export const PROCESS_FILE_QUEUE = 'process-file';
export const PROCESS_FILE_DEAD_LETTER_EXCHANGE = 'process-file.dead-letter';
export const PROCESS_FILE_DEAD_LETTER_QUEUE = 'process-file.dead';
export const PROCESS_FILE_DEAD_LETTER_ROUTING_KEY = 'process-file.dead';

export const PROCESS_FILE_QUEUE_OPTIONS = {
  durable: true,
  arguments: {
    'x-dead-letter-exchange': PROCESS_FILE_DEAD_LETTER_EXCHANGE,
    'x-dead-letter-routing-key': PROCESS_FILE_DEAD_LETTER_ROUTING_KEY,
  },
};

export type FileImportMessage = {
  fileName: string;
  filePath: string;
};
