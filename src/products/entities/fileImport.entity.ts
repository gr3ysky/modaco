import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

export enum FileImportStatus {
  CREATED = 'created',
  COMPLETED = 'completed',
  FAILED = 'failed',
}
@Entity({ name: 'file_imports' })
export class FileImportEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;
  @Column({ name: 'file_name', type: 'varchar', length: 255, unique: true })
  fileName: string;
  @Column({ name: 'file_path', type: 'varchar', length: 1023 })
  filePath: string;

  @Column({
    name: 'status',
    type: 'enum',
    enum: FileImportStatus,
    enumName: 'file_process_status_enum',
  })
  status: FileImportStatus;
  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'NOW()' })
  createdAt: Date;
  @Column({ name: 'process_started_at', type: 'timestamptz', nullable: true })
  processStartedAt: Date;
  @Column({ name: 'process_completed_at', type: 'timestamptz', nullable: true })
  processCompletedAt: Date;
}
