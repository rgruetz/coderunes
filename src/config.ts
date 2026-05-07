import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { DEFAULT_CONFIG, type RepoMapConfig, type ResolvedConfig } from "./types.js";

const CONFIG_FILES = [
  "coderunes.config.js",
  "coderunes.config.mjs",
  "coderunes.config.cjs",
  "coderunes.config.json",
];

export async function resolveConfig(opts: {
  cwd: string;
  configPath?: string | null;
  outputOverride?: string | null;
}): Promise<ResolvedConfig> {
  const { cwd } = opts;
  let raw: RepoMapConfig = {};
  let configPath: string | null = null;

  if (opts.configPath) {
    const abs = path.resolve(cwd, opts.configPath);
    raw = await loadConfigFile(abs);
    configPath = abs;
  } else {
    const found = await findConfigFile(cwd);
    if (found) {
      raw = await loadConfigFile(found);
      configPath = found;
    } else {
      const fromPkg = await loadFromPackageJson(cwd);
      if (fromPkg) {
        raw = fromPkg.config;
        configPath = fromPkg.path;
      }
    }
  }

  const resolved: ResolvedConfig = {
    include: raw.include ?? DEFAULT_CONFIG.include,
    ignore: raw.ignore ?? DEFAULT_CONFIG.ignore,
    output: opts.outputOverride ?? raw.output ?? DEFAULT_CONFIG.output,
    maxSignatureLength: raw.maxSignatureLength ?? DEFAULT_CONFIG.maxSignatureLength,
    groupByDirectory: raw.groupByDirectory ?? DEFAULT_CONFIG.groupByDirectory,
    includeFileSummary: raw.includeFileSummary ?? DEFAULT_CONFIG.includeFileSummary,
    header: raw.header ?? DEFAULT_CONFIG.header,
    cwd,
    configPath,
  };

  validate(resolved);
  return resolved;
}

async function findConfigFile(cwd: string): Promise<string | null> {
  let dir = path.resolve(cwd);
  const root = path.parse(dir).root;
  while (true) {
    for (const name of CONFIG_FILES) {
      const candidate = path.join(dir, name);
      if (await fileExists(candidate)) return candidate;
    }
    if (dir === root) return null;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

async function loadConfigFile(absPath: string): Promise<RepoMapConfig> {
  if (absPath.endsWith(".json")) {
    const text = await readFile(absPath, "utf8");
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object") return parsed as RepoMapConfig;
    throw new Error(`config at ${absPath} is not an object`);
  }
  const url = pathToFileURL(absPath).href;
  const mod = (await import(url)) as { default?: RepoMapConfig } & RepoMapConfig;
  const config = mod.default ?? mod;
  if (!config || typeof config !== "object") {
    throw new Error(`config at ${absPath} did not export an object`);
  }
  return config as RepoMapConfig;
}

interface PackageJsonHit {
  config: RepoMapConfig;
  path: string;
}

async function loadFromPackageJson(cwd: string): Promise<PackageJsonHit | null> {
  let dir = path.resolve(cwd);
  const root = path.parse(dir).root;
  while (true) {
    const candidate = path.join(dir, "package.json");
    if (await fileExists(candidate)) {
      const text = await readFile(candidate, "utf8");
      try {
        const pkg = JSON.parse(text);
        const cfg = pkg?.coderunes;
        if (cfg && typeof cfg === "object") {
          return { config: cfg as RepoMapConfig, path: candidate };
        }
      } catch {
        // malformed package.json — skip silently
      }
      return null;
    }
    if (dir === root) return null;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

async function fileExists(p: string): Promise<boolean> {
  try {
    const s = await stat(p);
    return s.isFile();
  } catch {
    return false;
  }
}

function validate(c: ResolvedConfig): void {
  if (!Array.isArray(c.include) || c.include.some((g) => typeof g !== "string")) {
    throw new Error("config.include must be an array of glob strings");
  }
  if (!Array.isArray(c.ignore) || c.ignore.some((g) => typeof g !== "string")) {
    throw new Error("config.ignore must be an array of glob strings");
  }
  if (typeof c.output !== "string" || !c.output) {
    throw new Error("config.output must be a non-empty string");
  }
  const m = c.maxSignatureLength;
  if (typeof m !== "number" || !Number.isFinite(m) || (m !== 0 && m < 20)) {
    throw new Error(
      "config.maxSignatureLength must be 0 (disable truncation) or a number >= 20",
    );
  }
}
