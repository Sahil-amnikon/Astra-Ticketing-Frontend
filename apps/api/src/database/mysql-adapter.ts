import mysql, {
  Pool as MysqlPool,
  PoolConnection,
  ResultSetHeader,
  RowDataPacket,
} from 'mysql2/promise';

export interface QueryResult<T = RowDataPacket> {
  rows: T[];
  rowCount: number;
}

export class MysqlClientAdapter {
  constructor(protected readonly connection: PoolConnection) {}

  async query<T = RowDataPacket>(
    sql: string,
    values: unknown[] = [],
  ): Promise<QueryResult<T>> {
    const normalized = sql.trim().toUpperCase();

    if (normalized === 'BEGIN' || normalized === 'BEGIN TRANSACTION') {
      await this.connection.beginTransaction();
      return { rows: [], rowCount: 0 };
    }

    if (normalized === 'COMMIT') {
      await this.connection.commit();
      return { rows: [], rowCount: 0 };
    }

    if (normalized === 'ROLLBACK') {
      await this.connection.rollback();
      return { rows: [], rowCount: 0 };
    }

    const [result] = await this.connection.execute(sql, values as never[]);

    if (Array.isArray(result)) {
      const rows = result as T[];
      return { rows, rowCount: rows.length };
    }

    const header = result as ResultSetHeader;
    return {
      rows: [],
      rowCount: header.affectedRows ?? 0,
    };
  }

  release(): void {
    this.connection.release();
  }
}

export class MysqlPoolAdapter {
  private readonly pool: MysqlPool;

  constructor(connectionString: string) {
    const url = new URL(connectionString);

    if (url.protocol !== 'mysql:') {
      throw new Error('MySQL connection URL must use mysql://');
    }

    this.pool = mysql.createPool({
      host: url.hostname,
      port: Number(url.port || 3306),
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: decodeURIComponent(url.pathname.replace(/^\//, '')),
      connectionLimit: 5,
      connectTimeout: 1500,
      waitForConnections: true,
      queueLimit: 10,
      timezone: 'Z',
      decimalNumbers: true,
    });
  }

  async query<T = RowDataPacket>(
    sql: string,
    values: unknown[] = [],
  ): Promise<QueryResult<T>> {
    const connection = await this.pool.getConnection();

    try {
      return await new MysqlClientAdapter(connection).query<T>(sql, values);
    } finally {
      connection.release();
    }
  }

  async connect(): Promise<MysqlClientAdapter> {
    return new MysqlClientAdapter(await this.pool.getConnection());
  }

  async end(): Promise<void> {
    await this.pool.end();
  }
}
