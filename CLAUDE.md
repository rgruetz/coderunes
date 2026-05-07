# CLAUDE.md

Project context for Claude Code working in this repository.

## What this is

`coderunes` — a public npm package that generates `REPO_MAP.md` for Node.js repos: a token-efficient table of contents listing every source file's public exports. Designed to be loaded into a coding agent's context as always-on grounding, so the agent navigates by file rather than scanning the codebase.

User-facing docs live in `README.md`; design rationale is captured in code comments and in this file.

## Layout

```
src/
  cli.ts        CLI entry, argv parsing, exit codes (0 ok, 1 error, 2 stale)
  config.ts     Resolves --config / coderunes.config.* / package.json key / defaults
  extract.ts    ast-grep parsing + signature rendering (full + name modes)
  generate.ts   Top-level pipeline: discover → extract → render
  glob.ts       File discovery via fast-glob + .gitignore + .coderunesignore
  render.ts     Markdown rendering, sorted/deterministic
  check.ts      --check comparison logic
  init.ts       `coderunes init` — drops starter config + npm scripts
  index.ts      Programmatic API barrel
  types.ts      RepoMapConfig, ResolvedConfig, FileEntry, SignatureMode, DEFAULT_CONFIG

test/
  *.test.ts     Vitest suites
  fixtures/     Sample repos used by integration-style tests (excluded from lint + map)
```

## Commands

| Command                | What it does                                                            |
| ---------------------- | ----------------------------------------------------------------------- |
| `npm run build`        | Compile `src/` → `dist/` via `tsc`                                      |
| `npm test`             | Run vitest suite                                                        |
| `npm run lint`         | ESLint (typescript-eslint recommendedTypeChecked)                       |
| `npm run lint:fix`     | ESLint with autofix                                                     |
| `npm run format`       | Prettier write                                                          |
| `npm run format:check` | Prettier check (CI mode)                                                |
| `npm run build:map`    | Regenerate this repo's own `REPO_MAP.md` (runs `node dist/cli.js`)      |
| `npm run check:map`    | Verify `REPO_MAP.md` is up to date (CI mode, exits 2 if stale)          |
| `npm run ci`           | format:check + lint + build + test + check:map (full pre-push gauntlet) |

In this repo we invoke the CLI as `node dist/cli.js` (or via the npm scripts) because there's no `node_modules/.bin/coderunes` symlink pointing to ourselves. Consumers just type `coderunes` after installing.

## Conventions

- **JSDoc on every public export** (functions, types, interfaces, constants). This is a published library — JSDoc surfaces in consumer IntelliSense.
- **"Why" comments** at non-obvious spots (AST range arithmetic, regex pitfalls, fallback ordering, error semantics). Don't comment what well-named code already says.
- **Whitespace** between unrelated stanzas inside functions — readability matters.
- **Determinism is load-bearing.** The map's whole value is that consumers can commit it and check it in CI. Sorting, comment stripping, and trailing newlines all exist to keep output byte-identical across runs.
- **Errors are non-fatal where it matters.** Per-file parse errors warn-and-skip; one broken file should never abort a whole-repo run.
- **No backwards-compatibility shims.** Pre-1.0; change shapes when needed and bump the version.

## After editing `src/`

The package dogfoods itself — its own `REPO_MAP.md` is generated from `src/`. After any source change:

1. `npm run build` (refresh `dist/`)
2. `npm run build:map` (regenerate the map)
3. Commit the regenerated `REPO_MAP.md` alongside the src change.

`npm run check:map` will fail in CI if the committed map drifts from source.

## Local config quirks

- `coderunes.config.json` at the repo root sets `maxSignatureLength: 0` (no truncation) for this repo's own map. That's a project-local preference; defaults remain `120` and `signatureMode: "full"` for downstream consumers.
- `test/fixtures/**` is ignored by Prettier, ESLint, and the map config — fixture files contain intentionally weird code (broken syntax, gitignored content) that linting would flag.

## Branching / PRs

- `main` is the trunk (kept empty until the first PR merges).
- Feature work happens on `feat/...` branches and lands via PR to `main`.
- Initial implementation lives on `feat/initial-implementation`.

## Open questions deferred to v0.2

- JSON output as an alternative format (for tooling that wants structured data).
- Per-package maps in monorepos (`packages/*/REPO_MAP.md` with a root index).
- Additional `signatureMode` values beyond `"full"` and `"name"` if a concrete need shows up.
