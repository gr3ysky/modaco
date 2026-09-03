export const PRODUCT_IMPORT_QUEUE = 'product-imports';
export const PRODUCT_IMPORT_DEAD_LETTER_EXCHANGE =
  'product-imports.dead-letter';
export const PRODUCT_IMPORT_DEAD_LETTER_QUEUE = 'product-imports.dead';
export const PRODUCT_IMPORT_DEAD_LETTER_ROUTING_KEY = 'product-imports.dead';

export const PRODUCT_IMPORT_QUEUE_OPTIONS = {
  durable: true,
  arguments: {
    'x-dead-letter-exchange': PRODUCT_IMPORT_DEAD_LETTER_EXCHANGE,
    'x-dead-letter-routing-key': PRODUCT_IMPORT_DEAD_LETTER_ROUTING_KEY,
  },
};
