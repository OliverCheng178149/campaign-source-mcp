# Building your own source library

This repository ships no books. This guide describes one workflow for turning
material you are entitled to use into a library that `campaign-source-mcp` can
route and search. It is a method and a file skeleton, not a required format;
adapt it to your table. `examples/synthetic-library` is a tiny working example
of the same layout.

## Ground rules

- Process only material you own or are licensed to use. Your library is
  private: keep it out of public repositories, issues, and bug reports, and do
  not publish extracted text or long excerpts.
- Every `.md`, `.txt`, `.json`, `.yaml`, and `.yml` file under the source root
  is searchable, and its text can be returned to your MCP host and its model
  provider. Keep absolute paths, secrets, and unrelated personal notes out of
  the library (see [SECURITY.md](../SECURITY.md)).
- Reading is not adopting. Cards and search results are reference candidates;
  whether a place, faction, or mechanic is part of your campaign stays your
  decision. Writing that limit into every card prevents later confusion.

## What the server recognizes

| Item | Rule |
| --- | --- |
| Text files | `.md`, `.txt`, `.json`, `.yaml`, `.yml`. PDFs and images are never opened. |
| Root routers | `SOURCE_TRIGGER_MASTER.md`, `INSTALLED_MODULES_OVERVIEW.md`, `CAMPAIGN_TIMELINE_DR.md` at the root are read first by `source_trigger_lookup`. All are optional. |
| Module entry | `START_HERE.md` (any case). |
| Activation protocols | File names containing `activation_protocol`. |
| Indexes | File names containing `source_index`, `cards_index`, or `coverage_guide`. |
| Full-source caches | `_full_source*.md`. Ranked lowest, and eligible for two-column reading-order reconstruction. |
| Support material | Top-level directories starting with `_`, or containing `subsystem` or `bastion`. |
| Excluded by default | Top-level `official_5e_core_rules`, `official_2024_core_rules`, `_srd_5e`, `_srd_5e_2024` (searchable only with `include_core_rules=true`); any path segment named `private`, `_private`, or `dm_private` (only with `include_private=true`, which is not authentication). |
| Symbolic links | Search skips links to files and directories. Open/router calls accept a link only when its target stays inside the root. Store real files. |

File type weights search ranking: root routers, `START_HERE`, activation
protocols, and indexes are preferred over ordinary cards, then support files;
full-source caches rank lowest. Markdown heading lines also score higher.

## Suggested layout

```text
your-source-library/
  SOURCE_TRIGGER_MASTER.md        routing table for the whole library
  official_5e_mybook/             one directory per book or module
    START_HERE.md
    source_index.md
    adoption_policy.md            optional
    coverage_guide.md             optional
    integration_manifest.json     provenance record, no absolute paths
    harbor_district.md            topic cards
    guild_of_lamps.md
    _full_source_mybook.md        page-anchored full-text cache
  _subsystems_downtime/           optional support material
```

Any directory name works with
`search_campaign_module(module="your-directory", query="...")`. A pattern
such as `official_5e_<code>` also helps fuzzy module matching, because the
`official_5e_`, `official_2024_`, and `official_` prefixes are ignored when a
module name of four or more characters is matched. The built-in short aliases
listed in the README only map to their specific directory names.

## Workflow

The commands below use [Poppler](https://poppler.freedesktop.org/)
(`pdfinfo`, `pdftotext`, `pdftoppm`) and
[Tesseract](https://github.com/tesseract-ocr/tesseract). Any equivalent tools
work.

### 1. Record provenance

Before extracting anything, record the source fingerprint. Every later check
refers back to it.

```sh
shasum -a 256 my-book.pdf
pdfinfo my-book.pdf        # look for "Pages:" and "File size:"
```

Store it in the module directory, without absolute paths:

```json
{
  "source_file": "my-book.pdf",
  "sha256": "<64 hex characters>",
  "bytes": 12345678,
  "pages": 224,
  "extraction": "pdftotext -layout; OCR for pages 1, 97",
  "printed_page_offset": 2,
  "visual_checks": [12, 48, 97]
}
```

Keep the PDF itself outside the library root.

### 2. Extract text

Prefer the PDF's embedded text, keeping the layout:

```sh
pdftotext -layout my-book.pdf my-book.txt
```

Pages are separated by form-feed characters (`\f`). Check for pages that come
out empty, garbled, or missing headings, and OCR only those pages:

```sh
pdftoppm -r 300 -f 97 -l 97 -singlefile -png my-book.pdf page-97
tesseract page-97.png page-97      # writes page-97.txt
```

OCR the whole book only when it is a scan with no usable embedded text.

### 3. Build the page-anchored cache

Clean each page (remove control characters other than tabs and newlines,
collapse long runs of blank lines) and write the pages in order into
`_full_source_<code>.md`:

````markdown
<!-- source-pdf-page: 12 -->
## PDF Page 12

```text
page 12 text exactly as extracted, layout spacing kept
```

<!-- source-pdf-page: 13 -->
## PDF Page 13
...
````

- `## PDF Page N` on its own line is the anchor the server uses to find page
  boundaries. The comment line is optional.
- The `text` fence is optional but recommended, so book text is not
  interpreted as Markdown.
- Number pages by PDF page, 1 to N with no gaps. Record the printed-page
  offset in `source_index.md` and the manifest instead of renumbering.
- Do not reflow two-column pages yourself. The server reconstructs confident
  two-column pages when results are returned, labels the result as
  reconstructed, and falls back to source order on ambiguous pages, so the
  cache stays identical to the PDF for checking.

### 4. Write routing files and cards

The full-source cache is the evidence; cards are the entry points. Write them
by hand or with an assistant, then check every page reference against the
cache.

- `START_HERE.md`: what the book is, its rules edition, the in-world period it
  covers, installation status, and how to read the module.
- `source_index.md`: a topic → PDF page range table, extraction notes, and the
  printed-page offset.
- `adoption_policy.md` (optional): what is background only, which mechanics
  are not adopted, and what needs table approval.
- `coverage_guide.md` (optional): which scenes the existing cards cover and how
  this module relates to others.

Split cards by what triggers a lookup: one per region or hub, one per group of
factions and NPCs, one per mechanic or procedure, one per storyline
navigation. Keep facts short, in your own words, each with a page reference;
leave long descriptions in the cache.

```markdown
# Harbor District (PDF pp. 40-44)

Status: installed, NOT active until a scene triggers it
Period: <the book's era>; check against your campaign's current date

## Places
- <fact in your own words> (PDF p. 41)

## Factions and people
- <fact> (PDF p. 42)

## Mechanics
## Hooks

Limits: reading this card does not grant abilities, start plots, or decide who
currently holds any office.
```

### 5. Register and smoke-test

Add rows to `SOURCE_TRIGGER_MASTER.md` in the form
`trigger terms -> file + PDF page range + one limiting sentence`. One
workable structure puts the always-read boundaries first, then, after a marker
line, the routing tables: a module registry, region triggers, topic triggers,
and per-book routes. Use English proper nouns as the primary trigger terms;
add other-language names next to them as aliases.

Then point `CAMPAIGN_SOURCE_PATH` at the library root and check that:

- `search_campaign_module(module="official_5e_mybook", query="<a name from a card>")`
  returns the card before the full-source cache;
- `open_campaign_source(file, line)` opens the returned pointer;
- `source_trigger_lookup(context="<a trigger phrase>")` finds your routing row.

## Quality checks

- The manifest's hash, byte count, and page count match the PDF.
- Page headings run from 1 to N with no gaps:

  ```sh
  grep -o '^## PDF Page [0-9]*' _full_source_mybook.md \
    | awk '{ if ($4 != ++n) { print "gap or disorder at page " n; bad = 1; exit 1 } } END { if (!bad) print n " pages" }'
  ```

- A short list of proper nouns that must appear in the book can all be found
  in the cache.
- Every page reference in cards and indexes lands on a page that contains the
  claimed fact.
- A few pages are compared visually against the PDF and listed in the
  manifest.

Common pitfalls:

- A wrong printed-page offset, so every reference is off by a few pages.
- Decorative headings that are images and never reach the text; add them to
  cards by hand.
- Pages with broken font maps (often adverts or special layouts) that extract
  as garbage; OCR those pages.
- Ligatures and two-column rows run together, so phrase searches miss; search
  for distinctive single words, and let cards attribute facts to the right
  subject.
- A new module directory that is never added to the routing table, so it never
  surfaces from `source_trigger_lookup`.
- Treating "the assistant read it" as "it happened in the campaign"; the limits
  line on each card exists for this.
