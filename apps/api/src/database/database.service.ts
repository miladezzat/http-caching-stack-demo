import { Inject, Injectable, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { PGlite } from '@electric-sql/pglite';
import { Pool } from 'pg';
import { mkdir } from 'node:fs/promises';
import { AppConfig, CONFIG } from '../config';

export interface SqlClient {
  query<T extends Record<string, unknown> = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

@Injectable()
export class DatabaseService implements OnModuleInit, OnApplicationShutdown {
  private pool?: Pool;
  private embedded?: PGlite;

  constructor(@Inject(CONFIG) private readonly config: AppConfig) {}

  async onModuleInit() {
    if (this.config.databaseUrl) this.pool = new Pool({ connectionString: this.config.databaseUrl, max: 8, connectionTimeoutMillis: 5000 });
    else {
      if (this.config.dataDir !== 'memory://') await mkdir(this.config.dataDir, { recursive: true });
      this.embedded = await PGlite.create(this.config.dataDir);
    }
    await this.transaction(async tx => {
      // Serialize initialization when several external-Postgres API instances start.
      await tx.query('SELECT pg_advisory_xact_lock(730104)');
      await tx.query(`CREATE TABLE IF NOT EXISTS products (
        id text PRIMARY KEY, name text NOT NULL, price numeric(12,2) NOT NULL CHECK (price >= 0),
        category text NOT NULL, version integer NOT NULL DEFAULT 1, updated_at timestamptz NOT NULL DEFAULT clock_timestamp())`);
      await tx.query(`CREATE TABLE IF NOT EXISTS catalog_state (
        id integer PRIMARY KEY CHECK (id = 1), version integer NOT NULL, updated_at timestamptz NOT NULL)`);
      await tx.query(`CREATE TABLE IF NOT EXISTS purge_jobs (
        id uuid PRIMARY KEY, tags text[] NOT NULL, status text NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','processing','done','failed')), attempts integer NOT NULL DEFAULT 0,
        available_at timestamptz NOT NULL DEFAULT clock_timestamp(), lease_until timestamptz, lease_token uuid,
        last_error text, created_at timestamptz NOT NULL DEFAULT clock_timestamp(), completed_at timestamptz)`);
      await tx.query(`CREATE INDEX IF NOT EXISTS purge_jobs_due ON purge_jobs(status, available_at)`);
      await tx.query(`INSERT INTO products(id,name,price,category) VALUES
        ('1','Laptop',1500,'electronics'), ('2','Shoes',120,'apparel'), ('3','Phone',899,'electronics')
        ON CONFLICT (id) DO NOTHING`);
      await tx.query(`INSERT INTO catalog_state VALUES (1,1,clock_timestamp()) ON CONFLICT (id) DO NOTHING`);
    });
  }

  async transaction<T>(run: (tx: SqlClient) => Promise<T>, readOnly = false): Promise<T> {
    if (this.embedded) {
      return this.embedded.transaction(async tx => {
        if (readOnly) await tx.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
        return run(tx);
      });
    }
    if (!this.pool) throw new Error('Database is not ready');
    const client = await this.pool.connect();
    try {
      await client.query(readOnly ? 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY' : 'BEGIN');
      const result = await run(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }

  async onApplicationShutdown() {
    await this.pool?.end();
    await this.embedded?.close();
  }
}
