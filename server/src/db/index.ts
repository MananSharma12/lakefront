import postgres from 'postgres';
import { drizzle, PostgresJsDatabase } from 'drizzle-orm/postgres-js';

const sql = postgres(process.env.DATABASE_URL as string);
export const db: PostgresJsDatabase = drizzle(sql);
