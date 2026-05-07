import { readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";

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

export interface InitResult {
  configCreated: boolean;
  configPath: string;
  scriptAdded: boolean;
  pkgPath: string | null;
}

export async function runInit(cwd: string): Promise<InitResult> {
  const configPath = path.join(cwd, "coderunes.config.json");
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

async function fileExists(p: string): Promise<boolean> {
  try {
    const s = await stat(p);
    return s.isFile();
  } catch {
    return false;
  }
}

function detectIndent(text: string): number | string {
  const match = text.match(/^([ \t]+)"/m);
  if (!match || !match[1]) return 2;
  if (match[1].includes("\t")) return "\t";
  return match[1].length;
}
