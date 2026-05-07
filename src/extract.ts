import { readFile } from "node:fs/promises";
import { parse, Lang } from "@ast-grep/napi";
import type { SgNode } from "@ast-grep/napi";
import type { SignatureMode } from "./types.js";

/**
 * AST node kinds that represent the *body* of a declaration we want to strip
 * from the rendered signature. Specifically excludes `interface_body`,
 * `object`, and `type_literal` — those are the API contract itself, not
 * implementation noise. Cutting at the start of these nodes turns
 * `function foo(a): R { ... }` into `function foo(a): R`.
 */
const BODY_KINDS = new Set(["statement_block", "class_body", "enum_body"]);

/**
 * Re-export forms (`export *`, `export { ... }`, `export type { ... }`).
 * These look like declarations syntactically but their text IS the API
 * surface — bindings and source. We render them verbatim.
 */
const RE_EXPORT_RE = /^export\s*(\*|type\s*\*|\{|type\s*\{)/;

/**
 * Type-level declarations (`type` aliases and `interface`s). Their bodies
 * are the API contract, so we keep them intact (just flattened to one line).
 */
const TYPE_INTERFACE_RE = /^export\s+(default\s+)?(type|interface)\b/;

/**
 * Splits an export statement into its declaration shape for "name" mode.
 * Captures: `default?`, `async?`, kind keyword, optional identifier.
 * Anonymous defaults (no identifier) match with `name` undefined.
 */
const NAME_KIND_RE =
  /^export\s+(default\s+)?(async\s+)?(abstract\s+class|class|function|interface|type|enum|namespace|module|const|let|var)(?:\s+([A-Za-z_$][\w$]*))?/;

/**
 * Heuristic threshold: default exports of literal expressions shorter than
 * this stay verbatim in name mode (`export default 42`); longer ones collapse
 * to a kind hint (`export default <object>`).
 */
const SHORT_LITERAL_LIMIT = 40;

/**
 * Maps a file path to the ast-grep language mode used for parsing.
 * `.jsx` is parsed as TSX so JSX syntax is recognized; pure JS uses
 * the JavaScript grammar.
 */
export function langFor(file: string): Lang {
  if (file.endsWith(".tsx")) return Lang.Tsx;
  if (file.endsWith(".ts") || file.endsWith(".mts") || file.endsWith(".cts")) {
    return Lang.TypeScript;
  }
  if (file.endsWith(".jsx")) return Lang.Tsx;
  return Lang.JavaScript;
}

/**
 * Recursively searches `node` for the first descendant whose kind is in
 * {@link BODY_KINDS}. Returns `null` if the export has no body to strip
 * (re-exports, types, interfaces, value declarations like `export const x = 1`).
 */
function findBody(node: SgNode): SgNode | null {
  for (const child of node.children()) {
    const kind = String(child.kind());
    if (BODY_KINDS.has(kind)) return child;

    const nested = findBody(child);
    if (nested) return nested;
  }
  return null;
}

/**
 * Strips block (`/* ... *\/`) and line comments from a snippet of source,
 * skipping over string and template literals so we don't accidentally
 * butcher contents like the `/**\/*.ts` portion of a glob pattern.
 *
 * Used so JSDoc on interface fields or object literal properties doesn't
 * bloat the rendered signature when we keep type/interface bodies intact.
 *
 * Note: this is a string-aware *lexer*, not a full parser. It handles the
 * cases that show up in export signatures (string literals, template
 * literals, escapes) and skips template-literal interpolation tracking
 * because the patterns we render rarely contain `${ }` with embedded code.
 */
function stripComments(text: string): string {
  let out = "";
  let i = 0;
  let inString: string | null = null;

  while (i < text.length) {
    const ch = text[i] ?? "";
    const next = text[i + 1];

    if (inString) {
      if (ch === "\\" && i + 1 < text.length) {
        // Preserve escape sequences verbatim.
        out += text.slice(i, i + 2);
        i += 2;
        continue;
      }
      if (ch === inString) {
        inString = null;
      }
      out += ch;
      i++;
      continue;
    }

    // Outside any string: enter a string literal on a quote character.
    if (ch === "'" || ch === '"' || ch === "`") {
      inString = ch;
      out += ch;
      i++;
      continue;
    }

    // Block comment: skip to closing `*/`.
    if (ch === "/" && next === "*") {
      const end = text.indexOf("*/", i + 2);
      if (end === -1) break;
      i = end + 2;
      continue;
    }

    // Line comment: skip to end of line (don't drop the newline itself —
    // it acts as a token separator that the whitespace-collapsing step
    // will fold away cleanly).
    if (ch === "/" && next === "/") {
      const end = text.indexOf("\n", i + 2);
      if (end === -1) break;
      i = end;
      continue;
    }

    out += ch;
    i++;
  }

  return out;
}

/**
 * Collapses whitespace, strips comments and trailing semicolons, and
 * truncates with an ellipsis when `maxLen > 0`. `maxLen <= 0` disables
 * truncation entirely.
 */
function normalize(text: string, maxLen: number): string {
  let out = stripComments(text).trim().replace(/\s+/g, " ").replace(/;\s*$/, "");
  if (maxLen > 0 && out.length > maxLen) {
    out = out.slice(0, maxLen - 1) + "…";
  }
  return out;
}

/**
 * Renders a single `export_statement` AST node into a one-line signature
 * string. Behavior depends on `mode`:
 *
 * - `"full"` — strip function/class/enum bodies, keep everything else.
 * - `"name"` — strip down to `export [default] [async] <kind> <name>`.
 *
 * In both modes, re-exports are rendered verbatim because the binding names
 * are the navigationally interesting part.
 */
export function toSignature(node: SgNode, maxLen: number, mode: SignatureMode = "full"): string {
  const text = node.text().trim();

  if (mode === "name") {
    return toNameSignature(text, maxLen);
  }

  // Re-exports and type-level decls: rendered verbatim (no body to cut).
  if (RE_EXPORT_RE.test(text) || TYPE_INTERFACE_RE.test(text)) {
    return normalize(text, maxLen);
  }

  // For function/class/enum, slice the source text up to the body's start
  // position. Using AST ranges (not regex on `{`) is what makes this safe
  // for declarations whose signature itself contains braces, such as
  // destructured params or generic bounds with object types.
  const body = findBody(node);
  if (body) {
    const nodeRange = node.range();
    const bodyRange = body.range();
    const offset = bodyRange.start.index - nodeRange.start.index;
    if (offset > 0) {
      const sliced = text.slice(0, offset).trim();
      return normalize(sliced, maxLen);
    }
  }

  // Fallback: no body found (e.g., `export const x = 1`). Render verbatim.
  return normalize(text, maxLen);
}

/**
 * Builds a "name" mode signature. Prefers AST-text inspection via regex
 * over walking the AST because the relevant tokens (`default`, `async`,
 * kind keyword, identifier) all live at the start of the source text.
 */
function toNameSignature(text: string, maxLen: number): string {
  // Re-exports preserved verbatim — the binding names ARE the signature.
  if (RE_EXPORT_RE.test(text)) {
    return normalize(text, maxLen);
  }

  // Standard declaration: rebuild from captured pieces so we drop everything
  // after the identifier (params, generics, return type, body, initializer).
  const m = NAME_KIND_RE.exec(text);
  if (m) {
    const isDefault = Boolean(m[1]);
    const isAsync = Boolean(m[2]);
    const kind = (m[3] ?? "").replace(/\s+/g, " ");
    const name = m[4];

    const parts = ["export"];
    if (isDefault) parts.push("default");
    if (isAsync) parts.push("async");
    parts.push(kind);
    if (name) parts.push(name);

    return normalize(parts.join(" "), maxLen);
  }

  // Anonymous default expression: no kind keyword, no identifier.
  // Examples: `export default 42`, `export default someFn()`, `export default { ... }`.
  const def = /^export\s+default\s+([\s\S]+?)\s*;?\s*$/.exec(text);
  if (def && def[1]) {
    return normalize(formatDefaultExpr(def[1]), maxLen);
  }

  return normalize(text, maxLen);
}

/**
 * Formats the right-hand side of an anonymous `export default <expr>`.
 * Short expressions are kept verbatim (the value IS the most identifying
 * thing the agent has). Long ones collapse to a kind placeholder so the
 * map doesn't fill with serialized object literals.
 */
function formatDefaultExpr(rawExpr: string): string {
  const expr = rawExpr.trim().replace(/\s+/g, " ").replace(/;\s*$/, "");

  if (expr.length <= SHORT_LITERAL_LIMIT) {
    return `export default ${expr}`;
  }

  let placeholder: string;
  if (expr.startsWith("{")) placeholder = "<object>";
  else if (expr.startsWith("[")) placeholder = "<array>";
  else placeholder = "<expression>";

  return `export default ${placeholder}`;
}

/**
 * Pulls a one-line summary from the file's leading JSDoc block, when one
 * is present. Skips `@tag-only` lines so files whose JSDoc is purely
 * `@module foo` or `@internal` return `null`.
 */
export function extractFileSummary(source: string): string | null {
  const match = source.match(/^\s*\/\*\*([\s\S]*?)\*\//);
  if (!match || !match[1]) return null;

  const lines = match[1]
    .split("\n")
    .map((l) => l.replace(/^\s*\*\s?/, "").trim())
    .filter((l) => l && !l.startsWith("@"));

  const first = lines[0];
  return first ? first : null;
}

/**
 * Result of extracting exports from a single file.
 */
export interface ExtractResult {
  signatures: string[];
  summary: string | null;
}

/**
 * Reads a single source file and extracts its rendered export signatures.
 *
 * Errors are intentionally non-fatal: read failures, parser crashes, and
 * per-export rendering errors all surface as warnings via `onWarn` and the
 * file is skipped. One bad file should never abort a whole-repo run.
 */
export async function extractFile(
  absPath: string,
  opts: {
    maxSignatureLength: number;
    includeFileSummary: boolean;
    signatureMode?: SignatureMode;
  },
  onWarn: (msg: string) => void,
): Promise<ExtractResult> {
  let source: string;
  try {
    source = await readFile(absPath, "utf8");
  } catch (err) {
    onWarn(`coderunes: could not read ${absPath}: ${(err as Error).message}`);
    return { signatures: [], summary: null };
  }

  let root: SgNode;
  try {
    root = parse(langFor(absPath), source).root();
  } catch (err) {
    onWarn(`coderunes: parse error in ${absPath}: ${(err as Error).message}`);
    return { signatures: [], summary: null };
  }

  let nodes: SgNode[];
  try {
    nodes = root.findAll({ rule: { kind: "export_statement" } });
  } catch (err) {
    onWarn(`coderunes: traversal error in ${absPath}: ${(err as Error).message}`);
    return { signatures: [], summary: null };
  }

  const signatures: string[] = [];
  const mode: SignatureMode = opts.signatureMode ?? "full";

  for (const node of nodes) {
    try {
      const sig = toSignature(node, opts.maxSignatureLength, mode);
      if (sig) signatures.push(sig);
    } catch (err) {
      onWarn(`coderunes: signature error in ${absPath}: ${(err as Error).message}`);
    }
  }

  const summary = opts.includeFileSummary ? extractFileSummary(source) : null;
  return { signatures, summary };
}
