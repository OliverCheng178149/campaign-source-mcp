import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

import { pageViewForLine } from "../src/ocr-page-order.js";

const GUTTER = 70;
const row = (left, right) => `${left.padEnd(GUTTER)}${right}`;

// A dense prose page: both columns hold text on every row, so no column ever
// runs alone; the left column ends mid-sentence and continues at the top of
// the right one. A folio follows two blank lines, then the next page marker.
function densePage(leftCells, rightCells, folio = "12 • Synthetic Workshop") {
  return [
    "<!-- source-pdf-page: 14 -->",
    "## PDF Page 14",
    "",
    ...leftCells.map((left, index) => row(left, rightCells[index])),
    "",
    "",
    folio,
    "",
    "<!-- source-pdf-page: 15 -->",
    "## PDF Page 15",
    "",
    "Next page text."
  ];
}

// Original synthetic prose; no text extracted from a published book.
const PROSE_LEFT = [
  "The clockmaker entered the hall as the lamps began to",
  "glow above the rows of empty desks, and she noticed",
  "a folded letter resting beside the unfinished model.",
  "She read the letter carefully and placed it near the",
  "window so that the morning team would be sure to see",
  "the new instructions before assembling the next part.",
  "Then she adjusted the small gears on the table and",
  "waited patiently for the brass bird"
];
const PROSE_RIGHT = [
  "to spread its wings and sing the notes she had written",
  "on a scrap of paper during the previous afternoon.",
  "Outside the workshop, rain fell softly on the stones",
  "while a delivery cart stopped beside the garden gate.",
  "Its driver carried a box of tools into the quiet hall",
  "and left a receipt on the desk by the open doorway.",
  "The clockmaker thanked him and returned to her work,",
  "ready to begin another careful round of adjustments."
];

test("dense two-column prose pages reconstruct without a lone-column run", () => {
  const lines = densePage(PROSE_LEFT, PROSE_RIGHT);
  const view = pageViewForLine(lines, 5);

  assert.equal(view.mode, "columns");
  const texts = view.entries.map(entry => `${entry.column}|${entry.text}`);
  const junction = texts.indexOf("L|waited patiently for the brass bird");
  assert.equal(texts[junction + 1], `R|${PROSE_RIGHT[0]}`);
  assert.equal(texts.at(-1), "S|12 • Synthetic Workshop");
  assert.ok(!texts.some(text => text.includes("<!--")));
});

test("dense pages carrying stat-block fields stay in source order", () => {
  const left = [
    "Armor Class 15 (natural armor) and a great deal of hide,",
    "Hit Points 138 (12d12 + 60) though the giant is weary and",
    "Speed 40 ft. across the rocks, and it carries a huge club",
    "that it swings at anything that comes within its reach,",
    "and it roars at the characters whenever they approach it,",
    "hoping that they will flee rather than stand and fight it,",
    "though it never pursues them farther than its own lair,",
    "and it guards the treasure of its tribe"
  ];
  const view = pageViewForLine(densePage(left, PROSE_RIGHT), 5);

  assert.equal(view.mode, "source");
});

async function connect(t, root) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.resolve("src/index.js")],
    env: { ...process.env, CAMPAIGN_SOURCE_PATH: root }
  });
  const client = new Client({ name: "campaign-source-page-order-test", version: "1.0.0" });
  await client.connect(transport);
  t.after(() => client.close());
  return client;
}

test("open_campaign_source column picks a cell on a two-cell line", async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "campaign-source-page-order-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const file = "official_2e_test/_full_source_test.md";
  fs.mkdirSync(path.join(root, "official_2e_test"), { recursive: true });
  fs.writeFileSync(path.join(root, file), densePage(PROSE_LEFT, PROSE_RIGHT).join("\n"));
  const client = await connect(t, root);
  const open = async args => (await client.callTool({
    name: "open_campaign_source",
    arguments: { file, context_lines: 2, ...args }
  })).content.map(part => part.text || "").join("\n");

  const ambiguous = await open({ line: 5 });
  assert.match(ambiguous, /reading_order: source-order fallback \(PDF page 14\); line 5 has text in both columns, pass column "L" or "R"/);

  const right = await open({ line: 4, column: "R" });
  assert.match(right, /reading_order: reconstructed from PDF page 14/);
  assert.match(right, /11L \| waited patiently for the brass bird\n4R \| to spread its wings/);

  const left = await open({ line: 5, column: "L" });
  assert.match(left, /5L \| glow above the rows of empty desks/);
  assert.doesNotMatch(left, /\dR \|/);
});
