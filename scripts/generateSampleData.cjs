// 1. Destructure faker from the import
const { faker } = require('@faker-js/faker');
const fs = require('fs');

const size = 500_000; // Number of sample records to generate
const filePath = './scripts/generated_sample_data.csv';
const categories = [ 'Electronics', 'Home & Kitchen', 'Office Supplies' ];

const buildSampleData = () => {
  // Use a WriteStream for fast disk writing
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
  const stream = fs.createWriteStream(filePath);

  // Write CSV Header
  stream.write('name,sku,basePrice,stockQuantity,category\n');

  for (let i = 0; i < size; i++) {
    // Escape quotes and wrap product name in quotes to prevent CSV parsing bugs from commas
    const name = `"${faker.commerce.productName().replace(/"/g, '""')}"`;
    const sku = faker.string.alphanumeric(10);
    const basePrice = faker.commerce.price({ min: 1, max: 1000, dec: 2 });
    const stockQuantity = faker.number.int({ min: 0, max: 1000 });
    const category = faker.helpers.arrayElement(categories);
    stream.write(`${name},${sku},${basePrice},${stockQuantity},${category}\n`);
  }

  stream.end();
  console.log(`Successfully generated ${size} records in ${filePath}`);
};

buildSampleData();