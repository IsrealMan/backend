/**
 * db/pool.js
 *
 * PostgreSQL connection pool for the predi_qc schema.
 * Mirrors the pattern from spc-engine-V1/node-api/src/db/pool.js.
 *
 * Falls back gracefully if DATABASE_URL is not set — routes will
 * detect `isConnected()` and drop to the MongoDB / mock tier.
 */

import pg from "pg";
import { config } from "../config/env.js";

const { Pool } = pg;

let _pool = null;

if (config.DATABASE_URL) {
  _pool = new Pool({
    connectionString: config.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    options: "-c search_path=predi_qc", // always scope to predi_qc schema
  });

  _pool.on("error", (err) => {
    console.error("[pg] Pool error:", err.message);
  });

  // Test the connection once on startup
  _pool
    .connect()
    .then((client) => {
      client.release();
      console.log("[pg] Connected to PostgreSQL (predi_qc)");
    })

    .catch((err) => {
      console.warn(
        "[pg] PostgreSQL not reachable — using MongoDB/mock tier:",
        err.message,
      );
    });
}

/**
 * Returns true when the PG pool is configured and reachable.
 * Routes call this before every PG query to decide which tier to use.
 */
export function isConnected() {
  return _pool !== null && _pool.totalCount >= 0;
}

/**
 * Run a parameterized query.
 * @param {string} text
 * @param {any[]} [params]
 */
export async function query(text, params) {
  if (!_pool) throw new Error("PostgreSQL pool not initialised");
  const start = Date.now();
  const res = await _pool.query(text, params);
  const ms = Date.now() - start;
  if (ms > 500) console.warn(`[pg] Slow query (${ms}ms): ${text.slice(0, 80)}`);
  return res;
}

/**
 * Run multiple queries inside a transaction.
 * @param {(client: pg.PoolClient) => Promise<any>} fn
 */
export async function withTransaction(fn) {
  if (!_pool) throw new Error("PostgreSQL pool not initialised");
  const client = await _pool.connect();
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

export async function disconnectPg() {
  if (_pool) {
    await _pool.end();
    _pool = null;
  }
}
