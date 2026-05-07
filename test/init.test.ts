import { describe, it, expect } from "vitest";
import { mkdtemp, writeFile, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { runInit } from "../src/init.js";

async function tmpDir(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "coderunes-init-"));
}

describe("runInit", () => {
  it("creates coderunes.config.json when missing", async () => {
    const dir = await tmpDir();
    try {
      const result = await runInit(dir);
      expect(result.configCreated).toBe(true);
      const text = await readFile(result.configPath, "utf8");
      expect(text).toContain('"include"');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("does not overwrite an existing config", async () => {
    const dir = await tmpDir();
    try {
      const cfgPath = path.join(dir, "coderunes.config.json");
      await writeFile(cfgPath, '{"include":["untouched/**"]}');
      const result = await runInit(dir);
      expect(result.configCreated).toBe(false);
      const text = await readFile(cfgPath, "utf8");
      expect(text).toContain("untouched/**");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("adds build:map and check:map to package.json scripts", async () => {
    const dir = await tmpDir();
    try {
      await writeFile(
        path.join(dir, "package.json"),
        JSON.stringify({ name: "x", version: "0.0.0" }, null, 2) + "\n",
      );
      const result = await runInit(dir);
      expect(result.scriptAdded).toBe(true);
      const pkg = JSON.parse(await readFile(path.join(dir, "package.json"), "utf8"));
      expect(pkg.scripts["build:map"]).toBe("coderunes");
      expect(pkg.scripts["check:map"]).toBe("coderunes --check");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("is a no-op when scripts already exist", async () => {
    const dir = await tmpDir();
    try {
      await writeFile(
        path.join(dir, "package.json"),
        JSON.stringify(
          {
            name: "x",
            scripts: { "build:map": "custom-cmd", "check:map": "custom-check" },
          },
          null,
          2,
        ) + "\n",
      );
      const result = await runInit(dir);
      expect(result.scriptAdded).toBe(false);
      const pkg = JSON.parse(await readFile(path.join(dir, "package.json"), "utf8"));
      expect(pkg.scripts["build:map"]).toBe("custom-cmd");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("works in a project without package.json", async () => {
    const dir = await tmpDir();
    try {
      const result = await runInit(dir);
      expect(result.configCreated).toBe(true);
      expect(result.pkgPath).toBeNull();
      await stat(result.configPath); // exists
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
