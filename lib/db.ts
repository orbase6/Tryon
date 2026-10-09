import mysql, { Pool, RowDataPacket, ResultSetHeader } from "mysql2/promise";

declare global {
  // eslint-disable-next-line no-var
  var __pool: Pool | undefined;
}

export function getPool(): Pool {
  if (!globalThis.__pool) {
    globalThis.__pool = mysql.createPool({
      host: process.env.DB_HOST || "127.0.0.1",
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER || "root",
      password: process.env.DB_PASSWORD || "",
      database: process.env.DB_NAME || "tryon_store",
      waitForConnections: true,
      connectionLimit: 10,
      decimalNumbers: true,
      charset: "utf8mb4",
    });
  }
  return globalThis.__pool;
}

/** Run a parameterized SELECT. Values are always bound via `?` placeholders. */
export async function query<T = RowDataPacket>(sql: string, params: unknown[] = []): Promise<T[]> {
  const [rows] = await getPool().query<RowDataPacket[]>(sql, params as never[]);
  return rows as unknown as T[];
}

export async function queryOne<T = RowDataPacket>(sql: string, params: unknown[] = []): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

/** Run a parameterized INSERT/UPDATE/DELETE. */
export async function execute(sql: string, params: unknown[] = []): Promise<ResultSetHeader> {
  const [res] = await getPool().execute<ResultSetHeader>(sql, params as never[]);
  return res;
}

/** JSON columns come back parsed on MySQL and as strings on MariaDB. */
export function parseJson<T>(v: unknown, fallback: T): T {
  if (v === null || v === undefined) return fallback;
  if (typeof v === "string") {
    try { return JSON.parse(v) as T; } catch { return fallback; }
  }
  return v as T;
}
