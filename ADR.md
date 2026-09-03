# Screnario A

## Constrains

- Serverless Consumption Plan
- Your processes have a strict "Timeout" limit (e.g., a few minutes).
- Server memory is highly restricted.
- The processor halts as soon as the HTTP request completes (Stateless).

## Approach

I have chosen async processing for large input files. When user uploads a file, it is saved to a shared volume inside docker. When file is saved a record in file_imports table is created and a message to message broker is sent.
For resilience the system tries to send the file import message 3 times.(Similar to transactional outbox pattern). The record
keeps the file processing metadata and allows the system to use distributed lock against multiple processing.
A file import consumer listens for messages and when a message is available it acquires a lock against the file name and asynchronously
reads the file line by line. After reading a predefined number of lines, the worker pushes these messages to message broker in batches.
This way, we can produce messages faster.

I created another consumer to process product messages that are produced by the file processing consumer. Since we can have thousands of messages waiting
In the queue, I have added 3 instances of this consumer to process large amount of messages simultaneously. Because is product in products table have
unique constraint I used upsert when persisting the messages. This way the consumer become idempotent, meaning any message can be processed multiple times
without any side-effects. Since product messages are small, to increase throughput I used prefect(1000) on this consumer for fast processing. I didn’t use
batch upserts in case of an error I would want to nack individual message for later investigation. I also enabled DQL in rabbitmq for failed messages and
every failed message ends up in their dedicated DQL.

Overall, the system runs asynchronously and we can run this inside a serverless environment. Enabling batch processing makes system faster and acts
as a defensive layer against timeout. Also configurable batch sizes can be adjusted if system has any memory issues. DQL and idempotent consumers helps to system
recover againts any failures since we use acks for each message we process.

# Screnario B

## Constrainst

- Develop a strategy to prevent the
  system from encountering bottlenecks during these simultaneous heavy read and write
  operations.

- Additionally, if a
  brand new product is added to the "Accessories" category while the flash sale is active,
  that product must automatically benefit from the discount.

## Approach

I designed the products table not to include any promotion or any effective price column.
Effective price is calculated when a user asks for it. Although this adds an overhead
it is safer. The reason is simple. The promotions have limited time range to be active.
We would need to maintain the effective price against any expirations if we had effective price is calculated
for each promotion change. (A background task to check any expired promotion. This not an option since we are running everything in Serverless environment. Even so we could have a cron job, the system still would allow stale data depending on the frequency of the job.) For any scenario that has heavy writes, Since we dont check promotions and calculate effective price, we do not add a bottleneck for writes. However, for reads we have this overhead. This can be solved by introducing effective pagination and limit the size of products retuned to the system for heavy reads.

Another benefit of calculating effective price on the go is, when a new product is added the product is automatically benefits
from the promotion if any exists. This solves the second constraint.
