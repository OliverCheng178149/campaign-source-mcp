import assert from "node:assert/strict";
import path from "node:path";
import test, { after, before } from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

// Optional integration suite: private book caches must be supplied explicitly.
const sourceRoot = process.env.CAMPAIGN_INTEGRATION_SOURCE_PATH
  || (process.env.AMES_CAMPAIGN_PATH && path.join(process.env.AMES_CAMPAIGN_PATH, "lore", "source_materials"));
if (!sourceRoot) throw new Error("Set CAMPAIGN_INTEGRATION_SOURCE_PATH (or AMES_CAMPAIGN_PATH) for the optional real-library integration suite");
const serverPath = path.resolve("src/index.js");
let client;

async function call(name, args) {
  const result = await client.callTool({ name, arguments: args });
  return result.content.map(part => part.text || "").join("\n");
}

before(async () => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverPath],
    env: {
      ...process.env,
      CAMPAIGN_SOURCE_PATH: sourceRoot,
      CAMPAIGN_SOURCE_LABEL: "protocol test"
    }
  });
  client = new Client({ name: "campaign-source-protocol-test", version: "1.0.0" });
  await client.connect(transport);
});

after(async () => {
  await client?.close();
});

test("2025 Realms book aliases search their full-source caches", async () => {
  const adventures = await call("search_campaign_module", {
    module: "fraif",
    query: "source_id: fraif25",
    max_results: 3,
    include_full_source: true
  });
  const heroes = await call("search_campaign_module", {
    module: "frhof",
    query: "source_id: frhof25",
    max_results: 3,
    include_full_source: true
  });
  assert.match(adventures, /official_2025_faerun\/_full_source_fraif\.md:/);
  assert.match(heroes, /official_2025_faerun\/_full_source_frhof\.md:/);

  const adventuresByName = await call("search_campaign_module", {
    module: "Adventures in Faerun",
    query: "source_id: fraif25",
    max_results: 1,
    include_full_source: true
  });
  const heroesByName = await call("search_campaign_module", {
    module: "Heroes of Faerun",
    query: "source_id: frhof25",
    max_results: 1,
    include_full_source: true
  });
  assert.match(adventuresByName, /official_2025_faerun\/_full_source_fraif\.md:/);
  assert.match(heroesByName, /official_2025_faerun\/_full_source_frhof\.md:/);
});

test("multiverse source aliases search every installed full-book cache", async () => {
  const cases = [
    ["planescape", "source_id: sato23", /official_5e_planescape\/_full_source_sigil_and_outlands\.md:/],
    ["mpp", "source_id: mpp23", /official_5e_planescape\/_full_source_mortes_planar_parade\.md:/],
    ["turn of fortune's wheel", "source_id: tofw23", /official_5e_planescape\/_full_source_turn_of_fortunes_wheel\.md:/],
    ["spelljammer", "source_id: aag22", /official_5e_spelljammer\/_full_source_astral_adventurers_guide\.md:/],
    ["bam", "source_id: bam22", /official_5e_spelljammer\/_full_source_boos_astral_menagerie\.md:/],
    ["light of xaryxis", "source_id: lox22", /official_5e_spelljammer\/_full_source_light_of_xaryxis\.md:/],
    ["vecna eve of ruin", "source_id: veor24", /official_5e_vecna_eve_of_ruin\/_full_source\.md:/],
    ["drde", "source_id: drde25", /official_5e_dragon_delves\/_full_source\.md:/]
  ];

  for (const [module, query, expected] of cases) {
    const text = await call("search_campaign_module", {
      module,
      query,
      max_results: 10,
      include_full_source: true
    });
    assert.match(text, expected, module);
  }
});

test("campaign full-source search reconstructs the matching AAG column", async () => {
  const text = await call("search_campaign_module", {
    module: "aag",
    query: "HEN YOU CREATE A CHARACTER FOR A",
    max_results: 1,
    context_lines: 20,
    include_full_source: true
  });

  assert.match(text, /official_5e_spelljammer\/_full_source_astral_adventurers_guide\.md:534/);
  assert.match(text, /kind: full-source/);
  assert.match(text, /reading_order: reconstructed from PDF page 7/);
  assert.match(text, /534L \| HEN YOU CREATE A CHARACTER FOR A/);
  assert.match(text, /campaign or an adventure set in Wild-/);
  assert.doesNotMatch(
    text,
    /Roll on the Divine Contact table|d10 Wandering Deity|Corellon|Tymora|Zivilyn|Arawn/
  );
});

test("AAG numbered-table rows with lost indentation remain in the right column", async () => {
  const text = await call("open_campaign_source", {
    file: "official_5e_spelljammer/_full_source_astral_adventurers_guide.md",
    line: 543,
    context_lines: 10,
    reading_order: "auto"
  });

  assert.match(text, /reading_order: reconstructed from PDF page 7/);
  assert.match(text, /543R \| 1 Corellon, god of art and magic/);
  assert.doesNotMatch(text, /543L \|/);
});

test("open_campaign_source supports reconstructed and exact source order", async () => {
  const file = "official_5e_spelljammer/_full_source_astral_adventurers_guide.md";
  const auto = await call("open_campaign_source", {
    file,
    line: 529,
    context_lines: 10,
    reading_order: "auto"
  });
  const source = await call("open_campaign_source", {
    file,
    line: 529,
    context_lines: 10,
    reading_order: "source"
  });

  assert.match(auto, new RegExp(`### ${file.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:529`));
  assert.match(auto, /kind: full-source/);
  assert.match(auto, /status_hint: raw full-source fallback/);
  assert.match(auto, /reading_order: reconstructed from PDF page 7/);
  assert.match(auto, /529L \| °Character Options/);
  assert.match(auto, /534L \| HEN YOU CREATE A CHARACTER FOR A/);
  assert.doesNotMatch(auto, /Roll on the Divine Contact table|Divine CONTACT|d10 Wandering Deity/);

  assert.doesNotMatch(source, /reading_order:/);
  assert.match(source, /534 \| HEN YOU CREATE A CHARACTER FOR A\s+Roll on the Divine Contact table to determine/);
});

test("ambiguous full-source open falls back to labeled source order", async () => {
  const text = await call("open_campaign_source", {
    file: "official_5e_spelljammer/_full_source_astral_adventurers_guide.md",
    line: 534,
    context_lines: 1,
    reading_order: "auto"
  });

  assert.match(text, /reading_order: source-order fallback/);
  assert.match(text, /534 \| HEN YOU CREATE A CHARACTER FOR A\s+Roll on the Divine Contact table to determine/);
});

test("curated campaign cards are byte-identical across reading modes", async () => {
  const args = {
    file: "official_5e_spelljammer/adoption_policy.md",
    line: 1,
    context_lines: 8
  };
  const auto = await call("open_campaign_source", { ...args, reading_order: "auto" });
  const source = await call("open_campaign_source", { ...args, reading_order: "source" });

  assert.equal(auto, source);
  assert.doesNotMatch(auto, /reading_order:/);
});

test("Chinese Forgotten Realms questions route to the setting library", async () => {
  const text = await call("source_trigger_lookup", {
    context: "费伦里法师和能施展六环法术的人常见吗？",
    campaign_year: 1488,
    max_results: 8
  });

  assert.doesNotMatch(text, /No module\/source-card matches/);
  assert.match(text, /official_2025_faerun/);
});
