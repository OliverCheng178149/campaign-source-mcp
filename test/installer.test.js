import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = path.resolve(".");

test("installer copies the current complete runtime and tests into an explicit sandbox", t => {
  const sandbox = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "campaign-install-test-")));
  t.after(() => fs.rmSync(sandbox, { recursive: true, force: true }));
  const target = path.join(sandbox, "server");
  const repo = path.join(sandbox, "campaign");
  fs.mkdirSync(repo);
  fs.writeFileSync(path.join(repo, ".mcp.json"), JSON.stringify({ mcpServers: { existing: { command: "preserve" } } }));
  // Import without running main, then replace every old installer destination
  // before calling it. This keeps the regression test safe even on the old version
  // whose main() ignored CLI arguments and contained absolute production paths.
  const program = `
import importlib.util, pathlib, sys
spec = importlib.util.spec_from_file_location("installer", sys.argv[1])
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
module.SERVER_ROOT = pathlib.Path(sys.argv[2])
module.SRC = module.SERVER_ROOT / "src"
module.REPOS = [pathlib.Path(sys.argv[3])]
module.CORE_NODE_MODULES = pathlib.Path(sys.argv[4])
sys.argv = [sys.argv[1], "--server-root", sys.argv[2], "--repo", sys.argv[3], "--node-modules", sys.argv[4]]
module.main()
`;
  const result = spawnSync("python3", ["-B", "-c", program, path.join(root, "campaign_source_mcp_installer.py"), target, repo, path.join(root, "node_modules")], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  for (const file of ["package.json", "package-lock.json", "README.md", "SECURITY.md", "LICENSE", "campaign_source_mcp_installer.py", ...fs.readdirSync(path.join(root, "examples"), { recursive: true }).filter(name => fs.statSync(path.join(root, "examples", name)).isFile()).map(name => `examples/${name}`), ...fs.readdirSync(path.join(root, "src")).map(name => `src/${name}`), ...fs.readdirSync(path.join(root, "test"), { recursive: true }).filter(name => fs.statSync(path.join(root, "test", name)).isFile()).map(name => `test/${name}`)]) {
    assert.ok(fs.existsSync(path.join(target, file)), `installer omitted ${file}`);
    assert.equal(fs.readFileSync(path.join(target, file), "utf8"), fs.readFileSync(path.join(root, file), "utf8"), `installer reverted ${file}`);
  }
  const config = JSON.parse(fs.readFileSync(path.join(repo, ".mcp.json"), "utf8"));
  assert.equal(config.mcpServers.existing.command, "preserve");
  assert.deepEqual(config.mcpServers["campaign-source"].args, [path.join(target, "src/index.js")]);
  assert.equal(config.mcpServers["campaign-source"].env.CAMPAIGN_SOURCE_PATH, path.join(repo, "lore/source_materials"));
});

test('installer defaults to its own checkout and never borrows sibling dependencies or configures a campaign', t => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'campaign-install-default-'));
  t.after(() => fs.rmSync(sandbox, { recursive: true, force: true }));
  const target = path.join(sandbox, 'server');
  fs.mkdirSync(target);
  for (const entry of ['campaign_source_mcp_installer.py', 'package.json', 'README.md', 'SECURITY.md', 'LICENSE', 'src', 'test', 'examples']) {
    fs.cpSync(path.join(root, entry), path.join(target, entry), { recursive: true });
  }
  // Inspect defaults in an isolated process before invoking main. A wrong old
  // default fails here rather than writing to any real machine destination.
  const inspect = spawnSync('python3', ['-B', '-c', `
import importlib.util, pathlib, sys
spec = importlib.util.spec_from_file_location('installer', sys.argv[1])
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
assert module.SERVER_ROOT == pathlib.Path(sys.argv[1]).resolve().parent
assert not module.REPOS
assert module.CORE_NODE_MODULES is None
sys.argv = [sys.argv[1]]
module.main()
`, path.join(target, 'campaign_source_mcp_installer.py')], { encoding: 'utf8' });
  assert.equal(inspect.status, 0, inspect.stderr);
  assert.equal(fs.existsSync(path.join(target, 'node_modules')), false);
});
