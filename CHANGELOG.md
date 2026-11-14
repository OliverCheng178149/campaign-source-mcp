# Changelog

## 0.1.4 - 2026-11-14

- Update `zod` to 4.6.7 (from 3.25.76) and `@modelcontextprotocol/sdk` to
  1.32.2, and refresh the lockfile, which also moves `hono` to 4.13.18,
  `@hono/node-server` to 2.1.8 and `body-parser` to 2.4.0. `npm audit` again
  reports no known vulnerabilities. This supersedes the open Dependabot pull
  requests. The zod advisory (GHSA-mrhx-c7xc-m3w5, memory exhaustion on large
  arrays with no length limit) reached the `directories` parameter; zod 3 has no fix,
  hence the major update.
- Published tool schemas change in two harmless ways under zod 4: they no
  longer state `additionalProperties: false` (unknown arguments were and still
  are silently dropped), and integer parameters without an explicit bound now
  carry the safe-integer range (±9007199254740991). Argument validation is
  otherwise unchanged.
- `repository.url` uses the `git+https://` form npm expects.

## 0.1.3 - 2026-10-22

- Publish to npm: drop `"private": true`, add a `files` list so the package
  carries the server, docs and synthetic examples and the optional installer but not the tests, and
  add keywords, author, homepage and issue links.
- README: install from npm with a pinned `npx` version, or globally.

## 0.1.2 - 2026-10-22

- Update `@modelcontextprotocol/sdk` to 1.32.1 and refresh the lockfile;
  `npm audit` now reports no known vulnerabilities. The server only uses the
  stdio transport, so the advisories in the SDK's HTTP and OAuth dependencies
  did not reach it, but the lockfile no longer carries them.

## 0.1.1 - 2026-10-08

- Add `docs/building-a-source-library.md`: a workflow and file skeleton for
  building a private source library from material you are entitled to use.
- Restore the executable bit on `src/index.js`, lost when the first release
  was uploaded.

## 0.1.0 - 2026-10-07

First public release: the local read-only MCP server, independent installer,
MIT license, security notes, and original synthetic examples. The default
test suite (19 tests) uses synthetic data only; the optional real-library
integration suite was not run for this release.
