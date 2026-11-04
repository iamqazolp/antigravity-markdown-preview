"use strict";

const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFile } = require("child_process");

const activeReviewWebviewsByPath = new Map();

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

function formatDocumentTitle(filePath) {
  const base = path.basename(String(filePath || "")).replace(/\.(?:md|markdown|mdx)$/i, "");
  if (!base) return "Markdown Review";
  return base
    .split(/[_-\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
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
  return {
    fsPath,
    realPath,
    isSymlink,
    cascadeId,
    isBrainArtifact: Boolean(cascadeId)
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
      const startLine = src.slice(0, offset).split("\n").length - 1;
      const parsed = parseCodeFenceInfo(trimmedInfo, body);
      fenceMetaByLine.set(startLine, parsed);
      const canonInfo = parsed.highlightLang ? parsed.highlightLang : trimmedInfo;
      return `${indentAndFence}${canonInfo}\n${body}${indentAndFence}`;
    }
  );
  return { normalized, fenceMetaByLine };
}

async function renderMarkdownWithCarousels(markdownText, renderFn) {
  const srcText = String(markdownText || "");
  const totalLines = srcText.split(/\r?\n/).length;
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
      const docTitle = formatDocumentTitle(info.fsPath);

      if (isWebviewInitialized && !force && !contentChanged) {
        await webview.postMessage({
          type: "updateTheme",
          isLightTheme,
          themeCss
        });
        return;
      }

      let renderedHtml = "";
      try {
        renderedHtml = await renderMarkdownWithCarousels(rawText, async (mdChunk) => {
          return await vscode.commands.executeCommand("markdown.api.render", mdChunk);
        });
      } catch (_) {
        renderedHtml = `<pre>${escapeHtml(rawText)}</pre>`;
      }

      renderedHtml = rewriteLocalImageUris(
        renderedHtml,
        webview,
        path.dirname(info.realPath),
        path.dirname(info.fsPath)
      );

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
        docTitle,
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
          await openInNativeArtifactViewer(info);
        } else if (msg.type === "exportPdf") {
          await exportMarkdownToPdf({
            info,
            extensionPath: this.context.extensionPath,
            mode: msg.mode || "ask",
            computedVars: msg.computedVars || null
          });
        } else if (msg.type === "copyRaw") {
          try {
            const raw = fs.readFileSync(info.realPath, "utf8");
            await vscode.env.clipboard.writeText(raw);
            vscode.window.setStatusBarMessage(
              "Antigravity: Copied raw Markdown to clipboard",
              2500
            );
          } catch (_) {}
        } else if (msg.type === "copyText" && typeof msg.text === "string") {
          try {
            await vscode.env.clipboard.writeText(msg.text);
            vscode.window.setStatusBarMessage("Antigravity: Copied to clipboard", 2000);
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

  if (/\.(md|markdown)$/i.test(targetFsPath)) {
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

  const defaultPdfPath = info.fsPath.replace(/\.(?:md|markdown|mdx)$/i, "") + ".pdf";
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
      vscode.window.showErrorMessage(`Unable to read Markdown file: ${info.fsPath}`);
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
    renderedHtml = await renderMarkdownWithCarousels(rawText, async (mdChunk) => {
      return await vscode.commands.executeCommand("markdown.api.render", mdChunk);
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

  const docTitle = formatDocumentTitle(info.fsPath);
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

function buildWebviewHtml({
  cssUri,
  katexCssUri,
  mermaidJsUri,
  jsUri,
  renderedHtml,
  displayPath,
  docTitle,
  isBrainArtifact,
  isSymlink,
  isLightTheme,
  themeCss = "",
  syncScrollEnabled = true,
  isSplitOpen = false,
  initialLine = 0
}) {
  const effectiveTitle = docTitle || formatDocumentTitle(displayPath);
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
  <title>Antigravity Markdown Review</title>
</head>
<body class="agy-review-body ${themeClass}">
  <div class="agy-toolbar">
    <div class="agy-toolbar-left">
      <span class="agy-doc-title agy-filepath" title="${escapeHtml(displayPath)}">${escapeHtml(effectiveTitle)}</span>
    </div>
    <div class="agy-toolbar-actions">
      <button type="button" class="agy-btn agy-btn-subtle${syncActiveClass}${syncInlineHiddenClass}" id="btn-sync-inline" title="Toggle synchronized scrolling between raw Markdown and preview" aria-pressed="${syncScrollEnabled ? "true" : "false"}">⇅ Sync</button>
      <button type="button" class="agy-btn agy-btn-subtle${splitActiveClass}" id="btn-split" title="Toggle raw Markdown editor beside this review" aria-pressed="${isSplitOpen ? "true" : "false"}">Split Edit</button>
      <div class="agy-menu-wrap">
        <button type="button" class="agy-btn-icon" id="btn-more" title="More review actions" aria-haspopup="true" aria-expanded="false">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><circle cx="8" cy="3" r="1.35"/><circle cx="8" cy="8" r="1.35"/><circle cx="8" cy="13" r="1.35"/></svg>
        </button>
        <div class="agy-dropdown-menu" id="agy-more-menu" hidden>
          <button type="button" class="agy-menu-item" id="btn-sync"><span>⇅ Synchronized Scrolling</span><span class="agy-menu-check" id="sync-check">${syncScrollEnabled ? "✓" : ""}</span></button>
          <button type="button" class="agy-menu-item" id="btn-export-pdf-themed" title="Export PDF preserving your active VS Code theme background and syntax palette"><span>Export PDF (Themed)</span></button>
          <button type="button" class="agy-menu-item" id="btn-export-pdf-unthemed" title="Export print-friendly PDF with a clean white background"><span>Export PDF (Unthemed)</span></button>
          <button type="button" class="agy-menu-item" id="btn-copy"><span>Copy Raw Markdown</span></button>
          <button type="button" class="agy-menu-item" id="btn-edit"><span>Switch to Raw Editor</span></button>
          ${nativeMenuItem}
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
      const btnExportPdfThemed = document.getElementById("btn-export-pdf-themed");
      const btnExportPdfUnthemed = document.getElementById("btn-export-pdf-unthemed");
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
        if (msg.type === "scrollToLine" && typeof msg.line === "number") {
          if (!syncScrollEnabled) return;
          if (!msg.instant && performance.now() < userScrollActiveUntil) return;
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
    vscode.window.showInformationMessage("Open a Markdown file first to export to PDF.");
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

function activate(context) {
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
