import path from "node:path";
import { extractFile } from "./extract.js";
import { discoverFiles } from "./glob.js";
import { render } from "./render.js";
import type { FileEntry, ResolvedConfig } from "./types.js";

/**
 * Result of a generate() run.
 */
export interface GenerateResult {
  /** Final REPO_MAP markdown content, byte-identical across runs for a given input. */
  content: string;

  /** Per-file extraction results, in sorted order. Empty entries are dropped. */
  entries: FileEntry[];

  /** Non-fatal warnings (read failures, parse errors) collected during the run. */
  warnings: string[];
}

/**
 * Top-level pipeline: discover files, extract their exports, render to
 * markdown. This is what both the CLI and the programmatic API call into.
 *
 * Does not write to disk — the caller decides whether to write the file
 * (`coderunes`) or compare against an existing one (`coderunes --check`).
 */
export async function generate(config: ResolvedConfig): Promise<GenerateResult> {
  const warnings: string[] = [];
  const onWarn = (msg: string) => warnings.push(msg);

  const files = await discoverFiles({
    cwd: config.cwd,
    include: config.include,
    ignore: config.ignore,
  });

  const entries: FileEntry[] = [];

  for (const rel of files) {
    const abs = path.join(config.cwd, rel);
    const result = await extractFile(
      abs,
      {
        maxSignatureLength: config.maxSignatureLength,
        includeFileSummary: config.includeFileSummary,
        signatureMode: config.signatureMode,
      },
      onWarn,
    );

    // Skip files with no exports rather than emitting empty entries.
    if (result.signatures.length === 0) continue;

    // Normalize to POSIX separators so map output is identical on Windows.
    entries.push({
      file: rel.split(path.sep).join("/"),
      signatures: result.signatures,
      summary: result.summary,
    });
  }

  const content = render(entries, config);
  return { content, entries, warnings };
}
