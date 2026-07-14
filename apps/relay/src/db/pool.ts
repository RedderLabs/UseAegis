// Pool de conexiones a PostgreSQL, único para todo el proceso.
import { Pool } from "pg";
import type { PoolClient, QueryResult, QueryResultRow } from "pg";
import { config } from "../config";

export const pool = new Pool({
  connectionString: config.databaseUrl,
  max: 10,
  idleTimeoutMillis: 30_000,
});

// Helper tipado fino para queries sueltas. Los tipos de fila los declara cada repo.
export function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: readonly unknown[],
): Promise<QueryResult<T>> {
  return pool.query<T>(text, params as unknown[]);
}

// Ejecuta `fn` dentro de una transacción; hace COMMIT si resuelve, ROLLBACK si lanza.
export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  await pool.end();
}
