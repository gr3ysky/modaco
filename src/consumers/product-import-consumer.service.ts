import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import amqp, { Channel, ChannelModel, ConsumeMessage } from 'amqplib';
import {
  PRODUCT_IMPORT_DEAD_LETTER_EXCHANGE,
  PRODUCT_IMPORT_DEAD_LETTER_QUEUE,
  PRODUCT_IMPORT_DEAD_LETTER_ROUTING_KEY,
  PRODUCT_IMPORT_QUEUE,
  PRODUCT_IMPORT_QUEUE_OPTIONS,
} from '../products/rabbitmq/product-import-queue.js';
import { ProductImportService } from './productImport.service.js';

const CONSUMER_PREFETCH_COUNT = 1000;
const batchSize = 1000;
@Injectable()
export class ProductImportConsumerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(ProductImportConsumerService.name);
  private connection?: ChannelModel;
  private channel?: Channel;

  constructor(private readonly productImportService: ProductImportService) {}
  async onModuleInit(): Promise<void> {
    const rabbitMqUrl = process.env.RABBITMQ_URL;
    if (!rabbitMqUrl) {
      throw new Error('RABBITMQ_URL must be configured');
    }

    this.connection = await amqp.connect(rabbitMqUrl);
    this.channel = await this.connection.createChannel();
    await this.channel.assertExchange(
      PRODUCT_IMPORT_DEAD_LETTER_EXCHANGE,
      'direct',
      { durable: true },
    );
    await this.channel.assertQueue(PRODUCT_IMPORT_DEAD_LETTER_QUEUE, {
      durable: true,
    });
    await this.channel.bindQueue(
      PRODUCT_IMPORT_DEAD_LETTER_QUEUE,
      PRODUCT_IMPORT_DEAD_LETTER_EXCHANGE,
      PRODUCT_IMPORT_DEAD_LETTER_ROUTING_KEY,
    );
    await this.channel.assertQueue(
      PRODUCT_IMPORT_QUEUE,
      PRODUCT_IMPORT_QUEUE_OPTIONS,
    );
    await this.channel.prefetch(CONSUMER_PREFETCH_COUNT);
    await this.channel.consume(PRODUCT_IMPORT_QUEUE, (message) => {
      void this.consume(message);
    });
    this.logger.log(
      `Listening to ${PRODUCT_IMPORT_QUEUE} with prefetch ${CONSUMER_PREFETCH_COUNT}`,
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.channel?.close().catch(() => undefined);
    await this.connection?.close().catch(() => undefined);
  }

  private async consume(message: ConsumeMessage | null): Promise<void> {
    if (!message || !this.channel) {
      return;
    }

    try {
      if (
        await this.productImportService.tryProcessProductImportRaw(
          message.content.toString(),
        )
      ) {
        this.channel.ack(message);
      } else {
        this.channel.nack(message, false, false);
      }
    } catch (error: any) {
      this.logger.error(
        `Failed to consume product import message ${message.properties.messageId ?? 'unknown'}: ${error.message}`,
      );
      this.channel.nack(message, false, false);
    }
  }
}
