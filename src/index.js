#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  logicalWindowForLine,
  pageViewForLine
} from "./ocr-page-order.js";

const DEFAULT_MAX_RESULTS = 12;
const MAX_RESULTS = 40;
const DEFAULT_CONTEXT = 4;
const MAX_CONTEXT = 80;
const MAX_CHARS = 18000;

const TEXT_EXTENSIONS = new Set([".md", ".txt", ".json", ".yaml", ".yml"]);
const CORE_RULE_DIRS = new Set([
  "official_5e_core_rules",
  "official_2024_core_rules",
  "_srd_5e",
  "_srd_5e_2024"
]);

const ROOT_PRIORITY_FILES = new Set([
  "INSTALLED_MODULES_OVERVIEW.md",
  "CAMPAIGN_TIMELINE_DR.md",
  "SOURCE_TRIGGER_MASTER.md"
]);

const QUERY_ALIAS_GROUPS = [
  ["Forgotten Realms", "Faerun", "Faerûn", "费伦", "被遗忘的国度"],
  ["Elturel", "艾尔托瑞尔", "埃尔托瑞尔"],
  ["The Companion", "伴星", "伴侣之日"],
  ["Waterdeep", "深水城"],
  ["Daggerford", "匕首镇"],
  ["Baldur's Gate", "Baldurs Gate", "博德之门", "巴尔德之门"],
  ["Neverwinter", "无冬城"],
  ["Avernus", "阿弗纳斯", "阿佛纳斯"],
  ["Chult", "楚尔特"],
  ["Icewind Dale", "冰风谷"],
  ["Skullport", "骷髅港"],
  ["Undermountain", "地下山城"],
  ["Yawning Portal", "哈欠传送门"],
  ["Zhentarim", "Black Network", "Zhents", "真黑网"]
];

const SPLIT_TOKEN_STOPWORDS = new Set([
  "the",
  "city",
  "gate",
  "gates",
  "baldur",
  "baldurs",
  "companion",
  "companions"
]);

const MODULE_ALIASES = new Map([
  ["wdh", "official_5e_wdh"],
  ["dragon heist", "official_5e_wdh"],
  ["waterdeep dragon heist", "official_5e_wdh"],
  ["龙金劫", "official_5e_wdh"],
  ["wdmm", "official_5e_wdmm"],
  ["dungeon of the mad mage", "official_5e_wdmm"],
  ["疯法师", "official_5e_wdmm"],
  ["undermountain", "official_5e_wdmm"],
  ["地下山城", "official_5e_wdmm"],
  ["skullport", "official_5e_wdmm"],
  ["骷髅港", "official_5e_wdmm"],
  ["yawning portal", "official_5e_wdmm"],
  ["哈欠传送门", "official_5e_wdmm"],
  ["bgdia", "official_5e_bgdia"],
  ["descent into avernus", "official_5e_bgdia"],
  ["avernus", "official_5e_bgdia"],
  ["阿弗纳斯", "official_5e_bgdia"],
  ["阿佛纳斯", "official_5e_bgdia"],
  ["baldur's gate", "official_5e_bgdia"],
  ["baldurs gate", "official_5e_bgdia"],
  ["博德之门", "official_5e_bgdia"],
  ["巴尔德之门", "official_5e_bgdia"],
  ["skt", "official_5e_skt"],
  ["storm king", "official_5e_skt"],
  ["风暴王", "official_5e_skt"],
  ["cos", "official_5e_cos"],
  ["curse of strahd", "official_5e_cos"],
  ["斯特拉德", "official_5e_cos"],
  ["toa", "official_5e_toa"],
  ["tomb of annihilation", "official_5e_toa"],
  ["湮灭之墓", "official_5e_toa"],
  ["oota", "official_5e_oota"],
  ["out of the abyss", "official_5e_oota"],
  ["深渊之外", "official_5e_oota"],
  ["pota", "official_5e_pota"],
  ["princes of the apocalypse", "official_5e_pota"],
  ["idrotf", "official_5e_idrotf"],
  ["rime", "official_5e_idrotf"],
  ["icewind dale", "official_5e_idrotf"],
  ["冰风谷", "official_5e_idrotf"],
  ["wbtw", "official_5e_wbtw"],
  ["witchlight", "official_5e_wbtw"],
  ["kftgv", "official_5e_kftgv"],
  ["golden vault", "official_5e_kftgv"],
  ["cm", "official_5e_cm"],
  ["candlekeep mysteries", "official_5e_cm"],
  ["烛堡", "official_5e_cm"],
  ["coa", "official_5e_coa"],
  ["chains of asmodeus", "official_5e_coa"],
  ["阿斯摩蒂斯", "official_5e_coa"],
  ["bg3", "official_bg3"],
  ["baldur's gate 3", "official_bg3"],
  ["baldurs gate 3", "official_bg3"],
  ["博德之门3", "official_bg3"],
  ["fizban", "official_5e_fizban_dragons"],
  ["fizban dragons", "official_5e_fizban_dragons"],
  ["dragon delves", "official_5e_dragon_delves"],
  ["drde", "official_5e_dragon_delves"],
  ["drde25", "official_5e_dragon_delves"],
  ["planescape", "official_5e_planescape"],
  ["sato", "official_5e_planescape"],
  ["sato23", "official_5e_planescape"],
  ["sigil and the outlands", "official_5e_planescape"],
  ["mpp", "official_5e_planescape"],
  ["mpp23", "official_5e_planescape"],
  ["morte's planar parade", "official_5e_planescape"],
  ["morte’s planar parade", "official_5e_planescape"],
  ["tofw", "official_5e_planescape"],
  ["tofw23", "official_5e_planescape"],
  ["turn of fortune's wheel", "official_5e_planescape"],
  ["turn of fortune’s wheel", "official_5e_planescape"],
  ["spelljammer", "official_5e_spelljammer"],
  ["aag", "official_5e_spelljammer"],
  ["aag22", "official_5e_spelljammer"],
  ["astral adventurer's guide", "official_5e_spelljammer"],
  ["astral adventurer’s guide", "official_5e_spelljammer"],
  ["bam", "official_5e_spelljammer"],
  ["bam22", "official_5e_spelljammer"],
  ["boo's astral menagerie", "official_5e_spelljammer"],
  ["boo’s astral menagerie", "official_5e_spelljammer"],
  ["lox", "official_5e_spelljammer"],
  ["lox22", "official_5e_spelljammer"],
  ["light of xaryxis", "official_5e_spelljammer"],
  ["vecna", "official_5e_vecna_eve_of_ruin"],
  ["veor", "official_5e_vecna_eve_of_ruin"],
  ["veor24", "official_5e_vecna_eve_of_ruin"],
  ["vecna eve of ruin", "official_5e_vecna_eve_of_ruin"],
  ["eve of ruin", "official_5e_vecna_eve_of_ruin"],
  ["fraif", "official_2025_faerun"],
  ["adventures in faerun", "official_2025_faerun"],
  ["adventures in faerûn", "official_2025_faerun"],
  ["forgotten realms adventures in faerun", "official_2025_faerun"],
  ["frhof", "official_2025_faerun"],
  ["heroes of faerun", "official_2025_faerun"],
  ["heroes of faerûn", "official_2025_faerun"],
  ["forgotten realms heroes of faerun", "official_2025_faerun"],
  ["faerun 2025", "official_2025_faerun"],
  ["forgotten realms 2025", "official_2025_faerun"]
]);

function clampInt(value, fallback, min, max) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function requireRoot() {
  const root = process.env.CAMPAIGN_SOURCE_PATH;
  if (!root) throw new Error("CAMPAIGN_SOURCE_PATH is not set");
  const resolved = path.resolve(root);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    throw new Error(`CAMPAIGN_SOURCE_PATH is not a directory: ${resolved}`);
  }
  return realpath(resolved);
}

function textResponse(text) {
  return { content: [{ type: "text", text }] };
}

function truncate(text, maxChars = MAX_CHARS) {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + `\n\n[truncated: ${text.length - maxChars} more characters omitted; narrow the query or open a specific file/line]`;
}

function topDir(rel) {
  const clean = rel.replace(/^\/+/, "");
  const parts = clean.split(path.sep);
  return parts.length > 1 ? parts[0] : "";
}

function realpath(p) {
  return fs.realpathSync.native ? fs.realpathSync.native(p) : fs.realpathSync(p);
}

function isInside(parent, child) {
  return child === parent || child.startsWith(parent + path.sep);
}

function cleanRelativePath(input, label = "path") {
  const raw = String(input || "").trim();
  if (!raw) throw new Error(`${label} is required`);
  if (path.isAbsolute(raw)) throw new Error(`${label} must be relative: ${input}`);
  const parts = raw.replace(/^\/+|\/+$/g, "").split(/[\/\\]+/).filter(Boolean);
  if (!parts.length) throw new Error(`${label} is required`);
  if (parts.some(part => part === "." || part === "..")) {
    throw new Error(`${label} must not contain . or .. segments: ${input}`);
  }
  return parts.join(path.sep);
}

function isPrivateRel(rel) {
  return /(^|[/\\])(?:dm_private|_private|private)(?:[/\\]|$)/i.test(rel);
}

function isFullSourceRel(rel) {
  return /(^|[/\\])_full_source[^/\\]*\.md$/i.test(rel) || /(^|[/\\])_full_source_[^/\\]*\.md$/i.test(rel);
}

function isCoreRulesRel(rel) {
  return CORE_RULE_DIRS.has(topDir(rel));
}

function fileKind(rel) {
  const base = path.basename(rel).toLowerCase();
  if (ROOT_PRIORITY_FILES.has(path.basename(rel))) return "root-router";
  if (base === "start_here.md") return "start-here";
  if (base.includes("activation_protocol")) return "activation-protocol";
  if (base.includes("source_index") || base.includes("cards_index") || base.includes("coverage_guide")) return "index";
  if (isFullSourceRel(rel)) return "full-source";
  if (topDir(rel).startsWith("_") || topDir(rel).includes("subsystem") || topDir(rel).includes("bastion")) return "support";
  return "card";
}

function sourceStatusHint(rel) {
  if (isCoreRulesRel(rel)) return "excluded-core-rules";
  const kind = fileKind(rel);
  if (kind === "root-router") return "routing/root orientation; read only as directed";
  if (kind === "start-here" || kind === "activation-protocol" || kind === "index") return "module routing/index; read before deep cards";
  if (kind === "full-source") return "raw full-source fallback; prefer lightweight card first";
  if (kind === "support") return "support/subsystem source; on-demand";
  return "module/source card candidate; not active until source trigger says so";
}

function safeRel(root, rel, includePrivate = false, includeCoreRules = false) {
  const clean = cleanRelativePath(rel, "file");
  const abs = path.resolve(root, clean);
  const rootResolved = path.resolve(root);
  if (!(abs === rootResolved || abs.startsWith(rootResolved + path.sep))) {
    throw new Error(`Path escapes source root: ${rel}`);
  }
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
    throw new Error(`File not found: ${rel}`);
  }
  const rootReal = realpath(rootResolved);
  const absReal = realpath(abs);
  if (!isInside(rootReal, absReal)) {
    throw new Error(`Path escapes source root via symlink: ${rel}`);
  }
  const relative = path.relative(rootResolved, abs);
  const realRelative = path.relative(rootReal, absReal);
  if (!includePrivate && (isPrivateRel(relative) || isPrivateRel(realRelative))) {
    throw new Error(`Private source path requires include_private=true: ${relative}`);
  }
  if (!includeCoreRules && (isCoreRulesRel(relative) || isCoreRulesRel(realRelative))) {
    throw new Error(`Refusing core/SRD path in campaign-source MCP: ${relative}; use core-rules/core-rules-2024 instead.`);
  }
  return absReal;
}

function walk(root, dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === ".git" || entry.name === "node_modules") continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(root, abs, out);
    } else if (entry.isFile()) {
      const rel = path.relative(root, abs);
      if (TEXT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        out.push(rel);
      }
    }
  }
}

function allTextFiles(root, options = {}) {
  const includeCoreRules = Boolean(options.includeCoreRules);
  const includePrivate = Boolean(options.includePrivate);
  const includeFullSource = options.includeFullSource !== false;
  const directories = normalizeDirFilter(options.directories);
  const rels = [];
  walk(root, root, rels);
  return rels.filter(rel => {
    if (!includeCoreRules && isCoreRulesRel(rel)) return false;
    if (!includePrivate && isPrivateRel(rel)) return false;
    if (!includeFullSource && isFullSourceRel(rel)) return false;
    if (directories && !directories.some(d => rel === d || rel.startsWith(d + path.sep))) return false;
    return true;
  }).sort((a, b) => filePriority(a) - filePriority(b) || a.localeCompare(b));
}

function normalizeDirFilter(value) {
  if (!value) return null;
  const arr = Array.isArray(value) ? value : String(value).split(/[,\s]+/);
  const cleaned = arr.map(v => cleanRelativePath(v, "directory")).filter(Boolean);
  return cleaned.length ? [...new Set(cleaned)] : null;
}

function filePriority(rel) {
  const kind = fileKind(rel);
  if (kind === "root-router") return 0;
  if (kind === "start-here") return 5;
  if (kind === "activation-protocol") return 8;
  if (kind === "index") return 10;
  if (kind === "card") return 20;
  if (kind === "support") return 30;
  if (kind === "full-source") return 80;
  return 40;
}

function readWindow(abs, centerLine, context) {
  const lines = fs.readFileSync(abs, "utf8").split(/\r?\n/);
  const line = clampInt(centerLine, 1, 1, Math.max(1, lines.length));
  const ctx = clampInt(context, DEFAULT_CONTEXT, 0, MAX_CONTEXT);
  const start = Math.max(1, line - ctx);
  const end = Math.min(lines.length, line + ctx);
  const out = [];
  for (let i = start; i <= end; i++) {
    out.push(`${String(i).padStart(6, " ")} | ${lines[i - 1]}`);
  }
  return { start, end, text: out.join("\n") };
}

function readingOrderLabel(mode, pageNumber, hint = "") {
  if (mode === "columns") {
    return `reading_order: reconstructed${pageNumber ? ` from PDF page ${pageNumber}` : ""}`;
  }
  if (mode === "fallback") {
    return `reading_order: source-order fallback${pageNumber ? ` (PDF page ${pageNumber})` : ""}${hint}`;
  }
  return null;
}

function isReflowEligible(rel) {
  return fileKind(rel) === "full-source" && !isPrivateRel(rel) && !isCoreRulesRel(rel);
}

function queryCell(lines, sourceLine, query, regex = false) {
  if (!query) return null;
  let matcher;
  if (regex) {
    try {
      const pattern = new RegExp(query, "i");
      matcher = text => pattern.test(text);
    } catch {
      return null;
    }
  } else {
    const needle = String(query).toLocaleLowerCase();
    matcher = text => text.toLocaleLowerCase().includes(needle);
  }

  const view = pageViewForLine(lines, sourceLine);
  if (view.mode !== "columns") return null;
  const matches = view.entries.filter(entry => (
    entry.sourceLine === sourceLine && matcher(entry.text)
  ));
  if (matches.length !== 1) return null;
  return {
    selector: { column: matches[0].column, text: matches[0].text },
    text: matches[0].text
  };
}

function readOrderedWindow(abs, rel, centerLine, context, options = {}) {
  const source = readWindow(abs, centerLine, context);
  if (options.readingOrder === "source" || !isReflowEligible(rel)) {
    return { ...source, mode: "source", pageNumber: null, label: null };
  }

  const lines = fs.readFileSync(abs, "utf8").split(/\r?\n/);
  const view = pageViewForLine(lines, centerLine);
  if (view.pageNumber === null) {
    return { ...source, mode: "source", pageNumber: null, label: null };
  }
  if (view.mode !== "columns") {
    return {
      ...source,
      mode: "fallback",
      pageNumber: view.pageNumber,
      label: readingOrderLabel("fallback", view.pageNumber)
    };
  }

  const selected = queryCell(lines, centerLine, options.query, options.regex);
  const cellsAtLine = view.entries.filter(entry => entry.sourceLine === centerLine).length;
  const selector = selected?.selector
    ?? (options.column && cellsAtLine > 1 ? { column: options.column } : undefined);
  try {
    const logical = logicalWindowForLine(
      lines,
      centerLine,
      context,
      selector
    );
    if (!logical.text) throw new RangeError("logical target not found");
    return {
      ...logical,
      mode: "columns",
      label: readingOrderLabel("columns", logical.pageNumber),
      matchText: selected?.text
    };
  } catch (error) {
    if (!(error instanceof RangeError) && !(error instanceof TypeError)) throw error;
    const hint = cellsAtLine > 1 && !selector
      ? `; line ${centerLine} has text in both columns, pass column "L" or "R" to read it in reconstructed order`
      : "";
    return {
      ...source,
      mode: "fallback",
      pageNumber: view.pageNumber,
      label: readingOrderLabel("fallback", view.pageNumber, hint)
    };
  }
}

function rgSearch(root, query, options = {}) {
  const maxResults = clampInt(options.maxResults, DEFAULT_MAX_RESULTS, 1, MAX_RESULTS);
  const regex = Boolean(options.regex);
  const files = allTextFiles(root, options).map(rel => path.join(root, rel));
  if (!files.length) return [];
  const args = ["--line-number", "--with-filename", "--ignore-case", "--no-heading"];
  if (!regex) args.push("--fixed-strings");
  args.push("--", query, ...files);
  const result = spawnSync("rg", args, { encoding: "utf8", maxBuffer: 1024 * 1024 * 16 });
  if (result.error && result.error.code === "ENOENT") return jsSearch(root, query, options);
  if (result.error || result.signal || (result.status !== 0 && result.status !== 1)) {
    const detail = result.error?.message || result.stderr?.trim() || `exit ${result.status}, signal ${result.signal || "none"}`;
    throw new Error(`Search failed (rg): ${compactText(detail, 1000)}`);
  }
  if (result.status === 1) return [];
  return parseRgOutput(root, result.stdout, maxResults, options.moduleTerms);
}

function parseRgOutput(root, stdout, maxResults, moduleTerms) {
  const hits = [];
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const m = line.match(/^(.*?):(\d+):(.*)$/);
    if (!m) continue;
    const abs = m[1];
    const rel = path.relative(root, abs);
    hits.push({
      file: rel,
      line: Number.parseInt(m[2], 10),
      kind: fileKind(rel),
      status_hint: sourceStatusHint(rel),
      match: m[3].trim(),
      score: hitScore(rel, m[3])
    });
  }
  if (moduleTerms) return rerankModuleHits(hits, moduleTerms, maxResults);
  return hits
    .sort((a, b) => b.score - a.score || filePriority(a.file) - filePriority(b.file) || a.file.localeCompare(b.file) || a.line - b.line)
    .slice(0, maxResults);
}

function jsSearch(root, query, options = {}) {
  const maxResults = clampInt(options.maxResults, DEFAULT_MAX_RESULTS, 1, MAX_RESULTS);
  const regex = Boolean(options.regex);
  const pattern = regex ? new RegExp(query, "i") : null;
  const q = String(query).toLowerCase();
  const hits = [];
  for (const rel of allTextFiles(root, options)) {
    const abs = path.join(root, rel);
    const lines = fs.readFileSync(abs, "utf8").split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const ok = regex ? pattern.test(lines[i]) : lines[i].toLowerCase().includes(q);
      if (!ok) continue;
      hits.push({
        file: rel,
        line: i + 1,
        kind: fileKind(rel),
        status_hint: sourceStatusHint(rel),
        match: lines[i].trim(),
        score: hitScore(rel, lines[i])
      });
      if (!options.moduleTerms && hits.length >= maxResults * 4) break;
    }
  }
  if (options.moduleTerms) return rerankModuleHits(hits, options.moduleTerms, maxResults);
  return hits
    .sort((a, b) => b.score - a.score || filePriority(a.file) - filePriority(b.file) || a.file.localeCompare(b.file) || a.line - b.line)
    .slice(0, maxResults);
}

function hitScore(rel, line) {
  let score = 100 - filePriority(rel);
  const base = path.basename(rel).toLowerCase();
  const text = String(line || "");
  if (/^#{1,4}\s/.test(text)) score += 20;
  if (base === "start_here.md") score += 12;
  if (base.includes("source_index") || base.includes("coverage_guide") || base.includes("cards_index")) score += 8;
  if (isFullSourceRel(rel)) score -= 30;
  return score;
}

function termMatchesText(text, terms) {
  const lower = String(text || "").toLowerCase();
  return terms.some(term => lower.includes(String(term).toLowerCase()));
}

function moduleHitScore(hit, terms) {
  let score = hit.score;
  const kind = fileKind(hit.file);
  const base = path.basename(hit.file).toLowerCase();
  const text = String(hit.match || "");
  if (kind === "card") score += 40;
  if (kind === "start-here" || kind === "index" || kind === "activation-protocol") score -= 25;
  if (termMatchesText(hit.file, terms) || termMatchesText(base, terms)) score += 80;
  if (/^#{1,4}\s/.test(text) && termMatchesText(text, terms)) score += 70;
  if (/trigger_keywords|aliases/i.test(text)) score += 20;
  if (/full raw text|line map|do not bulk-read|raw line/i.test(text)) score -= 90;
  if (isFullSourceRel(hit.file)) score -= 50;
  return score;
}

function rerankModuleHits(hits, terms, maxResults) {
  const cap = clampInt(maxResults, DEFAULT_MAX_RESULTS, 1, MAX_RESULTS);
  const scored = hits.map(hit => ({ ...hit, score: moduleHitScore(hit, terms) }))
    .sort((a, b) => b.score - a.score || filePriority(a.file) - filePriority(b.file) || a.file.localeCompare(b.file) || a.line - b.line);
  const perFile = new Map();
  const out = [];
  for (const hit of scored) {
    const seen = perFile.get(hit.file) || 0;
    const capForFile = path.basename(hit.file).toLowerCase() === "start_here.md" ? 1 : 3;
    if (seen >= capForFile) continue;
    perFile.set(hit.file, seen + 1);
    out.push(hit);
    if (out.length >= cap) break;
  }
  return out;
}

function formatHits(root, hits, contextLines, options = {}) {
  if (!hits.length) {
    return [
      "No module/source-card matches.",
      "This MCP excludes core rulebook/SRD folders by default.",
      "Use clean English proper nouns first (place/faction/NPC/module names). The source cards are English-first; Chinese terms are not reliable primary search keys. Then try broader aliases, regex=true, or include_full_source=true if you disabled it."
    ].join("\n");
  }
  const ctx = clampInt(contextLines, DEFAULT_CONTEXT, 0, MAX_CONTEXT);
  const parts = [
    "Reminder: these are source candidates, not automatic canon activation. Read the named card before using details in IC."
  ];
  for (const h of hits) {
    const abs = safeRel(root, h.file, options.includePrivate, options.includeCoreRules);
    const win = readOrderedWindow(abs, h.file, h.line, ctx, {
      readingOrder: "auto",
      query: options.query,
      regex: options.regex
    });
    const label = win.label ? `\n${win.label}` : "";
    parts.push(`### ${h.file}:${h.line}\nkind: ${h.kind}\nstatus_hint: ${h.status_hint}\nmatch: ${win.matchText || h.match}${label}\n\n\`\`\`text\n${win.text}\n\`\`\``);
  }
  return truncate(parts.join("\n\n---\n\n"));
}

function compactText(text, maxChars = 360) {
  const oneLine = String(text || "").replace(/\s+/g, " ").trim();
  if (oneLine.length <= maxChars) return oneLine;
  return oneLine.slice(0, maxChars - 1) + "…";
}

function extractBacktickPointers(text) {
  const pointers = [];
  const re = /`([^`]+)`/g;
  let match;
  while ((match = re.exec(String(text || ""))) !== null) {
    const value = match[1].trim();
    if (!value || value.length > 120) continue;
    if (value.includes("/") || value.endsWith(".md")) pointers.push(value);
  }
  return [...new Set(pointers)].slice(0, 6);
}

function formatRoutingHits(hits) {
  if (!hits.length) {
    return [
      "No module/source-card matches.",
      "Tip: use clean English trigger words such as a place, faction, module acronym, deity, monster, or NPC proper noun. Source cards are English-first; Chinese terms are only limited aliases.",
      "This MCP excludes core rulebook/SRD folders by default."
    ].join("\n");
  }
  const rows = [
    "Routing candidates only; read the named card/index before IC use. These do not activate optional canon."
  ];
  for (const h of hits) {
    const pointers = extractBacktickPointers(h.match);
    const pointerText = pointers.length ? `\n  pointers: ${pointers.join(", ")}` : "";
    rows.push([
      `- ${h.file}:${h.line}`,
      `  kind/status: ${h.kind}; ${h.status_hint}`,
      `  signal: ${compactText(h.match)}`,
      `  open: open_campaign_source({"file":"${h.file}","line":${h.line},"context_lines":8})${pointerText}`
    ].join("\n"));
  }
  return truncate(rows.join("\n"));
}

function expandQueryTerms(query) {
  const raw = String(query || "").trim();
  const terms = new Set();
  if (raw) terms.add(raw);
  for (const part of raw.split(/[\s,;，；、。！？()（）\[\]【】"'“”‘’]+/)) {
    const trimmed = part.trim();
    if (trimmed.length >= 2 && !SPLIT_TOKEN_STOPWORDS.has(trimmed.toLowerCase())) terms.add(trimmed);
  }
  const lower = raw.toLowerCase();
  for (const group of QUERY_ALIAS_GROUPS) {
    if (group.some(term => lower.includes(term.toLowerCase()))) {
      for (const term of group) terms.add(term);
    }
  }
  if (/\bcompanion\b/i.test(raw) || raw.includes("伴星")) {
    terms.add("The Companion");
    terms.add("伴星");
  }
  return [...terms].filter(term => term.length >= 2).slice(0, 12);
}

function lineContainsAny(line, terms) {
  const lower = String(line || "").toLowerCase();
  return terms.some(term => lower.includes(term.toLowerCase()));
}

function tableCells(line) {
  if (!String(line || "").trim().startsWith("|")) return [];
  return String(line).split("|").slice(1, -1).map(cell => cell.trim());
}

function startsWithAnyTerm(text, terms) {
  const lower = String(text || "").trim().toLowerCase();
  return terms.some(term => lower.startsWith(term.toLowerCase()));
}

function containsAnyTerm(text, terms) {
  const lower = String(text || "").toLowerCase();
  return terms.some(term => lower.includes(term.toLowerCase()));
}

function routingScore(rel, line, terms) {
  let score = 200 - filePriority(rel);
  const text = String(line || "");
  const cells = tableCells(text);
  const matchedCount = terms.filter(term => containsAnyTerm(text, [term])).length;
  score += Math.min(matchedCount, 4) * 35;
  if (cells.length) {
    if (containsAnyTerm(cells[0], terms)) score += 70;
    if (cells[3] && startsWithAnyTerm(cells[3], terms)) score += 110;
    if (cells.some(cell => extractBacktickPointers(cell).some(pointer => pointer.endsWith(".md")))) score += 25;
  }
  if (/^#{1,4}\s/.test(text)) score += containsAnyTerm(text, terms) ? 120 : 20;
  if (/Aliases?:/i.test(text)) score -= 45;
  if (/source_pool|do_not_auto_use|requires_user_approval/i.test(text)) score -= 55;
  if (isFullSourceRel(rel)) score -= 30;
  return score;
}

function summarizeTopDirs(root, includePrivate = false) {
  const counts = new Map();
  const rootFiles = [];
  for (const rel of allTextFiles(root, { includeCoreRules: true, includePrivate, includeFullSource: true })) {
    const dir = topDir(rel);
    if (!dir) rootFiles.push(rel);
    else counts.set(dir, (counts.get(dir) || 0) + 1);
  }
  return { counts, rootFiles };
}

function listFilesForDirectory(root, directory, options = {}) {
  const dir = cleanRelativePath(directory, "directory");
  const maxFiles = clampInt(options.maxFiles, 120, 1, 400);
  return allTextFiles(root, {
    directories: [dir],
    includeCoreRules: Boolean(options.includeCoreRules),
    includePrivate: Boolean(options.includePrivate),
    includeFullSource: options.includeFullSource !== false
  }).slice(0, maxFiles);
}

function resolveModuleDir(root, moduleName) {
  const raw = String(moduleName || "").trim();
  if (!raw) throw new Error("module is required");
  const normalized = raw.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  const aliased = MODULE_ALIASES.get(normalized);
  if (aliased && fs.existsSync(path.join(root, aliased))) return aliased;
  const direct = cleanRelativePath(raw, "module");
  if (fs.existsSync(path.join(root, direct)) && fs.statSync(path.join(root, direct)).isDirectory()) {
    if (CORE_RULE_DIRS.has(direct)) {
      throw new Error(`Refusing core/SRD module in campaign-source MCP: ${direct}; use core-rules/core-rules-2024 instead.`);
    }
    return direct;
  }
  const dirs = [...summarizeTopDirs(root).counts.keys()].filter(dir => !CORE_RULE_DIRS.has(dir));
  if (normalized.length >= 4 && !normalized.includes("/") && !normalized.includes("\\")) {
    const fuzzy = dirs.filter(dir => {
      const cleanDir = dir.toLowerCase().replace(/^official_5e_|^official_2024_|^official_/i, "").replace(/[_-]+/g, " ");
      return cleanDir === normalized || cleanDir.includes(normalized);
    });
    if (fuzzy.length === 1) return fuzzy[0];
    if (fuzzy.length > 1) {
      throw new Error(`Ambiguous campaign module/library: ${moduleName}\nCandidates: ${fuzzy.sort().slice(0, 20).join(", ")}\nUse an exact top-level directory or alias such as bgdia, wdh, wdmm, bg3.`);
    }
  }
  throw new Error(`Unknown campaign module/library: ${moduleName}\nKnown top-level modules include: ${dirs.sort().slice(0, 40).join(", ")}`);
}

function formatDirList(root, rels) {
  if (!rels.length) return "No files for that directory/filter.";
  return rels.map(rel => `- ${rel} — ${fileKind(rel)}; ${sourceStatusHint(rel)}`).join("\n");
}

function sourceTriggerLookup(root, context, options = {}) {
  const query = String(context || "").trim();
  if (!query) throw new Error("context/query is required");
  const maxResults = clampInt(options.maxResults, 12, 1, MAX_RESULTS);
  const contextLines = clampInt(options.contextLines, 4, 0, 20);
  const terms = expandQueryTerms(query);
  const keyFiles = [
    "SOURCE_TRIGGER_MASTER.md",
    "INSTALLED_MODULES_OVERVIEW.md",
    "CAMPAIGN_TIMELINE_DR.md"
  ].filter(rel => fs.existsSync(path.join(root, rel)));
  const routerHits = [];
  for (const rel of keyFiles) {
    const abs = safeRel(root, rel, Boolean(options.includePrivate));
    const sourceRel = path.relative(root, abs);
    const lines = fs.readFileSync(abs, "utf8").split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      if (!lineContainsAny(lines[i], terms)) continue;
      routerHits.push({
        file: sourceRel,
        line: i + 1,
        kind: fileKind(sourceRel),
        status_hint: sourceStatusHint(sourceRel),
        match: lines[i].trim(),
        score: routingScore(rel, lines[i], terms)
      });
      if (routerHits.length >= Math.max(maxResults * 6, 24)) break;
    }
  }
  const broadHits = [];
  for (const term of terms) {
    broadHits.push(...rgSearch(root, term, {
      maxResults: Math.max(3, Math.ceil(maxResults / Math.max(1, terms.length))),
      contextLines,
      includePrivate: Boolean(options.includePrivate),
      includeFullSource: false
    }));
  }
  const merged = [...routerHits, ...broadHits]
    .sort((a, b) => b.score - a.score || filePriority(a.file) - filePriority(b.file) || a.file.localeCompare(b.file) || a.line - b.line);
  const seen = new Set();
  const unique = [];
  for (const h of merged) {
    const key = `${h.file}:${h.line}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(h);
    if (unique.length >= maxResults) break;
  }
  const header = [
    `Source trigger lookup for: ${query}`,
    terms.length > 1 ? `Expanded trigger terms: ${terms.join(", ")}` : `Trigger term: ${terms[0] || query}`,
    options.campaign_year ? `Campaign year hint: ${options.campaign_year} DR — cross-check CAMPAIGN_TIMELINE_DR.md before activating time-sensitive modules.` : "Campaign year hint: not supplied; cross-check CAMPAIGN_TIMELINE_DR.md before activating time-sensitive modules.",
    "Use this as routing. It suggests cards to read; it does not activate optional arcs."
  ].join("\n");
  return `${header}\n\n${formatRoutingHits(unique)}`;
}

function buildServer() {
  const server = new McpServer({
    name: "campaign-source-mcp",
    version: "0.1.0"
  });

  server.tool(
    "list_campaign_sources",
    "List installed local campaign module/source libraries, excluding core rules/SRD by default.",
    {
      include_core_rules: z.boolean().optional().default(false),
      include_private: z.boolean().optional().default(false)
    },
    async ({ include_core_rules, include_private }) => {
      const root = requireRoot();
      const { counts, rootFiles } = summarizeTopDirs(root, include_private);
      const rows = [];
      rows.push(`Campaign source root: ${root}`);
      rows.push(`Label: ${process.env.CAMPAIGN_SOURCE_LABEL || "campaign source library"}`);
      rows.push("");
      rows.push("Root router files:");
      for (const f of rootFiles.sort()) rows.push(`- ${f} — ${sourceStatusHint(f)}`);
      rows.push("");
      rows.push("Top-level libraries:");
      for (const [dir, count] of [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
        if (!include_core_rules && CORE_RULE_DIRS.has(dir)) {
          rows.push(`- ${dir}: ${count} text files — excluded core/SRD by default`);
        } else {
          const status = CORE_RULE_DIRS.has(dir) ? "core/SRD included by override" : "available";
          rows.push(`- ${dir}: ${count} text files — ${status}`);
        }
      }
      return textResponse(rows.join("\n"));
    }
  );

  server.tool(
    "search_campaign_sources",
    "Search local campaign module/source cards. Returns file/line pointers and small context windows; candidates are not automatic canon activation.",
    {
      query: z.string().min(1),
      directories: z.union([z.string(), z.array(z.string())]).optional().describe("Optional top-level dir(s), e.g. official_5e_wdh or official_5e_bgdia."),
      regex: z.boolean().optional().default(false),
      max_results: z.number().int().min(1).max(MAX_RESULTS).optional().default(DEFAULT_MAX_RESULTS).describe("Maximum results: integer from 1 to 40."),
      context_lines: z.number().int().min(0).max(20).optional().default(DEFAULT_CONTEXT).describe("Context lines on each side: integer from 0 to 20."),
      include_full_source: z.boolean().optional().default(true),
      include_private: z.boolean().optional().default(false),
      include_core_rules: z.boolean().optional().default(false)
    },
    async ({ query, directories, regex, max_results, context_lines, include_full_source, include_private, include_core_rules }) => {
      const root = requireRoot();
      const hits = rgSearch(root, query, {
        directories,
        regex,
        maxResults: max_results,
        includeFullSource: include_full_source,
        includePrivate: include_private,
        includeCoreRules: include_core_rules
      });
      return textResponse(formatHits(root, hits, context_lines, { query, regex, includePrivate: include_private, includeCoreRules: include_core_rules }));
    }
  );

  server.tool(
    "search_campaign_module",
    "Search inside one campaign module/source library by module name or alias, e.g. module=bgdia query=Elturel.",
    {
      module: z.string().min(1).describe("Top-level directory or alias, e.g. official_5e_bgdia, bgdia, wdh, wdmm, bg3."),
      query: z.string().min(1),
      regex: z.boolean().optional().default(false),
      max_results: z.number().int().min(1).max(MAX_RESULTS).optional().default(DEFAULT_MAX_RESULTS).describe("Maximum results: integer from 1 to 40."),
      context_lines: z.number().int().min(0).max(20).optional().default(DEFAULT_CONTEXT).describe("Context lines on each side: integer from 0 to 20."),
      include_full_source: z.boolean().optional().default(true),
      include_private: z.boolean().optional().default(false)
    },
    async ({ module, query, regex, max_results, context_lines, include_full_source, include_private }) => {
      const root = requireRoot();
      const dir = resolveModuleDir(root, module);
      const hits = rgSearch(root, query, {
        directories: [dir],
        regex,
        maxResults: max_results,
        moduleTerms: expandQueryTerms(query),
        includeFullSource: include_full_source,
        includePrivate: include_private,
        includeCoreRules: false
      });
      const header = [
        `Module search: ${module} -> ${dir}`,
        `Query: ${query}`,
        "Candidates only; read the returned card/window before IC use."
      ].join("\n");
      return textResponse(`${header}\n\n${formatHits(root, hits, context_lines, { query, regex, includePrivate: include_private })}`);
    }
  );

  server.tool(
    "open_campaign_source",
    "Open a line-numbered window from a local campaign source file. Auto mode reconstructs confident two-column full-source PDF pages; reading_order=source preserves physical OCR rows. When the line has text in both columns, column picks the left (L) or right (R) cell.",
    {
      file: z.string().min(1).describe("Path relative to lore/source_materials."),
      line: z.number().int().min(1).optional().default(1).describe("Physical source line: integer of at least 1."),
      context_lines: z.number().int().min(0).max(MAX_CONTEXT).optional().default(20).describe("Context lines on each side: integer from 0 to 80."),
      reading_order: z.enum(["auto", "source"]).optional().default("auto"),
      column: z.enum(["L", "R"]).optional().describe("Auto mode only: which cell to open when the line has text in both columns."),
      include_private: z.boolean().optional().default(false)
    },
    async ({ file, line, context_lines, reading_order, column, include_private }) => {
      const root = requireRoot();
      const abs = safeRel(root, file, include_private);
      const rel = path.relative(root, abs);
      const win = readOrderedWindow(abs, rel, line, context_lines, { readingOrder: reading_order, column });
      const label = win.label ? `\n${win.label}` : "";
      return textResponse(truncate(`### ${rel}:${line}\nkind: ${fileKind(rel)}\nstatus_hint: ${sourceStatusHint(rel)}${label}\n\n\`\`\`text\n${win.text}\n\`\`\``));
    }
  );

  server.tool(
    "source_trigger_lookup",
    "Route a location/faction/topic/context phrase through the local source library. Returns likely cards/indexes to read; does not activate canon.",
    {
      context: z.string().min(1),
      campaign_year: z.number().int().optional().describe("Campaign year in DR; any integer."),
      max_results: z.number().int().min(1).max(MAX_RESULTS).optional().default(12).describe("Maximum results: integer from 1 to 40."),
      context_lines: z.number().int().min(0).max(20).optional().default(4).describe("Context lines: integer from 0 to 20; routing output stays compact."),
      include_private: z.boolean().optional().default(false)
    },
    async ({ context, campaign_year, max_results, context_lines, include_private }) => {
      const root = requireRoot();
      return textResponse(sourceTriggerLookup(root, context, { campaign_year: campaign_year, maxResults: max_results, contextLines: context_lines, includePrivate: include_private }));
    }
  );

  server.tool(
    "list_campaign_source_files",
    "List files under a specific source-library directory, e.g. official_5e_wdh or official_5e_bgdia/baldurs_gate.",
    {
      directory: z.string().min(1),
      max_files: z.number().int().min(1).max(400).optional().default(120).describe("Maximum files: integer from 1 to 400."),
      include_full_source: z.boolean().optional().default(false),
      include_private: z.boolean().optional().default(false),
      include_core_rules: z.boolean().optional().default(false)
    },
    async ({ directory, max_files, include_full_source, include_private, include_core_rules }) => {
      const root = requireRoot();
      const rels = listFilesForDirectory(root, directory, { maxFiles: max_files, includeFullSource: include_full_source, includePrivate: include_private, includeCoreRules: include_core_rules });
      return textResponse(truncate(formatDirList(root, rels)));
    }
  );

  return server;
}

async function selftest() {
  const root = requireRoot();
  const dirs = summarizeTopDirs(root).counts;
  if (!dirs.size) throw new Error("expected source directories");
  if (dirs.has("official_5e_core_rules")) {
    const listed = allTextFiles(root, { includeCoreRules: false, includeFullSource: true });
    if (listed.some(rel => rel.startsWith("official_5e_core_rules/"))) {
      throw new Error("core rules were not excluded by default");
    }
  }
  const query = fs.existsSync(path.join(root, "SOURCE_TRIGGER_MASTER.md")) ? "Waterdeep" : "Daggerford";
  const hits = rgSearch(root, query, { maxResults: 5, includeFullSource: true });
  if (!hits.length) throw new Error(`expected at least one hit for ${query}`);
  if (fs.existsSync(path.join(root, "SOURCE_TRIGGER_MASTER.md"))) {
    if (resolveModuleDir(root, "bgdia") !== "official_5e_bgdia") {
      throw new Error("expected module alias bgdia to resolve to official_5e_bgdia");
    }
    for (const [alias, expected] of [
      ["fraif", "official_2025_faerun"],
      ["frhof", "official_2025_faerun"],
      ["planescape", "official_5e_planescape"],
      ["mpp", "official_5e_planescape"],
      ["tofw", "official_5e_planescape"],
      ["spelljammer", "official_5e_spelljammer"],
      ["bam", "official_5e_spelljammer"],
      ["lox", "official_5e_spelljammer"],
      ["veor", "official_5e_vecna_eve_of_ruin"],
      ["drde", "official_5e_dragon_delves"]
    ]) {
      if (resolveModuleDir(root, alias) !== expected) {
        throw new Error(`expected module alias ${alias} to resolve to ${expected}`);
      }
    }
    for (const [file, sourceId] of [
      ["official_2025_faerun/_full_source_fraif.md", "source_id: fraif25"],
      ["official_2025_faerun/_full_source_frhof.md", "source_id: frhof25"],
      ["official_5e_planescape/_full_source_sigil_and_outlands.md", "source_id: sato23"],
      ["official_5e_planescape/_full_source_mortes_planar_parade.md", "source_id: mpp23"],
      ["official_5e_planescape/_full_source_turn_of_fortunes_wheel.md", "source_id: tofw23"],
      ["official_5e_spelljammer/_full_source_astral_adventurers_guide.md", "source_id: aag22"],
      ["official_5e_spelljammer/_full_source_boos_astral_menagerie.md", "source_id: bam22"],
      ["official_5e_spelljammer/_full_source_light_of_xaryxis.md", "source_id: lox22"],
      ["official_5e_vecna_eve_of_ruin/_full_source.md", "source_id: veor24"],
      ["official_5e_dragon_delves/_full_source.md", "source_id: drde25"]
    ]) {
      if (fs.existsSync(path.join(root, file))) {
        const directory = file.split("/", 1)[0];
        const hit = rgSearch(root, sourceId, {
          directories: [directory],
          maxResults: 3,
          includeFullSource: true
        });
        if (!hit.some(row => row.file === file)) {
          throw new Error(`expected full-source search hit for ${file}`);
        }
      }
    }
    try {
      resolveModuleDir(root, "official_5e_core_rules");
      throw new Error("expected core module resolution to be refused");
    } catch (err) {
      if (!String(err.message || err).includes("Refusing core/SRD")) throw err;
    }
    const routed = sourceTriggerLookup(root, "埃尔托瑞尔 伴星", { maxResults: 5, contextLines: 1 });
    if (!/official_5e_bgdia\/avernus\/elturel_fallen_city\.md/i.test(routed)) {
      throw new Error("expected noisy Chinese Elturel/Companion query to route to BGDIA");
    }
    if (/official_bg3\/companions\.md|official_5e_oota\/key_npcs\.md/i.test(routed)) {
      throw new Error("ambiguous companion query leaked generic companions into top routing results");
    }
    const bgdiaHits = rerankModuleHits(
      rgSearch(root, "Elturel", { directories: ["official_5e_bgdia"], maxResults: MAX_RESULTS, includeFullSource: false }),
      expandQueryTerms("Elturel"),
      8
    );
    if (!bgdiaHits.some(h => /official_5e_bgdia\/avernus\/elturel_(fallen_city|operational_nodes)\.md/i.test(h.file))) {
      throw new Error("expected BGDIA module search for Elturel to surface concrete Elturel cards");
    }
    if (bgdiaHits.slice(0, 3).every(h => path.basename(h.file).toLowerCase() === "start_here.md")) {
      throw new Error("module search over-prioritized START_HERE over concrete cards");
    }
    try {
      resolveModuleDir(root, "../source_materials");
      throw new Error("expected path-like module name to be refused");
    } catch (err) {
      if (!String(err.message || err).includes("must not contain")) throw err;
    }
  }
  try {
    safeRel(root, "../outside.md", false);
    throw new Error("expected path escape to be refused");
  } catch (err) {
    if (!String(err.message || err).includes("must not contain")) throw err;
  }
  const source = safeRel(root, "SOURCE_TRIGGER_MASTER.md", false);
  readWindow(source, 1, 2);
  console.log("SELFTEST PASS");
  console.log(`root=${root}`);
  console.log(`dirs=${[...dirs.keys()].sort().slice(0, 12).join(",")}${dirs.size > 12 ? ",..." : ""}`);
  console.log(`sample=${query} -> ${hits[0].file}:${hits[0].line}`);
}

if (process.argv.includes("--selftest")) {
  selftest().catch(err => {
    console.error(err.stack || err.message || String(err));
    process.exit(1);
  });
} else {
  const server = buildServer();
  const transport = new StdioServerTransport();
  server.connect(transport).catch(err => {
    console.error(err.stack || err.message || String(err));
    process.exit(1);
  });
}
