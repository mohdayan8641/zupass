import { QueryResult, QueryResultRow } from "pg";
import { Pool as PostgresPool } from "postgres-pool";
import { logger } from "../util/logger";
import { getDatabaseConfiguration } from "./postgresConfiguration";
import { migrateDatabase } from "./postgresMigrations";

export interface Pool {
  query<TRow extends QueryResultRow = any>(
    text: string,
    values: Record<string, any>
  ): Promise<QueryResult<TRow>>;
  end(): Promise<void>;

  get waitingCount(): number;
  get idleCount(): number;
  get totalCount(): number;
}

export async function getDB(): Promise<Pool> {
  logger("[INIT] Initializing Postgres client");

  const pool = new PostgresPool(getDatabaseConfiguration());
  const client = await pool.connect();
  await migrateDatabase(client);
  client.release();
  pool.query;

  return pool;
}
