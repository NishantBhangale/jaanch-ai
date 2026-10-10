import { config } from '../config.js';

export async function createStore() {
  if (config.databaseUrl) {
    const { PgStore } = await import('./pgStore.js');
    return new PgStore();
  }
  const { MemoryStore } = await import('./memoryStore.js');
  console.warn('[db] DATABASE_URL is not set: using the in-memory store (data is lost on restart)');
  return new MemoryStore();
}
