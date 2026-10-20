import { EMBEDDING_DIMENSIONS } from "../../../validation/embedding";
import { env } from "../../env";
import { callWithTimeout } from "../callWithTimeout";
import type { EmbeddingProvider } from "../types";

// Embeddings slot. The dimensions parameter pins the vector size to the
// single EMBEDDING_DIMENSIONS constant; lib/ai/index.ts re-checks every
// vector's length, so a model mismatch fails closed instead of writing
// wrong-size vectors.
export const openAiEmbeddingProvider: EmbeddingProvider = {
  async embed(texts: string[]): Promise<number[][]> {
    const apiKey = env.AI_EMBEDDING_API_KEY ?? process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "AI_EMBEDDING_API_KEY must be set to use the openai embedding provider",
      );
    }
    const model = env.AI_EMBEDDING_MODEL ?? "text-embedding-3-small";
    return callWithTimeout(
      "embedding request",
      env.AI_PROVIDER_TIMEOUT_MS,
      async (signal) => {
        const res = await fetch("https://api.openai.com/v1/embeddings", {
          method: "POST",
          signal,
          headers: {
            authorization: `Bearer ${apiKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model,
            input: texts,
            dimensions: EMBEDDING_DIMENSIONS,
          }),
        });
        if (!res.ok) {
          throw new Error(`embedding request failed with status ${res.status}`);
        }
        const body = (await res.json()) as {
          data?: Array<{ index: number; embedding: number[] }>;
        };
        if (!body.data || body.data.length !== texts.length) {
          throw new Error("embedding response is malformed");
        }
        return [...body.data]
          .sort((a, b) => a.index - b.index)
          .map((d) => d.embedding);
      },
    );
  },
};
