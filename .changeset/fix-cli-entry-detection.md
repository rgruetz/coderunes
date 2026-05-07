---
"coderunes": patch
---

Fix the CLI silently doing nothing when invoked via the `coderunes` bin (`npx coderunes`, `npm run`, or any consumer's installed copy).

The entry-point check used a naive string comparison between `import.meta.url` and `\`file://${process.argv[1]}\``. When npm/npx invokes the bin, `process.argv[1]` is the symlink path at `node_modules/.bin/coderunes` while `import.meta.url` is the resolved real path at `node_modules/coderunes/dist/cli.js`. The strings never matched, so `main()` was never called — `npx coderunes init` would exit 0 having done nothing, and `npx coderunes --check` would report "up to date" without actually checking anything. **Local development invocations (`node dist/cli.js`) happened to work because there was no symlink in the path, which is why this slipped through.**

Replaced with a `realpathSync`-based comparison that resolves symlinks on both sides before comparing, with a try/catch fallback so missing files don't crash the CLI startup.
