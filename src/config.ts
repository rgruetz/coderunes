import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { DEFAULT_CONFIG, type RepoMapConfig, type ResolvedConfig } from "./types.js";

/**
 * Config filenames searched for in priority order. The first match in the
 * directory walk wins; later candidates are not even checked. ESM (`.js`,
 * `.mjs`) is preferred over CJS (`.cjs`) over JSON, mirroring the order
 * tools like ESLint and Prettier resolve in.
 */
const CONFIG_FILES = [
  "coderunes.config.js",
  "coderunes.config.mjs",
  "coderunes.config.cjs",
  "coderunes.config.json",
];

/**
 * Resolves the effective config for a coderunes run.
 *
 * Resolution order (first match wins):
 * 1. The path passed via `--config` (relative paths resolved against `cwd`).
 * 2. A `coderunes.config.{js,mjs,cjs,json}` walked upward from `cwd`.
 * 3. The `"coderunes"` key in the nearest ancestor `package.json`.
 * 4. {@link DEFAULT_CONFIG}.
 *
 * `outputOverride` (from the CLI's `--output`) takes precedence over the
 * config file's `output` field but does not override the config file itself.
 */
export async function resolveConfig(opts: {
  cwd: string;
  configPath?: string | null;
  outputOverride?: string | null;
}): Promise<ResolvedConfig> {
  const { cwd } = opts;

  let raw: RepoMapConfig = {};
  let configPath: string | null = null;

  if (opts.configPath) {
    // Explicit --config: load the named file, no fallback search.
    const abs = path.resolve(cwd, opts.configPath);
    raw = await loadConfigFile(abs);
    configPath = abs;
  } else {
    // Walk upward looking for a coderunes.config.* file.
    const found = await findConfigFile(cwd);
    if (found) {
      raw = await loadConfigFile(found);
      configPath = found;
    } else {
      // Last fallback before defaults: package.json "coderunes" key.
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
    signatureMode: raw.signatureMode ?? DEFAULT_CONFIG.signatureMode,
    groupByDirectory: raw.groupByDirectory ?? DEFAULT_CONFIG.groupByDirectory,
    includeFileSummary: raw.includeFileSummary ?? DEFAULT_CONFIG.includeFileSummary,
    header: raw.header ?? DEFAULT_CONFIG.header,
    cwd,
    configPath,
  };

  validate(resolved);
  return resolved;
}

/**
 * Walks from `cwd` toward the filesystem root looking for the first
 * `coderunes.config.*` file. Returns `null` if none is found.
 *
 * The upward walk lets monorepo packages share a config defined at the
 * workspace root.
 */
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

/**
 * Loads and parses a config file by absolute path.
 *
 * - `.json` is parsed with `JSON.parse`.
 * - `.js` / `.mjs` / `.cjs` are imported as ES modules; either a default
 *   export or a module-level export object is accepted.
 */
async function loadConfigFile(absPath: string): Promise<RepoMapConfig> {
  if (absPath.endsWith(".json")) {
    const text = await readFile(absPath, "utf8");
    const parsed: unknown = JSON.parse(text);
    if (parsed && typeof parsed === "object") return parsed;
    throw new Error(`config at ${absPath} is not an object`);
  }

  // Use file:// URL so dynamic import works on Windows too.
  const url = pathToFileURL(absPath).href;
  const mod = (await import(url)) as { default?: RepoMapConfig } & RepoMapConfig;
  const config = mod.default ?? mod;

  if (!config || typeof config !== "object") {
    throw new Error(`config at ${absPath} did not export an object`);
  }

  return config;
}

interface PackageJsonHit {
  config: RepoMapConfig;
  path: string;
}

/**
 * Walks upward from `cwd` looking for the nearest `package.json` that
 * contains a `"coderunes"` key. Stops at the first `package.json` found,
 * even if it has no `coderunes` key — that prevents leaking config from a
 * grandparent into a child project that simply hasn't been configured.
 */
async function loadFromPackageJson(cwd: string): Promise<PackageJsonHit | null> {
  let dir = path.resolve(cwd);
  const root = path.parse(dir).root;

  while (true) {
    const candidate = path.join(dir, "package.json");
    if (await fileExists(candidate)) {
      const text = await readFile(candidate, "utf8");
      try {
        const pkg = JSON.parse(text) as { coderunes?: unknown };
        const cfg = pkg.coderunes;
        if (cfg && typeof cfg === "object") {
          return { config: cfg, path: candidate };
        }
      } catch {
        // Malformed package.json — skip silently. We don't want to hard-fail
        // the run because the consumer's package.json has a syntax error.
      }
      return null;
    }

    if (dir === root) return null;

    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
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
 * Validates a resolved config. Throws with a clear, user-facing message on
 * the first invalid field; we don't aggregate errors because the first one
 * is usually the actionable signal.
 */
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

  // 0 is a sentinel meaning "no truncation". Anything in (0, 20) is too
  // small to be useful (would chop most signatures mid-word) and likely
  // a typo, so we reject it explicitly.
  const m = c.maxSignatureLength;
  if (typeof m !== "number" || !Number.isFinite(m) || (m !== 0 && m < 20)) {
    throw new Error("config.maxSignatureLength must be 0 (disable truncation) or a number >= 20");
  }

  if (c.signatureMode !== "full" && c.signatureMode !== "name") {
    throw new Error('config.signatureMode must be "full" or "name"');
  }
}
