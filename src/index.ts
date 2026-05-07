/**
 * Public programmatic API for coderunes.
 *
 * Most users invoke coderunes via the CLI (`coderunes`, `coderunes --check`).
 * These exports exist for tooling that wants to embed map generation into
 * its own pipeline — for example, a custom CI script that consumes
 * {@link generate}'s structured `entries` instead of the rendered markdown.
 */

export { generate } from "./generate.js";
export type { GenerateResult } from "./generate.js";

export { resolveConfig } from "./config.js";

export { render } from "./render.js";

export { extractFile, extractFileSummary, toSignature, langFor } from "./extract.js";

export { discoverFiles } from "./glob.js";

export { checkAgainstFile } from "./check.js";
export type { CheckOutcome } from "./check.js";

export { runInit } from "./init.js";

export type { RepoMapConfig, ResolvedConfig, FileEntry, SignatureMode } from "./types.js";
export { DEFAULT_CONFIG } from "./types.js";
