import { readFile } from "node:fs/promises";
import path from "node:path";
import fg from "fast-glob";
import ignore from "ignore";

/**
 * Discovers source files in `cwd` matching `include` globs, with
 * configured `ignore` globs and any `.gitignore` / `.coderunesignore`
 * patterns applied on top.
 *
 * Returned paths are relative to `cwd` and sorted alphabetically — sorting
 * is required for the rendered map to be deterministic across filesystems
 * with different readdir orderings.
 */
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
    // Don't fail the whole run because one transient FS error popped up
    // during traversal — tolerate it and move on.
    suppressErrors: true,
  });

  // Layer .gitignore filtering on top of fast-glob's `ignore` option.
  // fast-glob doesn't parse .gitignore natively, so we apply it ourselves.
  const gitignored = await loadGitignore(opts.cwd);
  const filtered = gitignored ? matched.filter((rel) => !gitignored.ignores(rel)) : matched;

  return filtered.sort();
}

/**
 * Loads `.gitignore` and `.coderunesignore` from `cwd` (if present) into
 * a single `ignore` matcher. Returns `null` when neither file exists, so
 * callers can skip the filter step entirely.
 */
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
      // Missing files are expected; only an empty matcher is a "miss".
    }
  }

  return found ? ig : null;
}
