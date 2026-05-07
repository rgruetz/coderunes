---
"coderunes": patch
---

Fix the `bin` field so the published package actually exposes a working CLI.

Recent npm versions consider `bin` paths that start with `./` invalid and silently drop the entry from the published tarball, so the previous package definition would have shipped without the `coderunes` command on the consumer's PATH. The path is now bare-relative (`dist/cli.js`).

Also fixes a release-flow bug where the auto-generated "chore: release" PR bumped `package.json` but left `package-lock.json` out of sync — `npm ci` would fail on `main` after every release. The `version` npm script now runs `npm install --package-lock-only` after `changeset version` so future Version PRs include both files.
