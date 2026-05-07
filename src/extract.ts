import { readFile } from "node:fs/promises";
import { parse, Lang } from "@ast-grep/napi";
import type { SgNode } from "@ast-grep/napi";

const BODY_KINDS = new Set([
  "statement_block",
  "class_body",
  "enum_body",
]);

const RE_EXPORT_RE = /^export\s*(\*|type\s*\*|\{|type\s*\{)/;
const TYPE_INTERFACE_RE = /^export\s+(default\s+)?(type|interface)\b/;

export function langFor(file: string): Lang {
  if (file.endsWith(".tsx")) return Lang.Tsx;
  if (file.endsWith(".ts") || file.endsWith(".mts") || file.endsWith(".cts")) {
    return Lang.TypeScript;
  }
  if (file.endsWith(".jsx")) return Lang.Tsx;
  return Lang.JavaScript;
}

function findBody(node: SgNode): SgNode | null {
  for (const child of node.children()) {
    const kind = String(child.kind());
    if (BODY_KINDS.has(kind)) return child;
    const nested = findBody(child);
    if (nested) return nested;
  }
  return null;
}

function normalize(text: string, maxLen: number): string {
  let out = text.trim().replace(/\s+/g, " ").replace(/;\s*$/, "");
  if (out.length > maxLen) out = out.slice(0, maxLen - 1) + "…";
  return out;
}

export function toSignature(node: SgNode, maxLen: number): string {
  const text = node.text().trim();

  if (RE_EXPORT_RE.test(text) || TYPE_INTERFACE_RE.test(text)) {
    return normalize(text, maxLen);
  }

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

  return normalize(text, maxLen);
}

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

export interface ExtractResult {
  signatures: string[];
  summary: string | null;
}

export async function extractFile(
  absPath: string,
  opts: { maxSignatureLength: number; includeFileSummary: boolean },
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
  for (const node of nodes) {
    try {
      const sig = toSignature(node, opts.maxSignatureLength);
      if (sig) signatures.push(sig);
    } catch (err) {
      onWarn(
        `coderunes: signature error in ${absPath}: ${(err as Error).message}`,
      );
    }
  }

  const summary = opts.includeFileSummary ? extractFileSummary(source) : null;
  return { signatures, summary };
}
