import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { setTimeout } from 'node:timers/promises';
import amqp, {
  Channel,
  ChannelModel,
  ConfirmChannel,
  ConsumeMessage,
} from 'amqplib';
import {
  PRODUCT_IMPORT_DEAD_LETTER_EXCHANGE,
  PRODUCT_IMPORT_DEAD_LETTER_QUEUE,
  PRODUCT_IMPORT_DEAD_LETTER_ROUTING_KEY,
  PRODUCT_IMPORT_QUEUE,
  PRODUCT_IMPORT_QUEUE_OPTIONS,
} from '../../products/rabbitmq/product-import-queue.js';
import { ProcessFileService, ProductImportRow } from './processFile.service.js';
import {
  FileImportMessage,
  PROCESS_FILE_DEAD_LETTER_EXCHANGE,
  PROCESS_FILE_DEAD_LETTER_QUEUE,
  PROCESS_FILE_DEAD_LETTER_ROUTING_KEY,
  PROCESS_FILE_QUEUE,
  PROCESS_FILE_QUEUE_OPTIONS,
} from '../../products/rabbitmq/process-file-queue.js';

const MAX_PUBLISH_ATTEMPTS = 3;

@Injectable()
export class ProcessFileConsumerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(ProcessFileConsumerService.name);
  private connection?: ChannelModel;
  private channel?: Channel;
  private importProductsChannel?: ConfirmChannel;
  private importProductsConnection?: ChannelModel;

  constructor(private readonly processFileService: ProcessFileService) {}
  async onModuleInit(): Promise<void> {
    const rabbitMqUrl = process.env.RABBITMQ_URL;
    if (!rabbitMqUrl) {
      throw new Error('RABBITMQ_URL must be configured');
    }

    this.connection = await amqp.connect(rabbitMqUrl);
    this.channel = await this.connection.createChannel();
    await this.channel.assertExchange(
      PROCESS_FILE_DEAD_LETTER_EXCHANGE,
      'direct',
      { durable: true },
    );
    await this.channel.assertQueue(PROCESS_FILE_DEAD_LETTER_QUEUE, {
      durable: true,
    });
    await this.channel.bindQueue(
      PROCESS_FILE_DEAD_LETTER_QUEUE,
      PROCESS_FILE_DEAD_LETTER_EXCHANGE,
      PROCESS_FILE_DEAD_LETTER_ROUTING_KEY,
    );
    await this.channel.assertQueue(
      PROCESS_FILE_QUEUE,
      PROCESS_FILE_QUEUE_OPTIONS,
    );

    await this.channel.consume(PROCESS_FILE_QUEUE, (message) => {
      void this.consume(message);
    });
    this.logger.log(`Listening to ${PROCESS_FILE_QUEUE}.`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.channel?.close().catch(() => undefined);
    await this.importProductsChannel?.close().catch(() => undefined);
    await this.connection?.close().catch(() => undefined);
    await this.importProductsConnection?.close().catch(() => undefined);
  }

  private async consume(message: ConsumeMessage | null): Promise<void> {
    if (!message || !this.channel) {
      return;
    }

    try {
      const fileImportMessage: FileImportMessage = JSON.parse(
        message.content.toString(),
      );

      for await (const batch of this.processFileService.tryProcessProductImportRaw(
        fileImportMessage,
      )) {
        await this.publishBatch(batch, fileImportMessage.fileName);
      }

      this.channel.ack(message);
    } catch (error: any) {
      this.logger.error(
        `Failed to consume product import message ${message.properties.messageId ?? 'unknown'}: ${error.message}`,
      );
      this.channel.nack(message, false, false);
    }
  }

  private async publishBatch(
    batch: ProductImportRow[],
    fileName: string,
  ): Promise<void> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= MAX_PUBLISH_ATTEMPTS; attempt += 1) {
      const channel = await this.getImportProductsChannel();
      if (!channel) {
        return;
      }
      try {
        for (const [_, row] of batch.entries()) {
          const canContinue = channel.sendToQueue(
            PRODUCT_IMPORT_QUEUE,
            Buffer.from(JSON.stringify(row)),
            {
              persistent: true,
              messageId: row['sku'],
              headers: { fileName: fileName },
            },
          );
          if (!canContinue) {
            await this.waitForDrain(channel);
          }
        }
        await channel.waitForConfirms();
        return;
      } catch (error) {
        lastError = error;
        this.logger.warn(`Could not confirm import batch import`);
        await this.resetImportProductsChannel();
        if (attempt < MAX_PUBLISH_ATTEMPTS) {
          await setTimeout(1000);
        }
      }
    }

    throw lastError;
  }

  private async getImportProductsChannel(): Promise<ConfirmChannel> {
    if (this.importProductsChannel) {
      return this.importProductsChannel;
    }

    const rabbitMqUrl = process.env.RABBITMQ_URL;
    if (!rabbitMqUrl) {
      throw new Error('RABBITMQ_URL must be configured');
    }
    if (!this.importProductsConnection) {
      this.importProductsConnection = await amqp.connect(rabbitMqUrl);
    }
    this.importProductsChannel =
      await this.importProductsConnection.createConfirmChannel();

    await this.importProductsChannel.assertExchange(
      PRODUCT_IMPORT_DEAD_LETTER_EXCHANGE,
      'direct',
      { durable: true },
    );
    await this.importProductsChannel.assertQueue(
      PRODUCT_IMPORT_DEAD_LETTER_QUEUE,
      {
        durable: true,
      },
    );
    await this.importProductsChannel.bindQueue(
      PRODUCT_IMPORT_DEAD_LETTER_QUEUE,
      PRODUCT_IMPORT_DEAD_LETTER_EXCHANGE,
      PRODUCT_IMPORT_DEAD_LETTER_ROUTING_KEY,
    );

    await this.importProductsChannel.assertQueue(
      PRODUCT_IMPORT_QUEUE,
      PRODUCT_IMPORT_QUEUE_OPTIONS,
    );
    return this.importProductsChannel;
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

  private async resetImportProductsChannel(): Promise<void> {
    const channel = this.importProductsChannel;
    const connection = this.importProductsConnection;
    this.importProductsChannel = undefined;
    this.importProductsConnection = undefined;
    await channel?.close().catch(() => undefined);
    await connection?.close().catch(() => undefined);
  }
}
