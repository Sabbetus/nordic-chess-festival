// A D1-shaped wrapper around Node's built-in SQLite, so the Worker's SQL runs for real in tests.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import type { D1Like, D1Statement } from '../../worker/types.ts';

export function makeDb(): D1Like & { raw: DatabaseSync } {
  const raw = new DatabaseSync(':memory:');
  raw.exec(readFileSync(new URL('../../migrations/0001_init.sql', import.meta.url), 'utf8'));
  return {
    raw,
    prepare(sql: string): D1Statement {
      let params: unknown[] = [];
      const stmt: D1Statement = {
        bind(...values) { params = values; return stmt; },
        async first<T>() { return ((raw.prepare(sql).get(...(params as never[])) as T | undefined) ?? null) as T | null; },
        async all<T>() { return { results: raw.prepare(sql).all(...(params as never[])) as T[] }; },
        async run() { raw.prepare(sql).run(...(params as never[])); return {}; },
      };
      return stmt;
    },
  };
}
