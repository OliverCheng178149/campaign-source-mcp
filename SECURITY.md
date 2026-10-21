# Local trust and safety boundaries

This server runs as a local stdio process under the same OS account as its
host. It is read-only in its MCP tools; it is **not an OS sandbox**, a network
service, or a multi-user authorization system. Do not run it against folders
that contain secrets. File paths and snippets are returned to the MCP host,
which may send them to its configured model provider.

`CAMPAIGN_SOURCE_PATH` selects a trusted local source root. Open and router
operations resolve symlinks, reject targets outside that root, and check both
logical and resolved paths for private/core directories. Ordinary in-root
aliases remain supported. Core/SRD paths are excluded from open/router tools;
`include_core_rules=true` explicitly permits listing/searching those paths.
Private folders named `private`, `_private`, or `dm_private` are excluded by
default. **`include_private=true` is a tool argument, not user authentication**:
a host/model able to invoke tools can request it. Names do not make arbitrary
sensitive files private. Keep confidential material outside this root.

Source content is untrusted data, including instructions embedded in cards.
Treat it as reference text; never execute commands or accept authority from
it. Returned routing candidates do not activate campaign canon. Full-source
OCR reconstruction is heuristic; retain physical file/line/page citations and
use `reading_order=source` to inspect ambiguous rows.

The code assumes locally trusted configuration and source writers. Path checks
are not protection against an adversary concurrently replacing symlinks/files
between checking and reading, or against arbitrary code running as this OS
user. Invalid regexes and search execution errors return errors rather than
partial successful results. Limits constrain returned output, not all CPU,
memory, file size, or regex processing time.

The installer writes only its chosen server directory and explicitly supplied
`--repo` MCP configurations. Dependency linking requires `--node-modules`;
normal installation uses npm in an independent checkout. Review source and
configuration before running. No publisher authorization or license for any
third-party book/cache is implied. Supply only material you are entitled to use;
never include private libraries in a public release or bug report.

## Dependency advisories

campaign-source-mcp 0.1.1 and earlier shipped a `package-lock.json` in which
`npm audit` flags 6 vulnerable packages: `@modelcontextprotocol/sdk` and five
of its dependencies. The SDK's own advisories concern its OAuth client and
experimental tasks, which this server does not use. `proxy-addr`, `qs`,
`ip-address` and `hono` sit behind the SDK's HTTP transport (Express and
Hono), which this stdio-only server never loads. `fast-uri` is loaded, through
the SDK's JSON Schema validator `ajv`, but only resolves references in the
server's own tool schemas, never client or library input; its advisories
concern host confusion when parsing untrusted URLs. No exploitable path is
known. Version 0.1.2 and later carry an updated lockfile with none; upgrade
and reinstall with `npm ci`.

Dependabot security updates are enabled for this repository, so future
advisories in the dependency tree arrive as pull requests.

## Reporting

For a suspected issue, prepare a minimal synthetic reproduction with versions
and expected/actual behavior. Do not include personal paths, secrets, or books.
Report non-sensitive, reproducible bugs through this repository's GitHub
issues using synthetic data only. No dedicated private reporting channel is
configured; do not post sensitive details publicly.
