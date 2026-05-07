import { readFile } from "node:fs/promises";
import path from "node:path";
import fg from "fast-glob";
import ignore from "ignore";

export async function discoverFiles(opts: {
  cwd: string;
  include: string[];
  ignore: string[];
}): Promise<string[]> {
  const matched = await fg(opts.include, {
    cwd: opts.cwd,
    ignore: opts.ignore,
    dot: false,
    onlyFiles: true,
    followSymbolicLinks: false,
    suppressErrors: true,
  });

  const gitignored = await loadGitignore(opts.cwd);
  const filtered = gitignored
    ? matched.filter((rel) => !gitignored.ignores(rel))
    : matched;

  return filtered.sort();
}

async function loadGitignore(cwd: string): Promise<ReturnType<typeof ignore> | null> {
  const candidates = [".gitignore", ".coderunesignore"];
  const ig = ignore();
  let found = false;
  for (const name of candidates) {
    try {
      const text = await readFile(path.join(cwd, name), "utf8");
      ig.add(text);
      found = true;
    } catch {
      // missing files are fine
    }
  }
  return found ? ig : null;
}
