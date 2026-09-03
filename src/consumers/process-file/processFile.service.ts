import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  FileImportEntity,
  FileImportStatus,
} from '../../products/entities/fileImport.entity.js';
import { DataSource, Repository } from 'typeorm';
import { FileImportMessage } from '../../products/rabbitmq/process-file-queue.js';

import * as fs from 'fs';
import csv from 'csv-parser';

export type ProductImportRow = Record<string, string>;

const BATCH_SIZE = 1000;

@Injectable()
export class ProcessFileService {
  private readonly logger = new Logger(ProcessFileService.name);
  constructor(
    @InjectRepository(FileImportEntity)
    private readonly fileImportRepository: Repository<FileImportEntity>,
    private readonly dataSource: DataSource,
  ) {}

  async *tryProcessProductImportRaw(
    message: FileImportMessage,
  ): AsyncGenerator<ProductImportRow[]> {
    this.logger.log('Processing product import...');
    const fileImportEntity = await this.fileImportRepository.findOne({
      where: {
        fileName: message.fileName,
      },
    });

    if (!fileImportEntity) {
      this.logger.log(`No file ${message.fileName} to process.`);
      return;
    }

    const queryRunner = this.dataSource.createQueryRunner();
    let lockAcquired = false;

    try {
      await queryRunner.connect();
      const lockResult = (await queryRunner.query(
        'SELECT pg_try_advisory_lock(hashtext($1)) AS locked',
        [fileImportEntity.fileName],
      )) as { locked: boolean }[];
      const locked = lockResult[0]?.locked === true;
      if (!locked) {
        this.logger.log(
          `File process task ${fileImportEntity.fileName} is already being processed.`,
        );
        return;
      }
      await this.setFileImportStarted(fileImportEntity);
      lockAcquired = true;

      for await (const rawProducts of this.process(fileImportEntity.filePath)) {
        yield rawProducts;
      }
      this.setFileImportCompleted(fileImportEntity);
    } catch (error: any) {
      this.logger.error(
        `File import task ${fileImportEntity.fileName} failed: ${error.message}`,
      );
      await this.setFileImportFailed(fileImportEntity);
      throw error;
    } finally {
      if (lockAcquired) {
        await queryRunner.query('SELECT pg_advisory_unlock(hashtext($1))', [
          fileImportEntity.fileName,
        ]);
      }
      await queryRunner.release();
    }
  }
  private async *process(filePath: string): AsyncGenerator<ProductImportRow[]> {
    this.logger.log(`Started processing file ${filePath}...`);
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }
    const fileStream = fs.createReadStream(filePath).pipe(csv());
    let batch: ProductImportRow[] = [];
    let rowNumber = 0;

    for await (const row of fileStream) {
      batch.push(row);
      if (batch.length === BATCH_SIZE) {
        yield batch;
        rowNumber += batch.length;
        batch = [];
      }
    }
    if (batch.length > 0) {
      yield batch;
    }

    this.logger.log(`Completed processing file ${filePath}...`);
  }

  private async setFileImportCompleted(
    productImportEntity: FileImportEntity,
  ): Promise<void> {
    await this.fileImportRepository.update(productImportEntity.id, {
      status: FileImportStatus.COMPLETED,
      processCompletedAt: new Date(),
    });
  }
  private async setFileImportFailed(
    productImportEntity: FileImportEntity,
  ): Promise<void> {
    await this.fileImportRepository.update(productImportEntity.id, {
      status: FileImportStatus.FAILED,
    });
  }
  private async setFileImportStarted(
    productImportEntity: FileImportEntity,
  ): Promise<void> {
    await this.fileImportRepository.update(productImportEntity.id, {
      processStartedAt: new Date(),
    });
  }
}
