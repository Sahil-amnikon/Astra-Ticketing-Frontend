import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';
import Redis from 'ioredis';
import { readConfig } from './config';
export interface DependencyProbe {
  check(): Promise<boolean>;
}
@Injectable()
export class Dependencies implements OnModuleDestroy {
  private readonly config = readConfig();
  readonly db = new Pool({
    connectionString: this.config.DATABASE_URL,
    max: 5,
    connectionTimeoutMillis: 1500,
    query_timeout: 1500,
    statement_timeout: 1500,
  });
  readonly redis = new Redis(this.config.REDIS_URL, {
    lazyConnect: true,
    connectTimeout: 1500,
    commandTimeout: 1500,
    maxRetriesPerRequest: 0,
    enableOfflineQueue: false,
    retryStrategy: () => null,
  });
  constructor() {
    this.db.on('error', () =>
      console.error(JSON.stringify({ event: 'database.connection.error' })),
    );
    this.redis.on('error', () =>
      console.error(JSON.stringify({ event: 'redis.connection.error' })),
    );
  }
  async check(): Promise<boolean> {
    const results = await Promise.allSettled([
      this.db.query(
        'SELECT version FROM app_schema_state WHERE id = 1 AND version >= 18',
      ),
      this.pingRedis(),
    ]);
    const db = results[0];
    const redis = results[1];
    return (
      db?.status === 'fulfilled' &&
      db.value.rowCount === 1 &&
      redis?.status === 'fulfilled' &&
      redis.value === 'PONG'
    );
  }
  private async pingRedis() {
    if (this.redis.status === 'wait' || this.redis.status === 'end')
      await this.redis.connect();
    return this.redis.ping();
  }
  async onModuleDestroy() {
    this.redis.disconnect();
    await this.db.end();
  }
}
