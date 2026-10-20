import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import { resolve } from 'node:path';
import { Repository } from '../models/database.js';

export async function testDatabase() {
  const server = await MongoMemoryServer.create({ binary: { downloadDir: resolve('.cache/mongodb') } });
  const client = new MongoClient(server.getUri());
  await client.connect();
  const repo = new Repository(client.db('books_test'));
  await repo.initialize();
  return { repo, async close() { await client.close(); await server.stop(); } };
}
