import Anthropic from "@anthropic-ai/sdk";
import type { ZodSchema } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import { env } from "../../env";
import type { ExtractionProvider } from "../types";

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (client) return client;
  const apiKey = env.AI_EXTRACTION_API_KEY ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "AI_EXTRACTION_API_KEY must be set to use the anthropic extraction provider",
    );
  }
  client = new Anthropic({
    apiKey,
    // Fails closed: past the deadline the SDK aborts the request and throws.
    timeout: env.AI_PROVIDER_TIMEOUT_MS,
    maxRetries: 1,
  });
  return client;
}

// Structured outputs accept a restricted JSON-schema subset: no numeric or
// length constraints, and every object needs additionalProperties: false.
// The dropped constraints are NOT lost — the caller re-validates with the
// full Zod schema (including refinements like the citation rule), so a
// response that violates them still fails closed.
const UNSUPPORTED_KEYWORDS = new Set([
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  "minLength",
  "maxLength",
  "pattern",
  "minItems",
  "maxItems",
  "uniqueItems",
  "$schema",
]);

function sanitizeForStructuredOutput(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(sanitizeForStructuredOutput);
  if (node !== null && typeof node === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node)) {
      if (UNSUPPORTED_KEYWORDS.has(key)) continue;
      out[key] = sanitizeForStructuredOutput(value);
    }
    if (out.type === "object") {
      out.additionalProperties = false;
    }
    return out;
  }
  return node;
}

export const anthropicExtractionProvider: ExtractionProvider = {
  async extractStructured<T>(
    document: string,
    schema: ZodSchema<T>,
    instruction: string,
  ): Promise<T> {
    const format = {
      type: "json_schema" as const,
      schema: sanitizeForStructuredOutput(
        zodToJsonSchema(schema, { $refStrategy: "none" }),
      ) as Record<string, unknown>,
    };

    const response = await getClient().messages.create({
      model: env.AI_EXTRACTION_MODEL ?? "claude-opus-4-8",
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      system: instruction,
      messages: [
        { role: "user", content: `<document>\n${document}\n</document>` },
      ],
      output_config: { format },
    });

    if (response.stop_reason === "refusal") {
      throw new Error("extraction model refused the request");
    }
    const text = response.content.find((block) => block.type === "text");
    if (!text || text.type !== "text") {
      throw new Error("extraction response contained no text output");
    }
    // The full Zod schema is the gate — type shape AND refinements (the
    // citation rule). Malformed JSON or a non-conforming value throws, so a
    // partial extraction can never escape this function.
    return schema.parse(JSON.parse(text.text));
  },
};
