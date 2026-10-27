/**
 * Background-job queue.
 *
 * DEV STUB: jobs are logged and run in-process so the app works without Redis.
 * For production replace the body with BullMQ (same `queue.add(name, data)` call):
 *
 *   import { Queue } from 'bullmq';
 *   const q = new Queue('fsm', { connection: { url: process.env.REDIS_URL } });
 *   export const queue = { add: (name: string, data: unknown) => q.add(name, data, { attempts: 5, backoff: { type: 'exponential', delay: 5000 } }) };
 *
 * and write a worker that notifies the office of new tickets (job 'ticket.created') and, later, renders invoice PDFs.
 */
export const queue = {
  async add(name: string, data: unknown): Promise<void> {
    // Never log share tokens in real deployments.
    const safe = JSON.parse(JSON.stringify(data, (k, v) => (k === 'shareToken' ? '[redacted]' : v)));
    console.log(`[queue] ${name}`, safe);
  },
};
