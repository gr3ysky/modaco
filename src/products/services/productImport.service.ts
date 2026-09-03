import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import {
  ProductImportEntity,
  ProductImportStatus,
} from '../entities/productImport.entity.js';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';

import * as fs from 'fs';
import csv from 'csv-parser';
import amqp, { ChannelModel, ConfirmChannel } from 'amqplib';
import { setTimeout } from 'node:timers/promises';

const PRODUCT_IMPORT_QUEUE = 'product-imports';
const PUBLISH_BATCH_SIZE = 10;
const MAX_PUBLISH_ATTEMPTS = 3;

type ProductImportRow = Record<string, string>;

@Injectable()
export class ProductImportService implements OnModuleDestroy {
  private readonly logger = new Logger(ProductImportService.name);
  private connection?: ChannelModel;
  private channel?: ConfirmChannel;

  constructor(
    @InjectRepository(ProductImportEntity)
    private readonly productImportRepository: Repository<ProductImportEntity>,
    private readonly dataSource: DataSource,
  ) {}

  async createProductImport(file: string): Promise<ProductImportEntity> {
    const productImportEntity = await this.productImportRepository.save(
      this.productImportRepository.create({
        file,
        status: ProductImportStatus.CREATED,
        createdAt: new Date(),
      }),
    );
    return productImportEntity;
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async processProductImport(): Promise<void> {
    this.logger.log('Processing product import...');
    //find the product import entities with status CREATED  or FAILED and process them
    const productImportTask = await this.productImportRepository.findOne({
      where: {
        status: In([ProductImportStatus.CREATED, ProductImportStatus.FAILED]),
      },
    });

    if (!productImportTask) {
      this.logger.log('No product import tasks to process.');
      return;
    }

    const queryRunner = this.dataSource.createQueryRunner();
    let lockAcquired = false;

    try {
      await queryRunner.connect();
      const lockResult = (await queryRunner.query(
        'SELECT pg_try_advisory_lock(hashtext($1)) AS locked',
        [productImportTask.file],
      )) as { locked: boolean }[];
      const locked = lockResult[0]?.locked === true;
      if (!locked) {
        this.logger.log(
          `Product import task ${productImportTask.id} is already being processed.`,
        );
        return;
      }

      lockAcquired = true;
      await this.process(productImportTask);
    } catch (error: any) {
      this.logger.error(
        `Product import task ${productImportTask.id} failed: ${error.message}`,
      );
      await this.setProductImportFailed(productImportTask);
    } finally {
      if (lockAcquired) {
        await queryRunner.query('SELECT pg_advisory_unlock(hashtext($1))', [
          productImportTask.file,
        ]);
      }
      await queryRunner.release();
    }
  }

  private async process(
    productImportEntity: ProductImportEntity,
  ): Promise<void> {
    this.logger.log(`Processing file ${productImportEntity.file}...`);
    try {
      await this.setProductImportStarted(productImportEntity);
      const fileStream = fs
        .createReadStream(productImportEntity.file)
        .pipe(csv());
      let batch: ProductImportRow[] = [];
      let rowNumber = 0;

      for await (const row of fileStream) {
        batch.push(row);
        if (batch.length === PUBLISH_BATCH_SIZE) {
          await this.publishBatch(productImportEntity, batch, rowNumber);
          rowNumber += batch.length;
          batch = [];
        }
      }
      if (batch.length > 0) {
        await this.publishBatch(productImportEntity, batch, rowNumber);
      }
      await this.setProductImportCompleted(productImportEntity);
    } catch (error: any) {
      this.logger.error(
        `Error processing file ${productImportEntity.file}: ${error.message}`,
      );
      await this.setProductImportFailed(productImportEntity);
      throw error;
    }
  }

  private async setProductImportStarted(
    productImportEntity: ProductImportEntity,
  ): Promise<void> {
    await this.productImportRepository.update(productImportEntity.id, {
      status: ProductImportStatus.PROCESSING,
      processStartedAt: new Date(),
    });
  }
  private async setProductImportCompleted(
    productImportEntity: ProductImportEntity,
  ): Promise<void> {
    await this.productImportRepository.update(productImportEntity.id, {
      status: ProductImportStatus.COMPLETED,
      processCompletedAt: new Date(),
    });
  }
  private async setProductImportFailed(
    productImportEntity: ProductImportEntity,
  ): Promise<void> {
    await this.productImportRepository.update(productImportEntity.id, {
      status: ProductImportStatus.FAILED,
    });
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
    await this.channel.assertQueue(PRODUCT_IMPORT_QUEUE, { durable: true });
    return this.channel;
  }

  private async publishBatch(
    productImportEntity: ProductImportEntity,
    batch: ProductImportRow[],
    startRowNumber: number,
  ): Promise<void> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= MAX_PUBLISH_ATTEMPTS; attempt += 1) {
      try {
        const channel = await this.getChannel();
        for (const [index, row] of batch.entries()) {
          const canContinue = channel.sendToQueue(
            PRODUCT_IMPORT_QUEUE,
            Buffer.from(JSON.stringify(row)),
            {
              persistent: true,
              messageId: `${productImportEntity.id}:${startRowNumber + index}`,
              headers: { filePath: productImportEntity.file },
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
        this.logger.warn(
          `Could not confirm import batch starting at row ${startRowNumber}; attempt ${attempt}/${MAX_PUBLISH_ATTEMPTS}`,
        );
        await this.resetChannel();
        if (attempt < MAX_PUBLISH_ATTEMPTS) {
          await setTimeout(1000);
        }
      }
    }

    throw lastError;
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
