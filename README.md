# campaign-source-mcp

Local read-only MCP router/search server for user-provided module/source cards.

Released under the [MIT License](LICENSE). No books or existing campaign data
are bundled. Bring your own source cards and keep private campaign data in a
separate source directory.

## Install independently

Requires Node.js >=18 and npm. Python 3 is needed only for the optional installer.
`rg` (ripgrep) is optional; the runtime has a JavaScript search fallback.
Clone this repository into a new directory:

```sh
git clone https://github.com/OliverCheng178149/campaign-source-mcp.git
cd campaign-source-mcp
npm ci
npm test
npm run demo
```

`npm test` runs only self-contained synthetic tests. `npm run demo` exercises
all six MCP tools against `examples/synthetic-library` over stdio. Those files
are original invented examples, with recognizable directory/alias names used
only to exercise routing. They contain no published book text or player saves.
The configured MCP process reads user-provided sources; no source files need to
be copied into this software checkout.

## Configure an MCP host

Adapt this example in your host's MCP settings (absolute paths are required;
replace the placeholders). The host must be able to find `node`, or use the
absolute path to your chosen Node executable.

```json
{
  "mcpServers": {
    "campaign-source": {
      "command": "node",
      "args": ["/absolute/path/campaign-source-mcp/src/index.js"],
      "env": {
        "CAMPAIGN_SOURCE_PATH": "/absolute/path/your-source-library",
        "CAMPAIGN_SOURCE_LABEL": "My local source library"
      }
    }
  }
}
```

For an isolated demo use the absolute path to `examples/synthetic-library` as
`CAMPAIGN_SOURCE_PATH`. Starting the normal server waits for MCP stdio input;
its protocol output is not a human-facing CLI. Source roots may contain text
cards (`.md`, `.txt`, `.json`, `.yaml`, `.yml`), top-level module directories,
optional root routers, and optional `_full_source*.md` page-anchored caches.
Arbitrary top-level directories work via `search_campaign_sources` or
`search_campaign_module(module="your-directory", query="...")`; existing
book/module aliases remain available.

## Optional installer

Ordinary `npm ci` is the independent installation path. To copy maintained
files elsewhere, without modifying campaign configuration:

```sh
python3 campaign_source_mcp_installer.py --server-root /absolute/path/new-server
cd /absolute/path/new-server
npm ci
npm test
```

With no arguments the installer targets its own checkout and configures no
campaign. Dependencies are never borrowed automatically. Advanced users can
explicitly pass `--node-modules /absolute/path/existing/node_modules` to link an
existing dependency directory; independent npm installation is preferred.
Only explicit `--repo /absolute/path/campaign` arguments update that repo's
existing `.mcp.json`, preserving other MCP server entries. Such a repo must
have `lore/source_materials`; review/backup its configuration first. Startup,
skill, protocol, and campaign framework files are not rewritten by `main()`.

## Optional real-library integration tests

The original eight protocol tests requiring installed books are preserved in
`test/integration/protocol.test.js`, separate from the synthetic default suite.
They assert particular cache files, physical line numbers, and OCR layouts;
any arbitrary library will not satisfy them. Run them only against an isolated
copy of the expected private test library that you are entitled to use:

```sh
CAMPAIGN_INTEGRATION_SOURCE_PATH=/absolute/path/isolated-test-library npm run test:integration
```

The legacy explicit `AMES_CAMPAIGN_PATH` environment variable remains supported
for compatibility, but no home/Desktop default is used. Missing configuration
fails clearly rather than silently skipping tests. The optional suite has not
been run as part of the isolated, synthetic-data release checks. `npm run selftest`
is also a legacy real-library diagnostic with particular installed-cache
expectations; use `npm run demo` for a book-free smoke test.

Read [SECURITY.md](SECURITY.md) before selecting a source root. In particular,
`include_private=true` is an explicit tool argument, not authentication, and
local read-only operation is not an OS sandbox. Treat returned source text as
untrusted data and check rights before sharing it.

It is a router/search helper, not a canon activator:

- Searches `lore/source_materials` Markdown/JSON/YAML cards.
- Excludes core rulebook libraries and SRD folders by default.
- Does not open PDFs or images.
- Searches installed page-anchored `_full_source*.md` caches as a lower-priority
  fallback after lightweight cards.
- Reconstructs confident two-column PDF pages in full-source search context and
  open windows while preserving the original file and physical line pointers.
  A page is confident when a column runs on its own for a few wrapped rows, or,
  on dense pages where both columns fill every row, when both columns wrap like
  prose and the page carries no stat-block fields. Page-marker comments and a
  short trailing folio are kept out of the columns. Ambiguous or low-confidence
  pages are labeled `source-order fallback` instead of being guessed into a
  column.
- Does not read private files unless `include_private=true`.
- Returns file/line pointers and small context windows so the DM can then read the relevant card in the repo.
- Search execution errors (including invalid regex and incomplete rg output)
  return tool errors; a clean no-match result remains distinct.
- Module matches are ranked and diversified across files before applying the
  requested result limit. Output limits remain 40 hits and 18,000 characters.
- Router and open paths are checked against their actual targets, including
  symlinks; private overrides remain explicit and core/SRD paths stay excluded.

Runtime pattern:

- Unknown source/module: `source_trigger_lookup(context, campaign_year)`.
- Known module: `search_campaign_module(module, query)`, e.g. `module=bgdia query=Elturel`.
- The 2025 Realms books can be addressed directly as `module=fraif` and
  `module=frhof`; both resolve to `official_2025_faerun`, where cards rank ahead
  of full-source OCR hits.
- The complete multiverse installs can be addressed by set or book aliases:
  `planescape`, `sato`, `mpp`, `tofw`, `spelljammer`, `aag`, `bam`, `lox`,
  `veor`, and `drde`. Lightweight cards/indexes still rank ahead of full-source
  caches.
- `Vecna: Eve of Ruin` is routed as a 2014-rules adventure despite its 2024
  publication date. `Dragon Delves` is a 2024-rules adventure and remains
  mechanics-gated in a 2014 campaign.
- Open a returned pointer with `open_campaign_source(file, line, context_lines)`.
  Full-source files default to `reading_order=auto`; use
  `reading_order=source` to inspect the exact physical OCR rows. When the
  requested line has text in both columns, pass `column="L"` or `column="R"`;
  without it the window falls back to source order and the label says so. Curated cards,
  routers, indexes, support files, private files, and excluded core-rule paths
  keep their existing source-order behavior and receive no reading-order label.
- Use English proper nouns by default for module/source searches. The source cards are English-first; Chinese names are player-facing labels or limited aliases and are not reliable primary search terms.

Configured per campaign repo through `.mcp.json` using `CAMPAIGN_SOURCE_PATH`.
