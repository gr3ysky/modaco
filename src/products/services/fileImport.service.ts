import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import {
  FileImportEntity,
  FileImportStatus,
} from '../entities/fileImport.entity.js';
import { DataSource } from 'typeorm';

import * as fs from 'fs';
import amqp, { ChannelModel, ConfirmChannel } from 'amqplib';
import { setTimeout } from 'node:timers/promises';
import {
  FileImportMessage,
  PROCESS_FILE_QUEUE,
  PROCESS_FILE_QUEUE_OPTIONS,
} from '../rabbitmq/process-file-queue.js';
const MAX_PUBLISH_ATTEMPTS = 3;

@Injectable()
export class FileImportService implements OnModuleDestroy {
  private readonly logger = new Logger(FileImportService.name);
  private connection?: ChannelModel;
  private channel?: ConfirmChannel;

  constructor(private readonly dataSource: DataSource) {}

  async trySendFileToQueue(
    fileName: string,
    fullPath: string,
  ): Promise<boolean> {
    try {
      await this.dataSource.transaction(async (manager) => {
        const fileImportRepository =
          manager.getRepository<FileImportEntity>(FileImportEntity);

        const fileImportEntity = await fileImportRepository.save(
          fileImportRepository.create({
            fileName: fileName,
            filePath: fullPath,
            status: FileImportStatus.CREATED,
            createdAt: new Date(),
          }),
        );
        const isFileSent = await this.tryPushToQueue(fileImportEntity);
        if (!isFileSent) {
          this.deleteFile(fullPath);
        }
      });
      return true;
    } catch {
      return false;
    }
  }

  private deleteFile(filePath: string) {
    fs.unlinkSync(filePath);
  }

  private async tryPushToQueue(
    fileImportEntity: FileImportEntity,
  ): Promise<boolean> {
    for (let attempt = 1; attempt <= MAX_PUBLISH_ATTEMPTS; attempt += 1) {
      try {
        const channel = await this.getChannel();
        const fileImportMessage: FileImportMessage = {
          fileName: fileImportEntity.fileName,
          filePath: fileImportEntity.filePath,
        };
        const canContinue = channel.sendToQueue(
          PROCESS_FILE_QUEUE,
          Buffer.from(JSON.stringify(fileImportMessage)),
          {
            persistent: true,
            messageId: fileImportEntity.fileName,
          },
        );
        if (!canContinue) {
          await this.waitForDrain(channel);
        }

        await channel.waitForConfirms();
        return true;
      } catch (error) {
        this.logger.warn(
          `Could not confirm sending the message; attempt ${attempt}/${MAX_PUBLISH_ATTEMPTS}`,
        );
        await this.resetChannel();
        if (attempt < MAX_PUBLISH_ATTEMPTS) {
          await setTimeout(1000);
        }
      }
    }
    return false;
  }

  async onModuleDestroy(): Promise<void> {
    await this.resetChannel();
  }

  private async getChannel(): Promise<ConfirmChannel> {
    if (this.channel) {
      return this.channel;
    }

    const rabbitMqUrl = process.env.RABBITMQ_URL;
    if (!rabbitMqUrl) {
      throw new Error('RABBITMQ_URL must be configured');
    }
    this.connection = await amqp.connect(rabbitMqUrl);
    this.channel = await this.connection.createConfirmChannel();
    await this.channel.assertQueue(
      PROCESS_FILE_QUEUE,
      PROCESS_FILE_QUEUE_OPTIONS,
    );
    return this.channel;
  }

  private async waitForDrain(channel: ConfirmChannel): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        channel.off('drain', onDrain);
        channel.off('error', onError);
        channel.off('close', onClose);
      };
      const onDrain = () => {
        cleanup();
        resolve();
      };
      const onError = (error: Error) => {
        cleanup();
        reject(error);
      };
      const onClose = () => {
        cleanup();
        reject(new Error('RabbitMQ channel closed while waiting for drain'));
      };

      channel.once('drain', onDrain);
      channel.once('error', onError);
      channel.once('close', onClose);
    });
  }

  private async resetChannel(): Promise<void> {
    const channel = this.channel;
    const connection = this.connection;
    this.channel = undefined;
    this.connection = undefined;
    await channel?.close().catch(() => undefined);
    await connection?.close().catch(() => undefined);
  }
}
