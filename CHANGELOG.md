# coderunes

## 0.1.2

### Patch Changes

- b5aef5c: Fix the CLI silently doing nothing when invoked via the `coderunes` bin. The entry-point check failed through npm's bin symlinks, so `npx coderunes init` and `coderunes --check` ran but never executed `main()`. Replaced with a `realpathSync`-based comparison that handles the symlink correctly.

## 0.1.1

### Patch Changes

- c6e3fc8: Fix the `bin` field so the published package actually exposes a working CLI.

  Recent npm versions consider `bin` paths that start with `./` invalid and silently drop the entry from the published tarball, so the previous package definition would have shipped without the `coderunes` command on the consumer's PATH. The path is now bare-relative (`dist/cli.js`).

  Also fixes a release-flow bug where the auto-generated "chore: release" PR bumped `package.json` but left `package-lock.json` out of sync — `npm ci` would fail on `main` after every release. The `version` npm script now runs `npm install` after `changeset version` so future Version PRs include both files. (Originally tried `npm install --package-lock-only`, but that omits some optional/platform-conditional transitives — notably `@emnapi/core` and `@emnapi/runtime` from `@ast-grep/napi` — which `npm ci` later refuses to install.)

## 0.1.0

### Minor Changes

- 958ee8a: Initial public release.

  `coderunes` generates a `REPO_MAP.md` at the root of any Node.js repository — a token-efficient table of contents listing every source file's public exports. Designed to be loaded into a coding agent's context as always-on grounding so the agent navigates by file rather than scanning the codebase.

  **CLI**
  - `coderunes` — generate `REPO_MAP.md` in the current directory.
  - `coderunes --check` — exit non-zero (code 2) if the existing map is stale or missing. Wire into CI.
  - `coderunes --config <path>` — use a specific config file.
  - `coderunes --output <path>` — override the output path.
  - `coderunes init` — drop a starter `coderunes.config.json` and add `build:map` / `check:map` npm scripts.

  **Configuration**

  Resolution order: `--config` flag → `coderunes.config.{js,mjs,cjs,json}` (walked up from `cwd`) → `"coderunes"` key in `package.json` → built-in defaults. Configurable fields: `include`, `ignore`, `output`, `maxSignatureLength`, `signatureMode`, `groupByDirectory`, `includeFileSummary`, `header`. `.gitignore` and `.coderunesignore` are respected automatically.

  **Signature modes**
  - `signatureMode: "full"` (default) — keeps full signatures, strips only function/class/enum bodies, keeps types and interfaces intact.
  - `signatureMode: "name"` — strips signatures down to `export [default] [async] <kind> <name>` for very large repos. Re-exports remain verbatim; anonymous default exports get a kind hint.

  **Other**
  - `maxSignatureLength` defaults to 120; set to `0` to disable truncation entirely.
  - Output is deterministic — same input produces byte-identical output, suitable for `--check` in CI.
  - Per-file parse errors warn-and-skip; one broken file never aborts a whole-repo run.
  - Supports JavaScript, TypeScript, JSX, and TSX via `@ast-grep/napi`.
  - Programmatic API exported alongside the CLI for tooling that wants to consume the structured `entries` directly.
