import type { ZodSchema } from "zod";

// The two capability slots the application knows about. Concrete
// implementations live in ./providers — nothing outside that directory may
// import a vendor SDK or name a vendor, so each slot's model can be swapped
// by env variable without touching application code.
export interface EmbeddingProvider {
  embed(texts: string[]): Promise<number[][]>;
}

export interface ExtractionProvider {
  extractStructured<T>(
    document: string,
    schema: ZodSchema<T>,
    instruction: string,
  ): Promise<T>;
}
