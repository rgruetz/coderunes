import { describe, it, expect } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { extractFile, extractFileSummary } from "../src/extract.js";

async function withTmpFile(
  name: string,
  content: string,
  fn: (absPath: string) => Promise<void>,
): Promise<void> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "coderunes-"));
  const abs = path.join(dir, name);
  try {
    await writeFile(abs, content);
    await fn(abs);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const opts = { maxSignatureLength: 120, includeFileSummary: false };

describe("extractFile", () => {
  it("extracts function signatures and cuts the body", async () => {
    await withTmpFile(
      "fn.ts",
      `export function add(a: number, b: number): number {\n  return a + b;\n}\n`,
      async (abs) => {
        const out = await extractFile(abs, opts, () => {});
        expect(out.signatures).toEqual(["export function add(a: number, b: number): number"]);
      },
    );
  });

  it("keeps interface bodies on a single line", async () => {
    await withTmpFile(
      "iface.ts",
      `export interface Point {\n  x: number;\n  y: number;\n}\n`,
      async (abs) => {
        const out = await extractFile(abs, opts, () => {});
        expect(out.signatures).toEqual([
          "export interface Point { x: number; y: number; }",
        ]);
      },
    );
  });

  it("preserves type aliases including unions", async () => {
    await withTmpFile(
      "type.ts",
      `export type Result = { ok: true } | { ok: false; reason: string };\n`,
      async (abs) => {
        const out = await extractFile(abs, opts, () => {});
        expect(out.signatures).toEqual([
          'export type Result = { ok: true } | { ok: false; reason: string }',
        ]);
      },
    );
  });

  it("preserves re-exports", async () => {
    await withTmpFile(
      "re.ts",
      `export * from "./a.js";\nexport { foo, bar } from "./b.js";\nexport type { Baz } from "./c.js";\n`,
      async (abs) => {
        const out = await extractFile(abs, opts, () => {});
        expect(out.signatures).toEqual([
          'export * from "./a.js"',
          'export { foo, bar } from "./b.js"',
          'export type { Baz } from "./c.js"',
        ]);
      },
    );
  });

  it("cuts class bodies", async () => {
    await withTmpFile(
      "cls.ts",
      `export class Foo extends Bar {\n  constructor() { super(); }\n  hello() { return 1; }\n}\n`,
      async (abs) => {
        const out = await extractFile(abs, opts, () => {});
        expect(out.signatures).toEqual(["export class Foo extends Bar"]);
      },
    );
  });

  it("truncates very long signatures with an ellipsis", async () => {
    const long = "a".repeat(200);
    await withTmpFile(
      "long.ts",
      `export function fn(x: ${long}): void {}\n`,
      async (abs) => {
        const out = await extractFile(abs, opts, () => {});
        expect(out.signatures.length).toBe(1);
        const sig = out.signatures[0]!;
        expect(sig.length).toBeLessThanOrEqual(120);
        expect(sig.endsWith("…")).toBe(true);
      },
    );
  });

  it("does not truncate when maxSignatureLength is 0", async () => {
    const long = "a".repeat(200);
    await withTmpFile(
      "long.ts",
      `export function fn(x: ${long}): void {}\n`,
      async (abs) => {
        const out = await extractFile(
          abs,
          { maxSignatureLength: 0, includeFileSummary: false },
          () => {},
        );
        expect(out.signatures.length).toBe(1);
        const sig = out.signatures[0]!;
        expect(sig.endsWith("…")).toBe(false);
        expect(sig.length).toBeGreaterThan(200);
      },
    );
  });

  it("cuts arrow function bodies", async () => {
    await withTmpFile(
      "arrow.ts",
      `export const f = (x: number) => {\n  return x * 2;\n};\n`,
      async (abs) => {
        const out = await extractFile(abs, opts, () => {});
        expect(out.signatures).toEqual(["export const f = (x: number) =>"]);
      },
    );
  });

  it("handles export default function", async () => {
    await withTmpFile(
      "def.ts",
      `export default function noop(): void {}\n`,
      async (abs) => {
        const out = await extractFile(abs, opts, () => {});
        expect(out.signatures).toEqual(["export default function noop(): void"]);
      },
    );
  });

  it("does not crash on broken syntax", async () => {
    const warnings: string[] = [];
    await withTmpFile(
      "bad.ts",
      `export function broken(a: string {\n  return a.\n}\nexport const x =\n`,
      async (abs) => {
        const out = await extractFile(abs, opts, (m) => warnings.push(m));
        expect(Array.isArray(out.signatures)).toBe(true);
      },
    );
  });

  it("returns empty for files with no exports", async () => {
    await withTmpFile(
      "empty.ts",
      `const x = 1;\nconsole.log(x);\n`,
      async (abs) => {
        const out = await extractFile(abs, opts, () => {});
        expect(out.signatures).toEqual([]);
      },
    );
  });

  it("handles JSX/TSX with React-style components", async () => {
    await withTmpFile(
      "Btn.tsx",
      `export interface Props { label: string }\nexport function Button(p: Props) {\n  return <button>{p.label}</button>;\n}\n`,
      async (abs) => {
        const out = await extractFile(abs, opts, () => {});
        expect(out.signatures).toEqual([
          "export interface Props { label: string }",
          "export function Button(p: Props)",
        ]);
      },
    );
  });

  it("extracts file summaries when enabled", async () => {
    await withTmpFile(
      "doc.ts",
      `/**\n * The auth module.\n * @module auth\n */\nexport function f(): void {}\n`,
      async (abs) => {
        const out = await extractFile(
          abs,
          { maxSignatureLength: 120, includeFileSummary: true },
          () => {},
        );
        expect(out.summary).toBe("The auth module.");
      },
    );
  });
});

describe("name mode", () => {
  const nameOpts = {
    maxSignatureLength: 120,
    includeFileSummary: false,
    signatureMode: "name" as const,
  };

  it("strips function params and return types", async () => {
    await withTmpFile(
      "fn.ts",
      `export function add(a: number, b: number): number { return a + b; }\n`,
      async (abs) => {
        const out = await extractFile(abs, nameOpts, () => {});
        expect(out.signatures).toEqual(["export function add"]);
      },
    );
  });

  it("strips async, generics, and return types", async () => {
    await withTmpFile(
      "fn.ts",
      `export async function fetchUser<T>(id: string): Promise<T> { return null as T; }\n`,
      async (abs) => {
        const out = await extractFile(abs, nameOpts, () => {});
        expect(out.signatures).toEqual(["export async function fetchUser"]);
      },
    );
  });

  it("strips class extends and bodies", async () => {
    await withTmpFile(
      "cls.ts",
      `export class Foo extends Bar { hello() { return 1; } }\n`,
      async (abs) => {
        const out = await extractFile(abs, nameOpts, () => {});
        expect(out.signatures).toEqual(["export class Foo"]);
      },
    );
  });

  it("strips interface bodies", async () => {
    await withTmpFile(
      "i.ts",
      `export interface Session { id: string; userId: string; }\n`,
      async (abs) => {
        const out = await extractFile(abs, nameOpts, () => {});
        expect(out.signatures).toEqual(["export interface Session"]);
      },
    );
  });

  it("strips type aliases", async () => {
    await withTmpFile(
      "t.ts",
      `export type Result<T> = { ok: T } | { err: string };\n`,
      async (abs) => {
        const out = await extractFile(abs, nameOpts, () => {});
        expect(out.signatures).toEqual(["export type Result"]);
      },
    );
  });

  it("strips const initializers", async () => {
    await withTmpFile(
      "c.ts",
      `export const PI = 3.14159;\nexport const greet = (name: string) => name;\n`,
      async (abs) => {
        const out = await extractFile(abs, nameOpts, () => {});
        expect(out.signatures).toEqual([
          "export const PI",
          "export const greet",
        ]);
      },
    );
  });

  it("preserves re-exports verbatim", async () => {
    await withTmpFile(
      "re.ts",
      `export * from "./a.js";\nexport { foo, bar } from "./b.js";\n`,
      async (abs) => {
        const out = await extractFile(abs, nameOpts, () => {});
        expect(out.signatures).toEqual([
          'export * from "./a.js"',
          'export { foo, bar } from "./b.js"',
        ]);
      },
    );
  });

  it("named default function: strips params", async () => {
    await withTmpFile(
      "d.ts",
      `export default function noop(): void {}\n`,
      async (abs) => {
        const out = await extractFile(abs, nameOpts, () => {});
        expect(out.signatures).toEqual(["export default function noop"]);
      },
    );
  });

  it("anonymous default function shows kind only", async () => {
    await withTmpFile(
      "d.ts",
      `export default function() { return 1; }\n`,
      async (abs) => {
        const out = await extractFile(abs, nameOpts, () => {});
        expect(out.signatures).toEqual(["export default function"]);
      },
    );
  });

  it("anonymous default class shows kind only", async () => {
    await withTmpFile(
      "d.ts",
      `export default class { method() {} }\n`,
      async (abs) => {
        const out = await extractFile(abs, nameOpts, () => {});
        expect(out.signatures).toEqual(["export default class"]);
      },
    );
  });

  it("short literal default exports keep their value", async () => {
    await withTmpFile(
      "d.ts",
      `export default 42;\n`,
      async (abs) => {
        const out = await extractFile(abs, nameOpts, () => {});
        expect(out.signatures).toEqual(["export default 42"]);
      },
    );
  });

  it("short identifier default exports keep their reference", async () => {
    await withTmpFile(
      "d.ts",
      `export default someFunction;\n`,
      async (abs) => {
        const out = await extractFile(abs, nameOpts, () => {});
        expect(out.signatures).toEqual(["export default someFunction"]);
      },
    );
  });

  it("short object literal defaults are shown verbatim", async () => {
    await withTmpFile(
      "d.ts",
      `export default { a: 1, b: 2 };\n`,
      async (abs) => {
        const out = await extractFile(abs, nameOpts, () => {});
        expect(out.signatures).toEqual(["export default { a: 1, b: 2 }"]);
      },
    );
  });

  it("long object literal defaults collapse to <object>", async () => {
    const big = "key: 'a very very very very very very very long value'";
    await withTmpFile(
      "d.ts",
      `export default { ${big}, ${big} };\n`,
      async (abs) => {
        const out = await extractFile(abs, nameOpts, () => {});
        expect(out.signatures).toEqual(["export default <object>"]);
      },
    );
  });

  it("long array literal defaults collapse to <array>", async () => {
    await withTmpFile(
      "d.ts",
      `export default ["aaaaaaaaaa","bbbbbbbbbbb","cccccccccc","ddddddddd","eeeeeeeeee"];\n`,
      async (abs) => {
        const out = await extractFile(abs, nameOpts, () => {});
        expect(out.signatures).toEqual(["export default <array>"]);
      },
    );
  });

  it("long expression defaults collapse to <expression>", async () => {
    await withTmpFile(
      "d.ts",
      `export default someVeryLongIdentifier.deeply.nested.chained.property.access.thing;\n`,
      async (abs) => {
        const out = await extractFile(abs, nameOpts, () => {});
        expect(out.signatures).toEqual(["export default <expression>"]);
      },
    );
  });
});

describe("extractFileSummary", () => {
  it("returns null when no JSDoc is present", () => {
    expect(extractFileSummary("export const x = 1;\n")).toBeNull();
  });

  it("ignores @-tag-only JSDoc lines", () => {
    expect(
      extractFileSummary("/**\n * @internal\n */\nexport const x = 1;\n"),
    ).toBeNull();
  });

  it("picks the first non-tag line", () => {
    expect(
      extractFileSummary("/**\n * Real description.\n * @module foo\n */\nexport const x = 1;\n"),
    ).toBe("Real description.");
  });
});
