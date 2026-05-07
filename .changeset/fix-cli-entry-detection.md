---
"coderunes": patch
---

Fix the CLI silently doing nothing when invoked via the `coderunes` bin. The entry-point check failed through npm's bin symlinks, so `npx coderunes init` and `coderunes --check` ran but never executed `main()`. Replaced with a `realpathSync`-based comparison that handles the symlink correctly.
