import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const serverPath = path.resolve("src/index.js");

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "campaign-source-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const put = (file, text) => {
    const absolute = path.join(root, file);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, text);
    return absolute;
  };
  put("official_5e_wdh/card.md", "# Waterdeep\nA real matching source.\n");
  return { root, put };
}

async function connect(t, root, env = {}, entry = serverPath) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [entry],
    env: { ...process.env, CAMPAIGN_SOURCE_PATH: root, ...env }
  });
  const client = new Client({ name: "campaign-source-regression-test", version: "1.0.0" });
  await client.connect(transport);
  t.after(() => client.close());
  return client;
}

async function call(client, name, args) {
  const result = await client.callTool({ name, arguments: args });
  return { error: Boolean(result.isError), text: result.content.map(part => part.text || "").join("\n") };
}

test("invalid regex is an error while a valid absent query remains a miss", async t => {
  const { root } = fixture(t);
  const client = await connect(t, root);
  const invalid = await call(client, "search_campaign_sources", { query: "(", regex: true });
  assert.equal(invalid.error, true);
  assert.match(invalid.text, /regex|regular expression|pattern/i);
  const miss = await call(client, "search_campaign_sources", { query: "absent-word" });
  assert.equal(miss.error, false);
  assert.match(miss.text, /No module\/source-card matches/);
  const hit = await call(client, "search_campaign_sources", { query: "Waterdeep" });
  assert.equal(hit.error, false);
  assert.match(hit.text, /official_5e_wdh\/card.md:1/);
});

for (const mode of ["empty", "partial", "buffer-limit"]) {
  test(`rg execution failure with ${mode} output is never returned as search results`, async t => {
    const { root, put } = fixture(t);
    const script = mode === "buffer-limit"
      ? 'const fs = require("node:fs"); for (let i = 0; i < 20; i++) fs.writeSync(1, "x".repeat(1024 * 1024));'
      : `${mode === "partial" ? `process.stdout.write(${JSON.stringify(`${root}/official_5e_wdh/card.md:1:# Waterdeep\n`)});` : ""} process.stderr.write("synthetic rg execution failure"); process.exitCode = 2;`;
    const binary = put("bin/rg", `#!${process.execPath}\n${script}\n`);
    fs.chmodSync(binary, 0o755);
    const client = await connect(t, root, { PATH: path.dirname(binary) });
    const result = await call(client, "search_campaign_sources", { query: "Waterdeep" });
    assert.equal(result.error, true);
    assert.match(result.text, /rg|search/i);
    assert.doesNotMatch(result.text, /No module\/source-card matches|### official_5e_wdh/);
  });
}

for (const fallback of [false, true]) {
  test(`module ranking retains concrete cards before limiting results (${fallback ? "JS fallback" : "rg"})`, async t => {
    const { root, put } = fixture(t);
    put("official_5e_wdh/START_HERE.md", Array.from({ length: 50 }, (_, i) => `# Waterdeep overview ${i}`).join("\n"));
    put("official_5e_wdh/waterdeep_specific_card.md", "# Waterdeep specific source\n");
    const client = await connect(t, root, fallback ? { PATH: "/nonexistent" } : {});
    const result = await call(client, "search_campaign_module", { module: "wdh", query: "Waterdeep", max_results: 2, context_lines: 0 });
    assert.equal(result.error, false);
    assert.match(result.text, /### official_5e_wdh\/waterdeep_specific_card.md:1/);
    assert.equal((result.text.match(/^### /gm) || []).length, 2);
  });
}

test("JS fallback ranks a late concrete heading instead of stopping at early body matches", async t => {
  const { root, put } = fixture(t);
  put("official_5e_wdh/waterdeep_specific_card.md", `${"Waterdeep background.\n".repeat(200)}# Waterdeep concrete heading\n`);
  const client = await connect(t, root, { PATH: "/nonexistent" });
  const result = await call(client, "search_campaign_module", { module: "wdh", query: "Waterdeep", max_results: 1, context_lines: 0 });
  assert.equal(result.error, false);
  assert.match(result.text, /waterdeep_specific_card.md:201/);
});

for (const target of ["private", "core", "outside"]) {
  test(`root router aliases cannot bypass ${target} source boundaries`, async t => {
    const { root, put } = fixture(t);
    const external = fs.mkdtempSync(path.join(os.tmpdir(), "campaign-source-external-"));
    t.after(() => fs.rmSync(external, { recursive: true, force: true }));
    const file = target === "outside"
      ? path.join(external, "outside.md")
      : path.join(root, target === "private" ? "private/hidden.md" : "official_5e_core_rules/core.md");
    if (target === "outside") fs.writeFileSync(file, "BoundarySentinel\n");
    else put(path.relative(root, file), "BoundarySentinel\n");
    fs.symlinkSync(file, path.join(root, "SOURCE_TRIGGER_MASTER.md"));
    const client = await connect(t, root);
    const result = await call(client, "source_trigger_lookup", { context: "BoundarySentinel" });
    assert.equal(result.error, true);
    assert.doesNotMatch(result.text, /signal: BoundarySentinel/);
    if (target === "private") {
      const allowed = await call(client, "source_trigger_lookup", { context: "BoundarySentinel", include_private: true });
      assert.equal(allowed.error, false);
      assert.match(allowed.text, /signal: BoundarySentinel/);
    }
  });
}

test("open rejects core aliases while preserving ordinary aliases and explicit private access", async t => {
  const { root, put } = fixture(t);
  const core = put("official_5e_core_rules/core.md", "CoreSentinel\n");
  const secret = put("private/hidden.md", "PrivateSentinel\n");
  fs.symlinkSync(core, path.join(root, "core_alias.md"));
  fs.symlinkSync(secret, path.join(root, "private_alias.md"));
  fs.symlinkSync(path.join(root, "official_5e_wdh/card.md"), path.join(root, "card_alias.md"));
  const client = await connect(t, root);
  for (const file of ["official_5e_core_rules/core.md", "core_alias.md"]) {
    const rejected = await call(client, "open_campaign_source", { file });
    assert.match(rejected.text, /Refusing core\/SRD/);
    assert.doesNotMatch(rejected.text, /CoreSentinel/);
  }
  const ordinary = await call(client, "open_campaign_source", { file: "card_alias.md" });
  assert.equal(ordinary.error, false);
  assert.match(ordinary.text, /Waterdeep/);
  const denied = await call(client, "open_campaign_source", { file: "private_alias.md" });
  assert.equal(denied.error, true);
  const allowed = await call(client, "open_campaign_source", { file: "private_alias.md", include_private: true });
  assert.equal(allowed.error, false);
  assert.match(allowed.text, /PrivateSentinel/);
});

test("legitimate router aliases inside a symlinked source root remain usable", async t => {
  const { root, put } = fixture(t);
  const router = put("router-content.md", "Waterdeep routing\n");
  fs.symlinkSync(router, path.join(root, "SOURCE_TRIGGER_MASTER.md"));
  const alias = `${root}-alias`;
  fs.symlinkSync(root, alias);
  t.after(() => fs.unlinkSync(alias));
  const client = await connect(t, alias);
  const result = await call(client, "source_trigger_lookup", { context: "Waterdeep" });
  assert.equal(result.error, false);
  assert.match(result.text, /signal: Waterdeep routing/);
  const opened = await call(client, "open_campaign_source", { file: "SOURCE_TRIGGER_MASTER.md" });
  assert.equal(opened.error, false);
  assert.match(opened.text, /Waterdeep routing/);
});

test("published numeric parameter descriptions explain their enforced ranges", async t => {
  const { root } = fixture(t);
  const client = await connect(t, root);
  const { tools } = await client.listTools();
  for (const tool of tools) {
    for (const [name, schema] of Object.entries(tool.inputSchema.properties)) {
      if (schema.type !== "integer" && schema.type !== "number") continue;
      assert.ok(schema.description, `${tool.name}.${name} needs a description`);
      for (const edge of [schema.minimum, schema.maximum]) {
        if (edge !== undefined) assert.ok(schema.description.includes(String(edge)), `${tool.name}.${name} omits ${edge}`);
      }
    }
  }
  const rejected = await call(client, "search_campaign_module", { module: "wdh", query: "Waterdeep", context_lines: 21 });
  assert.equal(rejected.error, true);
  const allowed = await call(client, "search_campaign_module", { module: "wdh", query: "Waterdeep", context_lines: 20 });
  assert.equal(allowed.error, false);
});
