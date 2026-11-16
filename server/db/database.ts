import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import type Database from 'better-sqlite3';
import { config } from '../config.js';
import { initializeSchema } from './schema.js';

const require = createRequire(import.meta.url);

class NodeSqliteWrapper {
  private inner: any;

  constructor(targetPath: string) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { DatabaseSync } = require('node:sqlite');
    this.inner = new DatabaseSync(targetPath);
  }

  pragma(sql: string) {
    return this.inner.exec(`PRAGMA ${sql};`);
  }

  exec(sql: string) {
    return this.inner.exec(sql);
  }

  prepare(sql: string) {
    const rawStmt = this.inner.prepare(sql);
    const normalizeArgs = (args: any[]) => {
      if (args.length === 1 && Array.isArray(args[0])) {
        return args[0];
      }
      return args;
    };
    return {
      run: (...args: any[]) => rawStmt.run(...normalizeArgs(args)),
      get: (...args: any[]) => rawStmt.get(...normalizeArgs(args)),
      all: (...args: any[]) => rawStmt.all(...normalizeArgs(args)),
    };
  }

  transaction<T extends (...args: any[]) => any>(fn: T): T {
    const wrapped = (...args: Parameters<T>): ReturnType<T> => {
      this.inner.exec('BEGIN');
      try {
        const res = fn(...args);
        this.inner.exec('COMMIT');
        return res;
      } catch (err) {
        this.inner.exec('ROLLBACK');
        throw err;
      }
    };
    return wrapped as T;
  }

  close() {
    this.inner.close();
  }
}

export function createDatabase(targetPath: string): Database.Database {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const BetterSqlite = require('better-sqlite3');
    return new BetterSqlite(targetPath);
  } catch (_err) {
    // Fall back to node:sqlite built into Node.js (v22+)
    return new NodeSqliteWrapper(targetPath) as unknown as Database.Database;
  }
}

let dbInstance: Database.Database | null = null;

export function getDb(customPath?: string): Database.Database {
  if (dbInstance && !customPath) return dbInstance;
  const targetPath = customPath || config.dbPath;
  if (targetPath !== ':memory:') {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  }
  const conn = createDatabase(targetPath);
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

