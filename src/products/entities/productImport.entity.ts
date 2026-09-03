import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

export enum ProductImportStatus {
  CREATED = 'created',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  PARTIALLY_COMPLETED = 'partially_completed',
}
@Entity({ name: 'product_imports' })
export class ProductImportEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;
  @Column({ type: 'varchar', length: 1023 })
  file: string;

  @Column({
    name: 'status',
    type: 'enum',
    enum: ProductImportStatus,
    enumName: 'product_import_status_enum',
  })
  status: ProductImportStatus;
  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'NOW()' })
  createdAt: Date;
  @Column({ name: 'process_started_at', type: 'timestamptz', nullable: true })
  processStartedAt: Date;
  @Column({ name: 'process_completed_at', type: 'timestamptz', nullable: true })
  processCompletedAt: Date;
}
