import { PgVector, PostgresStore } from "@mastra/pg";
import { openai } from "@ai-sdk/openai";

// Create single instances of database connections to be reused
export const storage = new PostgresStore({
  connectionString: process.env.DATABASE_URL || "",
});

export const vector = new PgVector({
  connectionString: process.env.DATABASE_URL || "",
});

export const embedder = openai.embedding("text-embedding-3-small");
