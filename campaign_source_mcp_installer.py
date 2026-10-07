#!/usr/bin/env python3
"""Install the checked-in runtime; never regenerate it from embedded copies."""
import argparse
import json
import shutil
from pathlib import Path
from typing import Optional

SOURCE_ROOT = Path(__file__).resolve().parent
SERVER_ROOT = SOURCE_ROOT
SRC = SERVER_ROOT / "src"
CORE_NODE_MODULES = None
REPOS = []


def write_text(path: Path, text: str, mode: Optional[int] = None) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
    if mode is not None:
        path.chmod(mode)


def install_server() -> None:
    # These files are the single maintained source of runtime behavior and tests.
    files = [SOURCE_ROOT / name for name in (
        "package.json", "README.md", "SECURITY.md", "LICENSE",
        "campaign_source_mcp_installer.py"
    )]
    for directory in ("src", "test", "examples"):
        files.extend(path for path in (SOURCE_ROOT / directory).rglob("*")
                     if path.is_file() and path.suffix in {".js", ".md", ".json", ".txt", ".yaml", ".yml"}
                     and "__pycache__" not in path.parts)
    lockfile = SOURCE_ROOT / "package-lock.json"
    if lockfile.exists():
        files.append(lockfile)
    for source in files:
        destination = SERVER_ROOT / source.relative_to(SOURCE_ROOT)
        if source.resolve() == destination.resolve():
            continue
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, destination)
    link = SERVER_ROOT / "node_modules"
    if CORE_NODE_MODULES is not None and CORE_NODE_MODULES.exists():
        if link.is_symlink() or link.exists():
            if link.is_symlink() and link.resolve() == CORE_NODE_MODULES.resolve():
                pass
            elif link.is_dir() and not link.is_symlink():
                # Leave an existing real node_modules alone.
                pass
            else:
                link.unlink()
                link.symlink_to(CORE_NODE_MODULES, target_is_directory=True)
        else:
            link.symlink_to(CORE_NODE_MODULES, target_is_directory=True)


def update_mcp(repo: Path) -> None:
    mcp_path = repo / ".mcp.json"
    data = json.loads(mcp_path.read_text(encoding="utf-8"))
    servers = data.setdefault("mcpServers", {})
    servers["campaign-source"] = {
        "command": "node",
        "args": [str(SRC / "index.js")],
        "env": {
            "CAMPAIGN_SOURCE_PATH": str(repo / "lore/source_materials"),
            "CAMPAIGN_SOURCE_LABEL": "Campaign module/source library (no core rulebooks)",
        },
    }
    mcp_path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def update_startup_prompt(repo: Path) -> None:
    path = repo / "tools/campaign_new_dm_prompt.py"
    text = path.read_text(encoding="utf-8")
    needle = '    print("- Source Trigger Gate: before IC involving new regions, organizations, gods, monsters, source-covered magic topics, dragon topics, or adventure hooks, use the routing tables in SOURCE_TRIGGER_MASTER.md and report source trigger status.")\n'
    old_addition = '    print("- Campaign-source MCP: for module/source-library lookup, use the local `campaign-source` MCP as a router/search helper over lore/source_materials. It excludes core rulebook/SRD libraries by default and does not activate canon; read the returned card/index before using details in IC.")\n'
    canonical_header = '    print("- `campaign-source` MCP: module/source-library lookup helper over lore/source_materials; excludes core rulebook/SRD libraries by default and never activates canon by itself.")\n'
    legacy_header = '    print("- Campaign-source MCP: module/source-library lookup helper over lore/source_materials; excludes core rulebook/SRD libraries by default and never activates canon by itself.")\n'
    detail_lines = (
        '    print("  - Unknown module/source: call `source_trigger_lookup(context, campaign_year)` to route to likely cards/indexes.")\n'
        '    print("  - Known module: call `search_campaign_module(module, query)` (e.g. module=bgdia query=Elturel), then `open_campaign_source(file,line)` for the returned pointer.")\n'
        '    print("  - Use English proper nouns by default. Source cards are English-first; Chinese names are player-facing labels/limited aliases, not reliable primary search terms.")\n'
    )
    legacy_detailed = (
        legacy_header + detail_lines
    )
    addition = canonical_header + detail_lines
    for fragment in (legacy_detailed, old_addition, canonical_header, legacy_header, detail_lines):
        text = text.replace(fragment, "")
    text = text.replace(needle, needle + addition)
    path.write_text(text, encoding="utf-8")


def update_skill(repo: Path) -> None:
    path = repo / ".claude/skills/campaign-dm-runtime/SKILL.md"
    text = path.read_text(encoding="utf-8")
    needle = "- Source trigger before new region/faction/god/monster/source-covered magic/adventure-hook/dragon topic; read matching card/index and report source status.\n"
    old_addition = "- For module/source-library lookup, the local `campaign-source` MCP is available as a router/search helper over `lore/source_materials`; it excludes core rulebook/SRD libraries by default and never activates canon by itself.\n"
    addition = (
        "- `campaign-source` MCP usage for module/source-library lookup:\n"
        "  - Unknown source/module: call `source_trigger_lookup(context, campaign_year)` to route to likely cards/indexes.\n"
        "  - Known module: call `search_campaign_module(module, query)` (aliases like `bgdia`, `wdh`, `wdmm`, `bg3` are supported), then `open_campaign_source(file, line)` for the returned pointer.\n"
        "  - Use English proper nouns by default. Source cards are English-first; Chinese names are player-facing labels/limited aliases, not reliable primary search terms.\n"
        "  - It excludes core rulebook/SRD libraries by default and never activates canon by itself.\n"
    )
    if old_addition in text:
        text = text.replace(old_addition, addition)
    elif needle in text and addition not in text:
        text = text.replace(needle, needle + addition)
    else:
        gate = "- **Source Trigger Gate:**\n"
        if addition not in text and gate in text:
            text = text.replace(gate, gate + addition)
        fallback = "## Source Trigger Discipline\n"
        if addition not in text and fallback in text:
            text = text.replace(fallback, fallback + "\n" + addition)
    path.write_text(text, encoding="utf-8")


def update_protocol(repo: Path) -> None:
    path = repo / "rules/live_run_protocol.md"
    text = path.read_text(encoding="utf-8")
    needle = "Read only files listed by the prompt plus any user-specified additions. Do not start IC until the user gives an action.\n"
    old_addition = "The local `campaign-source` MCP may be used during source-trigger checks as a router/search helper over module/source cards; it does not replace reading the returned card and does not activate optional canon.\n"
    addition = (
        "The local `campaign-source` MCP may be used during source-trigger checks as a router/search helper over module/source cards; it does not replace reading the returned card and does not activate optional canon. Use `source_trigger_lookup(context, campaign_year)` when the relevant module is unknown, `search_campaign_module(module, query)` when the module is known, then `open_campaign_source(file, line)` for the returned pointer. Use English proper nouns by default because source cards are English-first; Chinese names are player-facing labels/limited aliases, not reliable primary search terms.\n"
    )
    if old_addition in text:
        text = text.replace(old_addition, addition)
    elif addition not in text:
        text = text.replace(needle, needle + addition)
    path.write_text(text, encoding="utf-8")


def update_tool_contract(repo: Path) -> None:
    path = repo / "tools/TOOL_CONTRACT.md"
    if not path.exists():
        return
    text = path.read_text(encoding="utf-8")
    needle = "## Startup and Handoff Helpers\n"
    old_addition = """## Local MCP Helpers

- `campaign-source`
  - Read-only MCP router/search helper for `lore/source_materials` module/source cards.
  - Excludes core rulebook/SRD libraries by default; use `core-rules` or
    `core-rules-2024` for rules text.
	  - Returns file/line candidates and small context windows. It does not activate
	    canon; the DM still reads the returned card/index before IC use.
	  - Maintenance: when a MCP tool name, argument, or output contract changes,
	    update this contract, the MCP README, and startup prompt in the same
	    framework change. Prefer checking the tool schema/current README over
	    relying on memory.

	"""
    addition = """## Local MCP Helpers

- `campaign-source`
  - Read-only MCP router/search helper for `lore/source_materials` module/source cards.
  - Use `source_trigger_lookup(context, campaign_year)` when you do not yet know
    which module/source card should answer a region, faction, deity, monster,
    adventure hook, or source-covered topic.
  - Use `search_campaign_module(module, query)` when you already know the module
    or library, e.g. `module=bgdia query=Elturel`, `module=wdh query=Zhentarim`,
    `module=wdmm query=Skullport`.
  - Use `open_campaign_source(file, line, context_lines)` on returned pointers
    before using details in IC.
  - Use English proper nouns by default. Source cards are English-first; Chinese
    names are player-facing labels/limited aliases, not reliable primary search
    terms.
  - Excludes core rulebook/SRD libraries by default; use `core-rules` or
    `core-rules-2024` for rules text.
  - Returns file/line candidates and small context windows. It does not activate
    canon; the DM still reads the returned card/index before IC use.

"""
    if old_addition in text:
        text = text.replace(old_addition, addition)
    elif addition not in text and needle in text:
        text = text.replace(needle, addition + needle)
    path.write_text(text, encoding="utf-8")


def main() -> None:
    global SERVER_ROOT, SRC, CORE_NODE_MODULES
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--server-root", type=Path, help="Explicit install destination; disables default campaign configuration writes.")
    parser.add_argument("--repo", type=Path, action="append", help="Campaign repository whose .mcp.json should be wired; repeatable.")
    parser.add_argument("--node-modules", type=Path, help="Existing dependency directory to link when the destination has none.")
    args = parser.parse_args()
    repos = args.repo if args.repo is not None else ([] if args.server_root is not None else REPOS)
    if args.server_root is not None:
        SERVER_ROOT = args.server_root.resolve()
    SRC = SERVER_ROOT / "src"
    if args.node_modules is not None:
        CORE_NODE_MODULES = args.node_modules.resolve()
    install_server()
    for repo in repos:
        update_mcp(repo.resolve())
    print(f"installed {SERVER_ROOT}")
    for repo in repos:
        print(f"updated {repo.resolve()}")


if __name__ == "__main__":
    main()
