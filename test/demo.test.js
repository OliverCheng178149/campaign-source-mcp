import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const root = path.resolve('examples/synthetic-library');

test('synthetic demo exercises discovery, routing, search, aliases, and open over stdio', async t => {
  const client = new Client({ name: 'synthetic-demo', version: '1.0.0' });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [path.resolve('src/index.js')], env: { ...process.env, CAMPAIGN_SOURCE_PATH: root } }));
  t.after(() => client.close());
  const invoke = async (name, args) => {
    const result = await client.callTool({ name, arguments: args });
    assert.notEqual(result.isError, true, JSON.stringify(result));
    return result.content.map(item => item.text || '').join('\n');
  };
  const tools = await client.listTools();
  assert.deepEqual(tools.tools.map(tool => tool.name).sort(), ['list_campaign_source_files', 'list_campaign_sources', 'open_campaign_source', 'search_campaign_module', 'search_campaign_sources', 'source_trigger_lookup'].sort());
  assert.match(await invoke('list_campaign_sources', {}), /official_5e_wdh/);
  assert.match(await invoke('list_campaign_source_files', { directory: 'official_5e_wdh' }), /workshop_card.md/);
  assert.match(await invoke('source_trigger_lookup', { context: 'Waterdeep workshop', campaign_year: 1488 }), /workshop/);
  assert.match(await invoke('search_campaign_sources', { query: 'DemoWorkshopSentinel' }), /workshop_card.md/);
  assert.match(await invoke('search_campaign_module', { module: 'wdh', query: 'DemoWorkshopSentinel' }), /official_5e_wdh/);
  assert.match(await invoke('open_campaign_source', { file: 'official_5e_wdh/workshop_card.md', line: 3, context_lines: 0 }), /3 \| DemoWorkshopSentinel/);
  const defaults = await invoke('search_campaign_sources', { query: 'Sentinel' });
  assert.doesNotMatch(defaults, /DemoPrivateSentinel|DemoCoreSentinel/);
  assert.match(await invoke('search_campaign_sources', { query: 'DemoPrivateSentinel', include_private: true }), /DemoPrivateSentinel/);
  assert.match(await invoke('search_campaign_sources', { query: 'DemoCoreSentinel', include_core_rules: true }), /DemoCoreSentinel/);
});
