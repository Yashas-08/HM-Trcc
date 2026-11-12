import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { config } from '../config.js';
import { initializeSchema } from './schema.js';

let dbInstance: Database.Database | null = null;

export function getDb(customPath?: string): Database.Database {
  if (dbInstance && !customPath) return dbInstance;
  const targetPath = customPath || config.dbPath;
  if (targetPath !== ':memory:') {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  }
  const conn = new Database(targetPath);
  initializeSchema(conn);
  if (!customPath) {
    dbInstance = conn;
  }
  return conn;
}

export function setDbForTest(conn: Database.Database): void {
  dbInstance = conn;
}

export function closeDb(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

