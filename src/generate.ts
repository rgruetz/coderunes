import path from "node:path";
import { extractFile } from "./extract.js";
import { discoverFiles } from "./glob.js";
import { render } from "./render.js";
import type { FileEntry, ResolvedConfig } from "./types.js";

export interface GenerateResult {
  content: string;
  entries: FileEntry[];
  warnings: string[];
}

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
    if (result.signatures.length === 0) continue;
    entries.push({
      file: rel.split(path.sep).join("/"),
      signatures: result.signatures,
      summary: result.summary,
    });
  }

  const content = render(entries, config);
  return { content, entries, warnings };
}
