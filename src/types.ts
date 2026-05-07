export type SignatureMode = "full" | "name";

export interface RepoMapConfig {
  include?: string[];
  ignore?: string[];
  output?: string;
  maxSignatureLength?: number;
  signatureMode?: SignatureMode;
  groupByDirectory?: boolean;
  includeFileSummary?: boolean;
  header?: string;
}

export interface ResolvedConfig {
  include: string[];
  ignore: string[];
  output: string;
  maxSignatureLength: number;
  signatureMode: SignatureMode;
  groupByDirectory: boolean;
  includeFileSummary: boolean;
  header: string | null;
  cwd: string;
  configPath: string | null;
}

export interface FileEntry {
  file: string;
  signatures: string[];
  summary: string | null;
}

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
