import { describe, it, expect } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generate } from "../src/generate.js";
import { resolveConfig } from "../src/config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(__dirname, "fixtures", "sample-repo");

describe("generate", () => {
  it("produces deterministic output across runs", async () => {
    const config = await resolveConfig({ cwd: FIXTURE });
    const a = await generate(config);
    const b = await generate(config);
    expect(a.content).toBe(b.content);
  });

  it("includes valid TS, TSX, JS, and JSX files", async () => {
    const config = await resolveConfig({ cwd: FIXTURE });
    const { content } = await generate(config);
    expect(content).toContain("### src/auth/session.ts");
    expect(content).toContain("### src/auth/middleware.ts");
    expect(content).toContain("### src/auth/index.ts");
    expect(content).toContain("### src/widgets/Button.tsx");
    expect(content).toContain("### src/utils.js");
    expect(content).toContain("### src/legacy.jsx");
  });

  it("captures classes, functions, types, and re-exports", async () => {
    const config = await resolveConfig({ cwd: FIXTURE });
    const { content } = await generate(config);
    expect(content).toContain("export class SessionStore");
    expect(content).toContain("export function createSession(userId: string");
    expect(content).toContain("export interface Session {");
    expect(content).toContain('export * from "./session.js"');
    expect(content).toContain("export type SessionId = string");
  });

  it("skips files with no exports and ignored test files", async () => {
    const config = await resolveConfig({ cwd: FIXTURE });
    const { content } = await generate(config);
    expect(content).not.toContain("empty.ts");
    expect(content).not.toContain("notes.test.ts");
  });

  it("respects .gitignore", async () => {
    const config = await resolveConfig({ cwd: FIXTURE });
    const { content } = await generate(config);
    expect(content).not.toContain("secret.ts");
    expect(content).not.toContain("SECRET");
  });

  it("handles files with parse errors gracefully", async () => {
    const config = await resolveConfig({ cwd: FIXTURE });
    const { content, warnings } = await generate(config);
    expect(content).toContain("### src/auth/session.ts"); // generation continued
    expect(Array.isArray(warnings)).toBe(true);
  });

  it("sorts file entries alphabetically", async () => {
    const config = await resolveConfig({ cwd: FIXTURE });
    const { content } = await generate(config);
    const headings = [...content.matchAll(/^### (.+)$/gm)].map((m) => m[1]!);
    const sorted = [...headings].sort();
    expect(headings).toEqual(sorted);
  });
});
