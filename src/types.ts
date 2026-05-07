/**
 * How exported declarations are rendered in the generated map.
 *
 * - `"full"` keeps the full signature (parameter list, generics, return type),
 *   stripping only function/class/enum *bodies*.
 * - `"name"` strips signatures down to `export [default] [async] <kind> <name>`
 *   for maximum compactness. Use this for very large repos where the full map
 *   becomes a token problem.
 */
export type SignatureMode = "full" | "name";

/**
 * User-facing config schema. Every field is optional; missing fields fall
 * back to {@link DEFAULT_CONFIG}.
 *
 * Loaded from any of (in resolution order):
 * `--config <path>`, `coderunes.config.{js,mjs,cjs,json}`,
 * the `"coderunes"` key in `package.json`, then defaults.
 */
export interface RepoMapConfig {
  /** Glob patterns for files to scan. Default: `['src/**\/*.{ts,tsx,js,jsx,mjs,cjs}']`. */
  include?: string[];

  /** Glob patterns to exclude. Layered on top of `.gitignore`. */
  ignore?: string[];

  /** Output file path, relative to the project root. Default: `'REPO_MAP.md'`. */
  output?: string;

  /**
   * Maximum signature length before truncation with an ellipsis.
   * Set to `0` to disable truncation entirely. Minimum non-zero value is 20.
   * Default: 120.
   */
  maxSignatureLength?: number;

  /** See {@link SignatureMode}. Default: `"full"`. */
  signatureMode?: SignatureMode;

  /** When true, adds `## <directory>` headers above the per-file `### <file>` headers. */
  groupByDirectory?: boolean;

  /** When true, extracts the first line of any top-of-file JSDoc as a one-line summary. */
  includeFileSummary?: boolean;

  /** Custom markdown header to prepend to the output. Replaces the default banner. */
  header?: string;
}

/**
 * Fully-resolved config used internally. All fields are non-optional; defaults
 * have been applied and the resolution context (`cwd`, `configPath`) is included.
 */
export interface ResolvedConfig {
  include: string[];
  ignore: string[];
  output: string;
  maxSignatureLength: number;
  signatureMode: SignatureMode;
  groupByDirectory: boolean;
  includeFileSummary: boolean;

  /** Custom header text, or `null` to use the default banner. */
  header: string | null;

  /** Absolute path of the project root for this run. */
  cwd: string;

  /** Absolute path of the config file that was loaded, or `null` if defaults were used. */
  configPath: string | null;
}

/**
 * One file's worth of extracted exports, ready to be rendered.
 * Files with zero signatures are dropped before rendering.
 */
export interface FileEntry {
  /** POSIX-style path relative to the project root (e.g., `src/auth/session.ts`). */
  file: string;

  /** Per-export signatures, in source order. */
  signatures: string[];

  /** First line of the top-of-file JSDoc, when `includeFileSummary` is enabled. */
  summary: string | null;
}

/**
 * Default values applied to any field a user's config omits.
 * Exposed for tests and consumers building config tooling on top of coderunes.
 */
export const DEFAULT_CONFIG: Omit<ResolvedConfig, "cwd" | "configPath"> = {
  include: ["src/**/*.{ts,tsx,js,jsx,mjs,cjs}"],
  ignore: [
    "**/node_modules/**",
    "**/dist/**",
    "**/build/**",
    "**/*.test.*",
    "**/*.spec.*",
    "**/*.d.ts",
  ],
  output: "REPO_MAP.md",
  maxSignatureLength: 120,
  signatureMode: "full",
  groupByDirectory: false,
  includeFileSummary: false,
  header: null,
};
