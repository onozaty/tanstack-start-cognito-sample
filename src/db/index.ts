import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

// HMR で再評価されるたびに Pool が増殖して "too many clients" になるのを避けるため、
// globalThis にキャッシュする。
const globalForPool = globalThis as unknown as { __pgPool?: Pool };

const pool =
  globalForPool.__pgPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
  });

if (!globalForPool.__pgPool) {
  globalForPool.__pgPool = pool;
}

export const db = drizzle(pool);
