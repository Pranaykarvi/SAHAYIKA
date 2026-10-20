import { z } from "zod";

// The single place the embedding dimension is chosen. The pgvector columns,
// the HNSW indexes, and every Zod schema that carries an embedding all import
// this constant; changing it means a migration plus re-embedding everything,
// so it is deliberately one named export, not a config value.
export const EMBEDDING_DIMENSIONS = 1536;

export const embeddingSchema = z
  .array(z.number())
  .length(EMBEDDING_DIMENSIONS);

export type Embedding = z.infer<typeof embeddingSchema>;
