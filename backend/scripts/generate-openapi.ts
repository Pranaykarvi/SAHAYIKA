import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { buildOpenApiDocument } from "../src/lib/openapi/document";

// Writes backend/openapi.json — the contract the frontend builds against.
// Generated from the Zod schemas in src/validation; never edited by hand.
const document = buildOpenApiDocument();
const target = resolve(process.cwd(), "openapi.json");
writeFileSync(target, `${JSON.stringify(document, null, 2)}\n`);

const pathCount = Object.keys(document.paths ?? {}).length;
console.log(`wrote ${target} (${pathCount} paths)`);
