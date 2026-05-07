import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ResolvedConfig } from "./types.js";

/**
 * Outcome of comparing a freshly-generated map against the on-disk file.
 *
 * - `match` — file exists and is byte-identical to the expected content.
 * - `missing` — file does not exist on disk.
 * - `stale` — file exists but its content differs.
 *
 * The CLI maps `match` to exit 0 and the other two to exit 2.
 */
export type CheckOutcome =
  | { status: "match" }
  | { status: "missing"; expectedPath: string }
  | { status: "stale"; expectedPath: string; existing: string; expected: string };

/**
 * Compares `expected` (the freshly-rendered markdown) against the file at
 * `config.output`. Used by `--check` to fail CI when the committed map
 * has drifted from the source it claims to describe.
 */
export async function checkAgainstFile(
  expected: string,
  config: ResolvedConfig,
): Promise<CheckOutcome> {
  const outPath = path.resolve(config.cwd, config.output);

  let existing: string;
  try {
    existing = await readFile(outPath, "utf8");
  } catch {
    // ENOENT and friends: treat any read failure as "the map isn't there".
    // Distinguishing missing-file from permission-denied here would just
    // produce noisier error reporting without changing the outcome.
    return { status: "missing", expectedPath: outPath };
  }

  if (existing === expected) return { status: "match" };

  return { status: "stale", expectedPath: outPath, existing, expected };
}
