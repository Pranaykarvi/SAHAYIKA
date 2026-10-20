import type { EmbeddingProvider, ExtractionProvider } from "../types";
import { anthropicExtractionProvider } from "./anthropic";
import { fakeProvider } from "./fake";
import { openAiEmbeddingProvider } from "./openai";

// The only place provider ids map to vendors. AI_EXTRACTION_PROVIDER /
// AI_EMBEDDING_PROVIDER env values name an entry here; "fake" is the
// deterministic dev/test provider.

export function resolveExtractionProvider(id: string): ExtractionProvider {
  switch (id) {
    case "anthropic":
      return anthropicExtractionProvider;
    case "fake":
      return fakeProvider;
    default:
      throw new Error(`unknown extraction provider "${id}"`);
  }
}

export function resolveEmbeddingProvider(id: string): EmbeddingProvider {
  switch (id) {
    case "openai":
      return openAiEmbeddingProvider;
    case "fake":
      return fakeProvider;
    default:
      throw new Error(`unknown embedding provider "${id}"`);
  }
}
