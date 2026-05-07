import { describe, it, expect } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { checkAgainstFile } from "../src/check.js";
import { DEFAULT_CONFIG } from "../src/types.js";
import type { ResolvedConfig } from "../src/types.js";

function makeConfig(cwd: string, output = "REPO_MAP.md"): ResolvedConfig {
  return { ...DEFAULT_CONFIG, output, cwd, configPath: null };
}

describe("checkAgainstFile", () => {
  it("returns missing when no file exists", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "coderunes-chk-"));
    try {
      const result = await checkAgainstFile("expected", makeConfig(dir));
      expect(result.status).toBe("missing");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("returns match for byte-identical content", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "coderunes-chk-"));
    try {
      await writeFile(path.join(dir, "REPO_MAP.md"), "abc\n");
      const result = await checkAgainstFile("abc\n", makeConfig(dir));
      expect(result.status).toBe("match");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("returns stale when content differs", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "coderunes-chk-"));
    try {
      await writeFile(path.join(dir, "REPO_MAP.md"), "old\n");
      const result = await checkAgainstFile("new\n", makeConfig(dir));
      expect(result.status).toBe("stale");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
