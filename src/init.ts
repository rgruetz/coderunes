import { readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";

/**
 * Starter config dropped by `coderunes init`. Mirrors {@link DEFAULT_CONFIG}
 * but is materialized as a JSON file so users have something concrete to
 * edit. Default values are restated explicitly so changes to defaults
 * upstream don't silently change user behavior.
 */
const STARTER_CONFIG = `{
  "include": ["src/**/*.{ts,tsx,js,jsx,mjs}"],
  "ignore": [
    "**/node_modules/**",
    "**/dist/**",
    "**/build/**",
    "**/*.test.*",
    "**/*.spec.*",
    "**/*.d.ts"
  ],
  "output": "REPO_MAP.md",
  "maxSignatureLength": 120
}
`;

/**
 * Result of an `init` run. The caller (CLI) uses these flags to decide
 * which messages to print without re-checking the filesystem.
 */
export interface InitResult {
  /** True if a fresh `coderunes.config.json` was written. */
  configCreated: boolean;

  /** Absolute path of the config file (whether created or pre-existing). */
  configPath: string;

  /** True if at least one new npm script was added to `package.json`. */
  scriptAdded: boolean;

  /** Absolute path of the consumer's `package.json`, or `null` if none was found. */
  pkgPath: string | null;
}

/**
 * Idempotent project setup: drops a starter config and wires up
 * `build:map` / `check:map` npm scripts when a `package.json` is present.
 *
 * Safe to re-run — pre-existing config files and pre-existing scripts of
 * the same name are left alone.
 */
export async function runInit(cwd: string): Promise<InitResult> {
  const configPath = path.join(cwd, "coderunes.config.json");

  // Don't clobber a config the user has already customized.
  let configCreated = false;
  if (!(await fileExists(configPath))) {
    await writeFile(configPath, STARTER_CONFIG);
    configCreated = true;
  }

  const pkgPath = path.join(cwd, "package.json");
  let scriptAdded = false;
  let resolvedPkgPath: string | null = null;

  if (await fileExists(pkgPath)) {
    resolvedPkgPath = pkgPath;
    const text = await readFile(pkgPath, "utf8");
    const pkg = JSON.parse(text);

    pkg.scripts ??= {};

    // Add scripts only when not already defined — never overwrite a custom
    // script with our default, and never silently change user behavior.
    if (!pkg.scripts["build:map"]) {
      pkg.scripts["build:map"] = "coderunes";
      scriptAdded = true;
    }
    if (!pkg.scripts["check:map"]) {
      pkg.scripts["check:map"] = "coderunes --check";
      scriptAdded = true;
    }

    if (scriptAdded) {
      const indent = detectIndent(text);
      await writeFile(pkgPath, JSON.stringify(pkg, null, indent) + "\n");
    }
  }

  return { configCreated, configPath, scriptAdded, pkgPath: resolvedPkgPath };
}

/** Returns `true` if `p` exists and is a regular file. */
async function fileExists(p: string): Promise<boolean> {
  try {
    const s = await stat(p);
    return s.isFile();
  } catch {
    return false;
  }
}

/**
 * Detects the indent style of an existing `package.json` so we don't rewrite
 * a 4-space file into 2-space (or vice versa) and produce a noisy diff.
 * Falls back to two spaces when nothing matches.
 */
function detectIndent(text: string): number | string {
  const match = text.match(/^([ \t]+)"/m);
  if (!match || !match[1]) return 2;
  if (match[1].includes("\t")) return "\t";
  return match[1].length;
}
