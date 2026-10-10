import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: [".env.local", ".env"], quiet: true });

/*
 * The source of truth for the database is supabase/migrations (plain SQL, applied with the
 * Supabase CLI). drizzle-kit is only used to check that src/db/schema.ts matches it
 * (`npm run db:check`) and to scaffold DDL into a scratch folder when the schema changes.
 */
export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./.drizzle-scratch",
  dialect: "postgresql",
  casing: "snake_case",
  schemaFilter: ["public"],
  dbCredentials: { url: process.env.DATABASE_URL! },
});
