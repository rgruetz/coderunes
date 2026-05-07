import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ResolvedConfig } from "./types.js";

export type CheckOutcome =
  | { status: "match" }
  | { status: "missing"; expectedPath: string }
  | { status: "stale"; expectedPath: string; existing: string; expected: string };

export async function checkAgainstFile(
  expected: string,
  config: ResolvedConfig,
): Promise<CheckOutcome> {
  const outPath = path.resolve(config.cwd, config.output);
  let existing: string;
  try {
    existing = await readFile(outPath, "utf8");
  } catch {
    return { status: "missing", expectedPath: outPath };
  }
  if (existing === expected) return { status: "match" };
  return { status: "stale", expectedPath: outPath, existing, expected };
}
