import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { PGlite } from '@electric-sql/pglite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let adapter;
let engineName;

export async function initDatabase() {
  if (process.env.DATABASE_URL) {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    adapter = {
      query: (text, params = []) => pool.query(text, params),
      exec: (text) => pool.query(text),
      close: () => pool.end(),
    };
    engineName = 'PostgreSQL';
  } else {
    const dataDirectory = path.resolve(__dirname, '..', '.data', 'pglite');
    await fs.mkdir(dataDirectory, { recursive: true });
    const db = new PGlite(`file://${dataDirectory.replaceAll('\\', '/')}`);
    adapter = {
      query: (text, params = []) => db.query(text, params),
      exec: (text) => db.exec(text),
      close: () => db.close(),
    };
    engineName = 'PGlite (本地 PostgreSQL)';
  }

  const schema = await fs.readFile(path.join(__dirname, 'schema.sql'), 'utf8');
  await adapter.exec(schema);
  return engineName;
}

export function query(text, params = []) {
  if (!adapter) throw new Error('数据库尚未初始化');
  return adapter.query(text, params);
}

export function closeDatabase() {
  return adapter?.close();
}
