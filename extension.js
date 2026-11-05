"use strict";

const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const https = require("https");
const { execFile } = require("child_process");

const EXTENSION_ID = "iamqazolp.agy-markdown-review";
const EXTENSION_VERSION = "1.3.0";
const GITHUB_REPO_URL = "https://github.com/iamqazolp/antigravity-markdown-preview";
const GITHUB_ISSUES_URL = "https://github.com/iamqazolp/antigravity-markdown-preview/issues";
const MARKETPLACE_ITEM_URL =
  "https://marketplace.visualstudio.com/items?itemName=iamqazolp.agy-markdown-review";
const MARKETPLACE_URL = MARKETPLACE_ITEM_URL;
const AUTHOR_USERNAMES = new Set(["iamqazolp"]);

const SUPPORTED_DOC_EXT_RE =
  /\.(?:md|markdown|mdx|qmd|rmd|html|htm|svg|mmd|mermaid|csv|tsv|jsonl|ndjson)$/i;

const DOC_FORMAT_BY_EXT = {
  ".md": { id: "markdown", badge: "MD", label: "Markdown", family: "markdown" },
  ".markdown": { id: "markdown", badge: "MD", label: "Markdown", family: "markdown" },
  ".mdx": { id: "mdx", badge: "MDX", label: "MDX Document", family: "markdown" },
  ".qmd": { id: "qmd", badge: "QMD", label: "Quarto Markdown", family: "markdown" },
  ".rmd": { id: "rmd", badge: "RMD", label: "R Markdown", family: "markdown" },
  ".html": { id: "html", badge: "HTML", label: "HTML Document", family: "html" },
  ".htm": { id: "html", badge: "HTML", label: "HTML Document", family: "html" },
  ".svg": { id: "svg", badge: "SVG", label: "SVG Vector Graphic", family: "svg" },
  ".mmd": { id: "mermaid", badge: "MERMAID", label: "Mermaid Diagram", family: "mermaid" },
  ".mermaid": { id: "mermaid", badge: "MERMAID", label: "Mermaid Diagram", family: "mermaid" },
  ".csv": { id: "csv", badge: "CSV", label: "CSV Data Table", family: "table" },
  ".tsv": { id: "tsv", badge: "TSV", label: "TSV Data Table", family: "table" },
  ".jsonl": { id: "jsonl", badge: "JSONL", label: "JSONL / Transcript", family: "jsonl" },
  ".ndjson": { id: "jsonl", badge: "NDJSON", label: "NDJSON Dataset", family: "jsonl" }
};

const ACRONYM_UPPER_SET = new Set([
  "md", "mdx", "qmd", "rmd", "html", "htm", "css", "js", "ts", "jsx", "tsx",
  "json", "jsonl", "ndjson", "yaml", "yml", "toml", "csv", "tsv", "svg", "pdf",
  "png", "jpg", "jpeg", "gif", "webp", "api", "cli", "gui", "ui", "ux", "ide",
  "sdk", "llm", "ai", "ml", "dl", "nlp", "gpu", "cpu", "tpu", "cuda", "ptx",
  "sql", "db", "url", "uri", "uuid", "id", "toc", "faq", "readme", "changelog",
  "license", "todo", "wip", "pr", "ci", "cd", "aws", "gcp", "os", "io", "mcp",
  "agy", "vscode", "vsix", "http", "https", "ssh", "tls", "ssl", "jwt", "oauth",
  "rgb", "rgba", "hsl", "dom", "xml", "ast", "ir", "jit", "wasm", "rag", "rlhf"
]);

function detectDocumentFormat(filePath) {
  const ext = path.extname(String(filePath || "")).toLowerCase();
  const base = DOC_FORMAT_BY_EXT[ext] || DOC_FORMAT_BY_EXT[".md"];
  return Object.assign({ ext: ext || ".md" }, base);
}

const activeReviewWebviewsByPath = new Map();
let telemetryLogger = null;
let telemetryOutputChannel = null;
let isExcludedAuthorEnv = false;
let isAuthorEnvironment = false;

function detectIsAuthorEnvironment(context) {
  try {
    if (context && context.extensionMode === vscode.ExtensionMode.Development) {
      return true;
    }
    const username = String((os.userInfo() && os.userInfo().username) || "")
      .trim()
      .toLowerCase();
    if (AUTHOR_USERNAMES.has(username)) {
      return true;
    }
    const home = os.homedir();
    if (home.toLowerCase().includes("iamqazolp")) {
      return true;
    }
    if (
      fs.existsSync(
        path.join(home, "Documents", "Projects", "antigravity-markdown-preview", "install.py")
      )
    ) {
      return true;
    }
  } catch (_) {}
  return false;
}

function getAnonymousDistinctId() {
  const raw = String((vscode.env && vscode.env.machineId) || "anonymous");
  return crypto.createHash("sha256").update(`agy-md:${raw}`).digest("hex").slice(0, 24);
}

function initTelemetry(context) {
  isExcludedAuthorEnv = detectIsAuthorEnvironment(context);
  isAuthorEnvironment = isExcludedAuthorEnv;
  telemetryOutputChannel = vscode.window.createOutputChannel("Antigravity Document Preview");
  context.subscriptions.push(telemetryOutputChannel);

  const extVersion =
    (context &&
      context.extension &&
      context.extension.packageJSON &&
      context.extension.packageJSON.version) ||
    EXTENSION_VERSION;

  const sender = {
    sendEventData(eventName, data) {
      const enabledByCfg = vscode.workspace
        .getConfiguration("agyMarkdown")
        .get("telemetry", true);
      if (!enabledByCfg || !vscode.env.isTelemetryEnabled) {
        return;
      }
      const payload = Object.assign(
        {
          distinct_id: getAnonymousDistinctId(),
          appName: vscode.env.appName || "VSCode",
          vscodeVersion: vscode.version,
          platform: process.platform,
          arch: process.arch,
          extVersion,
          colorTheme:
            vscode.workspace.getConfiguration("workbench").get("colorTheme") || "unknown",
          timestamp: new Date().toISOString()
        },
        data || {}
      );
      if (isExcludedAuthorEnv) {
        if (telemetryOutputChannel) {
          telemetryOutputChannel.appendLine(
            `[Telemetry:AuthorExcluded] ${eventName} ${JSON.stringify(payload)}`
          );
        }
        return;
      }
      if (telemetryOutputChannel) {
        telemetryOutputChannel.appendLine(
          `[Telemetry:Event] ${eventName} ${JSON.stringify(payload)}`
        );
      }
    },
    sendErrorData(error, data) {
      if (isExcludedAuthorEnv) {
        if (telemetryOutputChannel) {
          telemetryOutputChannel.appendLine(
            `[Telemetry:AuthorExcludedError] ${error && error.message ? error.message : error}`
          );
        }
        return;
      }
      if (telemetryOutputChannel) {
        telemetryOutputChannel.appendLine(
          `[Telemetry:Error] ${error && error.message ? error.message : error} ${JSON.stringify(
            data || {}
          )}`
        );
      }
    }
  };

  if (typeof vscode.env.createTelemetryLogger === "function") {
    telemetryLogger = vscode.env.createTelemetryLogger(sender, {
      ignoreBuiltInCommonProperties: false
    });
    context.subscriptions.push(telemetryLogger);
  }
}

function trackEvent(eventName, properties = {}) {
  try {
    if (telemetryLogger && typeof telemetryLogger.logUsage === "function") {
      telemetryLogger.logUsage(eventName, properties);
    }
  } catch (_) {}
}

const BRAIN_UUID_RE = /\/brain\/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\//;

const ALERT_ICONS = {
  note: '<svg class="octicon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Zm8-6.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM6.5 7.75A.75.75 0 0 1 7.25 7h1a.75.75 0 0 1 .75.75v2.75h.25a.75.75 0 0 1 0 1.5h-2a.75.75 0 0 1 0-1.5h.25v-2h-.25a.75.75 0 0 1-.75-.75ZM8 6a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"></path></svg>',
  tip: '<svg class="octicon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M8 1.5c-2.363 0-4 1.69-4 3.75 0 .984.424 1.625.984 2.304l.214.253c.223.264.47.556.673.848.284.411.537.896.621 1.49a.75.75 0 0 1-1.484.211c-.04-.282-.163-.547-.37-.847a8.456 8.456 0 0 0-.542-.68c-.084-.1-.173-.205-.268-.32C3.201 7.75 2.5 6.766 2.5 5.25 2.5 2.31 4.863 0 8 0s5.5 2.31 5.5 5.25c0 1.516-.701 2.5-1.328 3.259-.095.115-.184.22-.268.319-.207.245-.383.453-.541.681-.208.3-.33.565-.37.847a.751.751 0 0 1-1.485-.212c.084-.593.337-1.078.621-1.489.203-.292.45-.584.673-.848.075-.088.147-.173.213-.253.561-.679.985-1.32.985-2.304 0-2.06-1.637-3.75-4-3.75ZM5.75 12h4.5a.75.75 0 0 1 0 1.5h-4.5a.75.75 0 0 1 0-1.5ZM6 15.25a.75.75 0 0 1 .75-.75h2.5a.75.75 0 0 1 0 1.5h-2.5a.75.75 0 0 1-.75-.75Z"></path></svg>',
  important: '<svg class="octicon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M0 1.75C0 .784.784 0 1.75 0h12.5C15.216 0 16 .784 16 1.75v9.5A1.75 1.75 0 0 1 14.25 13H8.06l-2.573 2.573A1.458 1.458 0 0 1 3 14.543V13H1.75A1.75 1.75 0 0 1 0 11.25Zm1.75-.25a.25.25 0 0 0-.25.25v9.5c0 .138.112.25.25.25h2a.75.75 0 0 1 .75.75v2.19l2.72-2.72a.749.749 0 0 1 .53-.22h6.5a.25.25 0 0 0 .25-.25v-9.5a.25.25 0 0 0-.25-.25Zm7 2.25v2.5a.75.75 0 0 1-1.5 0v-2.5a.75.75 0 0 1 1.5 0ZM9 9a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z"></path></svg>',
  warning: '<svg class="octicon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M6.457 1.047c.659-1.234 2.427-1.234 3.086 0l6.082 11.378A1.75 1.75 0 0 1 14.082 15H1.918a1.75 1.75 0 0 1-1.543-2.575Zm1.763.707a.25.25 0 0 0-.44 0L1.698 13.132a.25.25 0 0 0 .22.368h12.164a.25.25 0 0 0 .22-.368Zm.53 3.996v2.5a.75.75 0 0 1-1.5 0v-2.5a.75.75 0 0 1 1.5 0ZM9 11a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z"></path></svg>',
  caution: '<svg class="octicon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M4.47.22A.749.749 0 0 1 5 0h6c.199 0 .389.079.53.22l4.25 4.25c.141.14.22.331.22.53v6a.749.749 0 0 1-.22.53l-4.25 4.25A.749.749 0 0 1 11 16H5a.749.749 0 0 1-.53-.22L.22 11.53A.749.749 0 0 1 0 11V5c0-.199.079-.389.22-.53Zm.84 1.28L1.5 5.31v5.38l3.81 3.81h5.38l3.81-3.81V5.31L10.69 1.5ZM8 4a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 8 4Zm0 8a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"></path></svg>'
};

const ALERT_LABELS = {
  note: "NOTE",
  tip: "TIP",
  important: "IMPORTANT",
  warning: "WARNING",
  caution: "CAUTION"
};

function smartTitleWord(word) {
  if (!word) return "";
  const lower = word.toLowerCase();
  if (ACRONYM_UPPER_SET.has(lower)) {
    return lower === "vscode" ? "VS Code" : lower.toUpperCase();
  }
  if (/^v\d+(?:\.\d+)+[a-z0-9-]*$/i.test(word)) {
    return word;
  }
  // Preserve intentional mixed case (e.g. Antigravity, PyTorch, GitHub, FastAPI)
  if (/[a-z]/.test(word) && /[A-Z]/.test(word.slice(1))) {
    return word;
  }
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

function formatDocumentTitle(filePath, rawText = "") {
  const leftSide = String(filePath || "").includes("→")
    ? String(filePath || "").split("→")[0].trim()
    : String(filePath || "");
  const baseName = path.basename(leftSide);
  const withoutExt = baseName.replace(SUPPORTED_DOC_EXT_RE, "");

  if (typeof rawText === "string" && rawText.trim()) {
    const fmMatch = rawText.match(/^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/);
    if (fmMatch) {
      const titleLine = fmMatch[1].match(/^[ \t]*title[ \t]*:[ \t]*(.+)$/m);
      if (titleLine) {
        const cleaned = titleLine[1]
          .trim()
          .replace(/^["']|["']$/g, "")
          .trim();
        if (cleaned && cleaned.length <= 96) {
          return cleaned;
        }
      }
    }
    if (/\.html?$/i.test(baseName)) {
      const htmlTitle = rawText.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      if (htmlTitle) {
        const cleaned = decodeHtmlEntities(htmlTitle[1].replace(/\s+/g, " ").trim());
        if (
          cleaned &&
          cleaned.length <= 96 &&
          !/^(?:document|untitled|index|page)$/i.test(cleaned)
        ) {
          return cleaned;
        }
      }
    }
  }

  if (!withoutExt) return baseName || "Document Preview";
  const spaced = withoutExt.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
  return spaced
    .split(/[_-\s]+/)
    .filter(Boolean)
    .map(smartTitleWord)
    .join(" ");
}

function resolveRealFileInfo(uri) {
  const fsPath = uri.fsPath;
  let realPath = fsPath;
  let isSymlink = false;
  try {
    const lstat = fs.lstatSync(fsPath);
    if (lstat.isSymbolicLink()) {
      isSymlink = true;
      realPath = fs.realpathSync(fsPath);
    } else {
      realPath = fs.realpathSync(fsPath);
    }
  } catch (_) {
    // ignore
  }
  const normalized = realPath.replace(/\\/g, "/");
  const match = normalized.match(BRAIN_UUID_RE);
  const cascadeId = match ? match[1] : null;
  const format = detectDocumentFormat(fsPath || realPath);
  return {
    fsPath,
    realPath,
    isSymlink,
    cascadeId,
    isBrainArtifact: Boolean(cascadeId),
    format
  };
}

const lastEditorLineByPath = new Map();
const lastRevealedLineByEditor = new WeakMap();

function getTopVisibleLine(editor) {
  if (!editor || !editor.visibleRanges || !editor.visibleRanges.length) {
    return undefined;
  }
  const start = editor.visibleRanges[0].start;
  const lineNumber = start.line;
  const lineText = editor.document.lineAt(lineNumber).text;
  const progress = start.character / (lineText.length + 2);
  return lineNumber + progress;
}

function revealEditorAtLine(editor, fractionalLine, force = false) {
  if (!editor || typeof fractionalLine !== "number" || Number.isNaN(fractionalLine)) {
    return;
  }
  const docLineCount = editor.document.lineCount;
  if (docLineCount <= 0) return;
  const targetLine = Math.max(0, Math.min(docLineCount - 1, Math.round(fractionalLine)));
  if (!force && lastRevealedLineByEditor.get(editor) === targetLine) {
    return;
  }
  lastRevealedLineByEditor.set(editor, targetLine);
  const range = new vscode.Range(targetLine, 0, targetLine, 0);
  editor.revealRange(range, vscode.TextEditorRevealType.AtTop);
}

function isMatchingDocumentUri(uri, info) {
  if (!uri || !info) return false;
  const fsPath = uri.fsPath;
  if (fsPath === info.fsPath || fsPath === info.realPath) return true;
  try {
    const real = fs.realpathSync(fsPath);
    return real === info.realPath || real === info.fsPath;
  } catch (_) {
    return false;
  }
}

function findMatchingVisibleEditors(info) {
  return vscode.window.visibleTextEditors.filter(
    (ed) => ed && ed.document && isMatchingDocumentUri(ed.document.uri, info)
  );
}

function getOpenRawEditorTabs(info) {
  const rawTabs = [];
  if (!vscode.window.tabGroups || !vscode.window.tabGroups.all) {
    return rawTabs;
  }
  for (const group of vscode.window.tabGroups.all) {
    for (const tab of group.tabs) {
      const input = tab.input;
      if (
        input &&
        input.uri &&
        !input.viewType &&
        isMatchingDocumentUri(input.uri, info)
      ) {
        rawTabs.push(tab);
      }
    }
  }
  return rawTabs;
}

function isRawSplitOpen(info) {
  if (findMatchingVisibleEditors(info).length > 0) {
    return true;
  }
  return getOpenRawEditorTabs(info).length > 0;
}

function recordEditorPosition(editor) {
  if (!editor || !editor.document) return;
  const line = getTopVisibleLine(editor);
  if (typeof line !== "number" || Number.isNaN(line)) return;
  const info = resolveRealFileInfo(editor.document.uri);
  lastEditorLineByPath.set(info.fsPath, line);
  lastEditorLineByPath.set(info.realPath, line);
}

function parseSimpleYamlFrontmatter(yamlText) {
  const entries = [];
  const lines = String(yamlText || "").split(/\r?\n/);
  let currentKey = null;
  let currentList = null;

  const flushList = () => {
    if (currentKey && currentList && currentList.length > 0) {
      entries.push({ key: currentKey, value: currentList, isList: true });
    }
    currentKey = null;
    currentList = null;
  };

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const listItemMatch = rawLine.match(/^[ \t]+-[ \t]+(.+)$/);
    if (listItemMatch && currentKey) {
      if (!currentList) currentList = [];
      currentList.push(listItemMatch[1].trim().replace(/^["']|["']$/g, ""));
      continue;
    }
    flushList();
    const kvMatch = rawLine.match(/^([a-zA-Z0-9_.-]+)[ \t]*:[ \t]*(.*)$/);
    if (!kvMatch) continue;
    const key = kvMatch[1].trim();
    const rawVal = kvMatch[2].trim();
    if (!rawVal) {
      currentKey = key;
      currentList = [];
      continue;
    }
    if (rawVal.startsWith("[") && rawVal.endsWith("]")) {
      const items = rawVal
        .slice(1, -1)
        .split(",")
        .map((s) => s.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean);
      entries.push({ key, value: items, isList: true });
    } else {
      entries.push({
        key,
        value: rawVal.replace(/^["']|["']$/g, ""),
        isList: false
      });
    }
  }
  flushList();
  return entries;
}

function buildFrontmatterCardHtml(yamlText, startLine, endLine, formatInfo) {
  const entries = parseSimpleYamlFrontmatter(yamlText);
  const badgeLabel =
    formatInfo && formatInfo.id !== "markdown"
      ? `${formatInfo.badge} FRONTMATTER`
      : "FRONTMATTER";
  const rowsHtml = entries
    .map((e) => {
      if (e.isList && Array.isArray(e.value)) {
        const pills = e.value
          .map((item) => `<span class="agy-fm-tag">${escapeHtml(item)}</span>`)
          .join("");
        return `<div class="agy-fm-row"><span class="agy-fm-key">${escapeHtml(e.key)}</span><span class="agy-fm-val agy-fm-tags">${pills}</span></div>`;
      }
      return `<div class="agy-fm-row"><span class="agy-fm-key">${escapeHtml(e.key)}</span><span class="agy-fm-val">${escapeHtml(String(e.value))}</span></div>`;
    })
    .join("");
  const highlightedYaml = highlightFallbackPlainCode(yamlText.trim(), "yaml");
  return (
    `<div class="agy-frontmatter-card code-line" data-line="${startLine}" data-line-end="${endLine}">` +
    `<div class="agy-frontmatter-header">` +
    `<span class="agy-frontmatter-badge">${escapeHtml(badgeLabel)}</span>` +
    `<details class="agy-frontmatter-raw"><summary>YAML Source</summary><pre><code class="language-yaml" data-agy-highlighted="1">${highlightedYaml}</code></pre></details>` +
    `</div>` +
    (rowsHtml ? `<div class="agy-frontmatter-grid">${rowsHtml}</div>` : "") +
    `</div>`
  );
}

function preprocessMarkdownVariants(srcText, formatInfo) {
  let text = String(srcText || "");
  const injectedBlocks = [];

  // 1. YAML Frontmatter at top of document (--- ... ---)
  const fmMatch = text.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/);
  if (fmMatch) {
    const fullMatch = fmMatch[0];
    const yamlBody = fmMatch[1];
    const newlineCount = (fullMatch.match(/\n/g) || []).length;
    const endLine = Math.max(1, newlineCount);
    const idx = injectedBlocks.length;
    injectedBlocks.push(buildFrontmatterCardHtml(yamlBody, 0, endLine, formatInfo));
    text = `<div data-agy-injected-block="${idx}"></div>` + "\n".repeat(newlineCount) + text.slice(fullMatch.length);
  }

  // 2. Quarto / Pandoc Callout Blocks: ::: {.callout-note title="..."} ... :::
  text = text.replace(
    /^[ \t]*:::[ \t]*\{\.callout-(note|tip|important|warning|caution)([^}]*)\}[ \t]*\r?\n([\s\S]*?)\r?\n[ \t]*:::[ \t]*(?=\r?\n|$)/gim,
    (_full, rawType, attrs, inner) => {
      const alertType = rawType.toUpperCase();
      const titleMatch = (attrs || "").match(/\btitle=["']([^"']+)["']/i);
      const innerLines = inner.split(/\r?\n/);
      const quoted = innerLines.map((l) => `> ${l}`).join("\n");
      const headerSuffix = titleMatch ? ` **${titleMatch[1].trim()}**` : "";
      return `> [!${alertType}]${headerSuffix}\n${quoted}`;
    }
  );

  // 3. MDX top-level import/export statements & JSX Callout/Card components
  const isMdx = formatInfo && formatInfo.id === "mdx";
  if (isMdx || /^import\s+.+\s+from\s+["'][^"']+["']/m.test(text)) {
    // Collapse contiguous top-level import/export lines (outside code fences) into an MDX Module badge card
    text = text.replace(
      /(?:^[ \t]*(?:import\s+[\s\S]*?from\s+["'][^"']+["']\s*;?|export\s+(?:const|let|var|function|default)\s+[^\n]+)[ \t]*\r?\n)+/gm,
      (blockMatch, offset) => {
        const before = text.slice(0, offset);
        const fenceCount = (before.match(/^[ \t]*(?:`{3,}|~{3,})/gm) || []).length;
        if (fenceCount % 2 === 1) return blockMatch;
        const startLine = before.split("\n").length - 1;
        const newlineCount = (blockMatch.match(/\n/g) || []).length;
        const endLine = startLine + Math.max(1, newlineCount);
        const trimmedCode = blockMatch.trim();
        const highlighted = highlightFallbackPlainCode(trimmedCode, "typescript");
        const idx = injectedBlocks.length;
        injectedBlocks.push(
          `<details class="agy-mdx-imports-card code-line" data-line="${startLine}" data-line-end="${endLine}">` +
            `<summary><span class="agy-frontmatter-badge">MDX MODULE</span> <code>${escapeHtml(
              trimmedCode.split(/\r?\n/)[0].slice(0, 72)
            )}${trimmedCode.includes("\n") ? " …" : ""}</code></summary>` +
            `<pre><code class="language-tsx" data-agy-highlighted="1">${highlighted}</code></pre>` +
            `</details>`
        );
        return `<div data-agy-injected-block="${idx}"></div>` + "\n".repeat(newlineCount);
      }
    );
  }

  // Convert MDX <Note>, <Tip>, <Important>, <Warning>, <Caution>, <Callout type="..."> tags
  text = text.replace(
    /<(Note|Tip|Important|Warning|Caution|Info)\b[^>]*>([\s\S]*?)<\/\1>/gi,
    (_full, tag, inner) => {
      const mapType = tag.toLowerCase() === "info" ? "NOTE" : tag.toUpperCase();
      const lines = inner.trim().split(/\r?\n/);
      return `> [!${mapType}]\n` + lines.map((l) => `> ${l}`).join("\n");
    }
  );
  text = text.replace(
    /<Callout\b([^>]*)>([\s\S]*?)<\/Callout>/gi,
    (_full, attrs, inner) => {
      const tMatch = (attrs || "").match(/\btype=["'](note|tip|important|warning|caution|info|error)["']/i);
      const rawT = tMatch ? tMatch[1].toLowerCase() : "note";
      const mapType =
        rawT === "info" ? "NOTE" : rawT === "error" ? "CAUTION" : rawT.toUpperCase();
      const lines = inner.trim().split(/\r?\n/);
      return `> [!${mapType}]\n` + lines.map((l) => `> ${l}`).join("\n");
    }
  );

  return { text, injectedBlocks };
}

function preprocessMarkdownCodeFences(mdText) {
  const fenceMetaByLine = new Map();
  const src = String(mdText || "");
  const normalized = src.replace(
    /^([ \t]*(`{3,}|~{3,}))([^\n]*)\n([\s\S]*?)^\1[ \t]*$/gm,
    (fullMatch, indentAndFence, _fenceChars, infoStr, body, offset) => {
      const trimmedInfo = (infoStr || "").trim();
      if (/^(?:carousel|mermaid)\b/i.test(trimmedInfo)) {
        return fullMatch;
      }
      // Quarto {mermaid} executable chunk -> standard mermaid block
      if (/^\{\s*mermaid\b[^}]*\}/i.test(trimmedInfo)) {
        return `${indentAndFence}mermaid\n${body}${indentAndFence}`;
      }
      const startLine = src.slice(0, offset).split("\n").length - 1;
      const parsed = parseCodeFenceInfo(trimmedInfo, body);
      fenceMetaByLine.set(startLine, parsed);
      const canonInfo = parsed.highlightLang ? parsed.highlightLang : trimmedInfo;
      return `${indentAndFence}${canonInfo}\n${body}${indentAndFence}`;
    }
  );
  return { normalized, fenceMetaByLine };
}

async function renderMarkdownWithCarousels(markdownText, renderFn, formatInfo = null) {
  const rawInput = String(markdownText || "");
  const totalLines = rawInput.split(/\r?\n/).length;
  const variantPre = preprocessMarkdownVariants(rawInput, formatInfo);
  const srcText = variantPre.text;
  const carousels = [];
  const withPlaceholders = srcText.replace(
    /^[ \t]*(`{3,})carousel[ \t]*\r?\n([\s\S]*?)\r?\n[ \t]*\1[ \t]*(?:$|\r?\n)/gm,
    (fullMatch, _fence, inner, offset) => {
      const slides = inner
        .split(/(?:^|\r?\n)[ \t]*<!--\s*slide\s*-->[ \t]*(?=\r?\n|$)/i)
        .map((s) => s.trim())
        .filter(Boolean);
      if (!slides.length) return fullMatch;
      const startLine = srcText.slice(0, offset).split("\n").length - 1;
      const newlineCount = (fullMatch.match(/\n/g) || []).length;
      const fenceLines = fullMatch.replace(/\s+$/, "").split("\n").length;
      const endLine = startLine + Math.max(1, fenceLines - 1);
      const idx = carousels.length;
      carousels.push({ slides, startLine, endLine });
      return `<div data-agy-carousel-placeholder="${idx}"></div>` + "\n".repeat(newlineCount);
    }
  );

  const mainPre = preprocessMarkdownCodeFences(withPlaceholders);
  let mainHtml = await renderFn(mainPre.normalized);
  mainHtml = postprocessAlertsInHtml(mainHtml, mainPre.fenceMetaByLine);

  for (let i = 0; i < variantPre.injectedBlocks.length; i++) {
    const blockHtml = variantPre.injectedBlocks[i];
    const blockPlaceholderRe = new RegExp(
      `(?:<div[^>]*class=["'][^"']*\\bcode-line\\b[^"']*["'][^>]*>\\s*<\\/div>\\s*)?(?:<p[^>]*>\\s*)?<div data-agy-injected-block="${i}"><\\/div>(?:\\s*<\\/p>)?`,
      "g"
    );
    mainHtml = mainHtml.replace(blockPlaceholderRe, blockHtml);
  }

  for (let i = 0; i < carousels.length; i++) {
    const { slides, startLine, endLine } = carousels[i];
    const renderedSlides = [];
    for (let sIdx = 0; sIdx < slides.length; sIdx++) {
      const slidePre = preprocessMarkdownCodeFences(slides[sIdx]);
      let slideHtml = await renderFn(slidePre.normalized);
      slideHtml = postprocessAlertsInHtml(slideHtml, slidePre.fenceMetaByLine);
      slideHtml = slideHtml
        .replace(/\s*\bdata-line(?:-end)?=["'][^"']*["']/gi, "")
        .replace(/\bcode-line\b\s*/g, "");
      renderedSlides.push(
        `<div class="agy-carousel-slide${sIdx === 0 ? " active" : ""}">${slideHtml}</div>`
      );
    }
    const carouselHtml =
      `<div class="agy-carousel code-line" data-line="${startLine}" data-line-end="${endLine}">` +
      `<div class="agy-carousel-header">` +
      `<span class="agy-carousel-counter">Slide 1 of ${slides.length}</span>` +
      `<div class="agy-carousel-controls">` +
      `<button type="button" class="agy-btn agy-carousel-prev">← Prev</button>` +
      `<button type="button" class="agy-btn agy-carousel-next">Next →</button>` +
      `</div>` +
      `</div>` +
      `${renderedSlides.join("")}` +
      `</div>`;

    const placeholderRe = new RegExp(
      `(?:<div[^>]*class=["'][^"']*\\bcode-line\\b[^"']*["'][^>]*>\\s*<\\/div>\\s*)?(?:<p[^>]*>\\s*)?<div data-agy-carousel-placeholder="${i}"><\\/div>(?:\\s*<\\/p>)?`,
      "g"
    );
    mainHtml = mainHtml.replace(placeholderRe, carouselHtml);
  }

  return `${mainHtml}\n<div class="code-line agy-scroll-sentinel" data-line="${totalLines}"></div>`;
}

function postprocessAlertsInHtml(html, fenceMetaByLine) {
  let out = String(html || "").replace(
    /<blockquote\b([^>]*)>\s*<p\b([^>]*)>\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\](?:\s*<br\s*\/?>|\s*\n|\s+)?([\s\S]*?)<\/blockquote>/gi,
    (_, bqAttrs, pAttrs, rawType, innerRest) => {
      const type = rawType.toLowerCase();
      const label = ALERT_LABELS[type] || rawType.toUpperCase();
      const combinedAttrs = `${bqAttrs || ""} ${pAttrs || ""}`;
      const dlMatch = combinedAttrs.match(/\bdata-line=["'](\d+)["']/i);
      const dleMatch = combinedAttrs.match(/\bdata-line-end=["'](\d+)["']/i);
      const dlAttr = dlMatch ? ` data-line="${dlMatch[1]}"` : "";
      const dleAttr = dleMatch ? ` data-line-end="${dleMatch[1]}"` : "";
      const body = innerRest.trim().startsWith("</p>")
        ? innerRest.trim().slice(4)
        : `<p>${innerRest}`;
      return (
        `<div class="markdown-alert markdown-alert-${type} code-line"${dlAttr}${dleAttr}>` +
        `<p class="markdown-alert-title">${label}</p>` +
        `${body}` +
        `</div>`
      );
    }
  );

  // Convert any [label](file://...) or [label](conversation://...) rejected by markdown-it's default validateLink
  out = out.replace(
    /(<pre\b[\s\S]*?<\/pre>)|\[((?:<code\b[^>]*>[\s\S]*?<\/code>|<\/?(?:strong|b|em|i|span)\b[^>]*>|[^\[\]\n<])+)\]\((?:<a\b[^>]*href=["']((?:file|conversation):\/\/[^"']+)["'][^>]*>[\s\S]*?<\/a>|((?:file|conversation):\/\/[^)\s<"']+))\)/gi,
    (full, preBlock, labelHtml, linkedHref, rawHref) => {
      if (preBlock) return preBlock;
      const href = (linkedHref || rawHref || "").trim();
      if (!href) return full;
      const cls = /^conversation:\/\//i.test(href) ? "agy-conv-link" : "agy-file-link";
      return `<a href="${href}" class="${cls}">${labelHtml}</a>`;
    }
  );

  // Unwrap Mermaid blocks produced by vscode.mermaid-markdown-features or standard fences
  out = out.replace(
    /<pre\b[^>]*\bclass=["'][^"']*\bmermaid\b[^"']*["'][^>]*>([\s\S]*?)<\/pre>/gi,
    (full, inner) => {
      const trimmed = inner.trim();
      const dlMatch = full.match(/\bdata-line=["'](\d+)["']/i);
      const startLine = dlMatch ? parseInt(dlMatch[1], 10) : null;
      const lineSpan = (trimmed.match(/\n/g) || []).length + 2;
      const lineAttrs =
        startLine !== null && !Number.isNaN(startLine)
          ? ` data-line="${startLine}" data-line-end="${startLine + lineSpan}"`
          : "";
      return `<div class="agy-mermaid-container code-line"${lineAttrs}><div class="mermaid">${trimmed}</div></div>`;
    }
  );
  out = out.replace(
    /<pre\b[^>]*>\s*<code\b[^>]*\bclass=["'][^"']*(?:language-mermaid|lang-mermaid)[^"']*["'][^>]*>([\s\S]*?)<\/code>\s*<\/pre>/gi,
    (full, inner) => {
      const trimmed = inner.trim();
      const dlMatch = full.match(/\bdata-line=["'](\d+)["']/i);
      const startLine = dlMatch ? parseInt(dlMatch[1], 10) : null;
      const lineSpan = (trimmed.match(/\n/g) || []).length + 2;
      const lineAttrs =
        startLine !== null && !Number.isNaN(startLine)
          ? ` data-line="${startLine}" data-line-end="${startLine + lineSpan}"`
          : "";
      return `<div class="agy-mermaid-container code-line"${lineAttrs}><div class="mermaid">${trimmed}</div></div>`;
    }
  );

  out = postprocessCodeBlocksInHtml(out, fenceMetaByLine);
  return out;
}

const LANG_ALIAS_MAP = {
  py: "python",
  py3: "python",
  python3: "python",
  pyi: "python",
  pytorch: "python",
  pyspark: "python",
  mojo: "python",
  triton: "python",
  cython: "python",
  starlark: "python",
  bazel: "python",
  bzl: "python",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "javascript",
  javascriptreact: "javascript",
  ts: "typescript",
  mts: "typescript",
  cts: "typescript",
  tsx: "typescript",
  typescriptreact: "typescript",
  sh: "bash",
  zsh: "bash",
  fish: "bash",
  shell: "bash",
  "shell-session": "bash",
  shellsession: "bash",
  console: "bash",
  terminal: "bash",
  bashrc: "bash",
  zshrc: "bash",
  "c++": "cpp",
  cc: "cpp",
  cxx: "cpp",
  hpp: "cpp",
  "h++": "cpp",
  cuda: "cpp",
  cu: "cpp",
  ptx: "cpp",
  hip: "cpp",
  "c#": "csharp",
  cs: "csharp",
  dotnet: "csharp",
  golang: "go",
  rs: "rust",
  zig: "rust",
  wgsl: "rust",
  cairo: "rust",
  kt: "kotlin",
  kts: "kotlin",
  rb: "ruby",
  tf: "ruby",
  hcl: "ruby",
  terraform: "ruby",
  psql: "sql",
  postgres: "sql",
  postgresql: "sql",
  mysql: "sql",
  mariadb: "sql",
  sqlite: "sql",
  sqlite3: "sql",
  sparksql: "sql",
  snowflake: "sql",
  bigquery: "sql",
  clickhouse: "sql",
  duckdb: "sql",
  tsql: "sql",
  plsql: "sql",
  jsonc: "json",
  json5: "json",
  jsonl: "json",
  ndjson: "json",
  geojson: "json",
  yml: "yaml",
  toml: "ini",
  conf: "ini",
  cfg: "ini",
  env: "ini",
  dotenv: "ini",
  properties: "ini",
  docker: "dockerfile",
  containerfile: "dockerfile",
  html: "xml",
  html5: "xml",
  xhtml: "xml",
  svg: "xml",
  vue: "xml",
  svelte: "xml",
  astro: "xml",
  hlsl: "glsl",
  metal: "cpp",
  solidity: "javascript",
  sol: "javascript",
  prisma: "graphql",
  gql: "graphql",
  md: "markdown",
  mdx: "markdown",
  qmd: "markdown",
  rmd: "markdown",
  ojs: "javascript",
  tex: "latex",
  katex: "latex",
  math: "latex",
  ps1: "powershell",
  pwsh: "powershell",
  bat: "dos",
  cmd: "dos",
  asm: "x86asm",
  nasm: "x86asm",
  gas: "x86asm"
};

function decodeHtmlEntities(s) {
  return String(s || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function detectUntaggedCodeLang(rawCode) {
  const s = String(rawCode || "").trim();
  if (!s) return "";
  // Skip ASCII art / box-drawing diagrams
  if (/[┌┐└┘├┤┬┴┼───│═║╔╗╚╝╠╣╦╩╬]/.test(s) && !/├──|└──/.test(s)) {
    return "";
  }
  if (/^(?:diff --git|--- a\/|\+\+\+ b\/|@@ -\d+)/m.test(s)) return "diff";
  if (/^\s*\{[\s\S]*"[^"]+"\s*:/m.test(s) && /[\]}]\s*$/.test(s)) return "json";
  if (/^\s*(?:def |class |from [a-zA-Z0-9_.]+ import |import [a-zA-Z0-9_]+|@[a-zA-Z_][\w.]*\s*\n\s*(?:def|class)\b)/m.test(s)) {
    return "python";
  }
  if (/^\s*(?:#include\s+[<"]|__global__\s+void\b|int\s+main\s*\()/m.test(s)) return "cpp";
  if (/^\s*(?:pub\s+(?:fn|struct|enum|trait)\b|fn\s+\w+\s*\(|impl(?:<[^>]+>)?\s+\w+)/m.test(s)) return "rust";
  if (/^\s*(?:package\s+\w+|func\s+(?:\([^)]+\)\s*)?\w+\s*\()/m.test(s)) return "go";
  if (/^\s*(?:interface\s+[A-Z]\w*|type\s+[A-Z]\w*\s*=|export\s+(?:default\s+|async\s+)?(?:function|class|const|interface|type)\b|const\s+\w+\s*=\s*(?:async\s*)?\()/m.test(s)) {
    return "typescript";
  }
  if (/^\s*(?:SELECT\b[\s\S]+\bFROM\b|CREATE\s+TABLE\b|INSERT\s+INTO\b|ALTER\s+TABLE\b)/im.test(s)) {
    return "sql";
  }
  if (/^(?:#!\/bin\/(?:ba|z)?sh|\s*(?:\$\s+)?(?:python3?|pip3?|uv|npm|npx|git|docker|kubectl|cargo|curl|brew|chmod|mkdir|export)\s+\S+)/m.test(s)) {
    return "bash";
  }
  return "";
}

function parseCodeFenceInfo(rawInfo, rawCode) {
  const info = String(rawInfo || "").trim();
  let hlLines = "";
  let title = "";
  let showLineNumbers = false;

  let rest = info;
  // Quarto / R Markdown executable code chunk: {python}, {r fig-plot, echo=FALSE}, {ojs}
  const chunkMatch = rest.match(/^\{\s*([a-zA-Z][a-zA-Z0-9_+#.-]*)(?:[\s,]+([^}]*))?\}(.*)$/);
  if (chunkMatch) {
    const chunkLang = chunkMatch[1].toLowerCase();
    const chunkOpts = (chunkMatch[2] || "").trim().replace(/^,\s*/, "");
    if (chunkOpts && !title) {
      title = `chunk: ${chunkOpts}`;
    }
    rest = `${chunkLang} ${chunkMatch[3] || ""}`.trim();
  }

  // Extract {1,3-5} range
  const braceMatch = rest.match(/\{([\d\s,-]+)\}/);
  if (braceMatch) {
    hlLines = braceMatch[1].replace(/\s+/g, "");
    rest = rest.replace(braceMatch[0], " ");
  }
  // Extract hl_lines="1 3-5"
  const hlAttrMatch = rest.match(/\bhl_lines=["']([^"']+)["']/i);
  if (hlAttrMatch) {
    hlLines = hlAttrMatch[1].trim().replace(/\s+/g, ",");
    rest = rest.replace(hlAttrMatch[0], " ");
  }
  // Extract title="..." or file="..." or filename="..."
  const titleMatch = rest.match(/\b(?:title|file|filename)=["']([^"']+)["']/i);
  if (titleMatch) {
    title = titleMatch[1].trim();
    rest = rest.replace(titleMatch[0], " ");
  }
  if (/\b(?:showLineNumbers|lineNumbers|numberLines|linenos)\b/i.test(rest)) {
    showLineNumbers = true;
    rest = rest.replace(/\b(?:showLineNumbers|lineNumbers|numberLines|linenos)\b/gi, " ");
  }

  // Quarto in-chunk option: #| label: fig-plot or #| filename: src/app.py
  if (!title && rawCode) {
    const qOptMatch = String(rawCode).match(/^[ \t]*#\|[ \t]*(?:label|filename|title)[ \t]*:[ \t]*([^\r\n]+)/m);
    if (qOptMatch) {
      title = qOptMatch[1].trim().replace(/^["']|["']$/g, "");
    }
  }

  const firstToken = (rest.trim().split(/\s+/)[0] || "").toLowerCase();
  let displayLang = firstToken;
  if (!displayLang || displayLang === "text" || displayLang === "plaintext") {
    const detected = !displayLang ? detectUntaggedCodeLang(rawCode) : "";
    if (detected) {
      displayLang = detected;
    }
  }
  const highlightLang = LANG_ALIAS_MAP[displayLang] || displayLang;
  return {
    displayLang,
    highlightLang,
    title,
    hlLines,
    showLineNumbers
  };
}

function parseLineHighlightSpec(spec) {
  const set = new Set();
  if (!spec) return set;
  for (const part of String(spec).split(/[,\s]+/)) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const rangeMatch = trimmed.match(/^(\d+)-(\d+)$/);
    if (rangeMatch) {
      const a = parseInt(rangeMatch[1], 10);
      const b = parseInt(rangeMatch[2], 10);
      for (let i = Math.min(a, b); i <= Math.max(a, b); i++) {
        set.add(i);
      }
    } else {
      const n = parseInt(trimmed, 10);
      if (!Number.isNaN(n)) set.add(n);
    }
  }
  return set;
}

const CONTAINER_SPAN_CLASSES = new Set(["hljs-params", "hljs-function", "hljs-subst"]);
const SHELL_LANG_SET = new Set(["bash", "sh", "zsh", "fish", "shell", "console", "terminal"]);
const SHELL_CMD_SET = new Set([
  "python", "python3", "pip", "pip3", "uv", "poetry", "conda", "pytest", "ruff", "mypy", "black",
  "node", "npm", "npx", "yarn", "pnpm", "bun", "deno", "tsc", "eslint", "prettier",
  "git", "gh", "docker", "kubectl", "helm", "terraform", "ansible", "aws", "gcloud", "az",
  "cargo", "rustc", "rustup", "go", "javac", "java", "mvn", "gradle", "gcc", "g++", "clang", "nvcc", "make", "cmake", "ninja",
  "curl", "wget", "ssh", "scp", "rsync", "tar", "zip", "unzip", "gzip", "gunzip",
  "ls", "ll", "la", "cd", "pwd", "mkdir", "rmdir", "rm", "cp", "mv", "touch", "cat", "head", "tail", "less", "more",
  "grep", "egrep", "fgrep", "rg", "find", "fd", "sed", "awk", "sort", "uniq", "wc", "cut", "tr", "xargs", "tee",
  "chmod", "chown", "sudo", "su", "env", "export", "source", "which", "whereis", "ps", "top", "htop", "kill", "pkill",
  "brew", "apt", "apt-get", "yum", "dnf", "pacman", "apk", "systemctl", "journalctl", "service", "agy", "code"
]);

const FALLBACK_KEYWORDS = new Set([
  "def", "class", "return", "import", "from", "as", "if", "elif", "else", "for", "while", "try", "except",
  "finally", "with", "async", "await", "yield", "lambda", "pass", "break", "continue", "raise", "assert",
  "del", "global", "nonlocal", "in", "is", "not", "and", "or",
  "const", "let", "var", "function", "interface", "type", "enum", "implements", "extends", "export",
  "default", "new", "delete", "typeof", "instanceof", "void", "of", "switch", "case", "throw", "catch",
  "readonly", "public", "private", "protected", "static", "abstract", "override", "declare", "namespace",
  "struct", "impl", "trait", "pub", "fn", "mut", "ref", "match", "use", "mod", "crate", "where", "unsafe", "extern", "move",
  "package", "func", "defer", "go", "chan", "select", "fallthrough", "range",
  "virtual", "inline", "template", "typename", "constexpr", "noexcept", "nullptr", "sizeof", "typedef", "union", "using",
  "__global__", "__device__", "__host__", "__shared__", "__constant__", "__syncthreads",
  "SELECT", "FROM", "WHERE", "JOIN", "LEFT", "RIGHT", "INNER", "OUTER", "FULL", "CROSS", "ON", "GROUP", "BY",
  "ORDER", "HAVING", "LIMIT", "OFFSET", "INSERT", "INTO", "VALUES", "UPDATE", "SET", "DELETE", "CREATE", "ALTER",
  "DROP", "TABLE", "VIEW", "INDEX", "WITH", "AS", "DISTINCT", "UNION", "ALL", "CASE", "WHEN", "THEN", "END",
  "AND", "OR", "NOT", "IN", "IS", "NULL", "PRIMARY", "KEY", "FOREIGN", "REFERENCES", "ASC", "DESC", "OVER", "PARTITION"
]);

const FALLBACK_LITERALS = new Set([
  "True", "False", "None", "true", "false", "null", "undefined", "NaN", "Infinity", "nil", "NULL"
]);

const FALLBACK_BUILTINS = new Set([
  "int", "float", "str", "bool", "list", "dict", "set", "tuple", "bytes", "object", "complex",
  "len", "range", "print", "enumerate", "zip", "map", "filter", "sorted", "reversed", "sum", "min", "max",
  "abs", "round", "any", "all", "isinstance", "issubclass", "getattr", "setattr", "hasattr", "open", "super",
  "number", "string", "boolean", "symbol", "bigint", "never", "unknown", "console", "window", "document", "Math", "JSON", "Promise", "Object", "Array", "Map", "Set",
  "usize", "isize", "u8", "u16", "u32", "u64", "u128", "i8", "i16", "i32", "i64", "i128", "f16", "bf16", "f32", "f64",
  "char", "short", "long", "double", "unsigned", "signed", "size_t", "uint8_t", "uint16_t", "uint32_t", "uint64_t", "int8_t", "int16_t", "int32_t", "int64_t",
  "blockIdx", "blockDim", "threadIdx", "gridDim", "warpSize"
]);

const SELF_VARS_SET = new Set(["self", "cls", "this", "super"]);

function enrichPlainSegment(escapedText, lang) {
  const raw = decodeHtmlEntities(escapedText);
  if (!raw.trim()) return escapedText;

  if (SHELL_LANG_SET.has(lang)) {
    const re =
      /(^|[|;&]\s*|\b(?:sudo|time|env|nohup|xargs)\s+)([a-zA-Z0-9_./-]+)|(\b[A-Z_][A-Z0-9_]*)(?==)|(\s)(--?[a-zA-Z0-9][a-zA-Z0-9_-]*)(?=\s|=|$)|(\b\d+(?:\.\d+)?\b)/gm;
    let out = "";
    let last = 0;
    let m;
    while ((m = re.exec(raw)) !== null) {
      out += escapeHtml(raw.slice(last, m.index));
      if (m[2] !== undefined) {
        out += escapeHtml(m[1]);
        const cmd = m[2];
        const base = cmd.split("/").pop();
        if (SHELL_CMD_SET.has(base) || cmd.startsWith("./")) {
          out += `<span class="hljs-built_in">${escapeHtml(cmd)}</span>`;
        } else {
          out += escapeHtml(cmd);
        }
      } else if (m[3] !== undefined) {
        out += `<span class="hljs-variable constant_">${escapeHtml(m[3])}</span>`;
      } else if (m[5] !== undefined) {
        out += escapeHtml(m[4]) + `<span class="hljs-attr">${escapeHtml(m[5])}</span>`;
      } else if (m[6] !== undefined) {
        out += `<span class="hljs-number">${escapeHtml(m[6])}</span>`;
      }
      last = re.lastIndex;
    }
    out += escapeHtml(raw.slice(last));
    return out;
  }

  const re =
    /(\b(?:self|cls|this|super)\b)|(\b(?:__global__|__device__|__host__|__shared__|__constant__|__syncthreads|blockIdx|blockDim|threadIdx|gridDim|warpSize)\b)|(@[a-zA-Z_][\w.]*)|(\.[A-Z][a-zA-Z0-9_]*\b)|(\.[a-zA-Z_][a-zA-Z0-9_]*)(?=\s*\()|(\.[a-zA-Z_][a-zA-Z0-9_]*\b)|(\b[A-Z][a-zA-Z0-9_]*\b)|(\b[a-zA-Z_][a-zA-Z0-9_]*)(?=\s*\()|([,(]\s*)([a-zA-Z_][a-zA-Z0-9_]*)(?=\s*=(?!=))|(\b(?:0x[0-9a-fA-F]+|0b[01]+|\d+(?:\.\d+)?(?:e[+-]?\d+)?)\b)|(->|=>|::|===|!==|==|!=|<=|>=|&&|\|\||<<|>>|\+=|-=|\*=|\/=)/g;
  let out = "";
  let last = 0;
  let m;
  while ((m = re.exec(raw)) !== null) {
    out += escapeHtml(raw.slice(last, m.index));
    if (m[1]) {
      out += `<span class="hljs-variable language_">${escapeHtml(m[1])}</span>`;
    } else if (m[2]) {
      out += `<span class="hljs-keyword">${escapeHtml(m[2])}</span>`;
    } else if (m[3]) {
      out += `<span class="hljs-meta">${escapeHtml(m[3])}</span>`;
    } else if (m[4]) {
      out += `.<span class="hljs-title class_">${escapeHtml(m[4].slice(1))}</span>`;
    } else if (m[5]) {
      out += `.<span class="hljs-title function_">${escapeHtml(m[5].slice(1))}</span>`;
    } else if (m[6]) {
      out += `.<span class="hljs-property">${escapeHtml(m[6].slice(1))}</span>`;
    } else if (m[7]) {
      const cls = /^[A-Z0-9_]{2,}$/.test(m[7]) ? "hljs-variable constant_" : "hljs-title class_";
      out += `<span class="${cls}">${escapeHtml(m[7])}</span>`;
    } else if (m[8]) {
      out += `<span class="hljs-title function_">${escapeHtml(m[8])}</span>`;
    } else if (m[9] && m[10]) {
      out += escapeHtml(m[9]) + `<span class="hljs-attr">${escapeHtml(m[10])}</span>`;
    } else if (m[11]) {
      out += `<span class="hljs-number">${escapeHtml(m[11])}</span>`;
    } else if (m[12]) {
      out += `<span class="hljs-operator">${escapeHtml(m[12])}</span>`;
    } else {
      out += escapeHtml(m[0]);
    }
    last = re.lastIndex;
  }
  out += escapeHtml(raw.slice(last));
  return out;
}

function highlightMarkdownCode(rawCode) {
  const src = String(rawCode || "");
  const nestedFenceRe = /^([ \t]*(`{3,}|~{3,}))([^\n]*)\n([\s\S]*?)(^\1[ \t]*$)/gm;
  let out = "";
  let last = 0;
  let m;

  const highlightMarkdownLines = (segment) => {
    return segment
      .split("\n")
      .map((line) => {
        if (/^[ \t]*#{1,6}[ \t]+/.test(line)) {
          return `<span class="hljs-keyword">${escapeHtml(line)}</span>`;
        }
        if (/^[ \t]*>\s*\[!(?:NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/i.test(line)) {
          return `<span class="hljs-meta">${escapeHtml(line)}</span>`;
        }
        if (/^[ \t]*>/.test(line)) {
          return `<span class="hljs-comment">${escapeHtml(line)}</span>`;
        }
        return escapeHtml(line)
          .replace(/(`+[^`\n]+`+)/g, '<span class="hljs-string">$1</span>')
          .replace(/(\*\*[^*\n]+\*\*)/g, '<span class="hljs-strong">$1</span>')
          .replace(/(\[[^\]\n]+\]\([^)\n]+\))/g, '<span class="hljs-attr">$1</span>');
      })
      .join("\n");
  };

  while ((m = nestedFenceRe.exec(src)) !== null) {
    out += highlightMarkdownLines(src.slice(last, m.index));
    const openFence = m[1];
    const infoStr = m[3] || "";
    const body = m[4] || "";
    const closeFence = m[5];
    const parsed = parseCodeFenceInfo(infoStr.trim(), body);
    const subLang = parsed.highlightLang || parsed.displayLang || "python";
    const openLineHtml = `<span class="hljs-meta">${escapeHtml(openFence + infoStr)}</span>`;
    const bodyHtml = highlightFallbackPlainCode(body.replace(/\n$/, ""), subLang);
    const closeLineHtml = `<span class="hljs-meta">${escapeHtml(closeFence)}</span>`;
    out += `${openLineHtml}\n${bodyHtml}\n${closeLineHtml}`;
    last = nestedFenceRe.lastIndex;
  }
  out += highlightMarkdownLines(src.slice(last));
  return out;
}

function highlightFallbackPlainCode(rawCode, lang) {
  const raw = String(rawCode || "");
  if (lang === "markdown" || lang === "md") {
    return highlightMarkdownCode(raw);
  }
  if (lang === "diff") {
    return raw
      .split("\n")
      .map((line) => {
        if (line.startsWith("@@")) return `<span class="hljs-meta">${escapeHtml(line)}</span>`;
        if (line.startsWith("+") && !line.startsWith("+++")) {
          return `<span class="hljs-addition">${escapeHtml(line)}</span>`;
        }
        if (line.startsWith("-") && !line.startsWith("---")) {
          return `<span class="hljs-deletion">${escapeHtml(line)}</span>`;
        }
        return escapeHtml(line);
      })
      .join("\n");
  }

  if (/├──|└──|│/.test(raw)) {
    return raw.replace(
      /(#.*$)|([a-zA-Z0-9_.-]+\/)|(\b[a-zA-Z0-9_.-]+\.[a-zA-Z0-9]+\b)/gm,
      (m, cmt, dir, file) => {
        if (cmt) return `<span class="hljs-comment">${escapeHtml(cmt)}</span>`;
        if (dir) return `<span class="hljs-title class_">${escapeHtml(dir)}</span>`;
        if (file) return `<span class="hljs-attr">${escapeHtml(file)}</span>`;
        return escapeHtml(m);
      }
    );
  }

  if (!lang || lang === "text" || lang === "plaintext") {
    return escapeHtml(raw);
  }

  if (SHELL_LANG_SET.has(lang)) {
    const shRe =
      /(#[^\n]*)|("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*')|(\$\{?[a-zA-Z_][a-zA-Z0-9_]*\}?)/gm;
    let out = "";
    let last = 0;
    let m;
    while ((m = shRe.exec(raw)) !== null) {
      out += enrichPlainSegment(escapeHtml(raw.slice(last, m.index)), lang);
      if (m[1]) {
        out += `<span class="hljs-comment">${escapeHtml(m[1])}</span>`;
      } else if (m[2]) {
        out += `<span class="hljs-string">${escapeHtml(m[2])}</span>`;
      } else if (m[3]) {
        out += `<span class="hljs-variable">${escapeHtml(m[3])}</span>`;
      }
      last = shRe.lastIndex;
    }
    out += enrichPlainSegment(escapeHtml(raw.slice(last)), lang);
    return out;
  }

  const isSql = lang === "sql";
  const isCLike =
    lang === "c" || lang === "cpp" || lang === "cuda" || lang === "csharp" || lang === "rust" || lang === "java" || lang === "go" || lang === "javascript" || lang === "typescript";

  const commentPart = isSql
    ? "(\\/\\*[\\s\\S]*?\\*\\/| --[^\\n]*|^--[^\\n]*)"
    : isCLike
    ? "(\\/\\*[\\s\\S]*?\\*\\/|\\/\\/[^\\n]*)"
    : "(\\/\\*[\\s\\S]*?\\*\\/|\\/\\/[^\\n]*|#(?!!\\[)[^\\n]*)";

  const tokenRe = new RegExp(
    [
      commentPart,
      '("""[\\s\\S]*?"""|\'\'\'[\\s\\S]*?\'\'\'|"(?:\\\\.|[^"\\\\\\n])*"|\'(?:\\\\.|[^\'\\\\\\n])*\'|`(?:\\\\.|[^`\\\\])*`)',
      "(^[ \\t]*(?:@[a-zA-Z_][\\w.]*|#(?:include|define|pragma|ifdef|ifndef|endif|if|elif|else)\\b[^\\n]*)|#\\[[\\s\\S]*?\\])",
      '(^[ \\t]*"?[a-zA-Z0-9_.-]+"?(?=\\s*:\\s))',
      "(\\b(?:0x[0-9a-fA-F]+|0b[01]+|\\d+(?:\\.\\d+)?(?:e[+-]?\\d+)?)\\b)",
      "(\\b[a-zA-Z_][a-zA-Z0-9_]*\\b)",
      "(->|=>|::|===|!==|==|!=|<=|>=|&&|\\|\\||<<|>>|\\+=|-=|\\*=|\\/=)"
    ].join("|"),
    "gm"
  );

  let out = "";
  let last = 0;
  let m;
  while ((m = tokenRe.exec(raw)) !== null) {
    out += escapeHtml(raw.slice(last, m.index));
    const [full, cmt, str, dec, key, num, ident, op] = m;
    if (cmt !== undefined) {
      out += `<span class="hljs-comment">${escapeHtml(cmt)}</span>`;
    } else if (str !== undefined) {
      out += `<span class="hljs-string">${escapeHtml(str)}</span>`;
    } else if (dec !== undefined) {
      out += `<span class="hljs-meta">${escapeHtml(dec)}</span>`;
    } else if (
      key !== undefined &&
      (lang === "yaml" || lang === "yml" || lang === "json" || lang === "ini" || lang === "toml")
    ) {
      out += `<span class="hljs-attr">${escapeHtml(key)}</span>`;
    } else if (num !== undefined) {
      out += `<span class="hljs-number">${escapeHtml(num)}</span>`;
    } else if (ident !== undefined) {
      const after = raw.slice(tokenRe.lastIndex);
      const beforeChar = m.index > 0 ? raw[m.index - 1] : "";
      if (SELF_VARS_SET.has(ident)) {
        out += `<span class="hljs-variable language_">${escapeHtml(ident)}</span>`;
      } else if (FALLBACK_LITERALS.has(ident)) {
        out += `<span class="hljs-literal">${escapeHtml(ident)}</span>`;
      } else if (
        FALLBACK_KEYWORDS.has(ident) ||
        (isSql && FALLBACK_KEYWORDS.has(ident.toUpperCase()))
      ) {
        out += `<span class="hljs-keyword">${escapeHtml(ident)}</span>`;
      } else if (FALLBACK_BUILTINS.has(ident)) {
        out += `<span class="hljs-built_in">${escapeHtml(ident)}</span>`;
      } else if (/^\s*\(/.test(after)) {
        const cls = /^[A-Z]/.test(ident) ? "hljs-title class_" : "hljs-title function_";
        out += `<span class="${cls}">${escapeHtml(ident)}</span>`;
      } else if (/^[A-Z][a-zA-Z0-9_]*$/.test(ident)) {
        const cls = /^[A-Z0-9_]{2,}$/.test(ident) ? "hljs-variable constant_" : "hljs-title class_";
        out += `<span class="${cls}">${escapeHtml(ident)}</span>`;
      } else if (beforeChar === ".") {
        out += `<span class="hljs-property">${escapeHtml(ident)}</span>`;
      } else {
        out += escapeHtml(ident);
      }
    } else if (op !== undefined) {
      out += `<span class="hljs-operator">${escapeHtml(op)}</span>`;
    } else {
      out += escapeHtml(full);
    }
    last = tokenRe.lastIndex;
  }
  out += escapeHtml(raw.slice(last));
  return out;
}

function splitHtmlIntoBalancedLines(html) {
  const tokenRe = /(<\/?span\b[^>]*>)|(\r?\n)/gi;
  const openTags = [];
  const lines = [];
  let currentLine = "";
  let last = 0;
  let m;
  while ((m = tokenRe.exec(html)) !== null) {
    currentLine += html.slice(last, m.index);
    if (m[1]) {
      const tag = m[1];
      if (tag.startsWith("</")) {
        openTags.pop();
      } else {
        openTags.push(tag);
      }
      currentLine += tag;
    } else {
      for (let i = openTags.length - 1; i >= 0; i--) {
        currentLine += "</span>";
      }
      lines.push(currentLine);
      currentLine = openTags.join("");
    }
    last = tokenRe.lastIndex;
  }
  currentLine += html.slice(last);
  lines.push(currentLine);
  return lines;
}

function enrichCodeBlockHtml(innerHtml, rawLang, hlLinesSpec = "", showLineNumbers = false) {
  const lang = (LANG_ALIAS_MAP[rawLang] || rawLang || "").toLowerCase();
  let html = String(innerHtml || "");

  const hasSpans = /\bclass=["'][^"']*\b(?:hljs-|token\b)/i.test(html);
  if (lang === "markdown" || lang === "md" || rawLang === "markdown" || rawLang === "md") {
    const rawText = decodeHtmlEntities(html.replace(/<[^>]+>/g, ""));
    html = highlightMarkdownCode(rawText);
  } else if (!hasSpans) {
    const rawText = decodeHtmlEntities(html.replace(/<[^>]+>/g, ""));
    const effectiveLang = lang || detectUntaggedCodeLang(rawText);
    html = highlightFallbackPlainCode(rawText, effectiveLang);
  } else if (
    lang !== "diff" &&
    lang !== "markdown" &&
    lang !== "plaintext" &&
    lang !== "text" &&
    lang !== "xml" &&
    lang !== "json"
  ) {
    const tagRe = /<\/?span\b[^>]*>/gi;
    const stack = [];
    let out = "";
    let last = 0;
    let m;
    while ((m = tagRe.exec(html)) !== null) {
      const seg = html.slice(last, m.index);
      const canEnrich = stack.every((c) => CONTAINER_SPAN_CLASSES.has(c));
      out += canEnrich ? enrichPlainSegment(seg, lang) : seg;
      const tag = m[0];
      if (tag.startsWith("</")) {
        stack.pop();
      } else {
        const clsMatch = tag.match(/\bclass=["']([^"']+)["']/i);
        stack.push(clsMatch ? clsMatch[1].trim() : "");
      }
      out += tag;
      last = tagRe.lastIndex;
    }
    const tail = html.slice(last);
    const canEnrich = stack.every((c) => CONTAINER_SPAN_CLASSES.has(c));
    out += canEnrich ? enrichPlainSegment(tail, lang) : tail;
    html = out;
  }

  const hlSet = parseLineHighlightSpec(hlLinesSpec);
  if (hlSet.size > 0 || showLineNumbers) {
    const trailingNewline = html.endsWith("\n");
    const trimmedHtml = trailingNewline ? html.slice(0, -1) : html;
    const lines = splitHtmlIntoBalancedLines(trimmedHtml);
    html =
      lines
        .map((lineHtml, idx) => {
          const lineNum = idx + 1;
          const hlClass = hlSet.has(lineNum) ? " agy-code-line-hl" : "";
          const numAttr = showLineNumbers ? ` data-line-num="${lineNum}"` : "";
          return `<span class="agy-code-line${hlClass}"${numAttr}>${lineHtml || " "}</span>`;
        })
        .join("\n") + (trailingNewline ? "\n" : "");
  }

  return html;
}

function postprocessCodeBlocksInHtml(html, fenceMetaByLine) {
  let defaultLineNums = false;
  try {
    defaultLineNums = Boolean(
      vscode.workspace.getConfiguration("agyMarkdown").get("codeLineNumbers", false)
    );
  } catch (_) {}

  return String(html || "").replace(
    /<pre\b([^>]*)>\s*<code\b([^>]*)>([\s\S]*?)<\/code>\s*<\/pre>/gi,
    (full, preAttrs, codeAttrs, inner) => {
      const combined = `${preAttrs || ""} ${codeAttrs || ""}`;
      if (/\b(?:language-mermaid|lang-mermaid|mermaid)\b/i.test(combined)) {
        return full;
      }
      if (/\bdata-agy-highlighted=["']1["']/i.test(codeAttrs || "")) {
        return full;
      }
      const dlMatch = combined.match(/\bdata-line=["'](\d+)["']/i);
      const startLine = dlMatch ? parseInt(dlMatch[1], 10) : null;
      const meta =
        fenceMetaByLine && startLine !== null && fenceMetaByLine.has(startLine)
          ? fenceMetaByLine.get(startLine)
          : null;

      const langMatch =
        combined.match(/\bdata-lang=["']([^"']+)["']/i) ||
        combined.match(/\b(?:language-|lang-)([a-zA-Z0-9_+#.-]+)/i);
      let rawLang =
        (meta && meta.displayLang) ||
        (langMatch ? langMatch[1].toLowerCase() : "");
      if (!rawLang) {
        const rawText = decodeHtmlEntities(inner.replace(/<[^>]+>/g, ""));
        rawLang = detectUntaggedCodeLang(rawText);
      }

      const titleMatch = combined.match(/\bdata-title=["']([^"']+)["']/i);
      const title = (meta && meta.title) || (titleMatch ? titleMatch[1] : "");

      const hlMatch = combined.match(/\bdata-hl-lines=["']([^"']+)["']/i);
      const hlLinesSpec =
        (meta && meta.hlLines) || (hlMatch ? hlMatch[1] : "");

      const lineNumAttr =
        Boolean(meta && meta.showLineNumbers) ||
        /\bdata-line-numbers=["']1["']/i.test(combined);

      const enriched = enrichCodeBlockHtml(
        inner,
        rawLang,
        hlLinesSpec,
        lineNumAttr || defaultLineNums
      );
      const extraAttrs =
        (rawLang && !/\bdata-lang=/i.test(codeAttrs || "")
          ? ` data-lang="${escapeHtml(rawLang)}"`
          : "") +
        (title && !/\bdata-title=/i.test(codeAttrs || "")
          ? ` data-title="${escapeHtml(title)}"`
          : "") +
        (hlLinesSpec && !/\bdata-hl-lines=/i.test(codeAttrs || "")
          ? ` data-hl-lines="${escapeHtml(hlLinesSpec)}"`
          : "") +
        (lineNumAttr && !/\bdata-line-numbers=/i.test(codeAttrs || "")
          ? ` data-line-numbers="1"`
          : "");
      return `<pre${preAttrs}><code${codeAttrs}${extraAttrs} data-agy-highlighted="1">${enriched}</code></pre>`;
    }
  );
}

function escapeHtmlAttr(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function rewriteHtmlAssetUris(rawHtml, webview, baseDir, fallbackDir, mode = "webview") {
  return String(rawHtml || "").replace(
    /(\b(?:src|href)=["'])([^"']+)(["'])/gi,
    (full, prefix, rawUrl, suffix) => {
      const url = rawUrl.trim();
      if (
        !url ||
        url.startsWith("#") ||
        /^(?:https?:|data:|mailto:|tel:|javascript:|vscode-webview-resource:|blob:)/i.test(url)
      ) {
        return full;
      }
      const fsPath = resolveLocalAssetPath(url, baseDir, fallbackDir);
      if (!fsPath || !fs.existsSync(fsPath)) {
        return full;
      }
      if (mode === "webview" && webview) {
        return `${prefix}${webview.asWebviewUri(vscode.Uri.file(fsPath))}${suffix}`;
      }
      if (mode === "pdf") {
        return `${prefix}${vscode.Uri.file(fsPath).toString()}${suffix}`;
      }
      if (mode === "data" && /\.(?:png|jpe?g|gif|webp|svg|avif)$/i.test(fsPath)) {
        try {
          const buf = fs.readFileSync(fsPath);
          const mime = getMimeTypeForImageExt(fsPath);
          return `${prefix}data:${mime};base64,${buf.toString("base64")}${suffix}`;
        } catch (_) {}
      }
      return full;
    }
  );
}

function renderHtmlDocumentPreview(rawText, info, options = {}) {
  const src = String(rawText || "");
  const totalLines = src.split(/\r?\n/).length;
  const baseDir = path.dirname(info.realPath);
  const fallbackDir = path.dirname(info.fsPath);
  const assetMode = options.forExport
    ? options.exportType === "pdf"
      ? "pdf"
      : "data"
    : "webview";

  const rewrittenHtml = rewriteHtmlAssetUris(
    src,
    options.webview || null,
    baseDir,
    fallbackDir,
    assetMode
  );

  const iframeBridgeScript = `<script data-agy-iframe-bridge="1">
(function(){
  var lockUntil = 0;
  window.addEventListener("scroll", function(){
    if (Date.now() < lockUntil) return;
    var maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    var ratio = Math.max(0, Math.min(1, window.scrollY / maxScroll));
    try { window.parent.postMessage({ type: "agy.iframe.scroll", ratio: ratio, totalLines: ${totalLines} }, "*"); } catch(_) {}
  }, { passive: true });
  window.addEventListener("message", function(ev){
    var d = ev && ev.data;
    if (!d || d.type !== "agy.iframe.scrollToRatio") return;
    lockUntil = Date.now() + 220;
    var maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    window.scrollTo({ top: Math.round((d.ratio || 0) * maxScroll), behavior: d.instant ? "auto" : "smooth" });
  });
})();
</script>`;

  const srcdocContent = /<\/body>/i.test(rewrittenHtml)
    ? rewrittenHtml.replace(/<\/body>/i, `${iframeBridgeScript}</body>`)
    : `${rewrittenHtml}\n${iframeBridgeScript}`;

  // Extract Reader View HTML (body inner content without <script> tags, enhanced with Antigravity tables/code)
  const bodyMatch = rewrittenHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const rawBodyInner = bodyMatch ? bodyMatch[1] : rewrittenHtml;
  const safeReaderInner = rawBodyInner
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "");
  const readerHtml = postprocessAlertsInHtml(safeReaderInner, null);

  let defaultLineNums = true;
  try {
    defaultLineNums = Boolean(
      vscode.workspace.getConfiguration("agyMarkdown").get("codeLineNumbers", false)
    );
  } catch (_) {}
  const highlightedSource = enrichCodeBlockHtml(
    escapeHtml(src),
    "html",
    "",
    defaultLineNums || true
  );

  if (options.forExport && options.exportType === "pdf") {
    return `${readerHtml}\n<div class="code-line agy-scroll-sentinel" data-line="${totalLines}"></div>`;
  }

  return (
    `<div class="agy-studio-card agy-html-studio code-line" data-line="0" data-line-end="${totalLines}" data-total-lines="${totalLines}">` +
    `<div class="agy-studio-bar">` +
    `<div class="agy-studio-pills">` +
    `<button type="button" class="agy-studio-pill active" data-html-pane="webview" title="Render live HTML page in sandboxed web view">🌐 Web View</button>` +
    `<button type="button" class="agy-studio-pill" data-html-pane="reader" title="Render HTML content with Antigravity typography, tables & Outline">✨ Reader View</button>` +
    `<button type="button" class="agy-studio-pill" data-html-pane="source" title="Inspect syntax-highlighted HTML source (${totalLines} lines)">&lt;/&gt; Source (${totalLines}L)</button>` +
    `</div>` +
    `<div class="agy-studio-controls" id="agy-html-webview-controls">` +
    `<span class="agy-studio-label">Canvas:</span>` +
    `<button type="button" class="agy-surface-btn active" data-html-bg="auto" title="Keep page's own background">Auto</button>` +
    `<button type="button" class="agy-surface-btn" data-html-bg="light" title="Force white canvas background">Light</button>` +
    `<button type="button" class="agy-surface-btn" data-html-bg="dark" title="Force dark canvas background">Dark</button>` +
    `<span class="agy-studio-sep"></span>` +
    `<button type="button" class="agy-surface-btn active" data-html-width="100%" title="Full width">100%</button>` +
    `<button type="button" class="agy-surface-btn" data-html-width="1024px" title="Desktop / Laptop width">1024px</button>` +
    `<button type="button" class="agy-surface-btn" data-html-width="768px" title="Tablet width">768px</button>` +
    `<button type="button" class="agy-surface-btn" data-html-width="390px" title="Mobile width">390px</button>` +
    `<span class="agy-studio-sep"></span>` +
    `<button type="button" class="agy-btn agy-btn-subtle" id="agy-html-open-browser" title="Open this HTML file in your default web browser">↗ Browser</button>` +
    `</div>` +
    `</div>` +
    `<div class="agy-html-pane active" data-pane-id="webview">` +
    `<div class="agy-html-iframe-wrap" data-bg="auto">` +
    `<iframe class="agy-html-iframe" id="agy-html-iframe" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals" srcdoc="${escapeHtmlAttr(
      srcdocContent
    )}"></iframe>` +
    `</div>` +
    `</div>` +
    `<div class="agy-html-pane agy-html-reader-pane" data-pane-id="reader" hidden>` +
    `${readerHtml}` +
    `</div>` +
    `<div class="agy-html-pane agy-html-source-pane" data-pane-id="source" hidden>` +
    `<pre><code class="language-xml" data-lang="html" data-title="${escapeHtml(
      path.basename(info.fsPath)
    )}" data-line-numbers="1" data-agy-highlighted="1">${highlightedSource}</code></pre>` +
    `</div>` +
    `</div>` +
    `<div class="code-line agy-scroll-sentinel" data-line="${totalLines}"></div>`
  );
}

function renderSvgDocumentPreview(rawText, info) {
  const src = String(rawText || "");
  const totalLines = src.split(/\r?\n/).length;
  const byteSize = Buffer.byteLength(src, "utf8");
  const sizeLabel =
    byteSize >= 1024 ? `${(byteSize / 1024).toFixed(1)} KB` : `${byteSize} B`;
  const dims = getImageDimensions(info.realPath) || getImageDimensions(info.fsPath);
  const vbMatch = src.match(/\bviewBox=["']\s*([^"']+)\s*["']/i);
  const dimsLabel = dims
    ? `${dims.width} × ${dims.height} px`
    : vbMatch
    ? `viewBox ${vbMatch[1].trim()}`
    : "Vector SVG";
  const nodeMatches = src.match(/<(?:path|rect|circle|ellipse|line|polyline|polygon|text|g|use|image)\b/gi);
  const nodeCount = nodeMatches ? nodeMatches.length : 0;

  const base64Svg = Buffer.from(src, "utf8").toString("base64");
  const svgDataUri = `data:image/svg+xml;base64,${base64Svg}`;
  const highlightedXml = enrichCodeBlockHtml(escapeHtml(src), "xml", "", true);

  return (
    `<div class="agy-studio-card agy-svg-studio code-line" data-line="0" data-line-end="${totalLines}" data-raw-svg-b64="${base64Svg}">` +
    `<div class="agy-studio-bar">` +
    `<div class="agy-studio-pills">` +
    `<span class="agy-studio-meta-pill">${escapeHtml(dimsLabel)}</span>` +
    `<span class="agy-studio-meta-pill">${escapeHtml(sizeLabel)}</span>` +
    `<span class="agy-studio-meta-pill">${nodeCount} SVG elements</span>` +
    `</div>` +
    `<div class="agy-studio-controls">` +
    `<span class="agy-studio-label">Surface:</span>` +
    `<button type="button" class="agy-surface-btn active" data-stage-surface="checkerboard" title="Transparency checkerboard grid">Grid</button>` +
    `<button type="button" class="agy-surface-btn" data-stage-surface="theme" title="Active VS Code theme surface">Theme</button>` +
    `<button type="button" class="agy-surface-btn" data-stage-surface="light" title="Crisp white surface">Light</button>` +
    `<button type="button" class="agy-surface-btn" data-stage-surface="dark" title="Dark carbon surface">Dark</button>` +
    `<span class="agy-studio-sep"></span>` +
    `<button type="button" class="agy-surface-btn" data-stage-zoom="out" title="Zoom out">−</button>` +
    `<button type="button" class="agy-surface-btn" data-stage-zoom="reset" title="Reset zoom & pan">100%</button>` +
    `<button type="button" class="agy-surface-btn" data-stage-zoom="in" title="Zoom in">+</button>` +
    `<button type="button" class="agy-surface-btn" data-stage-action="copy-svg" title="Copy raw SVG XML markup">Copy SVG</button>` +
    `<button type="button" class="agy-surface-btn" data-stage-action="copy-data-uri" title="Copy base64 Data URI">Copy Data URI</button>` +
    `<button type="button" class="agy-surface-btn" data-stage-action="lightbox" title="Open in fullscreen Lightbox">⛶ Expand</button>` +
    `</div>` +
    `</div>` +
    `<div class="agy-studio-stage" data-surface="checkerboard">` +
    `<div class="agy-studio-stage-canvas">` +
    `<img class="agy-svg-preview-img" decoding="sync" src="${svgDataUri}" alt="${escapeHtml(
      path.basename(info.fsPath)
    )}" />` +
    `</div>` +
    `<div class="agy-studio-stage-hint">Scroll to zoom · Drag to pan · Double-click to reset · Click image for fullscreen</div>` +
    `</div>` +
    `<details class="agy-studio-source">` +
    `<summary>SVG XML Source (${totalLines} lines · ${escapeHtml(sizeLabel)})</summary>` +
    `<pre><code class="language-xml" data-lang="svg" data-title="${escapeHtml(
      path.basename(info.fsPath)
    )}" data-line-numbers="1" data-agy-highlighted="1">${highlightedXml}</code></pre>` +
    `</details>` +
    `</div>` +
    `<div class="code-line agy-scroll-sentinel" data-line="${totalLines}"></div>`
  );
}

function detectMermaidDiagramKind(rawText) {
  const lines = String(rawText || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("%%"));
  const first = lines[0] || "";
  if (/^(?:flowchart|graph)\b/i.test(first)) return "Flowchart";
  if (/^sequenceDiagram\b/i.test(first)) return "Sequence Diagram";
  if (/^stateDiagram(?:-v2)?\b/i.test(first)) return "State Diagram";
  if (/^classDiagram\b/i.test(first)) return "Class Diagram";
  if (/^erDiagram\b/i.test(first)) return "ER Diagram";
  if (/^xychart(?:-beta)?\b/i.test(first)) return "XY Chart";
  if (/^gantt\b/i.test(first)) return "Gantt Chart";
  if (/^pie\b/i.test(first)) return "Pie Chart";
  if (/^mindmap\b/i.test(first)) return "Mindmap";
  if (/^timeline\b/i.test(first)) return "Timeline";
  if (/^gitGraph\b/i.test(first)) return "Git Graph";
  if (/^journey\b/i.test(first)) return "User Journey";
  return "Mermaid Diagram";
}

function renderMermaidDocumentPreview(rawText, info) {
  const src = String(rawText || "");
  const totalLines = src.split(/\r?\n/).length;
  const diagramKind = detectMermaidDiagramKind(src);
  const highlightedSource = enrichCodeBlockHtml(escapeHtml(src), "yaml", "", true);

  return (
    `<div class="agy-studio-card agy-mermaid-studio code-line" data-line="0" data-line-end="${totalLines}">` +
    `<div class="agy-studio-bar">` +
    `<div class="agy-studio-pills">` +
    `<span class="agy-studio-meta-pill">${escapeHtml(diagramKind)}</span>` +
    `<span class="agy-studio-meta-pill">${totalLines} lines</span>` +
    `</div>` +
    `<div class="agy-studio-controls">` +
    `<span class="agy-studio-label">Surface:</span>` +
    `<button type="button" class="agy-surface-btn active" data-mermaid-surface="theme">Theme</button>` +
    `<button type="button" class="agy-surface-btn" data-mermaid-surface="checkerboard">Grid</button>` +
    `<button type="button" class="agy-surface-btn" data-mermaid-surface="light">Light</button>` +
    `<button type="button" class="agy-surface-btn" data-mermaid-surface="dark">Dark</button>` +
    `</div>` +
    `</div>` +
    `<div class="agy-mermaid-container agy-studio-mermaid-stage code-line" data-surface="theme" data-line="0" data-line-end="${totalLines}">` +
    `<div class="mermaid">${escapeHtml(src.trim())}</div>` +
    `</div>` +
    `<details class="agy-studio-source" open>` +
    `<summary>Mermaid Diagram Source (${totalLines} lines)</summary>` +
    `<pre><code class="language-yaml" data-lang="mermaid" data-title="${escapeHtml(
      path.basename(info.fsPath)
    )}" data-line-numbers="1" data-agy-highlighted="1">${highlightedSource}</code></pre>` +
    `</details>` +
    `</div>` +
    `<div class="code-line agy-scroll-sentinel" data-line="${totalLines}"></div>`
  );
}

function parseDelimitedTable(rawText, delimiter = ",") {
  const src = String(rawText || "");
  const rows = [];
  let currentRow = [];
  let currentField = "";
  let inQuotes = false;
  let currentLine = 0;
  let rowStartLine = 0;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    const next = src[i + 1];
    if (inQuotes) {
      if (ch === '"') {
        if (next === '"') {
          currentField += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        if (ch === "\n") currentLine++;
        currentField += ch;
      }
      continue;
    }

    if (ch === '"' && currentField.length === 0) {
      inQuotes = true;
      continue;
    }
    if (ch === delimiter) {
      currentRow.push(currentField);
      currentField = "";
      continue;
    }
    if (ch === "\r" && next === "\n") {
      currentRow.push(currentField);
      if (currentRow.length > 1 || (currentRow[0] && currentRow[0].trim() !== "")) {
        rows.push({ sourceLine: rowStartLine, cells: currentRow });
      }
      currentRow = [];
      currentField = "";
      currentLine++;
      rowStartLine = currentLine;
      i++;
      continue;
    }
    if (ch === "\n" || ch === "\r") {
      currentRow.push(currentField);
      if (currentRow.length > 1 || (currentRow[0] && currentRow[0].trim() !== "")) {
        rows.push({ sourceLine: rowStartLine, cells: currentRow });
      }
      currentRow = [];
      currentField = "";
      currentLine++;
      rowStartLine = currentLine;
      continue;
    }
    currentField += ch;
  }

  if (inQuotes || currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    if (currentRow.length > 1 || (currentRow[0] && currentRow[0].trim() !== "")) {
      rows.push({ sourceLine: rowStartLine, cells: currentRow });
    }
  }
  return rows;
}

function formatTableCellHtml(cellValue) {
  const s = String(cellValue == null ? "" : cellValue).trim();
  if (!s) return `<span class="agy-cell-empty">—</span>`;
  if (/^(?:true|false)$/i.test(s)) {
    const isTrue = s.toLowerCase() === "true";
    return `<span class="agy-cell-bool ${isTrue ? "bool-true" : "bool-false"}">${escapeHtml(
      s
    )}</span>`;
  }
  if (/^(?:https?:\/\/|file:\/\/)\S+$/i.test(s)) {
    return `<a href="${escapeHtmlAttr(s)}">${escapeHtml(s)}</a>`;
  }
  return escapeHtml(s);
}

function renderDelimitedTablePreview(rawText, info) {
  const src = String(rawText || "");
  const totalLines = src.split(/\r?\n/).length;
  const isTsv = info.format && info.format.id === "tsv";
  const delimiter = isTsv ? "\t" : ",";
  const allRows = parseDelimitedTable(src, delimiter);
  if (!allRows.length) {
    return `<div class="markdown-alert markdown-alert-note"><p class="markdown-alert-title">EMPTY TABLE</p><p>No rows found in <code>${escapeHtml(
      path.basename(info.fsPath)
    )}</code>.</p></div>`;
  }

  const headerCells = allRows[0].cells;
  const dataRows = allRows.slice(1);
  const colCount = allRows.reduce((m, r) => Math.max(m, r.cells.length), headerCells.length);
  const MAX_RENDER_ROWS = 2500;
  const visibleRows = dataRows.slice(0, MAX_RENDER_ROWS);
  const truncatedCount = Math.max(0, dataRows.length - visibleRows.length);

  const ths = [];
  ths.push(`<th class="agy-csv-row-num" title="Row number">#</th>`);
  for (let c = 0; c < colCount; c++) {
    const colName = headerCells[c] !== undefined && String(headerCells[c]).trim() !== ""
      ? String(headerCells[c]).trim()
      : `Col ${c + 1}`;
    ths.push(
      `<th class="agy-sortable-th" data-col-idx="${c}" title="Click to sort by ${escapeHtmlAttr(
        colName
      )}"><span class="agy-th-content"><span>${escapeHtml(
        colName
      )}</span><span class="agy-sort-indicator">⇅</span></span></th>`
    );
  }

  const trs = visibleRows.map((row, rIdx) => {
    const tds = [`<td class="agy-csv-row-num">${rIdx + 1}</td>`];
    for (let c = 0; c < colCount; c++) {
      const val = row.cells[c] !== undefined ? row.cells[c] : "";
      const isNum =
        typeof val === "string" &&
        val.trim() !== "" &&
        /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?%?$/i.test(val.trim());
      tds.push(
        `<td${isNum ? ' class="agy-cell-num"' : ""} data-raw="${escapeHtmlAttr(
          val
        )}">${formatTableCellHtml(val)}</td>`
      );
    }
    return `<tr class="code-line" data-line="${row.sourceLine}" data-row-idx="${rIdx}">${tds.join(
      ""
    )}</tr>`;
  });

  const truncBanner =
    truncatedCount > 0
      ? `<div class="agy-studio-trunc-notice">Showing first ${visibleRows.length} of ${dataRows.length} rows (${truncatedCount} more in raw file).</div>`
      : "";

  return (
    `<div class="agy-studio-card agy-csv-studio code-line" data-line="0" data-line-end="${totalLines}">` +
    `<div class="agy-studio-bar">` +
    `<div class="agy-studio-pills">` +
    `<span class="agy-studio-meta-pill">${isTsv ? "TSV" : "CSV"} Table</span>` +
    `<span class="agy-studio-meta-pill" id="agy-csv-count-badge" data-total="${
      visibleRows.length
    }" data-cols="${colCount}">${dataRows.length} rows × ${colCount} columns</span>` +
    `</div>` +
    `<div class="agy-studio-controls">` +
    `<input type="search" class="agy-studio-search" id="agy-csv-search" placeholder="Filter ${dataRows.length} rows across ${colCount} columns…" autocomplete="off" />` +
    `</div>` +
    `</div>` +
    `<div class="agy-table-wrapper agy-csv-table-wrapper">` +
    `<table class="agy-csv-table" id="agy-csv-table">` +
    `<thead><tr>${ths.join("")}</tr></thead>` +
    `<tbody>${trs.join("")}</tbody>` +
    `</table>` +
    `</div>` +
    `${truncBanner}` +
    `</div>` +
    `<div class="code-line agy-scroll-sentinel" data-line="${totalLines}"></div>`
  );
}

function renderJsonlDocumentPreview(rawText, info) {
  const src = String(rawText || "");
  const rawLines = src.split(/\r?\n/);
  const totalLines = rawLines.length;
  const records = [];

  for (let i = 0; i < rawLines.length; i++) {
    const trimmed = rawLines[i].trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed);
      records.push({ sourceLine: i, ok: true, data: parsed, raw: trimmed });
    } catch (err) {
      records.push({
        sourceLine: i,
        ok: false,
        data: null,
        raw: trimmed,
        error: err && err.message ? err.message : "Invalid JSON"
      });
    }
  }

  if (!records.length) {
    return `<div class="markdown-alert markdown-alert-note"><p class="markdown-alert-title">EMPTY JSONL</p><p>No JSONL records found in <code>${escapeHtml(
      path.basename(info.fsPath)
    )}</code>.</p></div>`;
  }

  // Detect Antigravity Conversation Transcript format
  const sampleValid = records.filter((r) => r.ok && r.data && typeof r.data === "object").slice(0, 8);
  const isTranscript =
    sampleValid.length > 0 &&
    sampleValid.some(
      (r) =>
        typeof r.data.step_index === "number" ||
        (typeof r.data.source === "string" &&
          typeof r.data.type === "string" &&
          (r.data.content !== undefined ||
            r.data.thinking !== undefined ||
            r.data.tool_calls !== undefined))
    );

  if (isTranscript) {
    let userCount = 0;
    let plannerCount = 0;
    let toolCount = 0;
    let errorCount = 0;

    const cardsHtml = records.map((rec, idx) => {
      if (!rec.ok || !rec.data || typeof rec.data !== "object") {
        errorCount++;
        return (
          `<article class="agy-jsonl-step-card role-error code-line" data-line="${rec.sourceLine}" data-role="error">` +
          `<div class="agy-step-header">` +
          `<span class="agy-step-idx">Line #${rec.sourceLine + 1}</span>` +
          `<span class="agy-step-badge badge-error">PARSE ERROR</span>` +
          `</div>` +
          `<pre><code class="language-json">${escapeHtml(rec.raw)}</code></pre>` +
          `</article>`
        );
      }

      const d = rec.data;
      const stepIdx = d.step_index !== undefined ? d.step_index : idx;
      const source = String(d.source || "").toUpperCase();
      const type = String(d.type || "STEP").toUpperCase();
      const status = String(d.status || "").toUpperCase();
      const createdAt = d.created_at ? String(d.created_at).replace("T", " ").slice(0, 19) : "";
      const toolCalls = Array.isArray(d.tool_calls) ? d.tool_calls : [];
      const hasError = status === "ERROR" || type.includes("ERROR");

      let role = "system";
      if (hasError) {
        role = "error";
        errorCount++;
      } else if (type === "USER_INPUT" || source.includes("USER")) {
        role = "user";
        userCount++;
      } else if (type === "PLANNER_RESPONSE" || source === "MODEL") {
        role = "planner";
        plannerCount++;
      }
      if (toolCalls.length > 0) {
        toolCount += toolCalls.length;
      }

      const thinkingSection =
        typeof d.thinking === "string" && d.thinking.trim()
          ? `<details class="agy-step-thinking"><summary>💭 Thinking (${
              d.thinking.trim().length
            } chars)</summary><div class="agy-step-thinking-body">${escapeHtml(
              d.thinking.trim()
            )}</div></details>`
          : "";

      const contentText =
        typeof d.content === "string"
          ? d.content.trim()
          : d.content !== undefined && d.content !== null
          ? JSON.stringify(d.content, null, 2)
          : "";
      const contentSection = contentText
        ? `<div class="agy-step-content">${escapeHtml(contentText)}</div>`
        : "";

      let toolsSection = "";
      if (toolCalls.length > 0) {
        const toolItems = toolCalls
          .map((tc) => {
            const name =
              (tc && (tc.name || tc.tool_name || (tc.function && tc.function.name))) || "tool_call";
            const argsObj =
              tc && (tc.arguments !== undefined ? tc.arguments : tc.args !== undefined ? tc.args : tc);
            const prettyArgs =
              typeof argsObj === "string" ? argsObj : JSON.stringify(argsObj, null, 2);
            const hlArgs = highlightFallbackPlainCode(prettyArgs, "json");
            return (
              `<div class="agy-tool-call-item">` +
              `<div class="agy-tool-call-title"><code>🔧 ${escapeHtml(String(name))}</code></div>` +
              `<pre><code class="language-json" data-agy-highlighted="1">${hlArgs}</code></pre>` +
              `</div>`
            );
          })
          .join("");
        toolsSection = `<details class="agy-step-tools"><summary>🔧 Tool Calls (${toolCalls.length})</summary><div class="agy-step-tools-list">${toolItems}</div></details>`;
      }

      const truncNotice =
        Array.isArray(d.truncated_fields) && d.truncated_fields.length > 0
          ? `<span class="agy-step-badge badge-warn" title="Read transcript_full.jsonl line ${
              rec.sourceLine + 1
            } for full content">✂️ truncated: ${escapeHtml(d.truncated_fields.join(", "))}</span>`
          : "";

      return (
        `<article class="agy-jsonl-step-card role-${role} code-line" data-line="${
          rec.sourceLine
        }" data-role="${role}" data-has-tools="${toolCalls.length > 0 ? "1" : "0"}">` +
        `<div class="agy-step-header">` +
        `<div class="agy-step-header-left">` +
        `<span class="agy-step-idx">#${escapeHtml(String(stepIdx))}</span>` +
        `<span class="agy-step-badge badge-${role}">${escapeHtml(type)}</span>` +
        (source ? `<span class="agy-step-meta">${escapeHtml(source)}</span>` : "") +
        (status && status !== "DONE"
          ? `<span class="agy-step-badge ${
              hasError ? "badge-error" : "badge-warn"
            }">${escapeHtml(status)}</span>`
          : "") +
        truncNotice +
        `</div>` +
        `<div class="agy-step-header-right">` +
        (createdAt ? `<span class="agy-step-time">${escapeHtml(createdAt)}</span>` : "") +
        `<span class="agy-step-line">L${rec.sourceLine + 1}</span>` +
        `<button type="button" class="agy-surface-btn agy-copy-json-btn" data-json="${escapeHtmlAttr(
          JSON.stringify(d, null, 2)
        )}">Copy JSON</button>` +
        `</div>` +
        `</div>` +
        thinkingSection +
        contentSection +
        toolsSection +
        `</article>`
      );
    });

    return (
      `<div class="agy-studio-card agy-jsonl-studio code-line" data-line="0" data-line-end="${totalLines}">` +
      `<div class="agy-studio-bar">` +
      `<div class="agy-studio-pills">` +
      `<button type="button" class="agy-studio-pill active" data-jsonl-filter="all">All (${records.length})</button>` +
      `<button type="button" class="agy-studio-pill" data-jsonl-filter="user">💬 User (${userCount})</button>` +
      `<button type="button" class="agy-studio-pill" data-jsonl-filter="planner">🤖 Planner (${plannerCount})</button>` +
      `<button type="button" class="agy-studio-pill" data-jsonl-filter="tools">🔧 Tools (${toolCount})</button>` +
      (errorCount > 0
        ? `<button type="button" class="agy-studio-pill" data-jsonl-filter="error">⚠️ Errors (${errorCount})</button>`
        : "") +
      `</div>` +
      `<div class="agy-studio-controls">` +
      `<input type="search" class="agy-studio-search" id="agy-jsonl-search" placeholder="Search transcript steps, thinking, or tools…" autocomplete="off" />` +
      `<button type="button" class="agy-surface-btn" id="agy-jsonl-expand-all">Expand All</button>` +
      `</div>` +
      `</div>` +
      `<div class="agy-jsonl-list" id="agy-jsonl-list">${cardsHtml.join("")}</div>` +
      `</div>` +
      `<div class="code-line agy-scroll-sentinel" data-line="${totalLines}"></div>`
    );
  }

  // Generic JSONL / NDJSON Dataset Inspector
  const MAX_RECORDS = 1000;
  const visibleRecords = records.slice(0, MAX_RECORDS);
  const cardsHtml = visibleRecords.map((rec, idx) => {
    const pretty = rec.ok ? JSON.stringify(rec.data, null, 2) : rec.raw;
    const highlighted = rec.ok
      ? highlightFallbackPlainCode(pretty, "json")
      : escapeHtml(rec.raw);
    const summaryKeys =
      rec.ok && rec.data && typeof rec.data === "object" && !Array.isArray(rec.data)
        ? Object.entries(rec.data)
            .slice(0, 4)
            .map(([k, v]) => {
              const valStr =
                typeof v === "object" && v !== null ? JSON.stringify(v) : String(v);
              return `<span class="agy-jsonl-kv"><b>${escapeHtml(k)}:</b> ${escapeHtml(
                valStr.slice(0, 48)
              )}${valStr.length > 48 ? "…" : ""}</span>`;
            })
            .join("")
        : "";
    return (
      `<article class="agy-jsonl-step-card role-generic code-line" data-line="${rec.sourceLine}" data-role="all">` +
      `<div class="agy-step-header">` +
      `<div class="agy-step-header-left">` +
      `<span class="agy-step-idx">#${idx + 1}</span>` +
      `<span class="agy-step-line">Line ${rec.sourceLine + 1}</span>` +
      summaryKeys +
      `</div>` +
      `<div class="agy-step-header-right">` +
      `<button type="button" class="agy-surface-btn agy-copy-json-btn" data-json="${escapeHtmlAttr(
        pretty
      )}">Copy JSON</button>` +
      `</div>` +
      `</div>` +
      `<pre><code class="language-json" data-agy-highlighted="1">${highlighted}</code></pre>` +
      `</article>`
    );
  });

  return (
    `<div class="agy-studio-card agy-jsonl-studio code-line" data-line="0" data-line-end="${totalLines}">` +
    `<div class="agy-studio-bar">` +
    `<div class="agy-studio-pills">` +
    `<span class="agy-studio-meta-pill">${info.format ? info.format.badge : "JSONL"}</span>` +
    `<span class="agy-studio-meta-pill" id="agy-jsonl-count-badge">${records.length} records</span>` +
    `</div>` +
    `<div class="agy-studio-controls">` +
    `<input type="search" class="agy-studio-search" id="agy-jsonl-search" placeholder="Filter ${records.length} JSONL records…" autocomplete="off" />` +
    `</div>` +
    `</div>` +
    `<div class="agy-jsonl-list" id="agy-jsonl-list">${cardsHtml.join("")}</div>` +
    `</div>` +
    `<div class="code-line agy-scroll-sentinel" data-line="${totalLines}"></div>`
  );
}

async function renderDocumentContent(rawText, info, options = {}) {
  const fmt = (info && info.format) || detectDocumentFormat(info && info.fsPath);
  if (fmt.id === "html") {
    return renderHtmlDocumentPreview(rawText, info, options);
  }
  if (fmt.id === "svg") {
    return renderSvgDocumentPreview(rawText, info);
  }
  if (fmt.id === "mermaid") {
    return renderMermaidDocumentPreview(rawText, info);
  }
  if (fmt.id === "csv" || fmt.id === "tsv") {
    return renderDelimitedTablePreview(rawText, info);
  }
  if (fmt.id === "jsonl") {
    return renderJsonlDocumentPreview(rawText, info);
  }

  let renderedHtml = "";
  try {
    renderedHtml = await renderMarkdownWithCarousels(
      rawText,
      async (mdChunk) => {
        return await vscode.commands.executeCommand("markdown.api.render", mdChunk);
      },
      fmt
    );
  } catch (_) {
    renderedHtml = `<pre>${escapeHtml(rawText)}</pre>`;
  }

  if (options.forExport) {
    if (options.exportType === "pdf") {
      renderedHtml = rewriteLocalImageUrisForPdf(
        renderedHtml,
        path.dirname(info.realPath),
        path.dirname(info.fsPath)
      );
      renderedHtml = renderedHtml.replace(/<details\b(?![^>]*\bopen\b)/gi, "<details open");
    } else if (options.exportType === "html") {
      renderedHtml = embedLocalImagesAsDataUris(
        renderedHtml,
        path.dirname(info.realPath),
        path.dirname(info.fsPath)
      );
    }
  } else if (options.webview) {
    renderedHtml = rewriteLocalImageUris(
      renderedHtml,
      options.webview,
      path.dirname(info.realPath),
      path.dirname(info.fsPath)
    );
  }
  return renderedHtml;
}

class AntigravityMarkdownReviewProvider {
  constructor(context) {
    this.context = context;
  }

  async openCustomDocument(uri) {
    return {
      uri,
      dispose: () => {}
    };
  }

  async resolveCustomEditor(document, webviewPanel) {
    const webview = webviewPanel.webview;
    const info = resolveRealFileInfo(document.uri);
    const localRoots = [
      vscode.Uri.joinPath(this.context.extensionUri, "media"),
      vscode.Uri.file(path.dirname(info.fsPath)),
      vscode.Uri.file(path.dirname(info.realPath)),
      vscode.Uri.file(os.homedir())
    ];
    if (vscode.workspace.workspaceFolders) {
      for (const wf of vscode.workspace.workspaceFolders) {
        localRoots.push(wf.uri);
      }
    }

    webview.options = {
      enableScripts: true,
      localResourceRoots: localRoots
    };

    let lastRawText = null;
    let lastRenderedHtml = null;
    let lastIsLightTheme = null;
    let lastThemeCss = null;
    let isWebviewInitialized = false;
    let renderTimer = null;
    let wasPanelVisible = Boolean(webviewPanel.visible);

    let syncScrollEnabled = vscode.workspace
      .getConfiguration("agyMarkdown")
      .get("syncScroll", true);
    let suppressEditorToPreviewUntil = 0;
    let suppressPreviewToEditorUntil = 0;
    let lastSyncedLine = 0;

    const initialMatchingEditors = findMatchingVisibleEditors(info);
    if (initialMatchingEditors.length > 0) {
      const topLine = getTopVisibleLine(initialMatchingEditors[0]);
      if (typeof topLine === "number" && !Number.isNaN(topLine)) {
        lastSyncedLine = topLine;
      }
    } else if (lastEditorLineByPath.has(info.realPath)) {
      lastSyncedLine = lastEditorLineByPath.get(info.realPath) || 0;
    } else if (lastEditorLineByPath.has(info.fsPath)) {
      lastSyncedLine = lastEditorLineByPath.get(info.fsPath) || 0;
    }

    const renderToWebview = async (force = false) => {
      let rawText = "";
      try {
        rawText = fs.readFileSync(info.realPath, "utf8");
      } catch (err) {
        try {
          rawText = fs.readFileSync(info.fsPath, "utf8");
        } catch (err2) {
          rawText = `# Unable to read file\n\n\`${info.fsPath}\``;
        }
      }

      const themeKind = vscode.window.activeColorTheme
        ? vscode.window.activeColorTheme.kind
        : vscode.ColorThemeKind.Dark;
      const isLightTheme =
        themeKind === vscode.ColorThemeKind.Light ||
        themeKind === vscode.ColorThemeKind.HighContrastLight;
      const themeCss = buildThemeOverrideCss();

      if (
        !force &&
        isWebviewInitialized &&
        !rawText.trim() &&
        lastRawText &&
        lastRawText.trim().length > 0
      ) {
        scheduleRender(80);
        return;
      }

      if (
        !force &&
        isWebviewInitialized &&
        rawText === lastRawText &&
        isLightTheme === lastIsLightTheme &&
        themeCss === lastThemeCss
      ) {
        return;
      }

      const contentChanged = !isWebviewInitialized || rawText !== lastRawText;
      lastRawText = rawText;
      lastIsLightTheme = isLightTheme;
      lastThemeCss = themeCss;

      const displayPath = info.isSymlink
        ? `${path.basename(info.fsPath)} → ${shortenHome(info.realPath)}`
        : shortenHome(info.fsPath);
      const docTitle = formatDocumentTitle(info.fsPath, rawText);

      if (isWebviewInitialized && !force && !contentChanged) {
        await webview.postMessage({
          type: "updateTheme",
          isLightTheme,
          themeCss
        });
        return;
      }

      const renderedHtml = await renderDocumentContent(rawText, info, {
        webview,
        forExport: false
      });

      if (isWebviewInitialized && !force) {
        if (renderedHtml === lastRenderedHtml) {
          return;
        }
        lastRenderedHtml = renderedHtml;
        await webview.postMessage({
          type: "updateContent",
          renderedHtml,
          displayPath,
          docTitle,
          formatBadge: info.format ? info.format.badge : "MD",
          formatId: info.format ? info.format.id : "markdown",
          isLightTheme,
          themeCss
        });
        return;
      }

      lastRenderedHtml = renderedHtml;

      const cssUri = webview.asWebviewUri(
        vscode.Uri.joinPath(this.context.extensionUri, "media", "antigravity-markdown.css")
      );
      const katexCssUri = webview.asWebviewUri(
        vscode.Uri.joinPath(this.context.extensionUri, "media", "katex.min.css")
      );
      const mermaidJsUri = webview.asWebviewUri(
        vscode.Uri.joinPath(this.context.extensionUri, "media", "mermaid.min.js")
      );
      const jsUri = webview.asWebviewUri(
        vscode.Uri.joinPath(this.context.extensionUri, "media", "antigravity-markdown.js")
      );

      isWebviewInitialized = true;
      webview.html = buildWebviewHtml({
        cssUri,
        katexCssUri,
        mermaidJsUri,
        jsUri,
        renderedHtml,
        displayPath,
        realFilePath: info.realPath,
        docTitle,
        formatInfo: info.format,
        isBrainArtifact: info.isBrainArtifact,
        isSymlink: info.isSymlink,
        isLightTheme,
        themeCss,
        syncScrollEnabled,
        isSplitOpen: isRawSplitOpen(info),
        initialLine: lastSyncedLine
      });
    };

    const scheduleRender = (delayMs = 120) => {
      if (renderTimer) {
        clearTimeout(renderTimer);
      }
      renderTimer = setTimeout(() => {
        renderTimer = null;
        renderToWebview(false);
      }, delayMs);
    };

    await renderToWebview(true);
    trackEvent("review.open", { isBrainArtifact: info.isBrainArtifact });

    const disposables = [
      {
        dispose: () => {
          if (renderTimer) {
            clearTimeout(renderTimer);
            renderTimer = null;
          }
        }
      }
    ];

    const broadcastSplitState = () => {
      if (!isWebviewInitialized) return;
      webview.postMessage({
        type: "updateSplitState",
        isOpen: isRawSplitOpen(info)
      });
    };

    disposables.push(
      vscode.window.onDidChangeVisibleTextEditors(() => {
        broadcastSplitState();
      })
    );
    if (vscode.window.tabGroups && typeof vscode.window.tabGroups.onDidChangeTabs === "function") {
      disposables.push(
        vscode.window.tabGroups.onDidChangeTabs(() => {
          broadcastSplitState();
        })
      );
    }

    // Re-render when VS Code color theme changes
    disposables.push(
      vscode.window.onDidChangeActiveColorTheme(() => {
        scheduleRender(40);
      })
    );

    // Sync scroll from Raw Editor -> Preview in Split Edit mode
    disposables.push(
      vscode.window.onDidChangeTextEditorVisibleRanges((e) => {
        if (!e || !e.textEditor || !isMatchingDocumentUri(e.textEditor.document.uri, info)) {
          return;
        }
        const line = getTopVisibleLine(e.textEditor);
        if (typeof line !== "number" || Number.isNaN(line)) return;
        lastEditorLineByPath.set(info.realPath, line);
        lastEditorLineByPath.set(info.fsPath, line);
        lastSyncedLine = line;

        if (!syncScrollEnabled || !webviewPanel.visible) return;
        if (Date.now() < suppressEditorToPreviewUntil) return;

        suppressPreviewToEditorUntil = Date.now() + 500;
        webview.postMessage({
          type: "scrollToLine",
          line
        });
      })
    );

    // Keep syncScroll, codeLineNumbers, and theme palette settings in sync if changed in VS Code settings
    disposables.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration("agyMarkdown.syncScroll")) {
          syncScrollEnabled = vscode.workspace
            .getConfiguration("agyMarkdown")
            .get("syncScroll", true);
          webview.postMessage({
            type: "updateSyncScroll",
            enabled: syncScrollEnabled
          });
        }
        if (e.affectsConfiguration("agyMarkdown.codeLineNumbers")) {
          renderToWebview(true);
        }
        if (
          e.affectsConfiguration("agyMarkdown.useThemePalette") ||
          e.affectsConfiguration("workbench.colorTheme") ||
          e.affectsConfiguration("workbench.colorCustomizations") ||
          e.affectsConfiguration("editor.tokenColorCustomizations") ||
          e.affectsConfiguration("editor.semanticTokenColorCustomizations")
        ) {
          scheduleRender(40);
        }
      })
    );

    // When preview panel transitions from hidden to visible alongside a raw editor, align scroll position
    disposables.push(
      webviewPanel.onDidChangeViewState(() => {
        const becameVisible = !wasPanelVisible && Boolean(webviewPanel.visible);
        wasPanelVisible = Boolean(webviewPanel.visible);
        broadcastSplitState();
        if (!becameVisible || !syncScrollEnabled) return;
        const editors = findMatchingVisibleEditors(info);
        if (editors.length > 0) {
          const line = getTopVisibleLine(editors[0]);
          if (typeof line === "number" && !Number.isNaN(line)) {
            lastSyncedLine = line;
            suppressPreviewToEditorUntil = Date.now() + 500;
            webview.postMessage({
              type: "scrollToLine",
              line,
              instant: true
            });
          }
        }
      })
    );

    // Watch text document changes in VS Code
    disposables.push(
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (isMatchingDocumentUri(e.document.uri, info)) {
          if (e.contentChanges && e.contentChanges.length > 0) {
            scheduleRender(120);
          }
        }
      })
    );

    // Watch canonical file on disk (avoid duplicate fs.watch events on both symlink and target)
    const primaryWatchPath = fs.existsSync(info.realPath) ? info.realPath : info.fsPath;
    try {
      if (fs.existsSync(primaryWatchPath)) {
        const watcher = fs.watch(primaryWatchPath, { persistent: false }, () => {
          scheduleRender(220);
        });
        disposables.push({ dispose: () => watcher.close() });
      }
    } catch (_) {
      // ignore watcher errors
    }

    // Handle toolbar, scroll sync, & link clicks from webview
    disposables.push(
      webview.onDidReceiveMessage(async (msg) => {
        if (!msg || !msg.type) return;
        if (msg.type === "revealLine" && typeof msg.line === "number") {
          if (Number.isNaN(msg.line)) return;
          lastSyncedLine = msg.line;
          lastEditorLineByPath.set(info.realPath, msg.line);
          lastEditorLineByPath.set(info.fsPath, msg.line);
          if (!syncScrollEnabled) return;
          if (Date.now() < suppressPreviewToEditorUntil) return;
          const editors = findMatchingVisibleEditors(info);
          if (!editors.length) return;
          suppressEditorToPreviewUntil = Date.now() + 600;
          for (const ed of editors) {
            revealEditorAtLine(ed, msg.line);
          }
        } else if (msg.type === "toggleSyncScroll") {
          syncScrollEnabled =
            typeof msg.enabled === "boolean" ? msg.enabled : !syncScrollEnabled;
          webview.postMessage({
            type: "updateSyncScroll",
            enabled: syncScrollEnabled
          });
          if (syncScrollEnabled) {
            const editors = findMatchingVisibleEditors(info);
            if (editors.length > 0 && typeof lastSyncedLine === "number") {
              suppressEditorToPreviewUntil = Date.now() + 600;
              for (const ed of editors) {
                revealEditorAtLine(ed, lastSyncedLine, true);
              }
            }
          }
        } else if (msg.type === "toggleSplitEdit") {
          trackEvent("review.splitEdit");
          const rawTabs = getOpenRawEditorTabs(info);
          const visibleRawEditors = findMatchingVisibleEditors(info);
          if (rawTabs.length > 0 || visibleRawEditors.length > 0) {
            if (rawTabs.length > 0) {
              try {
                await vscode.window.tabGroups.close(rawTabs, true);
              } catch (_) {}
            } else if (visibleRawEditors.length > 0) {
              try {
                await vscode.window.showTextDocument(
                  visibleRawEditors[0].document,
                  visibleRawEditors[0].viewColumn,
                  false
                );
                await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
              } catch (_) {}
            }
            broadcastSplitState();
            return;
          }

          const targetLine =
            typeof msg.line === "number" && !Number.isNaN(msg.line)
              ? msg.line
              : lastSyncedLine;
          lastEditorLineByPath.set(info.realPath, targetLine);
          lastEditorLineByPath.set(info.fsPath, targetLine);
          suppressEditorToPreviewUntil = Date.now() + 650;
          await vscode.commands.executeCommand(
            "vscode.openWith",
            document.uri,
            "default",
            vscode.ViewColumn.Beside
          );
          if (typeof targetLine === "number" && !Number.isNaN(targetLine) && targetLine > 0) {
            const applyReveal = () => {
              const editors = findMatchingVisibleEditors(info);
              for (const ed of editors) {
                revealEditorAtLine(ed, targetLine, true);
              }
            };
            applyReveal();
            setTimeout(applyReveal, 50);
          }
          broadcastSplitState();
        } else if (msg.type === "editSource") {
          const targetLine =
            typeof msg.line === "number" && !Number.isNaN(msg.line)
              ? msg.line
              : lastSyncedLine;
          lastEditorLineByPath.set(info.realPath, targetLine);
          lastEditorLineByPath.set(info.fsPath, targetLine);
          suppressEditorToPreviewUntil = Date.now() + 650;
          await vscode.commands.executeCommand(
            "vscode.openWith",
            document.uri,
            "default",
            msg.beside ? vscode.ViewColumn.Beside : webviewPanel.viewColumn
          );
          if (typeof targetLine === "number" && !Number.isNaN(targetLine) && targetLine > 0) {
            const applyReveal = () => {
              const editors = findMatchingVisibleEditors(info);
              for (const ed of editors) {
                revealEditorAtLine(ed, targetLine, true);
              }
            };
            applyReveal();
            setTimeout(applyReveal, 50);
          }
          broadcastSplitState();
        } else if (msg.type === "openNativeArtifact") {
          trackEvent("review.openNativeArtifact");
          await openInNativeArtifactViewer(info);
        } else if (msg.type === "openGitHubMenu") {
          await promptGitHubOrReportIssue(info);
        } else if (msg.type === "exportPdf") {
          trackEvent("review.exportPdf", { mode: msg.mode || "ask" });
          await exportMarkdownToPdf({
            info,
            extensionPath: this.context.extensionPath,
            mode: msg.mode || "ask",
            computedVars: msg.computedVars || null
          });
        } else if (msg.type === "exportHtml") {
          trackEvent("review.exportHtml", { mode: msg.mode || "ask" });
          await exportMarkdownToHtml({
            info,
            extensionPath: this.context.extensionPath,
            mode: msg.mode || "ask",
            computedVars: msg.computedVars || null
          });
        } else if (msg.type === "toggleTaskCheckbox") {
          trackEvent("review.toggleTaskCheckbox");
          await toggleTaskCheckboxInDocument(document, info, msg);
        } else if (msg.type === "copyRaw") {
          try {
            const raw = fs.readFileSync(info.realPath, "utf8");
            await vscode.env.clipboard.writeText(raw);
            vscode.window.setStatusBarMessage(
              "Antigravity: Copied raw source to clipboard",
              2500
            );
          } catch (_) {}
        } else if (msg.type === "copyText" && typeof msg.text === "string") {
          try {
            await vscode.env.clipboard.writeText(msg.text);
            vscode.window.setStatusBarMessage("Antigravity: Copied to clipboard", 2000);
          } catch (_) {}
        } else if (msg.type === "openExternalBrowser") {
          try {
            await vscode.env.openExternal(vscode.Uri.file(info.realPath));
          } catch (_) {}
        } else if (msg.type === "openLink") {
          await handleWebviewLinkClick(msg.href, info);
        }
      })
    );

    const panelEntry = {
      info,
      webviewPanel,
      requestExportPdf: (mode) => {
        webview.postMessage({ type: "requestExportPdf", mode });
      },
      requestExportHtml: (mode) => {
        webview.postMessage({ type: "requestExportHtml", mode });
      }
    };
    activeReviewWebviewsByPath.set(info.realPath, panelEntry);
    activeReviewWebviewsByPath.set(info.fsPath, panelEntry);

    webviewPanel.onDidDispose(() => {
      if (activeReviewWebviewsByPath.get(info.realPath) === panelEntry) {
        activeReviewWebviewsByPath.delete(info.realPath);
      }
      if (activeReviewWebviewsByPath.get(info.fsPath) === panelEntry) {
        activeReviewWebviewsByPath.delete(info.fsPath);
      }
      for (const d of disposables) {
        try {
          d.dispose();
        } catch (_) {}
      }
    });
  }
}

async function openInNativeArtifactViewer(info) {
  let targetUri = vscode.Uri.file(info.realPath);
  if (info.cascadeId) {
    targetUri = targetUri.with({ query: `cascadeId=${info.cascadeId}` });
  }
  try {
    await vscode.commands.executeCommand("vscode.openWith", targetUri, "antigravity.artifactEditor");
  } catch (_) {
    vscode.window.showInformationMessage("Native Antigravity Artifact Viewer is not available for this file.");
  }
}

async function handleWebviewLinkClick(href, currentInfo) {
  if (!href) return;

  if (href.startsWith("conversation://")) {
    const convId = href.replace(/^conversation:\/\//i, "").trim().replace(/\/$/, "");
    try {
      await vscode.commands.executeCommand("antigravity.openConversation", convId);
      return;
    } catch (_) {
      // Fallback: open that conversation's brain directory or PROJECT_HUB.md if present
      const candidates = [
        path.join(os.homedir(), ".gemini", "antigravity-cli", "brain", convId, "PROJECT_HUB.md"),
        path.join(os.homedir(), ".gemini", "antigravity", "brain", convId, "PROJECT_HUB.md")
      ];
      for (const c of candidates) {
        if (fs.existsSync(c)) {
          await vscode.commands.executeCommand("vscode.open", vscode.Uri.file(c));
          return;
        }
      }
      return;
    }
  }

  if (/^https?:\/\//i.test(href) || /^mailto:/i.test(href)) {
    await vscode.env.openExternal(vscode.Uri.parse(href));
    return;
  }

  // Handle file:// or relative file paths with optional #L10-L20 line fragments
  let rawPath = href;
  let fragment = "";
  const hashIdx = rawPath.indexOf("#");
  if (hashIdx !== -1) {
    fragment = rawPath.slice(hashIdx + 1);
    rawPath = rawPath.slice(0, hashIdx);
  }

  let targetFsPath = "";
  if (rawPath.startsWith("file://")) {
    try {
      targetFsPath = vscode.Uri.parse(rawPath).fsPath;
    } catch (_) {
      targetFsPath = decodeURIComponent(rawPath.replace(/^file:\/\//i, ""));
    }
  } else if (rawPath) {
    targetFsPath = path.resolve(path.dirname(currentInfo.realPath), decodeURIComponent(rawPath));
  } else {
    return;
  }

  if (!fs.existsSync(targetFsPath)) {
    // Also try resolving relative to the shortcut's directory
    const altPath = path.resolve(path.dirname(currentInfo.fsPath), decodeURIComponent(rawPath));
    if (fs.existsSync(altPath)) {
      targetFsPath = altPath;
    }
  }

  const targetUri = vscode.Uri.file(targetFsPath);
  const lineMatch = fragment.match(/^L(\d+)(?:-L?(\d+))?$/i);
  if (lineMatch) {
    const startLine = Math.max(0, parseInt(lineMatch[1], 10) - 1);
    const endLine = lineMatch[2] ? Math.max(startLine, parseInt(lineMatch[2], 10) - 1) : startLine;
    const doc = await vscode.workspace.openTextDocument(targetUri);
    const editor = await vscode.window.showTextDocument(doc);
    const range = new vscode.Range(startLine, 0, endLine, 999);
    editor.selection = new vscode.Selection(range.start, range.end);
    editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
    return;
  }

  if (SUPPORTED_DOC_EXT_RE.test(targetFsPath)) {
    await vscode.commands.executeCommand("vscode.openWith", targetUri, "antigravity.markdownReview");
  } else {
    await vscode.commands.executeCommand("vscode.open", targetUri);
  }
}

function resolveLocalAssetPath(rawSrc, baseDir, fallbackDir) {
  let decoded = rawSrc;
  try {
    decoded = decodeURIComponent(rawSrc.replace(/^file:\/\//i, ""));
  } catch (_) {}

  if (rawSrc.startsWith("file://")) {
    try {
      const parsed = vscode.Uri.parse(rawSrc).fsPath;
      if (fs.existsSync(parsed)) return parsed;
    } catch (_) {}
  }

  if (path.isAbsolute(decoded) && fs.existsSync(decoded)) {
    return decoded;
  }

  const relCleaned = decoded.replace(/^\/+/, "");
  const startDirs = [baseDir, fallbackDir].filter(Boolean);
  for (const startDir of startDirs) {
    // Check relative to startDir first
    const direct = path.resolve(startDir, decoded);
    if (fs.existsSync(direct)) return direct;

    // Walk up ancestor directories for root-relative paths like /assets/...
    let curr = startDir;
    while (curr && curr !== path.dirname(curr)) {
      const cand = path.join(curr, relCleaned);
      if (fs.existsSync(cand)) return cand;
      curr = path.dirname(curr);
    }
  }

  if (vscode.workspace.workspaceFolders) {
    for (const wf of vscode.workspace.workspaceFolders) {
      const cand = path.join(wf.uri.fsPath, relCleaned);
      if (fs.existsSync(cand)) return cand;
    }
  }

  return path.resolve(baseDir || "", relCleaned);
}

const IMAGE_DIM_CACHE = new Map();
const ASSET_CACHE_VERSION = Date.now();

function getImageDimensions(fsPath) {
  if (!fsPath) return null;
  try {
    const stat = fs.statSync(fsPath);
    if (!stat.isFile()) return null;
    const cacheKey = `${fsPath}:${stat.mtimeMs}:${stat.size}`;
    if (IMAGE_DIM_CACHE.has(cacheKey)) {
      return IMAGE_DIM_CACHE.get(cacheKey);
    }

    const ext = path.extname(fsPath).toLowerCase();
    let dims = null;

    if (ext === ".svg") {
      const fd = fs.openSync(fsPath, "r");
      const buf = Buffer.alloc(Math.min(2048, stat.size));
      fs.readSync(fd, buf, 0, buf.length, 0);
      fs.closeSync(fd);
      const head = buf.toString("utf8");
      const vbMatch = head.match(
        /\bviewBox=["']\s*[-+\d.]+\s+[-+\d.]+\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s*["']/i
      );
      if (vbMatch) {
        const w = Math.round(parseFloat(vbMatch[1]));
        const h = Math.round(parseFloat(vbMatch[2]));
        if (w > 0 && h > 0) dims = { width: w, height: h };
      } else {
        const wMatch = head.match(/\bwidth=["']\s*(\d+(?:\.\d+)?)(?:px)?\s*["']/i);
        const hMatch = head.match(/\bheight=["']\s*(\d+(?:\.\d+)?)(?:px)?\s*["']/i);
        if (wMatch && hMatch) {
          const w = Math.round(parseFloat(wMatch[1]));
          const h = Math.round(parseFloat(hMatch[1]));
          if (w > 0 && h > 0) dims = { width: w, height: h };
        }
      }
    } else {
      const fd = fs.openSync(fsPath, "r");
      const readLen = Math.min(32768, stat.size);
      const buf = Buffer.alloc(readLen);
      fs.readSync(fd, buf, 0, readLen, 0);
      fs.closeSync(fd);

      // PNG: 8-byte signature + IHDR chunk (width at 16, height at 20)
      if (
        readLen >= 24 &&
        buf[0] === 0x89 &&
        buf[1] === 0x50 &&
        buf[2] === 0x4e &&
        buf[3] === 0x47
      ) {
        const w = buf.readUInt32BE(16);
        const h = buf.readUInt32BE(20);
        if (w > 0 && h > 0) dims = { width: w, height: h };
      }
      // GIF: "GIF87a" or "GIF89a"
      else if (
        readLen >= 10 &&
        buf[0] === 0x47 &&
        buf[1] === 0x49 &&
        buf[2] === 0x46
      ) {
        const w = buf.readUInt16LE(6);
        const h = buf.readUInt16LE(8);
        if (w > 0 && h > 0) dims = { width: w, height: h };
      }
      // JPEG: 0xFFD8 followed by markers
      else if (readLen >= 4 && buf[0] === 0xff && buf[1] === 0xd8) {
        let offset = 2;
        while (offset + 9 < readLen) {
          if (buf[offset] !== 0xff) {
            offset += 1;
            continue;
          }
          const marker = buf[offset + 1];
          if (marker === 0xff) {
            offset += 1;
            continue;
          }
          if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
            offset += 2;
            continue;
          }
          const segLen = buf.readUInt16BE(offset + 2);
          if (segLen < 2) break;
          if (
            (marker >= 0xc0 && marker <= 0xc3) ||
            (marker >= 0xc5 && marker <= 0xc7) ||
            (marker >= 0xc9 && marker <= 0xcb) ||
            (marker >= 0xcd && marker <= 0xcf)
          ) {
            const h = buf.readUInt16BE(offset + 5);
            const w = buf.readUInt16BE(offset + 7);
            if (w > 0 && h > 0) dims = { width: w, height: h };
            break;
          }
          offset += 2 + segLen;
        }
      }
    }

    IMAGE_DIM_CACHE.set(cacheKey, dims);
    return dims;
  } catch (_) {
    return null;
  }
}

function rewriteLocalImageUris(html, webview, baseDir, fallbackDir) {
  return String(html || "").replace(
    /(<img\b[^>]*?\bsrc=["'])([^"']+)(["'][^>]*>)/gi,
    (full, prefix, src, suffix) => {
      // Remove any decoding="async" so Chromium's tile manager never paints blank
      // placeholders on scroll before async image decode completes.
      const cleanPrefix = prefix.replace(/\s*\bdecoding=["'][^"']*["']/gi, "");
      const cleanSuffix = suffix.replace(/\s*\bdecoding=["'][^"']*["']/gi, "");
      const syncPrefix = cleanPrefix.replace(/^<img\b/i, '<img decoding="sync"');
      if (/^(?:https?:|data:|vscode-webview-resource:)/i.test(src)) {
        const ghRawPrefix =
          "https://raw.githubusercontent.com/iamqazolp/antigravity-markdown-preview/main/";
        if (src.startsWith(ghRawPrefix)) {
          const relCandidate = src.slice(ghRawPrefix.length);
          const localCandidate = resolveLocalAssetPath(relCandidate, baseDir, fallbackDir);
          if (localCandidate && fs.existsSync(localCandidate)) {
            const dims = getImageDimensions(localCandidate);
            const hasDims = /\b(?:width|height)=["']/i.test(full);
            const dimAttrs =
              dims && !hasDims ? ` width="${dims.width}" height="${dims.height}"` : "";
            const withDimsPrefix = dimAttrs
              ? syncPrefix.replace(/^<img\b/i, `<img${dimAttrs}`)
              : syncPrefix;
            const webviewUri = webview.asWebviewUri(vscode.Uri.file(localCandidate));
            return `${withDimsPrefix}${webviewUri}${cleanSuffix}`;
          }
        }
        return `${syncPrefix}${src}${cleanSuffix}`;
      }
      const fsPath = resolveLocalAssetPath(src, baseDir, fallbackDir);
      const dims = getImageDimensions(fsPath);
      const hasDims = /\b(?:width|height)=["']/i.test(full);
      const dimAttrs =
        dims && !hasDims ? ` width="${dims.width}" height="${dims.height}"` : "";
      const withDimsPrefix = dimAttrs
        ? syncPrefix.replace(/^<img\b/i, `<img${dimAttrs}`)
        : syncPrefix;
      const webviewUri = webview.asWebviewUri(vscode.Uri.file(fsPath));
      return `${withDimsPrefix}${webviewUri}${cleanSuffix}`;
    }
  );
}

function shortenHome(p) {
  const home = os.homedir();
  return p.startsWith(home) ? "~" + p.slice(home.length) : p;
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function stripJsonc(raw) {
  let out = "";
  let inStr = false;
  let strQuote = '"';
  let i = 0;
  const len = raw.length;
  while (i < len) {
    const ch = raw[i];
    const next = raw[i + 1];
    if (inStr) {
      out += ch;
      if (ch === "\\" && i + 1 < len) {
        out += raw[i + 1];
        i += 2;
        continue;
      }
      if (ch === strQuote) {
        inStr = false;
      }
      i++;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inStr = true;
      strQuote = ch;
      out += ch;
      i++;
      continue;
    }
    if (ch === "/" && next === "/") {
      i += 2;
      while (i < len && raw[i] !== "\n") i++;
      continue;
    }
    if (ch === "/" && next === "*") {
      i += 2;
      while (i + 1 < len && !(raw[i] === "*" && raw[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    out += ch;
    i++;
  }
  return out.replace(/,\s*([}\]])/g, "$1");
}

function loadThemeJsonRecursive(themeFilePath, visited = new Set()) {
  if (!themeFilePath || visited.has(themeFilePath) || !fs.existsSync(themeFilePath)) {
    return { colors: {}, semanticTokenColors: {}, tokenColors: [] };
  }
  visited.add(themeFilePath);
  try {
    const raw = fs.readFileSync(themeFilePath, "utf8");
    const parsed = JSON.parse(stripJsonc(raw));
    let base = { colors: {}, semanticTokenColors: {}, tokenColors: [] };
    if (typeof parsed.include === "string" && parsed.include.trim()) {
      const includePath = path.resolve(path.dirname(themeFilePath), parsed.include.trim());
      base = loadThemeJsonRecursive(includePath, visited);
    }
    return {
      colors: Object.assign({}, base.colors, parsed.colors || {}),
      semanticTokenColors: Object.assign(
        {},
        base.semanticTokenColors,
        parsed.semanticTokenColors || {}
      ),
      tokenColors: []
        .concat(Array.isArray(base.tokenColors) ? base.tokenColors : [])
        .concat(Array.isArray(parsed.tokenColors) ? parsed.tokenColors : [])
    };
  } catch (_) {
    return { colors: {}, semanticTokenColors: {}, tokenColors: [] };
  }
}

function findThemeFileByName(themeName) {
  if (!themeName || typeof themeName !== "string") return null;
  const target = themeName.trim().toLowerCase();

  const matchThemeEntry = (extPath, themes) => {
    if (!Array.isArray(themes)) return null;
    for (const t of themes) {
      if (!t || typeof t.path !== "string") continue;
      const id = String(t.id || "").trim().toLowerCase();
      const label = String(t.label || "").trim().toLowerCase();
      if (id === target || label === target) {
        const full = path.resolve(extPath, t.path);
        if (fs.existsSync(full)) return full;
      }
    }
    return null;
  };

  if (vscode.extensions && Array.isArray(vscode.extensions.all)) {
    for (const ext of vscode.extensions.all) {
      const pkg = ext && ext.packageJSON;
      const themes = pkg && pkg.contributes && pkg.contributes.themes;
      const found = matchThemeEntry(ext.extensionPath, themes);
      if (found) return found;
    }
  }

  const extDirs = [
    path.join(os.homedir(), ".vscode", "extensions"),
    path.join(os.homedir(), ".antigravity", "extensions")
  ];
  for (const dir of extDirs) {
    try {
      if (!fs.existsSync(dir)) continue;
      for (const entry of fs.readdirSync(dir)) {
        const extPath = path.join(dir, entry);
        const pkgPath = path.join(extPath, "package.json");
        if (!fs.existsSync(pkgPath)) continue;
        try {
          const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
          const found = matchThemeEntry(extPath, pkg.contributes && pkg.contributes.themes);
          if (found) return found;
        } catch (_) {}
      }
    } catch (_) {}
  }
  return null;
}

function isValidCssColor(val) {
  if (typeof val !== "string") return false;
  const s = val.trim();
  return /^#[0-9a-fA-F]{3,8}$/.test(s);
}

function extractSemanticOrScopeColor(themeData, semanticKeys, textmateScopes) {
  const sem = (themeData && themeData.semanticTokenColors) || {};
  for (const key of semanticKeys) {
    const entry = sem[key];
    if (!entry) continue;
    if (typeof entry === "string" && isValidCssColor(entry)) {
      return entry.trim();
    }
    if (entry && typeof entry === "object" && isValidCssColor(entry.foreground)) {
      return entry.foreground.trim();
    }
  }

  const rules = (themeData && Array.isArray(themeData.tokenColors) && themeData.tokenColors) || [];
  for (const targetScope of textmateScopes) {
    for (let i = rules.length - 1; i >= 0; i--) {
      const rule = rules[i];
      const fg = rule && rule.settings && rule.settings.foreground;
      if (!isValidCssColor(fg)) continue;
      const rawScope = rule.scope;
      const scopes = Array.isArray(rawScope)
        ? rawScope
        : typeof rawScope === "string"
        ? rawScope.split(",").map((s) => s.trim())
        : [];
      if (scopes.includes(targetScope)) {
        return fg.trim();
      }
    }
  }

  for (const targetScope of textmateScopes) {
    for (let i = rules.length - 1; i >= 0; i--) {
      const rule = rules[i];
      const fg = rule && rule.settings && rule.settings.foreground;
      if (!isValidCssColor(fg)) continue;
      const rawScope = rule.scope;
      const scopes = Array.isArray(rawScope)
        ? rawScope
        : typeof rawScope === "string"
        ? rawScope.split(",").map((s) => s.trim())
        : [];
      if (
        scopes.some(
          (s) =>
            s === targetScope ||
            targetScope.startsWith(s + ".") ||
            s.startsWith(targetScope + ".")
        )
      ) {
        return fg.trim();
      }
    }
  }

  return null;
}

function buildThemeOverrideCss() {
  const agyCfg = vscode.workspace.getConfiguration("agyMarkdown");
  if (!agyCfg.get("useThemePalette", true)) {
    return "";
  }

  const workbenchCfg = vscode.workspace.getConfiguration("workbench");
  const themeName = workbenchCfg.get("colorTheme") || "";
  const themeFile = findThemeFileByName(themeName);
  const themeData = themeFile
    ? loadThemeJsonRecursive(themeFile)
    : { colors: {}, semanticTokenColors: {}, tokenColors: [] };

  const colorCustomizations = workbenchCfg.get("colorCustomizations") || {};
  if (colorCustomizations && typeof colorCustomizations === "object") {
    for (const [k, v] of Object.entries(colorCustomizations)) {
      if (typeof v === "string") {
        themeData.colors[k] = v;
      }
    }
    const perTheme = colorCustomizations[`[${themeName}]`];
    if (perTheme && typeof perTheme === "object") {
      Object.assign(themeData.colors, perTheme);
    }
  }

  const editorCfg = vscode.workspace.getConfiguration("editor");
  const semCustom = editorCfg.get("semanticTokenColorCustomizations") || {};
  if (semCustom && typeof semCustom === "object") {
    if (semCustom.rules && typeof semCustom.rules === "object") {
      Object.assign(themeData.semanticTokenColors, semCustom.rules);
    }
    const perThemeSem = semCustom[`[${themeName}]`];
    if (perThemeSem && perThemeSem.rules && typeof perThemeSem.rules === "object") {
      Object.assign(themeData.semanticTokenColors, perThemeSem.rules);
    }
  }

  const vars = [];
  const addVar = (name, value) => {
    if (value && isValidCssColor(value)) {
      vars.push(`  ${name}: ${value};`);
    }
  };

  addVar(
    "--agy-syn-keyword",
    extractSemanticOrScopeColor(
      themeData,
      ["keyword", "keyword.control", "storage", "modifier"],
      ["keyword", "keyword.control", "storage.type", "storage.modifier"]
    )
  );
  addVar(
    "--agy-syn-function",
    extractSemanticOrScopeColor(
      themeData,
      ["function", "method", "member", "function.declaration"],
      ["entity.name.function", "support.function", "meta.function-call"]
    )
  );
  addVar(
    "--agy-syn-type",
    extractSemanticOrScopeColor(
      themeData,
      ["class", "type", "interface", "enum", "struct", "namespace", "typeParameter"],
      ["entity.name.type", "entity.name.class", "support.class", "support.type"]
    )
  );
  addVar(
    "--agy-syn-string",
    extractSemanticOrScopeColor(
      themeData,
      ["string"],
      ["string", "string.quoted", "string.quoted.single", "string.quoted.double"]
    )
  );
  addVar(
    "--agy-syn-number",
    extractSemanticOrScopeColor(
      themeData,
      ["number", "enumMember", "boolean"],
      ["constant.numeric", "constant.language", "constant.character"]
    )
  );
  addVar(
    "--agy-syn-param",
    extractSemanticOrScopeColor(
      themeData,
      ["parameter", "variable.parameter", "variable.readonly", "variable.defaultLibrary"],
      ["variable.parameter", "variable.other.constant", "variable.language"]
    )
  );
  addVar(
    "--agy-syn-attr",
    extractSemanticOrScopeColor(
      themeData,
      ["property", "variable.other.property", "property.declaration"],
      [
        "support.type.property-name",
        "entity.other.attribute-name",
        "variable.other.property",
        "meta.object-literal.key"
      ]
    )
  );
  addVar(
    "--agy-syn-meta",
    extractSemanticOrScopeColor(
      themeData,
      ["decorator", "macro", "annotation"],
      [
        "meta.decorator",
        "entity.name.function.decorator",
        "punctuation.definition.decorator",
        "meta.preprocessor"
      ]
    )
  );
  addVar(
    "--agy-syn-comment",
    extractSemanticOrScopeColor(
      themeData,
      ["comment"],
      ["comment", "comment.line", "comment.block", "punctuation.definition.comment"]
    )
  );
  addVar(
    "--agy-syn-punct",
    extractSemanticOrScopeColor(
      themeData,
      ["operator", "punctuation"],
      ["keyword.operator", "punctuation", "punctuation.separator"]
    )
  );
  addVar(
    "--agy-code-fg",
    extractSemanticOrScopeColor(
      themeData,
      ["variable.readonly", "enumMember", "macro", "number"],
      ["markup.inline.raw", "constant.other", "variable.other.constant", "constant.numeric"]
    )
  );

  const colors = themeData.colors || {};
  const wellBg =
    colors["notebook.cellEditorBackground"] ||
    colors["sideBar.background"] ||
    colors["panel.background"];
  const sideBg =
    colors["sideBar.background"] ||
    colors["panel.background"] ||
    colors["editorWidget.background"];
  const lineHlBg = colors["editor.lineHighlightBackground"];
  const focusBorder = colors["focusBorder"] || colors["editor.selectionBorder"];

  addVar("--agy-theme-well", wellBg);
  addVar("--agy-theme-sidebar", sideBg);
  addVar("--agy-code-hl-line-bg", lineHlBg);
  addVar("--agy-code-hl-line-border", focusBorder);

  if (vars.length === 0) return "";
  return `:root,\nbody.vscode-light,\nbody.vscode-dark,\nbody.vscode-body,\nbody.agy-review-body.vscode-light,\nbody.agy-review-body.vscode-dark,\n.markdown-preview.markdown-preview {\n${vars.join("\n")}\n}`;
}

function findChromiumExecutable() {
  const candidates = [];
  if (process.platform === "darwin") {
    candidates.push(
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
      "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
      path.join(os.homedir(), "Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
    );
  } else if (process.platform === "win32") {
    const pf = process.env["PROGRAMFILES"] || "C:\\Program Files";
    const pf86 = process.env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)";
    const localAppData = process.env["LOCALAPPDATA"] || "";
    candidates.push(
      path.join(pf, "Google\\Chrome\\Application\\chrome.exe"),
      path.join(pf86, "Google\\Chrome\\Application\\chrome.exe"),
      path.join(pf, "Microsoft\\Edge\\Application\\msedge.exe"),
      path.join(pf86, "Microsoft\\Edge\\Application\\msedge.exe"),
      path.join(pf, "BraveSoftware\\Brave-Browser\\Application\\brave.exe")
    );
    if (localAppData) {
      candidates.push(path.join(localAppData, "Google\\Chrome\\Application\\chrome.exe"));
    }
  } else {
    candidates.push(
      "/usr/bin/google-chrome",
      "/usr/bin/google-chrome-stable",
      "/usr/bin/chromium",
      "/usr/bin/chromium-browser",
      "/usr/bin/microsoft-edge",
      "/usr/bin/brave-browser",
      "/snap/bin/chromium"
    );
  }
  for (const bin of candidates) {
    try {
      if (bin && fs.existsSync(bin)) return bin;
    } catch (_) {}
  }
  return null;
}

function rewriteLocalImageUrisForPdf(html, baseDir, fallbackDir) {
  return String(html || "").replace(
    /(<img\b[^>]*?\bsrc=["'])([^"']+)(["'][^>]*>)/gi,
    (full, prefix, src, suffix) => {
      const cleanPrefix = prefix.replace(/\s*\bdecoding=["'][^"']*["']/gi, "");
      const cleanSuffix = suffix.replace(/\s*\bdecoding=["'][^"']*["']/gi, "");
      const syncPrefix = cleanPrefix.replace(/^<img\b/i, '<img decoding="sync"');
      if (/^(?:https?:|data:|file:)/i.test(src)) {
        const ghRawPrefix =
          "https://raw.githubusercontent.com/iamqazolp/antigravity-markdown-preview/main/";
        if (src.startsWith(ghRawPrefix)) {
          const relCandidate = src.slice(ghRawPrefix.length);
          const localCandidate = resolveLocalAssetPath(relCandidate, baseDir, fallbackDir);
          if (localCandidate && fs.existsSync(localCandidate)) {
            const fileUrl = vscode.Uri.file(localCandidate).toString();
            return `${syncPrefix}${fileUrl}${cleanSuffix}`;
          }
        }
        return `${syncPrefix}${src}${cleanSuffix}`;
      }
      const fsPath = resolveLocalAssetPath(src, baseDir, fallbackDir);
      const fileUrl = vscode.Uri.file(fsPath).toString();
      return `${syncPrefix}${fileUrl}${cleanSuffix}`;
    }
  );
}

function buildStandaloneThemeVarsCss(isLightTheme, computedVars) {
  const workbenchCfg = vscode.workspace.getConfiguration("workbench");
  const themeName = workbenchCfg.get("colorTheme") || "";
  const themeFile = findThemeFileByName(themeName);
  const themeData = themeFile
    ? loadThemeJsonRecursive(themeFile)
    : { colors: {}, semanticTokenColors: {}, tokenColors: [] };
  const colors = Object.assign({}, themeData.colors || {});

  const colorCustomizations = workbenchCfg.get("colorCustomizations") || {};
  if (colorCustomizations && typeof colorCustomizations === "object") {
    for (const [k, v] of Object.entries(colorCustomizations)) {
      if (typeof v === "string") colors[k] = v;
    }
    const perTheme = colorCustomizations[`[${themeName}]`];
    if (perTheme && typeof perTheme === "object") {
      Object.assign(colors, perTheme);
    }
  }

  const lines = [];
  const addCssVar = (name, val) => {
    if (typeof val === "string" && val.trim()) {
      lines.push(`  ${name}: ${val.trim()} !important;`);
    }
  };

  const edBg = colors["editor.background"] || (isLightTheme ? "#ffffff" : "#18181b");
  const edFg = colors["editor.foreground"] || (isLightTheme ? "#09090b" : "#f4f4f5");
  const cellBg =
    colors["notebook.cellEditorBackground"] ||
    colors["sideBar.background"] ||
    colors["panel.background"] ||
    edBg;
  const sideBg =
    colors["sideBar.background"] ||
    colors["panel.background"] ||
    colors["editorWidget.background"] ||
    edBg;
  const cellBorder =
    colors["notebook.cellBorderColor"] ||
    colors["sideBar.border"] ||
    colors["panel.border"] ||
    (isLightTheme ? "#d4d4d8" : "#27272a");

  addCssVar("--vscode-editor-background", edBg);
  addCssVar("--vscode-editor-foreground", edFg);
  addCssVar("--vscode-notebook-cellEditorBackground", cellBg);
  addCssVar("--vscode-sideBar-background", sideBg);
  addCssVar("--vscode-panel-background", colors["panel.background"] || sideBg);
  addCssVar("--vscode-notebook-cellBorderColor", cellBorder);
  addCssVar("--vscode-sideBar-border", colors["sideBar.border"] || cellBorder);
  addCssVar("--agy-bg", edBg);
  addCssVar("--agy-fg", edFg);
  addCssVar("--agy-heading", edFg);
  addCssVar("--agy-theme-well", cellBg);
  addCssVar("--agy-theme-sidebar", sideBg);

  if (computedVars && typeof computedVars === "object") {
    for (const [k, v] of Object.entries(computedVars)) {
      if (k.startsWith("--agy-") && typeof v === "string" && v.trim()) {
        addCssVar(k, v);
      }
    }
  }

  return `:root,\nbody.agy-review-body,\nbody.agy-pdf-themed {\n${lines.join("\n")}\n}`;
}

async function exportMarkdownToPdf({ info, extensionPath, mode = "ask", computedVars = null }) {
  let effectiveMode = mode;
  if (effectiveMode !== "themed" && effectiveMode !== "unthemed") {
    const picked = await vscode.window.showQuickPick(
      [
        {
          label: "$(symbol-color) Themed PDF (Active VS Code Theme)",
          description: "Full-bleed theme background, surface tints & syntax colors",
          mode: "themed"
        },
        {
          label: "$(file-pdf) Unthemed PDF (Clean Print White)",
          description: "Standard white background & high-contrast print palette",
          mode: "unthemed"
        }
      ],
      {
        placeHolder: "Choose PDF export style"
      }
    );
    if (!picked) return;
    effectiveMode = picked.mode;
  }

  const defaultPdfPath = info.fsPath.replace(SUPPORTED_DOC_EXT_RE, "") + ".pdf";
  const saveUri = await vscode.window.showSaveDialog({
    defaultUri: vscode.Uri.file(defaultPdfPath),
    filters: { "PDF Document": ["pdf"] },
    saveLabel: effectiveMode === "themed" ? "Export Themed PDF" : "Export Unthemed PDF"
  });
  if (!saveUri) return;

  const targetPdfPath = saveUri.fsPath;

  let rawText = "";
  try {
    rawText = fs.readFileSync(info.realPath, "utf8");
  } catch (_) {
    try {
      rawText = fs.readFileSync(info.fsPath, "utf8");
    } catch (_) {
      vscode.window.showErrorMessage(`Unable to read document file: ${info.fsPath}`);
      return;
    }
  }

  const themeKind = vscode.window.activeColorTheme
    ? vscode.window.activeColorTheme.kind
    : vscode.ColorThemeKind.Dark;
  const isLightTheme =
    themeKind === vscode.ColorThemeKind.Light ||
    themeKind === vscode.ColorThemeKind.HighContrastLight;

  let renderedHtml = "";
  try {
    renderedHtml = await renderDocumentContent(rawText, info, {
      webview: null,
      forExport: true,
      exportType: "pdf"
    });
  } catch (_) {
    renderedHtml = `<pre>${escapeHtml(rawText)}</pre>`;
  }

  renderedHtml = rewriteLocalImageUrisForPdf(
    renderedHtml,
    path.dirname(info.realPath),
    path.dirname(info.fsPath)
  );
  renderedHtml = renderedHtml.replace(/<details\b(?![^>]*\bopen\b)/gi, "<details open");

  const katexCssFileUrl = vscode.Uri.file(
    path.join(extensionPath, "media", "katex.min.css")
  ).toString();
  const cssFileUrl = vscode.Uri.file(
    path.join(extensionPath, "media", "antigravity-markdown.css")
  ).toString();
  const mermaidJsFileUrl = vscode.Uri.file(
    path.join(extensionPath, "media", "mermaid.min.js")
  ).toString();
  const jsFileUrl = vscode.Uri.file(
    path.join(extensionPath, "media", "antigravity-markdown.js")
  ).toString();

  const isThemed = effectiveMode === "themed";
  const bodyThemeClass = isThemed
    ? `${isLightTheme ? "vscode-light" : "vscode-dark"} agy-pdf-themed`
    : "vscode-light agy-pdf-unthemed";
  const themeCss = isThemed ? buildThemeOverrideCss() : "";
  const standaloneVarsCss = isThemed
    ? buildStandaloneThemeVarsCss(isLightTheme, computedVars)
    : "";

  const pdfLayoutCss = isThemed
    ? `@page { size: A4; margin: 0; }
html, body {
  background-color: var(--agy-bg) !important;
  color: var(--agy-fg) !important;
  -webkit-print-color-adjust: exact !important;
  print-color-adjust: exact !important;
  margin: 0 !important;
  padding: 0 !important;
}
.agy-pdf-page-bg {
  position: fixed;
  inset: 0;
  width: 100vw;
  height: 100vh;
  background-color: var(--agy-bg) !important;
  z-index: -1;
  pointer-events: none;
}
table.mtable.agy-pdf-frame {
  width: 100% !important;
  border-collapse: collapse !important;
  border: none !important;
  margin: 0 !important;
  background: transparent !important;
}
table.mtable.agy-pdf-frame > thead > tr > td,
table.mtable.agy-pdf-frame > tbody > tr > td,
table.mtable.agy-pdf-frame > tfoot > tr > td {
  padding: 0 15mm !important;
  border: none !important;
  background: transparent !important;
}
.agy-pdf-spacer {
  height: 13mm;
}
.agy-review-container {
  max-width: 100% !important;
  padding: 0 !important;
  margin: 0 !important;
}
.agy-carousel-controls, .agy-copy-btn {
  display: none !important;
}
.agy-carousel-slide {
  display: block !important;
}`
    : `@page { size: A4; margin: 13mm 15mm; }
html, body {
  background-color: #ffffff !important;
  color: #1e293b !important;
  -webkit-print-color-adjust: exact !important;
  print-color-adjust: exact !important;
  margin: 0 !important;
  padding: 0 !important;
}
.agy-review-container {
  max-width: 100% !important;
  padding: 0 !important;
  margin: 0 !important;
}
.agy-carousel-controls, .agy-copy-btn {
  display: none !important;
}
.agy-carousel-slide {
  display: block !important;
}`;

  const bodyInner = isThemed
    ? `<div class="agy-pdf-page-bg"></div>
  <table class="mtable agy-pdf-frame">
    <thead><tr><td><div class="agy-pdf-spacer"></div></td></tr></thead>
    <tbody><tr><td><main class="agy-review-container" id="agy-content">${renderedHtml}</main></td></tr></tbody>
    <tfoot><tr><td><div class="agy-pdf-spacer"></div></td></tr></tfoot>
  </table>`
    : `<main class="agy-review-container" id="agy-content">${renderedHtml}</main>`;

  const docTitle = formatDocumentTitle(info.fsPath, rawText);
  const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <link rel="stylesheet" href="${katexCssFileUrl}" />
  <link rel="stylesheet" href="${cssFileUrl}" />
  <style id="agy-theme-palette">${themeCss}</style>
  <style id="agy-pdf-vars">${standaloneVarsCss}</style>
  <style id="agy-pdf-layout">${pdfLayoutCss}</style>
  <title>${escapeHtml(docTitle)}</title>
</head>
<body class="agy-review-body ${bodyThemeClass}">
  ${bodyInner}
  <script src="${mermaidJsFileUrl}"></script>
  <script src="${jsFileUrl}"></script>
</body>
</html>`;

  const tempHtmlPath = path.join(
    os.tmpdir(),
    `agy-pdf-export-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.html`
  );
  fs.writeFileSync(tempHtmlPath, fullHtml, "utf8");
  const tempHtmlUrl = vscode.Uri.file(tempHtmlPath).toString();

  const chromeBin = findChromiumExecutable();
  if (!chromeBin) {
    await vscode.env.openExternal(vscode.Uri.file(tempHtmlPath));
    vscode.window.showInformationMessage(
      "Opened print-ready Markdown view in your browser (press Cmd+P / Ctrl+P to Save as PDF)."
    );
    return;
  }

  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Antigravity: Exporting ${isThemed ? "Themed" : "Unthemed"} PDF…`,
        cancellable: false
      },
      () =>
        new Promise((resolve, reject) => {
          execFile(
            chromeBin,
            [
              "--headless",
              "--disable-gpu",
              "--no-pdf-header-footer",
              `--print-to-pdf=${targetPdfPath}`,
              tempHtmlUrl
            ],
            { timeout: 30000 },
            (err) => {
              if (err && !fs.existsSync(targetPdfPath)) {
                reject(err);
              } else {
                resolve();
              }
            }
          );
        })
    );

    try {
      fs.unlinkSync(tempHtmlPath);
    } catch (_) {}

    const action = await vscode.window.showInformationMessage(
      `Exported ${isThemed ? "Themed" : "Unthemed"} PDF: ${path.basename(targetPdfPath)}`,
      "Open PDF",
      "Reveal in Finder"
    );
    if (action === "Open PDF") {
      await vscode.env.openExternal(vscode.Uri.file(targetPdfPath));
    } else if (action === "Reveal in Finder") {
      await vscode.commands.executeCommand("revealFileInOS", vscode.Uri.file(targetPdfPath));
    }
  } catch (err) {
    try {
      fs.unlinkSync(tempHtmlPath);
    } catch (_) {}
    vscode.window.showErrorMessage(`PDF export failed: ${err && err.message ? err.message : err}`);
  }
}

function getMimeTypeForImageExt(filePath) {
  const ext = path.extname(String(filePath || "")).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".gif") return "image/gif";
  if (ext === ".webp") return "image/webp";
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".avif") return "image/avif";
  return "application/octet-stream";
}

function embedLocalImagesAsDataUris(html, baseDir, fallbackDir) {
  return String(html || "").replace(
    /(<img\b[^>]*?\bsrc=["'])([^"']+)(["'][^>]*>)/gi,
    (full, prefix, src, suffix) => {
      if (/^data:/i.test(src)) return full;
      let candidatePath = null;
      if (/^https?:/i.test(src)) {
        const ghRawPrefix =
          "https://raw.githubusercontent.com/iamqazolp/antigravity-markdown-preview/main/";
        if (src.startsWith(ghRawPrefix)) {
          const relCandidate = src.slice(ghRawPrefix.length);
          candidatePath = resolveLocalAssetPath(relCandidate, baseDir, fallbackDir);
        } else {
          return full;
        }
      } else if (/^file:\/\//i.test(src)) {
        try {
          candidatePath = vscode.Uri.parse(src).fsPath;
        } catch (_) {}
      } else {
        candidatePath = resolveLocalAssetPath(src, baseDir, fallbackDir);
      }
      if (candidatePath && fs.existsSync(candidatePath)) {
        try {
          const buf = fs.readFileSync(candidatePath);
          const mime = getMimeTypeForImageExt(candidatePath);
          const dataUri = `data:${mime};base64,${buf.toString("base64")}`;
          return `${prefix}${dataUri}${suffix}`;
        } catch (_) {}
      }
      return full;
    }
  );
}

async function exportMarkdownToHtml({ info, extensionPath, mode = "ask", computedVars = null }) {
  let effectiveMode = mode;
  if (effectiveMode !== "themed" && effectiveMode !== "unthemed") {
    const picked = await vscode.window.showQuickPick(
      [
        {
          label: "$(symbol-color) Themed HTML (Active VS Code Theme)",
          description: "Self-contained interactive HTML with active theme background & syntax palette",
          mode: "themed"
        },
        {
          label: "$(globe) Unthemed HTML (Clean Light)",
          description: "Self-contained interactive HTML with clean light theme",
          mode: "unthemed"
        }
      ],
      {
        placeHolder: "Choose Standalone HTML export style"
      }
    );
    if (!picked) return;
    effectiveMode = picked.mode;
  }

  const baseWithoutExt = info.fsPath.replace(SUPPORTED_DOC_EXT_RE, "");
  const defaultHtmlPath = /\.html?$/i.test(info.fsPath)
    ? `${baseWithoutExt}.standalone.html`
    : `${baseWithoutExt}.html`;
  const saveUri = await vscode.window.showSaveDialog({
    defaultUri: vscode.Uri.file(defaultHtmlPath),
    filters: { "HTML Document": ["html"] },
    saveLabel: effectiveMode === "themed" ? "Export Themed HTML" : "Export Unthemed HTML"
  });
  if (!saveUri) return;

  const targetHtmlPath = saveUri.fsPath;

  let rawText = "";
  try {
    rawText = fs.readFileSync(info.realPath, "utf8");
  } catch (_) {
    try {
      rawText = fs.readFileSync(info.fsPath, "utf8");
    } catch (_) {
      vscode.window.showErrorMessage(`Unable to read document file: ${info.fsPath}`);
      return;
    }
  }

  const themeKind = vscode.window.activeColorTheme
    ? vscode.window.activeColorTheme.kind
    : vscode.ColorThemeKind.Dark;
  const isLightTheme =
    themeKind === vscode.ColorThemeKind.Light ||
    themeKind === vscode.ColorThemeKind.HighContrastLight;

  let renderedHtml = "";
  try {
    renderedHtml = await renderDocumentContent(rawText, info, {
      webview: null,
      forExport: true,
      exportType: "html"
    });
  } catch (_) {
    renderedHtml = `<pre>${escapeHtml(rawText)}</pre>`;
  }

  renderedHtml = embedLocalImagesAsDataUris(
    renderedHtml,
    path.dirname(info.realPath),
    path.dirname(info.fsPath)
  );

  let katexCssRaw = "";
  let mainCssRaw = "";
  let mermaidJsRaw = "";
  let mainJsRaw = "";
  try {
    katexCssRaw = fs.readFileSync(path.join(extensionPath, "media", "katex.min.css"), "utf8");
  } catch (_) {}
  try {
    mainCssRaw = fs.readFileSync(
      path.join(extensionPath, "media", "antigravity-markdown.css"),
      "utf8"
    );
  } catch (_) {}
  try {
    mermaidJsRaw = fs.readFileSync(
      path.join(extensionPath, "media", "mermaid.min.js"),
      "utf8"
    );
  } catch (_) {}
  try {
    mainJsRaw = fs.readFileSync(
      path.join(extensionPath, "media", "antigravity-markdown.js"),
      "utf8"
    );
  } catch (_) {}

  const isThemed = effectiveMode === "themed";
  const bodyThemeClass = isThemed
    ? `${isLightTheme ? "vscode-light" : "vscode-dark"} agy-pdf-themed`
    : "vscode-light agy-pdf-unthemed";
  const themeCss = isThemed ? buildThemeOverrideCss() : "";
  const standaloneVarsCss = isThemed
    ? buildStandaloneThemeVarsCss(isLightTheme, computedVars)
    : `body.agy-review-body { --agy-bg: #ffffff !important; --agy-fg: #1e293b !important; background-color: #ffffff !important; color: #1e293b !important; }`;

  const docTitle = formatDocumentTitle(info.fsPath, rawText);
  const fmtInfo = (info && info.format) || detectDocumentFormat(info.realPath || info.fsPath);
  const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(docTitle)} — Antigravity Document Preview</title>
  <style id="agy-katex-css">${katexCssRaw}</style>
  <style id="agy-main-css">${mainCssRaw}</style>
  <style id="agy-theme-palette">${themeCss}</style>
  <style id="agy-standalone-vars">${standaloneVarsCss}</style>
</head>
<body class="agy-review-body ${bodyThemeClass}" data-real-path="${escapeHtml(info.realPath)}">
  <div class="agy-toolbar">
    <div class="agy-toolbar-left">
      <span class="agy-format-badge" data-format="${escapeHtml(fmtInfo.id)}">${escapeHtml(fmtInfo.badge)}</span>
      <span class="agy-doc-title agy-filepath" data-server-title="1" title="${escapeHtml(info.realPath)}">${escapeHtml(docTitle)}</span>
      <span class="agy-doc-filename">${escapeHtml(path.basename(info.realPath || info.fsPath))}</span>
    </div>
    <div class="agy-toolbar-actions">
      <button type="button" class="agy-btn agy-btn-subtle" id="btn-toc" title="Toggle Table of Contents / Document Outline" aria-pressed="false">Outline</button>
    </div>
  </div>
  <main class="agy-review-container" id="agy-content">
    ${renderedHtml}
  </main>
  <script>${mermaidJsRaw.replace(/<\/script>/gi, "<\\/script>")}</script>
  <script>${mainJsRaw.replace(/<\/script>/gi, "<\\/script>")}</script>
</body>
</html>`;

  try {
    fs.writeFileSync(targetHtmlPath, fullHtml, "utf8");
    const action = await vscode.window.showInformationMessage(
      `Exported ${isThemed ? "Themed" : "Unthemed"} HTML: ${path.basename(targetHtmlPath)}`,
      "Open in Browser",
      "Reveal in Finder"
    );
    if (action === "Open in Browser") {
      await vscode.env.openExternal(vscode.Uri.file(targetHtmlPath));
    } else if (action === "Reveal in Finder") {
      await vscode.commands.executeCommand("revealFileInOS", vscode.Uri.file(targetHtmlPath));
    }
  } catch (err) {
    vscode.window.showErrorMessage(`HTML export failed: ${err && err.message ? err.message : err}`);
  }
}

async function toggleTaskCheckboxInDocument(document, info, msg) {
  const checked = Boolean(msg && msg.checked);
  const hintLine = typeof msg.line === "number" && !Number.isNaN(msg.line) ? msg.line : -1;
  const taskLineRe = /^(\s*(?:[-*+]|\d+[.)])\s+\[)[ xX](\]\s*.*)$/;

  const totalLines = document.lineCount;
  let targetLineIdx = -1;

  if (hintLine >= 0 && hintLine < totalLines) {
    const candidate = document.lineAt(hintLine).text;
    if (taskLineRe.test(candidate)) {
      targetLineIdx = hintLine;
    } else {
      for (let offset = 1; offset <= 8; offset++) {
        if (hintLine + offset < totalLines && taskLineRe.test(document.lineAt(hintLine + offset).text)) {
          targetLineIdx = hintLine + offset;
          break;
        }
        if (hintLine - offset >= 0 && taskLineRe.test(document.lineAt(hintLine - offset).text)) {
          targetLineIdx = hintLine - offset;
          break;
        }
      }
    }
  }

  if (targetLineIdx < 0 && msg && typeof msg.taskText === "string" && msg.taskText.trim()) {
    const needle = msg.taskText.trim().slice(0, 48).toLowerCase();
    for (let i = 0; i < totalLines; i++) {
      const txt = document.lineAt(i).text;
      if (taskLineRe.test(txt) && txt.toLowerCase().includes(needle)) {
        targetLineIdx = i;
        break;
      }
    }
  }

  if (targetLineIdx < 0) return;

  const lineObj = document.lineAt(targetLineIdx);
  const newText = lineObj.text.replace(taskLineRe, `$1${checked ? "x" : " "}$2`);
  if (newText === lineObj.text) return;

  const wasDirty = document.isDirty;
  const edit = new vscode.WorkspaceEdit();
  edit.replace(document.uri, lineObj.range, newText);
  const applied = await vscode.workspace.applyEdit(edit);
  if (applied && !wasDirty) {
    try {
      await document.save();
    } catch (_) {}
  }
}

function buildWebviewHtml({
  cssUri,
  katexCssUri,
  mermaidJsUri,
  jsUri,
  renderedHtml,
  displayPath,
  realFilePath = "",
  docTitle,
  formatInfo = null,
  isBrainArtifact,
  isSymlink,
  isLightTheme,
  themeCss = "",
  syncScrollEnabled = true,
  isSplitOpen = false,
  initialLine = 0
}) {
  const effectiveTitle = docTitle || formatDocumentTitle(displayPath);
  const fmt = formatInfo || detectDocumentFormat(realFilePath || displayPath);
  const fileBaseName = path.basename(String(realFilePath || displayPath || ""));
  const nativeMenuItem = isBrainArtifact
    ? `<button type="button" class="agy-menu-item" id="btn-native" title="Open in Native Antigravity Artifact Viewer"><span>Native Artifact Viewer ↗</span></button>`
    : "";
  const themeClass = isLightTheme ? "vscode-light" : "vscode-dark";
  const syncActiveClass = syncScrollEnabled ? " agy-btn-active" : "";
  const splitActiveClass = isSplitOpen ? " agy-btn-active" : "";
  const syncInlineHiddenClass = isSplitOpen ? "" : " agy-hidden";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="stylesheet" href="${katexCssUri}" />
  <link rel="stylesheet" href="${cssUri}?v=${ASSET_CACHE_VERSION}" />
  <style id="agy-theme-palette">${themeCss || ""}</style>
  <title>Antigravity Document Preview</title>
</head>
<body class="agy-review-body ${themeClass}" data-real-path="${escapeHtml(realFilePath || displayPath)}" data-format="${escapeHtml(fmt.id)}">
  <div class="agy-toolbar">
    <div class="agy-toolbar-left">
      <span class="agy-format-badge" id="agy-format-badge" data-format="${escapeHtml(fmt.id)}" title="${escapeHtml(fmt.label || fmt.badge)}">${escapeHtml(fmt.badge)}</span>
      <span class="agy-doc-title agy-filepath" data-server-title="1" title="${escapeHtml(displayPath)}">${escapeHtml(effectiveTitle)}</span>
      <span class="agy-doc-filename" id="agy-doc-filename" title="${escapeHtml(displayPath)}">${escapeHtml(fileBaseName)}</span>
    </div>
    <div class="agy-toolbar-actions">
      <button type="button" class="agy-btn agy-btn-subtle${syncActiveClass}${syncInlineHiddenClass}" id="btn-sync-inline" title="Toggle synchronized scrolling between raw source and preview" aria-pressed="${syncScrollEnabled ? "true" : "false"}">⇅ Sync</button>
      <button type="button" class="agy-btn agy-btn-subtle" id="btn-toc" title="Toggle Table of Contents / Document Outline" aria-pressed="false">Outline</button>
      <button type="button" class="agy-btn agy-btn-subtle${splitActiveClass}" id="btn-split" title="Toggle raw source editor beside this preview" aria-pressed="${isSplitOpen ? "true" : "false"}">Split Edit</button>
      <div class="agy-menu-wrap">
        <button type="button" class="agy-btn-icon" id="btn-more" title="More preview actions" aria-haspopup="true" aria-expanded="false">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><circle cx="8" cy="3" r="1.35"/><circle cx="8" cy="8" r="1.35"/><circle cx="8" cy="13" r="1.35"/></svg>
        </button>
        <div class="agy-dropdown-menu" id="agy-more-menu" hidden>
          <button type="button" class="agy-menu-item" id="btn-sync"><span>⇅ Synchronized Scrolling</span><span class="agy-menu-check" id="sync-check">${syncScrollEnabled ? "✓" : ""}</span></button>
          <div class="agy-menu-divider"></div>
          <button type="button" class="agy-menu-item" id="btn-export-pdf-themed" title="Export PDF preserving your active VS Code theme background and syntax palette"><span>Export PDF (Themed)</span></button>
          <button type="button" class="agy-menu-item" id="btn-export-pdf-unthemed" title="Export print-friendly PDF with a clean white background"><span>Export PDF (Unthemed)</span></button>
          <button type="button" class="agy-menu-item" id="btn-export-html-themed" title="Export standalone interactive HTML with your active VS Code theme"><span>Export HTML (Themed)</span></button>
          <button type="button" class="agy-menu-item" id="btn-export-html-unthemed" title="Export standalone interactive HTML with clean light theme"><span>Export HTML (Unthemed)</span></button>
          <div class="agy-menu-divider"></div>
          <button type="button" class="agy-menu-item" id="btn-copy"><span>Copy Raw Source</span></button>
          <button type="button" class="agy-menu-item" id="btn-edit"><span>Switch to Raw Editor</span></button>
          ${nativeMenuItem}
          <div class="agy-menu-divider"></div>
          <button type="button" class="agy-menu-item" id="btn-github" title="Open GitHub repository or report an issue"><span>GitHub / Report Issue ↗</span></button>
        </div>
      </div>
    </div>
  </div>
  <main class="agy-review-container" id="agy-content">
    ${renderedHtml}
  </main>
  <script src="${mermaidJsUri}?v=${ASSET_CACHE_VERSION}"></script>
  <script src="${jsUri}?v=${ASSET_CACHE_VERSION}"></script>
  <script>
    (function() {
      const vscode = acquireVsCodeApi();
      const btnEdit = document.getElementById("btn-edit");
      const btnSplit = document.getElementById("btn-split");
      const btnCopy = document.getElementById("btn-copy");
      const btnNative = document.getElementById("btn-native");
      const btnGitHub = document.getElementById("btn-github");
      const btnExportPdfThemed = document.getElementById("btn-export-pdf-themed");
      const btnExportPdfUnthemed = document.getElementById("btn-export-pdf-unthemed");
      const btnExportHtmlThemed = document.getElementById("btn-export-html-themed");
      const btnExportHtmlUnthemed = document.getElementById("btn-export-html-unthemed");
      const btnSync = document.getElementById("btn-sync");
      const btnSyncInline = document.getElementById("btn-sync-inline");
      const syncCheckEl = document.getElementById("sync-check");
      const btnMore = document.getElementById("btn-more");
      const moreMenu = document.getElementById("agy-more-menu");
      const toolbarEl = document.querySelector(".agy-toolbar");
      const contentEl = document.getElementById("agy-content");
      const filepathEl = document.querySelector(".agy-filepath");

      let syncScrollEnabled = ${Boolean(syncScrollEnabled)};
      let isSplitOpen = ${Boolean(isSplitOpen)};
      let programmaticScrollLockUntil = 0;
      let userScrollActiveUntil = 0;
      let cachedAnchors = null;
      let lastTargetLine = ${typeof initialLine === "number" && !Number.isNaN(initialLine) ? initialLine : 0};
      let lastEmittedIntLine = -1;

      let smoothTargetY = null;
      let smoothCurrentY = 0;
      let smoothRafId = 0;
      let lastSmoothFrameTime = 0;

      function closeMoreMenu() {
        if (!moreMenu || !btnMore) return;
        moreMenu.hidden = true;
        btnMore.setAttribute("aria-expanded", "false");
        btnMore.classList.remove("agy-btn-active");
      }

      function updateSyncButtonUi() {
        if (btnSyncInline) {
          btnSyncInline.classList.toggle("agy-btn-active", Boolean(syncScrollEnabled));
          btnSyncInline.setAttribute("aria-pressed", syncScrollEnabled ? "true" : "false");
        }
        if (syncCheckEl) {
          syncCheckEl.textContent = syncScrollEnabled ? "✓" : "";
        }
      }

      function updateSplitButtonUi() {
        if (btnSplit) {
          btnSplit.classList.toggle("agy-btn-active", Boolean(isSplitOpen));
          btnSplit.setAttribute("aria-pressed", isSplitOpen ? "true" : "false");
        }
        if (btnSyncInline) {
          btnSyncInline.classList.toggle("agy-hidden", !isSplitOpen);
        }
      }

      function getAnchorOffset() {
        const th = toolbarEl ? toolbarEl.getBoundingClientRect().height : 0;
        return th + 10;
      }

      function invalidateAnchors() {
        cachedAnchors = null;
      }

      function buildScrollAnchors() {
        if (cachedAnchors) return cachedAnchors;
        const root = contentEl || document.body;
        const rootRect = root.getBoundingClientRect();
        const rootTop = rootRect.top + window.scrollY;
        const rawAnchors = [{ line: 0, y: Math.max(0, rootTop), isSentinel: false }];

        const codeLineEls = root.querySelectorAll(".code-line[data-line]");
        codeLineEls.forEach((el) => {
          if (!(el instanceof HTMLElement)) return;
          if (el.closest(".agy-carousel-slide")) return;
          const tag = el.tagName;
          if (tag === "UL" || tag === "OL" || tag === "THEAD" || tag === "TBODY") return;
          if (
            (tag === "PRE" || tag === "CODE") &&
            el.closest(".agy-code-block.code-line[data-line]")
          ) {
            return;
          }

          const line = parseFloat(el.getAttribute("data-line"));
          if (Number.isNaN(line) || line < 0) return;

          if (el.classList.contains("agy-scroll-sentinel")) {
            const rect = el.getBoundingClientRect();
            rawAnchors.push({ line, y: rect.top + window.scrollY, isSentinel: true });
            return;
          }

          if (el.closest("details:not([open])")) return;
          const style = window.getComputedStyle(el);
          if (style.display === "none" || style.visibility === "hidden") return;
          const rect = el.getBoundingClientRect();
          if (rect.height === 0 && rect.width === 0) return;

          const docTop = rect.top + window.scrollY;
          const docBottom = docTop + rect.height;

          if (el.classList.contains("agy-code-block")) {
            const endLineAttr = parseFloat(el.getAttribute("data-line-end"));
            const preEl = el.querySelector("pre");
            const codeEl = el.querySelector("code");
            const rawLines =
              (((codeEl || preEl || el).textContent || "").replace(/\\n$/, "").match(/\\n/g) || [])
                .length + 1;
            const endLine =
              !Number.isNaN(endLineAttr) && endLineAttr > line
                ? endLineAttr
                : line + rawLines + 1;
            rawAnchors.push({ line, y: docTop, isSentinel: false });
            if (preEl) {
              const preRect = preEl.getBoundingClientRect();
              const preStyle = window.getComputedStyle(preEl);
              const padTop = parseFloat(preStyle.paddingTop) || 0;
              const padBottom = parseFloat(preStyle.paddingBottom) || 0;
              const codeTop = preRect.top + window.scrollY + padTop;
              const codeBottom = Math.max(
                codeTop + 1,
                preRect.top + window.scrollY + preRect.height - padBottom
              );
              if (endLine > line + 1) {
                rawAnchors.push({ line: line + 1, y: codeTop, isSentinel: false });
              }
              rawAnchors.push({ line: endLine, y: codeBottom, isSentinel: false });
            } else {
              rawAnchors.push({ line: endLine, y: docBottom, isSentinel: false });
            }
            return;
          }

          if (tag === "CODE" && el.parentElement && el.parentElement.tagName === "PRE") {
            const preEl = el.parentElement;
            const preRect = preEl.getBoundingClientRect();
            const preStyle = window.getComputedStyle(preEl);
            const padTop = parseFloat(preStyle.paddingTop) || 0;
            const padBottom = parseFloat(preStyle.paddingBottom) || 0;
            const codeTop = preRect.top + window.scrollY + padTop;
            const codeBottom = Math.max(
              codeTop + 1,
              preRect.top + window.scrollY + preRect.height - padBottom
            );
            const rawLines =
              ((el.textContent || "").replace(/\\n$/, "").match(/\\n/g) || []).length + 1;
            const endLine = line + rawLines + 1;
            rawAnchors.push({ line, y: preRect.top + window.scrollY, isSentinel: false });
            if (endLine > line + 1) {
              rawAnchors.push({ line: line + 1, y: codeTop, isSentinel: false });
            }
            rawAnchors.push({ line: endLine, y: codeBottom, isSentinel: false });
            return;
          }

          if (
            el.classList.contains("agy-mermaid-container") ||
            el.classList.contains("agy-carousel")
          ) {
            const endLineAttr = parseFloat(el.getAttribute("data-line-end"));
            rawAnchors.push({ line, y: docTop, isSentinel: false });
            if (!Number.isNaN(endLineAttr) && endLineAttr > line) {
              rawAnchors.push({ line: endLineAttr, y: docBottom, isSentinel: false });
            }
            return;
          }

          rawAnchors.push({ line, y: docTop, isSentinel: false });
        });

        rawAnchors.sort((a, b) => (a.line !== b.line ? a.line - b.line : a.y - b.y));

        const anchors = [];
        for (const pt of rawAnchors) {
          if (anchors.length > 0 && Math.abs(pt.line - anchors[anchors.length - 1].line) < 1e-4) {
            if (pt.isSentinel) {
              anchors[anchors.length - 1].y = Math.max(anchors[anchors.length - 1].y, pt.y);
            }
            continue;
          }
          const clampedY =
            anchors.length > 0 ? Math.max(anchors[anchors.length - 1].y, pt.y) : pt.y;
          anchors.push({ line: pt.line, y: clampedY });
        }

        cachedAnchors = anchors;
        return anchors;
      }

      function getScrollYForSourceLine(line) {
        if (typeof line !== "number" || Number.isNaN(line) || line <= 0.05) {
          return 0;
        }
        const anchors = buildScrollAnchors();
        if (!anchors.length) return 0;

        const anchorOffset = getAnchorOffset();
        if (line <= anchors[0].line) {
          return Math.max(0, anchors[0].y - anchorOffset);
        }
        const last = anchors[anchors.length - 1];
        if (line >= last.line) {
          return Math.max(0, last.y - anchorOffset);
        }

        let lo = 0;
        let hi = anchors.length - 1;
        while (lo + 1 < hi) {
          const mid = (lo + hi) >> 1;
          if (anchors[mid].line <= line) {
            lo = mid;
          } else {
            hi = mid;
          }
        }

        const a = anchors[lo];
        const b = anchors[hi];
        const spanL = b.line - a.line;
        const t = spanL > 0 ? (line - a.line) / spanL : 0;
        const targetDocY = a.y + t * (b.y - a.y);
        return Math.max(0, targetDocY - anchorOffset);
      }

      function getSourceLineForScrollY(scrollY) {
        if (scrollY <= 2) return 0;
        const anchors = buildScrollAnchors();
        if (!anchors.length) return 0;

        const anchorDocY = scrollY + getAnchorOffset();
        if (anchorDocY <= anchors[0].y) {
          return anchors[0].line;
        }
        const last = anchors[anchors.length - 1];
        if (anchorDocY >= last.y) {
          return last.line;
        }

        let lo = 0;
        let hi = anchors.length - 1;
        while (lo + 1 < hi) {
          const mid = (lo + hi) >> 1;
          if (anchors[mid].y <= anchorDocY) {
            lo = mid;
          } else {
            hi = mid;
          }
        }

        while (lo > 0 && anchors[lo].y === anchors[lo - 1].y) {
          lo--;
        }
        while (hi < anchors.length - 1 && anchors[hi].y === anchors[lo].y) {
          hi++;
        }

        const a = anchors[lo];
        const b = anchors[hi];
        const spanY = b.y - a.y;
        const t = spanY > 0 ? Math.min(1, Math.max(0, (anchorDocY - a.y) / spanY)) : 0;
        return a.line + t * (b.line - a.line);
      }

      function cancelProgrammaticSmoothScroll() {
        if (smoothRafId) {
          if (typeof cancelAnimationFrame === "function") {
            cancelAnimationFrame(smoothRafId);
          }
          smoothRafId = 0;
        }
        smoothTargetY = null;
        lastSmoothFrameTime = 0;
      }

      function stepSmoothScroll(now) {
        if (smoothTargetY === null) {
          smoothRafId = 0;
          return;
        }
        const ts = typeof now === "number" ? now : performance.now();
        const dt = lastSmoothFrameTime ? Math.min(64, Math.max(4, ts - lastSmoothFrameTime)) : 16;
        lastSmoothFrameTime = ts;

        const diff = smoothTargetY - smoothCurrentY;
        if (Math.abs(diff) < 0.75) {
          programmaticScrollLockUntil = performance.now() + 180;
          window.scrollTo(window.scrollX, Math.round(smoothTargetY));
          smoothCurrentY = smoothTargetY;
          smoothTargetY = null;
          smoothRafId = 0;
          lastSmoothFrameTime = 0;
          return;
        }

        const alpha = 1 - Math.exp(-dt / 40);
        smoothCurrentY += diff * alpha;
        programmaticScrollLockUntil = performance.now() + 180;
        window.scrollTo(window.scrollX, smoothCurrentY);
        smoothRafId = requestAnimationFrame(stepSmoothScroll);
      }

      function scrollToSourceLine(line, instant = false) {
        if (typeof line !== "number" || Number.isNaN(line)) return;
        lastTargetLine = line;
        lastEmittedIntLine = Math.max(0, Math.round(line));
        const targetY = getScrollYForSourceLine(line);
        if (instant || Math.abs(targetY - window.scrollY) > 2200) {
          cancelProgrammaticSmoothScroll();
          smoothCurrentY = targetY;
          programmaticScrollLockUntil = performance.now() + 200;
          window.scrollTo(window.scrollX, targetY);
          return;
        }
        smoothTargetY = targetY;
        if (!smoothRafId) {
          smoothCurrentY = window.scrollY;
          lastSmoothFrameTime = 0;
          smoothRafId = requestAnimationFrame(stepSmoothScroll);
        }
      }

      function markUserScrollIntent() {
        cancelProgrammaticSmoothScroll();
        programmaticScrollLockUntil = 0;
        userScrollActiveUntil = performance.now() + 450;
      }

      window.addEventListener("wheel", markUserScrollIntent, { passive: true });
      window.addEventListener("touchstart", markUserScrollIntent, { passive: true });
      window.addEventListener("touchmove", markUserScrollIntent, { passive: true });
      window.addEventListener("pointerdown", markUserScrollIntent, { passive: true });
      window.addEventListener(
        "keydown",
        (e) => {
          if (
            e &&
            (e.key === "ArrowDown" ||
              e.key === "ArrowUp" ||
              e.key === "PageDown" ||
              e.key === "PageUp" ||
              e.key === "Home" ||
              e.key === "End" ||
              e.key === " ")
          ) {
            markUserScrollIntent();
          }
        },
        { passive: true }
      );

      function toggleSyncScroll() {
        syncScrollEnabled = !syncScrollEnabled;
        updateSyncButtonUi();
        vscode.postMessage({ type: "toggleSyncScroll", enabled: syncScrollEnabled });
      }

      if (btnMore && moreMenu) {
        btnMore.addEventListener("click", (e) => {
          e.stopPropagation();
          const willOpen = moreMenu.hidden;
          moreMenu.hidden = !willOpen;
          btnMore.setAttribute("aria-expanded", willOpen ? "true" : "false");
          btnMore.classList.toggle("agy-btn-active", willOpen);
        });
        document.addEventListener("click", (e) => {
          if (!moreMenu.hidden && !moreMenu.contains(e.target) && e.target !== btnMore) {
            closeMoreMenu();
          }
        });
        window.addEventListener("keydown", (e) => {
          if (e.key === "Escape" && !moreMenu.hidden) {
            closeMoreMenu();
          }
        });
      }

      if (btnEdit) {
        btnEdit.addEventListener("click", () => {
          closeMoreMenu();
          const line = getSourceLineForScrollY(window.scrollY);
          vscode.postMessage({ type: "editSource", beside: false, line });
        });
      }
      if (btnSplit) {
        btnSplit.addEventListener("click", () => {
          const line = getSourceLineForScrollY(window.scrollY);
          vscode.postMessage({ type: "toggleSplitEdit", line });
        });
      }
      if (btnSync) {
        btnSync.addEventListener("click", () => {
          toggleSyncScroll();
          closeMoreMenu();
        });
      }
      if (btnSyncInline) {
        btnSyncInline.addEventListener("click", () => {
          toggleSyncScroll();
        });
      }
      if (btnCopy) {
        btnCopy.addEventListener("click", () => {
          closeMoreMenu();
          vscode.postMessage({ type: "copyRaw" });
        });
      }
      if (btnNative) {
        btnNative.addEventListener("click", () => {
          closeMoreMenu();
          vscode.postMessage({ type: "openNativeArtifact" });
        });
      }
      if (btnGitHub) {
        btnGitHub.addEventListener("click", () => {
          closeMoreMenu();
          vscode.postMessage({ type: "openGitHubMenu" });
        });
      }

      const AGY_PDF_VARS = [
        "--agy-bg",
        "--agy-surface",
        "--agy-fg",
        "--agy-heading",
        "--agy-muted",
        "--agy-muted-fg",
        "--agy-secondary",
        "--agy-border",
        "--agy-table-border",
        "--agy-code-fg",
        "--agy-code-bg",
        "--agy-code-header-bg",
        "--agy-blockquote-bg",
        "--agy-alert-note",
        "--agy-alert-tip",
        "--agy-alert-important",
        "--agy-alert-warning",
        "--agy-alert-caution",
        "--agy-syn-fg",
        "--agy-syn-keyword",
        "--agy-syn-type",
        "--agy-syn-function",
        "--agy-syn-string",
        "--agy-syn-number",
        "--agy-syn-param",
        "--agy-syn-attr",
        "--agy-syn-meta",
        "--agy-syn-comment",
        "--agy-syn-punct",
        "--agy-syn-add-bg",
        "--agy-syn-add-fg",
        "--agy-syn-del-bg",
        "--agy-syn-del-fg",
        "--agy-code-hl-line-bg",
        "--agy-code-hl-line-border"
      ];

      function collectComputedThemeVars() {
        const out = {};
        if (!document.body || !window.getComputedStyle) return out;
        const cs = window.getComputedStyle(document.body);
        for (const name of AGY_PDF_VARS) {
          const val = cs.getPropertyValue(name);
          if (val && val.trim()) {
            out[name] = val.trim();
          }
        }
        return out;
      }

      if (btnExportPdfThemed) {
        btnExportPdfThemed.addEventListener("click", () => {
          closeMoreMenu();
          vscode.postMessage({
            type: "exportPdf",
            mode: "themed",
            computedVars: collectComputedThemeVars()
          });
        });
      }
      if (btnExportPdfUnthemed) {
        btnExportPdfUnthemed.addEventListener("click", () => {
          closeMoreMenu();
          vscode.postMessage({
            type: "exportPdf",
            mode: "unthemed",
            computedVars: collectComputedThemeVars()
          });
        });
      }
      if (btnExportHtmlThemed) {
        btnExportHtmlThemed.addEventListener("click", () => {
          closeMoreMenu();
          vscode.postMessage({
            type: "exportHtml",
            mode: "themed",
            computedVars: collectComputedThemeVars()
          });
        });
      }
      if (btnExportHtmlUnthemed) {
        btnExportHtmlUnthemed.addEventListener("click", () => {
          closeMoreMenu();
          vscode.postMessage({
            type: "exportHtml",
            mode: "unthemed",
            computedVars: collectComputedThemeVars()
          });
        });
      }

      window.addEventListener("agy.markdown.toggleTask", (e) => {
        if (!e || !e.detail) return;
        vscode.postMessage({
          type: "toggleTaskCheckbox",
          line: e.detail.line,
          checked: Boolean(e.detail.checked),
          taskText: e.detail.taskText || ""
        });
      });

      window.addEventListener("agy.markdown.jumpToLine", (e) => {
        if (!e || !e.detail || typeof e.detail.line !== "number") return;
        scrollToSourceLine(e.detail.line, false);
        vscode.postMessage({ type: "revealLine", line: e.detail.line });
      });

      window.addEventListener("agy.markdown.openExternalBrowser", () => {
        vscode.postMessage({ type: "openExternalBrowser" });
      });

      window.addEventListener("agy.markdown.copyText", (e) => {
        if (!e || !e.detail || typeof e.detail.text !== "string") return;
        vscode.postMessage({ type: "copyText", text: e.detail.text });
      });

      function applyThemeClass(isLight, themeCss) {
        if (!document.body) return;
        document.body.classList.toggle("vscode-light", Boolean(isLight));
        document.body.classList.toggle("vscode-dark", !isLight);
        if (typeof themeCss === "string") {
          let styleEl = document.getElementById("agy-theme-palette");
          if (!styleEl && document.head) {
            styleEl = document.createElement("style");
            styleEl.id = "agy-theme-palette";
            document.head.appendChild(styleEl);
          }
          if (styleEl && styleEl.textContent !== themeCss) {
            styleEl.textContent = themeCss;
          }
        }
      }

      let scrollEmitPending = false;
      function emitScrollLine() {
        scrollEmitPending = false;
        if (!syncScrollEnabled) return;
        if (smoothRafId || performance.now() < programmaticScrollLockUntil) return;
        const line = getSourceLineForScrollY(window.scrollY);
        if (typeof line === "number" && !Number.isNaN(line)) {
          lastTargetLine = line;
          const intLine = Math.max(0, Math.round(line));
          if (intLine !== lastEmittedIntLine) {
            lastEmittedIntLine = intLine;
            vscode.postMessage({ type: "revealLine", line });
          }
        }
      }

      window.addEventListener(
        "scroll",
        () => {
          if (!syncScrollEnabled) return;
          if (smoothRafId || performance.now() < programmaticScrollLockUntil) return;
          userScrollActiveUntil = performance.now() + 450;
          if (scrollEmitPending) return;
          scrollEmitPending = true;
          requestAnimationFrame(emitScrollLine);
        },
        { passive: true }
      );

      window.addEventListener("resize", () => {
        programmaticScrollLockUntil = performance.now() + 200;
        invalidateAnchors();
      });

      window.addEventListener("agy.markdown.layoutChanged", () => {
        invalidateAnchors();
      });

      if (lastTargetLine > 0) {
        const alignInitial = () => {
          invalidateAnchors();
          scrollToSourceLine(lastTargetLine, true);
        };
        if (document.readyState === "loading") {
          document.addEventListener("DOMContentLoaded", () => {
            requestAnimationFrame(alignInitial);
          });
        } else {
          requestAnimationFrame(alignInitial);
        }
      }

      window.addEventListener("message", (event) => {
        const msg = event.data;
        if (!msg || !msg.type) return;
        if (msg.type === "agy.iframe.scroll" && typeof msg.ratio === "number") {
          if (!syncScrollEnabled) return;
          if (performance.now() < programmaticScrollLockUntil) return;
          const htmlStudio = document.querySelector(".agy-html-studio");
          const totalLines = htmlStudio
            ? Math.max(1, parseInt(htmlStudio.getAttribute("data-total-lines") || "1", 10))
            : 100;
          const line = Math.max(0, Math.min(totalLines - 1, msg.ratio * (totalLines - 1)));
          const intLine = Math.round(line);
          if (intLine !== lastEmittedIntLine) {
            lastEmittedIntLine = intLine;
            vscode.postMessage({ type: "revealLine", line });
          }
          return;
        }
        if (msg.type === "scrollToLine" && typeof msg.line === "number") {
          if (!syncScrollEnabled) return;
          if (!msg.instant && performance.now() < userScrollActiveUntil) return;
          const htmlIframe = document.getElementById("agy-html-iframe");
          const htmlWebPane = document.querySelector('.agy-html-studio [data-html-pane="webview"]');
          if (
            htmlIframe &&
            htmlIframe.contentWindow &&
            htmlWebPane &&
            !htmlWebPane.hidden
          ) {
            const htmlStudio = document.querySelector(".agy-html-studio");
            const totalLines = htmlStudio
              ? Math.max(1, parseInt(htmlStudio.getAttribute("data-total-lines") || "1", 10))
              : 100;
            const ratio = totalLines > 1 ? Math.max(0, Math.min(1, msg.line / (totalLines - 1))) : 0;
            programmaticScrollLockUntil = performance.now() + 220;
            try {
              htmlIframe.contentWindow.postMessage(
                { type: "agy.iframe.scrollToRatio", ratio, instant: Boolean(msg.instant) },
                "*"
              );
            } catch (_) {}
            return;
          }
          scrollToSourceLine(msg.line, Boolean(msg.instant));
          return;
        }
        if (msg.type === "updateSyncScroll") {
          syncScrollEnabled = Boolean(msg.enabled);
          updateSyncButtonUi();
          return;
        }
        if (msg.type === "updateSplitState") {
          isSplitOpen = Boolean(msg.isOpen);
          updateSplitButtonUi();
          return;
        }
        if (msg.type === "requestExportPdf") {
          vscode.postMessage({
            type: "exportPdf",
            mode: msg.mode || "ask",
            computedVars: collectComputedThemeVars()
          });
          return;
        }
        if (msg.type === "requestExportHtml") {
          vscode.postMessage({
            type: "exportHtml",
            mode: msg.mode || "ask",
            computedVars: collectComputedThemeVars()
          });
          return;
        }
        if (msg.type === "updateTheme") {
          applyThemeClass(msg.isLightTheme, msg.themeCss);
          window.dispatchEvent(new CustomEvent("vscode.markdown.updateContent"));
          requestAnimationFrame(() => {
            window.dispatchEvent(new CustomEvent("vscode.markdown.updateContent"));
          });
          return;
        }
        if (msg.type === "updateContent") {
          const prevScrollY = window.scrollY;
          const prevScrollX = window.scrollX;
          cancelProgrammaticSmoothScroll();
          programmaticScrollLockUntil = performance.now() + 260;
          applyThemeClass(msg.isLightTheme, msg.themeCss);
          if (filepathEl && typeof msg.displayPath === "string") {
            filepathEl.textContent =
              typeof msg.docTitle === "string" && msg.docTitle
                ? msg.docTitle
                : msg.displayPath;
            filepathEl.setAttribute("title", msg.displayPath);
            filepathEl.setAttribute("data-server-title", "1");
          }
          const badgeEl = document.getElementById("agy-format-badge");
          if (badgeEl && typeof msg.formatBadge === "string" && msg.formatBadge) {
            badgeEl.textContent = msg.formatBadge;
            if (typeof msg.formatId === "string" && msg.formatId) {
              badgeEl.setAttribute("data-format", msg.formatId);
              if (document.body) {
                document.body.setAttribute("data-format", msg.formatId);
              }
            }
          }
          const filenameEl = document.getElementById("agy-doc-filename");
          if (filenameEl && typeof msg.displayPath === "string") {
            const parts = msg.displayPath.split(/[\\/]/);
            filenameEl.textContent = parts[parts.length - 1] || "";
            filenameEl.setAttribute("title", msg.displayPath);
          }
          if (contentEl && typeof msg.renderedHtml === "string") {
            contentEl.innerHTML = msg.renderedHtml;
          }
          invalidateAnchors();
          window.dispatchEvent(new CustomEvent("vscode.markdown.updateContent"));
          window.scrollTo(prevScrollX, prevScrollY);
          requestAnimationFrame(() => {
            programmaticScrollLockUntil = performance.now() + 200;
            window.scrollTo(prevScrollX, prevScrollY);
            invalidateAnchors();
          });
        }
      });

      document.addEventListener("click", (e) => {
        const sel = window.getSelection ? window.getSelection() : null;
        if (sel && !sel.isCollapsed && String(sel.toString()).trim().length > 0) {
          return;
        }
        const a = e.target && e.target.closest ? e.target.closest("a[href]") : null;
        if (!a) return;
        const href = a.getAttribute("href") || "";
        if (!href) return;
        if (href.startsWith("#")) {
          const rawId = href.slice(1);
          const target =
            document.getElementById(rawId) ||
            document.getElementById(decodeURIComponent(rawId));
          if (target) {
            e.preventDefault();
            target.scrollIntoView({ behavior: "smooth" });
          }
          return;
        }
        e.preventDefault();
        vscode.postMessage({ type: "openLink", href });
      });
    })();
  </script>
</body>
</html>`;
}

function syncMarkdownPreviewEnhanced(extensionPath) {
  try {
    const crossnoteDir = path.join(os.homedir(), ".local", "state", "crossnote");
    fs.mkdirSync(crossnoteDir, { recursive: true });

    const cssSource = fs.readFileSync(
      path.join(extensionPath, "media", "antigravity-markdown.css"),
      "utf8"
    );
    const themeCss = buildThemeOverrideCss();

    const styleLessPath = path.join(crossnoteDir, "style.less");
    const beginMarker = "/* BEGIN ANTIGRAVITY MARKDOWN STYLE */";
    const endMarker = "/* END ANTIGRAVITY MARKDOWN STYLE */";
    const styleBlock = `${beginMarker}\n${cssSource}${themeCss ? `\n\n/* Active VS Code Theme Palette */\n${themeCss}\n` : "\n"}${endMarker}`;

    let existingStyle = "";
    if (fs.existsSync(styleLessPath)) {
      existingStyle = fs.readFileSync(styleLessPath, "utf8");
    }
    if (existingStyle.includes(beginMarker) && existingStyle.includes(endMarker)) {
      const startIdx = existingStyle.indexOf(beginMarker);
      const endIdx = existingStyle.indexOf(endMarker) + endMarker.length;
      existingStyle = existingStyle.slice(0, startIdx) + styleBlock + existingStyle.slice(endIdx);
    } else {
      existingStyle = existingStyle.trimEnd() + "\n\n" + styleBlock + "\n";
    }
    fs.writeFileSync(styleLessPath, existingStyle, "utf8");

    // Configure Crossnote parser.js so [!NOTE]/[!TIP]/[!IMPORTANT]/[!WARNING]/[!CAUTION]
    // and ````carousel blocks render in Markdown Preview Enhanced without corrupting KaTeX matrices.
    const parserJsPath = path.join(crossnoteDir, "parser.js");
    const parserCode = `({
  // Managed by Antigravity Markdown Review (iamqazolp.agy-markdown-review)
  onWillParseMarkdown: async function(markdown) {
    return String(markdown || "").replace(
      /^[ \\t]*(\`{3,})carousel[ \\t]*\\r?\\n([\\s\\S]*?)\\r?\\n[ \\t]*\\1[ \\t]*(?:$|\\r?\\n)/gm,
      function(fullMatch, _fence, inner) {
        const slides = inner.split(/(?:^|\\r?\\n)[ \\t]*<!--\\s*slide\\s*-->[ \\t]*(?=\\r?\\n|$)/i).map(s => s.trim()).filter(Boolean);
        if (!slides.length) return fullMatch;
        const navJs = "const c=this.closest('.agy-carousel');const s=Array.from(c.querySelectorAll('.agy-carousel-slide'));let i=s.findIndex(x=>x.classList.contains('active'));if(i<0)i=0;i=(i+DIR+s.length)%s.length;s.forEach((el,idx)=>el.classList.toggle('active',idx===i));const cnt=c.querySelector('.agy-carousel-counter');if(cnt)cnt.textContent='Slide '+(i+1)+' of '+s.length;";
        const prevAttr = navJs.replace("DIR", "-1");
        const nextAttr = navJs.replace("DIR", "1");
        return '<div class="agy-carousel">\\n' +
          '<div class="agy-carousel-header">' +
          '<span class="agy-carousel-counter">Slide 1 of ' + slides.length + '</span>' +
          '<div class="agy-carousel-controls">' +
          '<button type="button" class="agy-btn agy-carousel-prev" onclick="' + prevAttr + '">← Prev</button>' +
          '<button type="button" class="agy-btn agy-carousel-next" onclick="' + nextAttr + '">Next →</button>' +
          '</div></div>\\n\\n' +
          slides.map((s, i) => '<div class="agy-carousel-slide' + (i === 0 ? ' active' : '') + '">\\n\\n' + s + '\\n\\n</div>').join("\\n\\n") +
          '\\n\\n</div>\\n\\n';
      }
    );
  },

  onDidParseMarkdown: async function(html) {
    const labels = ${JSON.stringify(ALERT_LABELS)};
    return String(html || "").replace(
      /<blockquote>\\s*<p>\\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\\](?:\\s*<br\\s*\\/?>|\\s*\\n|\\s+)?([\\s\\S]*?)<\\/blockquote>/gi,
      function(_, rawType, rest) {
        const t = rawType.toLowerCase();
        const body = rest.trim().startsWith("</p>") ? rest.trim().slice(4) : "<p>" + rest;
        return '<div class="markdown-alert markdown-alert-' + t + '">' +
          '<p class="markdown-alert-title">' + (labels[t] || rawType.toUpperCase()) + '</p>' +
          body + '</div>';
      }
    );
  },
})
`;
    fs.writeFileSync(parserJsPath, parserCode, "utf8");
  } catch (_) {
    // Ignore errors if crossnote dir is not writable
  }
}

function extendMarkdownItWithAntigravity(md) {
  const origValidateLink =
    typeof md.validateLink === "function" ? md.validateLink.bind(md) : null;
  md.validateLink = function (url) {
    if (/^(?:file|conversation):\/\//i.test(String(url || "").trim())) {
      return true;
    }
    return origValidateLink ? origValidateLink(url) : true;
  };

  md.core.ruler.push("agy_source_line_range", (state) => {
    for (const token of state.tokens) {
      if (token.map && token.type !== "inline") {
        if (!token.attrGet("data-line")) {
          token.attrSet("data-line", String(token.map[0]));
          token.attrJoin("class", "code-line");
        }
        if (typeof token.map[1] === "number") {
          token.attrSet("data-line-end", String(token.map[1]));
        }
      }
    }
  });

  const origHighlight =
    md.options && typeof md.options.highlight === "function"
      ? md.options.highlight
      : null;
  if (origHighlight) {
    md.options.highlight = function (str, lang, attrs) {
      const parsed = parseCodeFenceInfo(
        `${lang || ""} ${attrs || ""}`.trim(),
        str
      );
      return origHighlight.call(this, str, parsed.highlightLang, attrs);
    };
  }

  const defaultFence =
    md.renderer.rules.fence ||
    function (tokens, idx, options, env, self) {
      return self.renderToken(tokens, idx, options);
    };

  md.renderer.rules.fence = function (tokens, idx, options, env, self) {
    const token = tokens[idx];
    const rawInfo = (token.info || "").trim();
    const infoLower = rawInfo.toLowerCase();
    if (infoLower === "carousel") {
      const slides = (token.content || "")
        .split(/<!--\s*slide\s*-->/i)
        .map((s) => s.trim())
        .filter(Boolean);
      if (slides.length) {
        const lineAttrs =
          token.map && token.map.length >= 2
            ? ` data-line="${token.map[0]}" data-line-end="${token.map[1]}"`
            : "";
        const slidesHtml = slides
          .map(
            (s, i) =>
              `<div class="agy-carousel-slide${i === 0 ? " active" : ""}">${md.render(s)}</div>`
          )
          .join("");
        return (
          `<div class="agy-carousel code-line"${lineAttrs}>` +
          `<div class="agy-carousel-header">` +
          `<span class="agy-carousel-counter">Slide 1 of ${slides.length}</span>` +
          `<div class="agy-carousel-controls">` +
          `<button type="button" class="agy-btn agy-carousel-prev">← Prev</button>` +
          `<button type="button" class="agy-btn agy-carousel-next">Next →</button>` +
          `</div>` +
          `</div>` +
          `${slidesHtml}` +
          `</div>`
        );
      }
    }

    if (infoLower === "mermaid") {
      return defaultFence(tokens, idx, options, env, self);
    }

    const parsed = parseCodeFenceInfo(rawInfo, token.content || "");
    if (parsed.displayLang) {
      token.attrSet("data-lang", parsed.displayLang);
    }
    if (parsed.title) {
      token.attrSet("data-title", parsed.title);
    }
    if (parsed.hlLines) {
      token.attrSet("data-hl-lines", parsed.hlLines);
    }
    if (parsed.showLineNumbers) {
      token.attrSet("data-line-numbers", "1");
    }

    const savedInfo = token.info;
    if (parsed.highlightLang) {
      token.info = parsed.highlightLang;
    }
    let rendered = defaultFence(tokens, idx, options, env, self);
    token.info = savedInfo;

    let defaultLineNums = false;
    try {
      defaultLineNums = Boolean(
        vscode.workspace.getConfiguration("agyMarkdown").get("codeLineNumbers", false)
      );
    } catch (_) {}

    rendered = rendered.replace(
      /<pre\b([^>]*)>\s*<code\b([^>]*)>([\s\S]*?)<\/code>\s*<\/pre>/i,
      (_, preAttrs, codeAttrs, inner) => {
        const enriched = enrichCodeBlockHtml(
          inner,
          parsed.displayLang,
          parsed.hlLines,
          parsed.showLineNumbers || defaultLineNums
        );
        const extraAttrs =
          (parsed.displayLang && !/\bdata-lang=/i.test(codeAttrs)
            ? ` data-lang="${escapeHtml(parsed.displayLang)}"`
            : "") +
          (parsed.title && !/\bdata-title=/i.test(codeAttrs)
            ? ` data-title="${escapeHtml(parsed.title)}"`
            : "") +
          (parsed.hlLines && !/\bdata-hl-lines=/i.test(codeAttrs)
            ? ` data-hl-lines="${escapeHtml(parsed.hlLines)}"`
            : "") +
          (parsed.showLineNumbers && !/\bdata-line-numbers=/i.test(codeAttrs)
            ? ` data-line-numbers="1"`
            : "");
        return `<pre${preAttrs}><code${codeAttrs}${extraAttrs} data-agy-highlighted="1">${enriched}</code></pre>`;
      }
    );

    return rendered;
  };

  return md;
}

async function triggerExportPdfCommand(uri, mode, extensionPath) {
  trackEvent("command.exportPdf", { mode });
  let targetUri = uri instanceof vscode.Uri ? uri : null;
  if (!targetUri && vscode.window.tabGroups && vscode.window.tabGroups.activeTabGroup) {
    const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab;
    const input = activeTab && activeTab.input;
    if (input && input.uri) {
      targetUri = input.uri;
    }
  }
  if (!targetUri && vscode.window.activeTextEditor) {
    targetUri = vscode.window.activeTextEditor.document.uri;
  }
  if (!targetUri) {
    vscode.window.showInformationMessage("Open a supported document first to export to PDF.");
    return;
  }
  const info = resolveRealFileInfo(targetUri);
  const activePanel =
    activeReviewWebviewsByPath.get(info.realPath) ||
    activeReviewWebviewsByPath.get(info.fsPath);
  if (activePanel && typeof activePanel.requestExportPdf === "function") {
    activePanel.requestExportPdf(mode);
    return;
  }
  await exportMarkdownToPdf({
    info,
    extensionPath,
    mode,
    computedVars: null
  });
}

async function triggerExportHtmlCommand(uri, mode, extensionPath) {
  trackEvent("command.exportHtml", { mode });
  let targetUri = uri instanceof vscode.Uri ? uri : null;
  if (!targetUri && vscode.window.tabGroups && vscode.window.tabGroups.activeTabGroup) {
    const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab;
    const input = activeTab && activeTab.input;
    if (input && input.uri) {
      targetUri = input.uri;
    }
  }
  if (!targetUri && vscode.window.activeTextEditor) {
    targetUri = vscode.window.activeTextEditor.document.uri;
  }
  if (!targetUri) {
    vscode.window.showInformationMessage("Open a supported document first to export to HTML.");
    return;
  }
  const info = resolveRealFileInfo(targetUri);
  const activePanel =
    activeReviewWebviewsByPath.get(info.realPath) ||
    activeReviewWebviewsByPath.get(info.fsPath);
  if (activePanel && typeof activePanel.requestExportHtml === "function") {
    activePanel.requestExportHtml(mode);
    return;
  }
  await exportMarkdownToHtml({
    info,
    extensionPath,
    mode,
    computedVars: null
  });
}

async function openGitHubRepository() {
  trackEvent("github.openRepo");
  await vscode.env.openExternal(vscode.Uri.parse(GITHUB_REPO_URL));
}

async function openGitHubReportIssue(info) {
  trackEvent("github.reportIssue");
  const activeThemeName = vscode.workspace
    .getConfiguration("workbench")
    .get("colorTheme", "Default");
  const title = encodeURIComponent("[Bug / Feature]: ");
  const bodyLines = [
    "### Describe the issue or feature request",
    "",
    "",
    "### Steps to reproduce (if applicable)",
    "1. ",
    "2. ",
    "",
    "### Diagnostics",
    `- **Extension**: \`${EXTENSION_ID}\` v${EXTENSION_VERSION}`,
    `- **IDE**: ${vscode.env.appName} (${vscode.version})`,
    `- **OS**: ${process.platform} (${os.release()}, ${process.arch})`,
    `- **Active Color Theme**: \`${activeThemeName}\``,
    info && info.isBrainArtifact ? `- **Document Type**: Antigravity Brain Artifact` : ""
  ].filter(Boolean);
  const body = encodeURIComponent(bodyLines.join("\n"));
  const issueUrl = `${GITHUB_ISSUES_URL}/new?title=${title}&body=${body}`;
  await vscode.env.openExternal(vscode.Uri.parse(issueUrl));
}

async function promptGitHubOrReportIssue(info) {
  const pick = await vscode.window.showQuickPick(
    [
      {
        label: "$(github) Open GitHub Repository",
        description: "github.com/iamqazolp/antigravity-markdown-preview",
        detail: "Star the project, browse source code, or read documentation",
        action: "repo"
      },
      {
        label: "$(bug) Report Issue / Request Feature (with Diagnostics)",
        description: "Opens a pre-filled GitHub issue with IDE, OS & theme info",
        detail: `Extension v${EXTENSION_VERSION} · ${vscode.env.appName} ${vscode.version}`,
        action: "issue"
      },
      {
        label: "$(pulse) Show Extension Telemetry & Marketplace Stats",
        description: "Inspect live VS Code Marketplace metrics & author exclusion status",
        detail: isAuthorEnvironment
          ? "Author machine detected — your local activity is EXCLUDED from telemetry"
          : "View live install vs automated .vsix download counts",
        action: "stats"
      }
    ],
    {
      title: "Antigravity Document Preview — GitHub & Diagnostics",
      placeHolder: "Choose an action"
    }
  );
  if (!pick) return;
  if (pick.action === "repo") {
    await openGitHubRepository();
  } else if (pick.action === "issue") {
    await openGitHubReportIssue(info);
  } else if (pick.action === "stats") {
    await showTelemetryAndMarketplaceStats();
  }
}

function fetchMarketplaceStats() {
  return new Promise((resolve) => {
    const payload = JSON.stringify({
      filters: [
        {
          criteria: [{ filterType: 7, value: EXTENSION_ID }]
        }
      ],
      flags: 914
    });
    const req = https.request(
      {
        hostname: "marketplace.visualstudio.com",
        path: "/_apis/public/gallery/extensionquery",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json;api-version=3.0-preview.1",
          "Content-Length": Buffer.byteLength(payload)
        },
        timeout: 5000
      },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => {
          raw += chunk;
        });
        res.on("end", () => {
          try {
            const parsed = JSON.parse(raw);
            const ext =
              parsed &&
              parsed.results &&
              parsed.results[0] &&
              parsed.results[0].extensions &&
              parsed.results[0].extensions[0];
            if (!ext) {
              resolve(null);
              return;
            }
            const statsMap = {};
            for (const s of ext.statistics || []) {
              statsMap[s.statisticName] = s.value;
            }
            const latestVer =
              ext.versions && ext.versions[0] ? ext.versions[0].version : EXTENSION_VERSION;
            resolve({
              version: latestVer,
              install: statsMap.install || 0,
              downloadCount: statsMap.downloadCount || 0,
              updateCount: statsMap.updateCount || 0,
              averagerating: statsMap.averagerating || 0,
              ratingcount: statsMap.ratingcount || 0
            });
          } catch (_) {
            resolve(null);
          }
        });
      }
    );
    req.on("error", () => resolve(null));
    req.on("timeout", () => {
      req.destroy();
      resolve(null);
    });
    req.write(payload);
    req.end();
  });
}

function fetchGitHubRepoStats() {
  return new Promise((resolve) => {
    const req = https.request(
      {
        hostname: "api.github.com",
        path: "/repos/iamqazolp/antigravity-markdown-preview",
        method: "GET",
        headers: {
          "User-Agent": "agy-markdown-review-vsix",
          Accept: "application/vnd.github+json"
        },
        timeout: 5000
      },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => {
          raw += chunk;
        });
        res.on("end", () => {
          try {
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed.stargazers_count !== "number") {
              resolve(null);
              return;
            }
            resolve({
              stars: parsed.stargazers_count || 0,
              forks: parsed.forks_count || 0,
              openIssues: parsed.open_issues_count || 0
            });
          } catch (_) {
            resolve(null);
          }
        });
      }
    );
    req.on("error", () => resolve(null));
    req.on("timeout", () => {
      req.destroy();
      resolve(null);
    });
    req.end();
  });
}

async function showTelemetryAndMarketplaceStats() {
  const [mkt, gh] = await Promise.all([fetchMarketplaceStats(), fetchGitHubRepoStats()]);
  const cfgTelemetry = vscode.workspace
    .getConfiguration("agyMarkdown")
    .get("telemetry", true);

  const authorStatus = isAuthorEnvironment
    ? "EXCLUDED (Author machine detected — 0 events sent from your machine)"
    : cfgTelemetry && vscode.env.isTelemetryEnabled
    ? "ENABLED (Anonymous usage events active)"
    : "DISABLED (Opted out via settings)";

  const totalAcquisitions = mkt ? (mkt.install || 0) + (mkt.downloadCount || 0) : null;
  const lines = [
    `# Antigravity Document Preview — Telemetry & Marketplace Report`,
    ``,
    `- **Extension**: \`${EXTENSION_ID}\` (local \`v${EXTENSION_VERSION}\`${mkt ? `, Marketplace \`v${mkt.version}\`` : ""})`,
    `- **Your Telemetry Status**: **${authorStatus}**`,
    `- **Repository**: ${GITHUB_REPO_URL}`,
    gh
      ? `- **GitHub Stats**: ⭐ **${gh.stars}** stars · 🍴 **${gh.forks}** forks · 🐛 **${gh.openIssues}** open issues`
      : `- **GitHub Stats**: *(offline or rate-limited)*`,
    ``,
    `## 📊 VS Code Marketplace Breakdown`,
    mkt
      ? [
          `| Metric | Count | What It Actually Measures |`,
          `| :--- | :---: | :--- |`,
          `| **In-App Installs (\`install\`)** | **${mkt.install}** | Users clicking **Install** inside VS Code / Cursor / Antigravity Extensions view |`,
          `| **Direct VSIX Downloads (\`downloadCount\`)** | **${mkt.downloadCount}** | Direct \`.vsix\` HTTP downloads (automated VSIX mirrors, security scanners like Socket/Snyk, & web downloads) |`,
          `| **Extension Updates (\`updateCount\`)** | **${mkt.updateCount}** | Automatic or manual version upgrades from an earlier release |`,
          `| **Total Acquisitions (\`install + downloadCount\`)** | **${totalAcquisitions}** | Combined headline number shown on the VS Code Publisher Dashboard |`
        ].join("\n")
      : `*(Could not reach marketplace.visualstudio.com)*`,
    ``,
    `> [!NOTE]`,
    `> **Why does the Publisher Dashboard show ~30–40 Downloads/Acquisitions right after publishing?**`,
    `> Every time you publish a new version (\`1.0.0\`, \`1.0.1\`, \`1.0.2\`, \`1.1.0\`), public VSIX mirror registries, open-source archivers, and automated extension security scanners download the \`.vsix\` package (~8–10 automated pulls per version) to index and scan it. Microsoft's Publisher Dashboard adds \`install + downloadCount\` together into "Acquisitions", whereas **In-App Installs (\`install\`)** tracks real human installations from inside the IDE.`
  ];

  const channel = vscode.window.createOutputChannel("Antigravity Telemetry & Stats", "markdown");
  channel.clear();
  channel.appendLine(lines.join("\n"));
  channel.show(true);

  const summaryMsg = mkt
    ? `Marketplace v${mkt.version}: ${mkt.install} In-App Installs · ${mkt.downloadCount} VSIX Mirrors/Downloads (${totalAcquisitions} Total) · Author Telemetry: ${
        isAuthorEnvironment ? "EXCLUDED" : "Active"
      }`
    : `Author Telemetry: ${isAuthorEnvironment ? "EXCLUDED (Author machine)" : "Active"}`;

  const action = await vscode.window.showInformationMessage(
    summaryMsg,
    "Open GitHub Repo",
    "Open Marketplace Page"
  );
  if (action === "Open GitHub Repo") {
    await openGitHubRepository();
  } else if (action === "Open Marketplace Page") {
    await vscode.env.openExternal(vscode.Uri.parse(MARKETPLACE_URL));
  }
}

function activate(context) {
  initTelemetry(context);
  trackEvent("extension.activate");

  const provider = new AntigravityMarkdownReviewProvider(context);

  if (vscode.window.activeTextEditor) {
    recordEditorPosition(vscode.window.activeTextEditor);
  }

  context.subscriptions.push(
    vscode.window.onDidChangeTextEditorVisibleRanges((e) => {
      if (e && e.textEditor) {
        recordEditorPosition(e.textEditor);
      }
    }),
    vscode.window.onDidChangeActiveTextEditor((ed) => {
      if (ed) {
        recordEditorPosition(ed);
      }
    })
  );

  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider("antigravity.markdownReview", provider, {
      webviewOptions: { retainContextWhenHidden: true },
      supportsMultipleEditorsPerDocument: true
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("agyMarkdown.openReview", async (uri) => {
      if (vscode.window.activeTextEditor) {
        recordEditorPosition(vscode.window.activeTextEditor);
      }
      const targetUri =
        uri instanceof vscode.Uri
          ? uri
          : vscode.window.activeTextEditor
          ? vscode.window.activeTextEditor.document.uri
          : null;
      if (!targetUri) return;
      await vscode.commands.executeCommand("vscode.openWith", targetUri, "antigravity.markdownReview");
    }),
    vscode.commands.registerCommand("agyMarkdown.openReviewBeside", async (uri) => {
      if (vscode.window.activeTextEditor) {
        recordEditorPosition(vscode.window.activeTextEditor);
      }
      const targetUri =
        uri instanceof vscode.Uri
          ? uri
          : vscode.window.activeTextEditor
          ? vscode.window.activeTextEditor.document.uri
          : null;
      if (!targetUri) return;
      await vscode.commands.executeCommand(
        "vscode.openWith",
        targetUri,
        "antigravity.markdownReview",
        vscode.ViewColumn.Beside
      );
    }),
    vscode.commands.registerCommand("agyMarkdown.editSource", async (uri) => {
      let targetUri = uri instanceof vscode.Uri ? uri : null;
      if (!targetUri && vscode.window.tabGroups.activeTabGroup.activeTab) {
        const input = vscode.window.tabGroups.activeTabGroup.activeTab.input;
        if (input && input.uri) {
          targetUri = input.uri;
        }
      }
      if (!targetUri) return;
      const info = resolveRealFileInfo(targetUri);
      const savedLine =
        lastEditorLineByPath.get(info.realPath) ?? lastEditorLineByPath.get(info.fsPath);
      await vscode.commands.executeCommand("vscode.openWith", targetUri, "default");
      if (typeof savedLine === "number" && !Number.isNaN(savedLine) && savedLine > 0) {
        const applyReveal = () => {
          const editors = findMatchingVisibleEditors(info);
          for (const ed of editors) {
            revealEditorAtLine(ed, savedLine);
          }
        };
        applyReveal();
        setTimeout(applyReveal, 60);
      }
    }),
    vscode.commands.registerCommand("agyMarkdown.openNativeArtifactViewer", async (uri) => {
      const targetUri =
        uri instanceof vscode.Uri
          ? uri
          : vscode.window.activeTextEditor
          ? vscode.window.activeTextEditor.document.uri
          : null;
      if (!targetUri) return;
      await openInNativeArtifactViewer(resolveRealFileInfo(targetUri));
    }),
    vscode.commands.registerCommand("agyMarkdown.syncMpeTheme", () => {
      syncMarkdownPreviewEnhanced(context.extensionPath);
      vscode.window.showInformationMessage(
        "Antigravity Markdown style synced to Markdown Preview Enhanced."
      );
    }),
    vscode.commands.registerCommand("agyMarkdown.toggleSyncScroll", async () => {
      const cfg = vscode.workspace.getConfiguration("agyMarkdown");
      const current = cfg.get("syncScroll", true);
      await cfg.update("syncScroll", !current, vscode.ConfigurationTarget.Global);
      vscode.window.setStatusBarMessage(
        `Antigravity: Synchronized scrolling ${!current ? "enabled" : "disabled"}`,
        2500
      );
    }),
    vscode.commands.registerCommand("agyMarkdown.exportPdf", async (uri) => {
      await triggerExportPdfCommand(uri, "ask", context.extensionPath);
    }),
    vscode.commands.registerCommand("agyMarkdown.exportPdfThemed", async (uri) => {
      await triggerExportPdfCommand(uri, "themed", context.extensionPath);
    }),
    vscode.commands.registerCommand("agyMarkdown.exportPdfUnthemed", async (uri) => {
      await triggerExportPdfCommand(uri, "unthemed", context.extensionPath);
    }),
    vscode.commands.registerCommand("agyMarkdown.exportHtml", async (uri) => {
      await triggerExportHtmlCommand(uri, "ask", context.extensionPath);
    }),
    vscode.commands.registerCommand("agyMarkdown.exportHtmlThemed", async (uri) => {
      await triggerExportHtmlCommand(uri, "themed", context.extensionPath);
    }),
    vscode.commands.registerCommand("agyMarkdown.exportHtmlUnthemed", async (uri) => {
      await triggerExportHtmlCommand(uri, "unthemed", context.extensionPath);
    }),
    vscode.commands.registerCommand("agyMarkdown.openGitHub", async () => {
      await openGitHubRepository();
    }),
    vscode.commands.registerCommand("agyMarkdown.reportIssue", async (uri) => {
      const targetUri =
        uri instanceof vscode.Uri
          ? uri
          : vscode.window.activeTextEditor
          ? vscode.window.activeTextEditor.document.uri
          : null;
      const info = targetUri ? resolveRealFileInfo(targetUri) : null;
      await openGitHubReportIssue(info);
    }),
    vscode.commands.registerCommand("agyMarkdown.showTelemetryStats", async () => {
      await showTelemetryAndMarketplaceStats();
    })
  );

  const cfg = vscode.workspace.getConfiguration("agyMarkdown");
  if (cfg.get("syncMarkdownPreviewEnhanced", true)) {
    syncMarkdownPreviewEnhanced(context.extensionPath);
  }

  context.subscriptions.push(
    vscode.window.onDidChangeActiveColorTheme(() => {
      if (
        vscode.workspace
          .getConfiguration("agyMarkdown")
          .get("syncMarkdownPreviewEnhanced", true)
      ) {
        syncMarkdownPreviewEnhanced(context.extensionPath);
      }
    }),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (
        e.affectsConfiguration("agyMarkdown.useThemePalette") ||
        e.affectsConfiguration("workbench.colorTheme")
      ) {
        if (
          vscode.workspace
            .getConfiguration("agyMarkdown")
            .get("syncMarkdownPreviewEnhanced", true)
        ) {
          syncMarkdownPreviewEnhanced(context.extensionPath);
        }
      }
    })
  );

  try {
    vscode.commands.executeCommand("markdown.api.reloadPlugins").then(
      () => {},
      () => {}
    );
  } catch (_) {}

  return {
    extendMarkdownIt(md) {
      return extendMarkdownItWithAntigravity(md);
    }
  };
}

function deactivate() {}

module.exports = {
  activate,
  deactivate
};
