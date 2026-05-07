import { describe, it, expect } from "vitest";
import { mkdtemp, writeFile, rm, mkdir } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { resolveConfig } from "../src/config.js";
import { DEFAULT_CONFIG } from "../src/types.js";

async function tmpRepo(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "coderunes-cfg-"));
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(dir, rel);
    await mkdir(path.dirname(abs), { recursive: true });
    await writeFile(abs, content);
  }
  return dir;
}

describe("resolveConfig", () => {
  it("returns defaults when no config exists", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "coderunes-cfg-"));
    try {
      const cfg = await resolveConfig({ cwd: dir });
      expect(cfg.include).toEqual(DEFAULT_CONFIG.include);
      expect(cfg.output).toBe(DEFAULT_CONFIG.output);
      expect(cfg.configPath).toBeNull();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("loads coderunes.config.json when present", async () => {
    const dir = await tmpRepo({
      "coderunes.config.json": JSON.stringify({
        include: ["lib/**/*.ts"],
        output: "MAP.md",
      }),
    });
    try {
      const cfg = await resolveConfig({ cwd: dir });
      expect(cfg.include).toEqual(["lib/**/*.ts"]);
      expect(cfg.output).toBe("MAP.md");
      expect(cfg.configPath?.endsWith("coderunes.config.json")).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("loads from package.json coderunes key as fallback", async () => {
    const dir = await tmpRepo({
      "package.json": JSON.stringify({
        name: "x",
        coderunes: { include: ["pkg/**/*.ts"] },
      }),
    });
    try {
      const cfg = await resolveConfig({ cwd: dir });
      expect(cfg.include).toEqual(["pkg/**/*.ts"]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("prefers coderunes.config.json over package.json key", async () => {
    const dir = await tmpRepo({
      "coderunes.config.json": JSON.stringify({ include: ["from-config/**"] }),
      "package.json": JSON.stringify({ coderunes: { include: ["from-pkg/**"] } }),
    });
    try {
      const cfg = await resolveConfig({ cwd: dir });
      expect(cfg.include).toEqual(["from-config/**"]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("honors --output override on top of config", async () => {
    const dir = await tmpRepo({
      "coderunes.config.json": JSON.stringify({ output: "FROM_CFG.md" }),
    });
    try {
      const cfg = await resolveConfig({ cwd: dir, outputOverride: "OVERRIDE.md" });
      expect(cfg.output).toBe("OVERRIDE.md");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("loads explicit --config path", async () => {
    const dir = await tmpRepo({
      "custom.json": JSON.stringify({ include: ["custom/**"] }),
    });
    try {
      const cfg = await resolveConfig({ cwd: dir, configPath: "custom.json" });
      expect(cfg.include).toEqual(["custom/**"]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("rejects invalid include shape", async () => {
    const dir = await tmpRepo({
      "coderunes.config.json": JSON.stringify({ include: "not-an-array" }),
    });
    try {
      await expect(resolveConfig({ cwd: dir })).rejects.toThrow(/include/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("accepts maxSignatureLength of 0 to disable truncation", async () => {
    const dir = await tmpRepo({
      "coderunes.config.json": JSON.stringify({ maxSignatureLength: 0 }),
    });
    try {
      const cfg = await resolveConfig({ cwd: dir });
      expect(cfg.maxSignatureLength).toBe(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("rejects positive maxSignatureLength below 20", async () => {
    const dir = await tmpRepo({
      "coderunes.config.json": JSON.stringify({ maxSignatureLength: 5 }),
    });
    try {
      await expect(resolveConfig({ cwd: dir })).rejects.toThrow(/maxSignatureLength/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("rejects negative maxSignatureLength", async () => {
    const dir = await tmpRepo({
      "coderunes.config.json": JSON.stringify({ maxSignatureLength: -1 }),
    });
    try {
      await expect(resolveConfig({ cwd: dir })).rejects.toThrow(/maxSignatureLength/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("defaults signatureMode to full", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "coderunes-cfg-"));
    try {
      const cfg = await resolveConfig({ cwd: dir });
      expect(cfg.signatureMode).toBe("full");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("accepts signatureMode: name", async () => {
    const dir = await tmpRepo({
      "coderunes.config.json": JSON.stringify({ signatureMode: "name" }),
    });
    try {
      const cfg = await resolveConfig({ cwd: dir });
      expect(cfg.signatureMode).toBe("name");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("rejects unknown signatureMode values", async () => {
    const dir = await tmpRepo({
      "coderunes.config.json": JSON.stringify({ signatureMode: "compact" }),
    });
    try {
      await expect(resolveConfig({ cwd: dir })).rejects.toThrow(/signatureMode/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
