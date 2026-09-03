import { NestFactory } from '@nestjs/core';
import { ProcessFileConsumerModule } from './process-file.module.js';

await NestFactory.createApplicationContext(ProcessFileConsumerModule);
