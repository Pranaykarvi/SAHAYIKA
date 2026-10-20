import { createHash } from "node:crypto";

import type { ZodSchema } from "zod";

import { EMBEDDING_DIMENSIONS } from "../../../validation/embedding";
import { env } from "../../env";
import { callWithTimeout } from "../callWithTimeout";
import type { EmbeddingProvider, ExtractionProvider } from "../types";

// Deterministic provider for development and tests — never for production.
// It fabricates nothing: the extractor only reads labelled lines ("Payment
// terms: ...") out of the document, quoting each verbatim as its citation,
// and fails exactly like a real provider when a required field is absent.
// The embedding is a hash-derived vector: stable, meaningless, right-sized.

// Tests put this marker in a document to exercise the timeout path.
export const SIMULATE_SLOW_PROVIDER = "[[simulate-slow-provider]]";

const LABELS: Record<string, string> = {
  "what is being bought": "whatIsBeingBought",
  quantity: "quantity",
  "quality specification": "qualitySpec",
  deadline: "deadline",
  eligibility: "eligibility",
  "payment terms": "paymentTerms",
  penalties: "penalties",
};

function parseLabelledDocument(document: string): Record<string, unknown> {
  let page = 1;
  const values: Record<string, unknown> = {};
  const citations: Array<{ field: string; page: number; quotedText: string }> =
    [];
  for (const rawLine of document.split("\n")) {
    const line = rawLine.trim();
    const pageMatch = /^page\s+(\d+)\b/i.exec(line);
    if (pageMatch?.[1]) {
      page = Number(pageMatch[1]);
      continue;
    }
    const separator = line.indexOf(":");
    if (separator === -1) continue;
    const field = LABELS[line.slice(0, separator).trim().toLowerCase()];
    const value = line.slice(separator + 1).trim();
    if (!field || !value) continue;
    if (field === "quantity") {
      const match = /^([\d,.]+)\s+(.+)$/.exec(value);
      if (!match?.[1] || !match[2]) continue;
      values[field] = {
        amount: Number(match[1].replace(/,/g, "")),
        unit: match[2],
      };
    } else if (field === "eligibility") {
      values[field] = value
        .split(";")
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
    } else {
      values[field] = value;
    }
    citations.push({ field, page, quotedText: line });
  }
  return {
    whatIsBeingBought: values.whatIsBeingBought,
    quantity: values.quantity,
    qualitySpec: values.qualitySpec ?? null,
    deadline: values.deadline,
    eligibility: values.eligibility ?? [],
    paymentTerms: values.paymentTerms,
    penalties: values.penalties ?? null,
    sourceCitations: citations,
  };
}

function vectorFor(text: string): number[] {
  const vector: number[] = [];
  let digest = createHash("sha256").update(text).digest();
  while (vector.length < EMBEDDING_DIMENSIONS) {
    for (const byte of digest) {
      if (vector.length >= EMBEDDING_DIMENSIONS) break;
      vector.push(byte / 127.5 - 1);
    }
    digest = createHash("sha256").update(digest).digest();
  }
  return vector;
}

export const fakeProvider: EmbeddingProvider & ExtractionProvider = {
  async embed(texts: string[]): Promise<number[][]> {
    return callWithTimeout(
      "fake embedding",
      env.AI_PROVIDER_TIMEOUT_MS,
      async () => texts.map(vectorFor),
    );
  },

  async extractStructured<T>(
    document: string,
    schema: ZodSchema<T>,
  ): Promise<T> {
    return callWithTimeout(
      "fake extraction",
      env.AI_PROVIDER_TIMEOUT_MS,
      async () => {
        if (document.includes(SIMULATE_SLOW_PROVIDER)) {
          await new Promise((resolve) => {
            const timer = setTimeout(
              resolve,
              env.AI_PROVIDER_TIMEOUT_MS * 10,
            );
            timer.unref();
          });
        }
        return schema.parse(parseLabelledDocument(document));
      },
    );
  },
};
