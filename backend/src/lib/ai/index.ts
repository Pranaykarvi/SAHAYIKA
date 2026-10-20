import type { ZodSchema } from "zod";

import { EMBEDDING_DIMENSIONS } from "../../validation/embedding";
import { env } from "../env";
import {
  resolveEmbeddingProvider,
  resolveExtractionProvider,
} from "./providers";

// The AI boundary of the whole backend: exactly two functions, no vendor
// names. Providers are selected by env variable and resolved inside
// ./providers. Both calls fail closed — a timeout or malformed response
// rejects; it never returns a partial value.

export async function embed(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  if (!env.AI_EMBEDDING_PROVIDER) {
    throw new Error("AI_EMBEDDING_PROVIDER is not configured");
  }
  const vectors = await resolveEmbeddingProvider(
    env.AI_EMBEDDING_PROVIDER,
  ).embed(texts);
  const malformed =
    vectors.length !== texts.length ||
    vectors.some(
      (vector) =>
        vector.length !== EMBEDDING_DIMENSIONS ||
        vector.some((n) => !Number.isFinite(n)),
    );
  if (malformed) {
    throw new Error("embedding provider returned a malformed response");
  }
  return vectors;
}

export async function extractStructured<T>(
  document: string,
  schema: ZodSchema<T>,
  instruction: string,
): Promise<T> {
  if (!env.AI_EXTRACTION_PROVIDER) {
    throw new Error("AI_EXTRACTION_PROVIDER is not configured");
  }
  const value = await resolveExtractionProvider(
    env.AI_EXTRACTION_PROVIDER,
  ).extractStructured(document, schema, instruction);
  // The schema is the gate, whatever the provider did internally: anything
  // that does not satisfy it (including the citation rules baked into the
  // schema's refinements) throws here and nothing reaches the caller.
  return schema.parse(value);
}
