#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { resolveConfig } from "./config.js";
import { generate } from "./generate.js";
import { checkAgainstFile } from "./check.js";
import { runInit } from "./init.js";

interface ParsedArgs {
  command: "generate" | "init" | "help" | "version";
  check: boolean;
  configPath: string | null;
  outputOverride: string | null;
  positional: string[];
}

const HELP = `coderunes — generate REPO_MAP.md from your source files

Usage
  coderunes                Generate REPO_MAP.md in the current directory
  coderunes --check        Exit non-zero if existing REPO_MAP.md is stale (CI mode)
  coderunes --config <p>   Use a specific config file
  coderunes --output <p>   Override the output path
  coderunes init           Drop a starter coderunes.config.json + npm scripts
  coderunes --help
  coderunes --version

Exit codes
  0  success / map up to date
  1  internal error
  2  --check found a stale or missing map
`;

function parseArgs(argv: string[]): ParsedArgs {
  const args: ParsedArgs = {
    command: "generate",
    check: false,
    configPath: null,
    outputOverride: null,
    positional: [],
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === undefined) continue;
    if (a === "--help" || a === "-h") args.command = "help";
    else if (a === "--version" || a === "-v") args.command = "version";
    else if (a === "--check") args.check = true;
    else if (a === "--config") args.configPath = argv[++i] ?? null;
    else if (a.startsWith("--config=")) args.configPath = a.slice(9);
    else if (a === "--output" || a === "-o") args.outputOverride = argv[++i] ?? null;
    else if (a.startsWith("--output=")) args.outputOverride = a.slice(9);
    else if (a.startsWith("-")) {
      throw new Error(`unknown flag: ${a}`);
    } else {
      args.positional.push(a);
    }
  }

  const first = args.positional[0];
  if (first === "init") args.command = "init";
  else if (first !== undefined && args.command === "generate") {
    throw new Error(`unknown command: ${first}`);
  }

  return args;
}

async function readPkgVersion(): Promise<string> {
  try {
    const here = path.dirname(new URL(import.meta.url).pathname);
    const pkgPath = path.resolve(here, "..", "package.json");
    const { readFile } = await import("node:fs/promises");
    const text = await readFile(pkgPath, "utf8");
    const pkg = JSON.parse(text);
    return typeof pkg.version === "string" ? pkg.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
}

function formatStaleHint(outPath: string): string {
  return [
    `coderunes: ${outPath} is out of date.`,
    "  Run `coderunes` (or `npm run build:map`) and commit the result.",
  ].join("\n");
}

function formatMissingHint(outPath: string): string {
  return [
    `coderunes: ${outPath} does not exist.`,
    "  Run `coderunes` (or `npm run build:map`) to create it.",
  ].join("\n");
}

export async function main(argv: string[]): Promise<number> {
  let args: ParsedArgs;
  try {
    args = parseArgs(argv);
  } catch (err) {
    process.stderr.write(`${(err as Error).message}\n\n${HELP}`);
    return 1;
  }

  if (args.command === "help") {
    process.stdout.write(HELP);
    return 0;
  }
  if (args.command === "version") {
    process.stdout.write(`${await readPkgVersion()}\n`);
    return 0;
  }

  const cwd = process.cwd();

  if (args.command === "init") {
    const result = await runInit(cwd);
    if (result.configCreated) {
      process.stdout.write(`coderunes: created ${path.relative(cwd, result.configPath)}\n`);
    } else {
      process.stdout.write(
        `coderunes: ${path.relative(cwd, result.configPath)} already exists, leaving it alone\n`,
      );
    }
    if (result.pkgPath && result.scriptAdded) {
      process.stdout.write("coderunes: added build:map and check:map scripts to package.json\n");
    } else if (result.pkgPath) {
      process.stdout.write("coderunes: package.json scripts already present\n");
    }
    return 0;
  }

  const config = await resolveConfig({
    cwd,
    configPath: args.configPath,
    outputOverride: args.outputOverride,
  });

  const { content, warnings } = await generate(config);
  for (const w of warnings) process.stderr.write(`${w}\n`);

  if (args.check) {
    const outcome = await checkAgainstFile(content, config);
    if (outcome.status === "match") return 0;
    if (outcome.status === "missing") {
      process.stderr.write(`${formatMissingHint(outcome.expectedPath)}\n`);
      return 2;
    }
    process.stderr.write(`${formatStaleHint(outcome.expectedPath)}\n`);
    return 2;
  }

  const outPath = path.resolve(cwd, config.output);
  await writeFile(outPath, content);
  process.stdout.write(`coderunes: wrote ${path.relative(cwd, outPath)}\n`);
  return 0;
}

const isCli = import.meta.url === `file://${process.argv[1]}`;
if (isCli) {
  main(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((err) => {
      process.stderr.write(`coderunes: ${(err as Error).stack ?? err}\n`);
      process.exit(1);
    });
}
