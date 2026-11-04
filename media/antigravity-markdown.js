/* ==========================================================================
   Antigravity Markdown Review — Client Enhancer
   Runs in VS Code Built-in Markdown Preview, Antigravity Custom Editor,
   and Markdown Preview Enhanced.
   ========================================================================== */
(function () {
  "use strict";

  const CURRENT_SCRIPT_SRC =
    (document.currentScript && document.currentScript.src) || "";
  const MEDIA_BASE_URI = CURRENT_SCRIPT_SRC
    ? CURRENT_SCRIPT_SRC.replace(/[^/\\]+(\?.*)?$/, "")
    : "";

  const UUID_EXACT_RE =
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
  const UUID_SHORT_RE = /^`?[0-9a-fA-F]{8}`?\s*\(current\)$/i;

  const ALERT_ICONS = {
    note: '<svg class="octicon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Zm8-6.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM6.5 7.75A.75.75 0 0 1 7.25 7h1a.75.75 0 0 1 .75.75v2.75h.25a.75.75 0 0 1 0 1.5h-2a.75.75 0 0 1 0-1.5h.25v-2h-.25a.75.75 0 0 1-.75-.75ZM8 6a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"></path></svg>',
    tip: '<svg class="octicon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M8 1.5c-2.363 0-4 1.69-4 3.75 0 .984.424 1.625.984 2.304l.214.253c.223.264.47.556.673.848.284.411.537.896.621 1.49a.75.75 0 0 1-1.484.211c-.04-.282-.163-.547-.37-.847a8.456 8.456 0 0 0-.542-.68c-.084-.1-.173-.205-.268-.32C3.201 7.75 2.5 6.766 2.5 5.25 2.5 2.31 4.863 0 8 0s5.5 2.31 5.5 5.25c0 1.516-.701 2.5-1.328 3.259-.095.115-.184.22-.268.319-.207.245-.383.453-.541.681-.208.3-.33.565-.37.847a.751.751 0 0 1-1.485-.212c.084-.593.337-1.078.621-1.489.203-.292.45-.584.673-.848.075-.088.147-.173.213-.253.561-.679.985-1.32.985-2.304 0-2.06-1.637-3.75-4-3.75ZM5.75 12h4.5a.75.75 0 0 1 0 1.5h-4.5a.75.75 0 0 1 0-1.5ZM6 15.25a.75.75 0 0 1 .75-.75h2.5a.75.75 0 0 1 0 1.5h-2.5a.75.75 0 0 1-.75-.75Z"></path></svg>',
    important: '<svg class="octicon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M0 1.75C0 .784.784 0 1.75 0h12.5C15.216 0 16 .784 16 1.75v9.5A1.75 1.75 0 0 1 14.25 13H8.06l-2.573 2.573A1.458 1.458 0 0 1 3 14.543V13H1.75A1.75 1.75 0 0 1 0 11.25Zm1.75-.25a.25.25 0 0 0-.25.25v9.5c0 .138.112.25.25.25h2a.75.75 0 0 1 .75.75v2.19l2.72-2.72a.749.749 0 0 1 .53-.22h6.5a.25.25 0 0 0 .25-.25v-9.5a.25.25 0 0 0-.25-.25Zm7 2.25v2.5a.75.75 0 0 1-1.5 0v-2.5a.75.75 0 0 1 1.5 0ZM9 9a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z"></path></svg>',
    warning: '<svg class="octicon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M6.457 1.047c.659-1.234 2.427-1.234 3.086 0l6.082 11.378A1.75 1.75 0 0 1 14.082 15H1.918a1.75 1.75 0 0 1-1.543-2.575Zm1.763.707a.25.25 0 0 0-.44 0L1.698 13.132a.25.25 0 0 0 .22.368h12.164a.25.25 0 0 0 .22-.368Zm.53 3.996v2.5a.75.75 0 0 1-1.5 0v-2.5a.75.75 0 0 1 1.5 0ZM9 11a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z"></path></svg>',
    caution: '<svg class="octicon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M4.47.22A.749.749 0 0 1 5 0h6c.199 0 .389.079.53.22l4.25 4.25c.141.14.22.331.22.53v6a.749.749 0 0 1-.22.53l-4.25 4.25A.749.749 0 0 1 11 16H5a.749.749 0 0 1-.53-.22L.22 11.53A.749.749 0 0 1 0 11V5c0-.199.079-.389.22-.53Zm.84 1.28L1.5 5.31v5.38l3.81 3.81h5.38l3.81-3.81V5.31L10.69 1.5ZM8 4a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 8 4Zm0 8a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"></path></svg>'
  };

  const ALERT_LABELS = {
    note: "Note",
    tip: "Tip",
    important: "Important",
    warning: "Warning",
    caution: "Caution"
  };

  function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
    }
    return fallbackCopy(text);
  }

  function fallbackCopy(text) {
    return new Promise((resolve) => {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
      } catch (_) {}
      resolve();
    });
  }

  function parseColorLuminance(colorStr) {
    const s = String(colorStr || "").trim();
    if (!s) return null;
    const rgbMatch = s.match(
      /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/i
    );
    if (rgbMatch) {
      if (rgbMatch[4] !== undefined && parseFloat(rgbMatch[4]) === 0) return null;
      const r = Number(rgbMatch[1]);
      const g = Number(rgbMatch[2]);
      const b = Number(rgbMatch[3]);
      return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    }
    const hexMatch = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (hexMatch) {
      const hex = hexMatch[1];
      const r =
        hex.length === 3
          ? parseInt(hex[0] + hex[0], 16)
          : parseInt(hex.slice(0, 2), 16);
      const g =
        hex.length === 3
          ? parseInt(hex[1] + hex[1], 16)
          : parseInt(hex.slice(2, 4), 16);
      const b =
        hex.length === 3
          ? parseInt(hex[2] + hex[2], 16)
          : parseInt(hex.slice(4, 6), 16);
      return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    }
    return null;
  }

  function detectThemeIsLight() {
    try {
      const rootStyle = window.getComputedStyle(document.documentElement);
      const vscodeBg = rootStyle.getPropertyValue("--vscode-editor-background");
      const lumFromVar = parseColorLuminance(vscodeBg);
      if (lumFromVar !== null) {
        return lumFromVar > 0.55;
      }
      const target =
        document.querySelector(".markdown-preview") || document.body;
      if (target) {
        const lumFromBg = parseColorLuminance(
          window.getComputedStyle(target).backgroundColor
        );
        if (lumFromBg !== null) {
          return lumFromBg > 0.55;
        }
      }
    } catch (_) {}
    return Boolean(
      document.body &&
        (document.body.classList.contains("vscode-light") ||
          document.body.classList.contains("vscode-high-contrast-light"))
    );
  }

  function syncThemeClass() {
    if (!document.body) return false;
    const isLight = detectThemeIsLight();
    const mpe = document.querySelector(".markdown-preview");
    if (isLight) {
      if (!document.body.classList.contains("vscode-light")) {
        document.body.classList.add("vscode-light");
      }
      if (document.body.classList.contains("vscode-dark")) {
        document.body.classList.remove("vscode-dark");
      }
      if (mpe) {
        if (!mpe.classList.contains("vscode-light")) mpe.classList.add("vscode-light");
        if (mpe.classList.contains("vscode-dark")) mpe.classList.remove("vscode-dark");
      }
    } else {
      if (!document.body.classList.contains("vscode-dark")) {
        document.body.classList.add("vscode-dark");
      }
      if (document.body.classList.contains("vscode-light")) {
        document.body.classList.remove("vscode-light");
      }
      if (mpe) {
        if (!mpe.classList.contains("vscode-dark")) mpe.classList.add("vscode-dark");
        if (mpe.classList.contains("vscode-light")) mpe.classList.remove("vscode-light");
      }
    }
    return isLight;
  }

  let katexStylesChecked = false;
  function ensureKatexStylesLoaded(root) {
    if (katexStylesChecked) return;
    if (!root.querySelector(".katex, .katex-display, .katex-mathml")) return;
    katexStylesChecked = true;
    const existing = Array.from(
      document.querySelectorAll('link[rel="stylesheet"]')
    ).some((l) => (l.getAttribute("href") || "").includes("katex"));
    if (existing || !MEDIA_BASE_URI || !document.head) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = MEDIA_BASE_URI + "katex.min.css";
    document.head.appendChild(link);
  }

  function getDocumentAncestorDirs() {
    const m = CURRENT_SCRIPT_SRC.match(
      /^(https?:\/\/[^/]+)(\/Users\/[^/]+|\/home\/[^/]+)/i
    );
    const webviewOrigin = m ? m[1] : "";
    const homeDir = m ? m[2] : "";
    const fpEl = document.querySelector(".agy-filepath");
    const rawFp = fpEl
      ? (fpEl.getAttribute("title") || fpEl.textContent || "").trim()
      : "";
    if (!rawFp || !homeDir) {
      return { webviewOrigin, dirs: [] };
    }
    const targetFp = rawFp.includes("→")
      ? rawFp.split("→").pop().trim()
      : rawFp;
    const fullDocPath = targetFp.startsWith("~")
      ? homeDir + targetFp.slice(1)
      : targetFp;
    const docDir = fullDocPath.replace(/\/[^/]+$/, "");

    const dirs = [];
    // Prefer workspace project root (e.g., ~/Documents/Projects/<project>) first
    const projMatch = docDir.match(
      /^(\/(?:Users|home)\/[^/]+\/Documents\/Projects\/[^/]+)/
    );
    if (projMatch) {
      dirs.push(projMatch[1]);
    }
    let curr = docDir;
    while (curr && curr.length >= homeDir.length && curr !== "/") {
      if (!dirs.includes(curr)) {
        dirs.push(curr);
      }
      const parent = curr.replace(/\/[^/]+$/, "");
      if (!parent || parent === curr) break;
      curr = parent;
    }
    return { webviewOrigin, dirs };
  }

  function fixBrokenImages(root) {
    const imgs = root.querySelectorAll("img[src]:not([data-agy-img-checked='1'])");
    if (!imgs.length) return;
    const { webviewOrigin, dirs } = getDocumentAncestorDirs();

    imgs.forEach((img) => {
      img.setAttribute("data-agy-img-checked", "1");
      img.decoding = "sync";
      img.loading = "eager";
      const rawSrc = img.getAttribute("src") || "";
      let relAsset = null;

      // Case 1: Webview resource URI that resolved "/assets/..." to filesystem root "/"
      const originMatch = rawSrc.match(
        /^https?:\/\/[^/]+\/(?!Users\/|home\/)(assets\/.+)$/i
      );
      if (originMatch) {
        relAsset = originMatch[1];
      } else if (/^\/?assets\//i.test(rawSrc)) {
        relAsset = rawSrc.replace(/^\/+/, "");
      } else if (/^file:\/\/\/assets\//i.test(rawSrc)) {
        relAsset = rawSrc.replace(/^file:\/\/\/+/i, "");
      }

      if (relAsset && webviewOrigin && dirs.length) {
        const candidateUrls = dirs.map(
          (d) => webviewOrigin + d + "/" + relAsset
        );
        if (candidateUrls.length) {
          let tryIdx = 0;
          img.src = candidateUrls[0];
          img.addEventListener("error", function onImgErr() {
            tryIdx += 1;
            if (tryIdx < candidateUrls.length) {
              img.src = candidateUrls[tryIdx];
            } else {
              img.removeEventListener("error", onImgErr);
            }
          });
        }
      }

      const lockDimensions = () => {
        if (
          img.naturalWidth > 0 &&
          img.naturalHeight > 0 &&
          !img.getAttribute("width") &&
          !img.getAttribute("height")
        ) {
          img.setAttribute("width", String(img.naturalWidth));
          img.setAttribute("height", String(img.naturalHeight));
        }
        window.dispatchEvent(new CustomEvent("agy.markdown.layoutChanged"));
      };
      if (img.complete && img.naturalWidth > 0) {
        lockDimensions();
      } else {
        img.addEventListener("load", lockDimensions, { once: true });
      }
    });
  }

  function repairMangledCarousels(root) {
    // If an un-reloaded Extension Host ran an older regex that stopped at an inner
    // ```mermaid fence, the mermaid diagram leaked right after .agy-carousel as
    // <p>mermaid\nflowchart...</p> followed by <pre> blocks and an empty <pre> block.
    root.querySelectorAll(".agy-carousel").forEach((carousel) => {
      let next = carousel.nextElementSibling;
      while (
        next &&
        next.tagName &&
        next.tagName.toLowerCase() === "p" &&
        /^mermaid\s+(?:flowchart|graph|sequenceDiagram|stateDiagram|classDiagram|erDiagram|xychart)/i.test(
          (next.textContent || "").trim()
        )
      ) {
        const pNode = next;
        const parts = [
          (pNode.textContent || "").trim().replace(/^mermaid\s*\n?/i, "")
        ];
        let cursor = pNode.nextElementSibling;
        const toRemove = [pNode];

        while (cursor) {
          const tag = (cursor.tagName || "").toLowerCase();
          const isPre =
            tag === "pre" || cursor.classList.contains("agy-code-block");
          if (!isPre) break;
          const codeEl = cursor.querySelector
            ? cursor.querySelector("code") || cursor
            : cursor;
          const txt = (codeEl.textContent || "").trim();
          toRemove.push(cursor);
          cursor = cursor.nextElementSibling;
          if (!txt) {
            // Reached the closing empty fence block (` ```\n```` `)
            break;
          }
          parts.push(txt);
        }

        const fullMermaidSrc = parts.join("\n\n").trim();
        toRemove.forEach((n) => n.remove());

        if (fullMermaidSrc) {
          const slideDiv = document.createElement("div");
          slideDiv.className = "agy-carousel-slide";
          const mContainer = document.createElement("div");
          mContainer.className = "agy-mermaid-container";
          const mDiv = document.createElement("div");
          mDiv.className = "mermaid";
          mDiv.setAttribute("data-mermaid-src", fullMermaidSrc);
          mDiv.textContent = fullMermaidSrc;
          mContainer.appendChild(mDiv);
          slideDiv.appendChild(mContainer);
          carousel.appendChild(slideDiv);
          carousel.removeAttribute("data-agy-bound");
        }

        next = carousel.nextElementSibling;
      }
    });
  }

  function transformAlerts(root) {
    const blockquotes = root.querySelectorAll("blockquote:not(.markdown-alert)");
    blockquotes.forEach((bq) => {
      const firstP = bq.querySelector("p:first-child");
      if (!firstP) return;
      const text = firstP.innerHTML.trim();
      const match = text.match(
        /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\](?:\s*<br\s*\/?>|\s*\n|\s+)?([\s\S]*)$/i
      );
      if (!match) return;

      const type = match[1].toLowerCase();
      const remainder = match[2] || "";

      const dl = bq.getAttribute("data-line") || firstP.getAttribute("data-line");
      const dle = bq.getAttribute("data-line-end") || firstP.getAttribute("data-line-end");
      const alertDiv = document.createElement("div");
      alertDiv.className =
        "markdown-alert markdown-alert-" + type + (dl !== null ? " code-line" : "");
      if (dl !== null) alertDiv.setAttribute("data-line", dl);
      if (dle !== null) alertDiv.setAttribute("data-line-end", dle);

      const titleP = document.createElement("p");
      titleP.className = "markdown-alert-title";
      titleP.innerHTML = (ALERT_ICONS[type] || "") + ALERT_LABELS[type];
      alertDiv.appendChild(titleP);

      if (remainder.trim()) {
        firstP.innerHTML = remainder.trim();
      } else {
        firstP.remove();
      }

      while (bq.firstChild) {
        alertDiv.appendChild(bq.firstChild);
      }
      bq.replaceWith(alertDiv);
    });
  }

  function transformTables(root) {
    const tables = root.querySelectorAll("table");
    tables.forEach((table) => {
      if (
        table.classList.contains("mtable") ||
        table.closest(".katex, .katex-display, .katex-html, mjx-container, .MathJax")
      ) {
        return;
      }
      if (
        table.parentElement &&
        table.parentElement.classList.contains("agy-table-wrapper")
      ) {
        return;
      }
      const wrapper = document.createElement("div");
      wrapper.className = "agy-table-wrapper";
      table.parentNode.insertBefore(wrapper, table);
      wrapper.appendChild(table);
    });
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

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

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
    if (/[┌┐└┘├┤┬┴┼───│═║╔╗╚╝╠╣╦╩╬]/.test(s) && !/├──|└──/.test(s)) {
      return "";
    }
    if (/^(?:diff --git|--- a\/|\+\+\+ b\/|@@ -\d+)/m.test(s)) return "diff";
    if (/^\s*\{[\s\S]*"[^"]+"\s*:/m.test(s) && /[\]}]\s*$/.test(s)) return "json";
    if (
      /^\s*(?:def |class |from [a-zA-Z0-9_.]+ import |import [a-zA-Z0-9_]+|@[a-zA-Z_][\w.]*\s*\n\s*(?:def|class)\b)/m.test(
        s
      )
    ) {
      return "python";
    }
    if (/^\s*(?:#include\s+[<"]|__global__\s+void\b|int\s+main\s*\()/m.test(s)) {
      return "cpp";
    }
    if (
      /^\s*(?:pub\s+(?:fn|struct|enum|trait)\b|fn\s+\w+\s*\(|impl(?:<[^>]+>)?\s+\w+)/m.test(
        s
      )
    ) {
      return "rust";
    }
    if (/^\s*(?:package\s+\w+|func\s+(?:\([^)]+\)\s*)?\w+\s*\()/m.test(s)) {
      return "go";
    }
    if (
      /^\s*(?:interface\s+[A-Z]\w*|type\s+[A-Z]\w*\s*=|export\s+(?:default\s+|async\s+)?(?:function|class|const|interface|type)\b|const\s+\w+\s*=\s*(?:async\s*)?\()/m.test(
        s
      )
    ) {
      return "typescript";
    }
    if (
      /^\s*(?:SELECT\b[\s\S]+\bFROM\b|CREATE\s+TABLE\b|INSERT\s+INTO\b|ALTER\s+TABLE\b)/im.test(
        s
      )
    ) {
      return "sql";
    }
    if (
      /^(?:#!\/bin\/(?:ba|z)?sh|\s*(?:\$\s+)?(?:python3?|pip3?|uv|npm|npx|git|docker|kubectl|cargo|curl|brew|chmod|mkdir|export)\s+\S+)/m.test(
        s
      )
    ) {
      return "bash";
    }
    return "";
  }

  function detectLanguage(pre, code) {
    const dataLang =
      (code && code.getAttribute("data-lang")) || pre.getAttribute("data-lang");
    if (dataLang && dataLang !== "text" && dataLang !== "plaintext") {
      return dataLang.toLowerCase();
    }
    const classes = ((code ? code.className : "") + " " + pre.className).split(
      /\s+/
    );
    for (const cls of classes) {
      const m = cls.match(/^(?:language-|lang-)([a-zA-Z0-9_+#.-]+)/i);
      if (m && m[1] && m[1] !== "text" && m[1] !== "plaintext") {
        return m[1].toLowerCase();
      }
    }
    const rawText = (code ? code.textContent : pre.textContent) || "";
    return detectUntaggedCodeLang(rawText);
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

  const CONTAINER_SPAN_CLASSES = new Set([
    "hljs-params",
    "hljs-function",
    "hljs-subst"
  ]);
  const SHELL_LANG_SET = new Set([
    "bash",
    "sh",
    "zsh",
    "fish",
    "shell",
    "console",
    "terminal"
  ]);
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

  function highlightFallbackPlainCode(rawCode, lang) {
    const raw = String(rawCode || "");
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

  function enrichCodeBlockElement(targetEl, rawLang, hlLinesSpec, showLineNumbers) {
    if (!targetEl || targetEl.getAttribute("data-agy-highlighted") === "1") {
      return;
    }
    const lang = (LANG_ALIAS_MAP[rawLang] || rawLang || "").toLowerCase();
    let html = targetEl.innerHTML || "";
    const hasSpans = /\bclass=["'][^"']*\b(?:hljs-|token\b)/i.test(html);

    if (!hasSpans) {
      const rawText = targetEl.textContent || "";
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

    targetEl.innerHTML = html;
    targetEl.setAttribute("data-agy-highlighted", "1");
  }

  let mermaidLoadingPromise = null;
  let mermaidRenderSeq = 0;

  function ensureMermaidLoaded() {
    if (window.mermaid && typeof window.mermaid.render === "function") {
      return Promise.resolve(window.mermaid);
    }
    if (mermaidLoadingPromise) {
      return mermaidLoadingPromise;
    }
    if (!MEDIA_BASE_URI || !document.head) {
      return Promise.resolve(null);
    }
    mermaidLoadingPromise = new Promise((resolve) => {
      const script = document.createElement("script");
      script.src = MEDIA_BASE_URI + "mermaid.min.js";
      script.onload = () => resolve(window.mermaid || null);
      script.onerror = () => resolve(null);
      document.head.appendChild(script);
    });
    return mermaidLoadingPromise;
  }

  function transformMermaidBlocks(root) {
    // Only render Mermaid directly inside our Custom Editor (body.agy-review-body).
    // VS Code Built-in Markdown Preview (body.vscode-body) and MPE (.markdown-preview)
    // already have their own Mermaid renderers.
    if (!document.body || !document.body.classList.contains("agy-review-body")) {
      return;
    }

    const scope = root || document.body;
    const candidates = scope.querySelectorAll(
      "pre.mermaid, pre > code.language-mermaid, pre > code.lang-mermaid"
    );
    candidates.forEach((node) => {
      const pre = node.tagName.toLowerCase() === "pre" ? node : node.parentElement;
      if (!pre || !pre.parentNode) return;
      if (
        pre.parentElement &&
        pre.parentElement.classList.contains("agy-mermaid-container")
      ) {
        return;
      }
      const rawSource = (node.textContent || "").trim();
      if (!rawSource) return;

      const dl = pre.getAttribute("data-line") || node.getAttribute("data-line");
      const container = document.createElement("div");
      container.className = "agy-mermaid-container" + (dl !== null ? " code-line" : "");
      if (dl !== null) {
        const startLine = parseInt(dl, 10);
        const lineSpan = (rawSource.match(/\n/g) || []).length + 2;
        if (!Number.isNaN(startLine)) {
          container.setAttribute("data-line", String(startLine));
          container.setAttribute("data-line-end", String(startLine + lineSpan));
        }
      }
      const mermaidDiv = document.createElement("div");
      mermaidDiv.className = "mermaid";
      mermaidDiv.setAttribute("data-mermaid-src", rawSource);
      mermaidDiv.textContent = rawSource;
      container.appendChild(mermaidDiv);
      pre.replaceWith(container);
    });

    const isLight = detectThemeIsLight();
    const desiredTheme = isLight ? "default" : "dark";

    const allMermaidNodes = Array.from(scope.querySelectorAll(".mermaid"));
    const pendingNodes = allMermaidNodes.filter((el) => {
      if (!el.getAttribute("data-mermaid-src")) {
        const txt = (el.textContent || "").trim();
        if (txt) {
          el.setAttribute("data-mermaid-src", txt);
        }
      }
      const src = el.getAttribute("data-mermaid-src") || "";
      if (!src) return false;
      const renderedTheme = el.getAttribute("data-mermaid-rendered");
      const hasSvg = Boolean(el.querySelector("svg"));
      return !hasSvg || renderedTheme !== desiredTheme;
    });

    if (!pendingNodes.length) return;

    ensureMermaidLoaded().then(async (mermaid) => {
      if (!mermaid) return;
      try {
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "loose",
          theme: desiredTheme,
          fontFamily:
            'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        });
      } catch (_) {}

      for (const el of pendingNodes) {
        const source = (el.getAttribute("data-mermaid-src") || "").trim();
        if (!source) continue;
        try {
          const id =
            "agy-mermaid-" +
            ++mermaidRenderSeq +
            "-" +
            Math.random().toString(36).slice(2, 7);
          const res = await mermaid.render(id, source);
          if (res && res.svg) {
            el.innerHTML = res.svg;
            el.setAttribute("data-mermaid-rendered", desiredTheme);
          }
        } catch (_) {
          el.setAttribute("data-mermaid-rendered", desiredTheme);
        }
      }
      window.dispatchEvent(new CustomEvent("agy.markdown.layoutChanged"));
    });
  }

  function transformCodeBlocks(root) {
    const pres = root.querySelectorAll("pre");
    pres.forEach((pre) => {
      if (
        pre.classList.contains("mermaid") ||
        (pre.parentElement &&
          (pre.parentElement.classList.contains("agy-code-block") ||
            pre.parentElement.classList.contains("agy-mermaid-container")))
      ) {
        return;
      }
      const code = pre.querySelector("code");
      const lang = detectLanguage(pre, code);

      if (lang === "carousel") {
        transformCarouselPre(pre, code ? code.textContent : pre.textContent);
        return;
      }
      if (lang === "mermaid") {
        return;
      }

      const targetEl = code || pre;
      const rawCodeText = (targetEl.textContent || "").replace(/\n$/, "");
      const title =
        (code && code.getAttribute("data-title")) ||
        pre.getAttribute("data-title") ||
        "";
      const hlLines =
        (code && code.getAttribute("data-hl-lines")) ||
        pre.getAttribute("data-hl-lines") ||
        "";
      const showLineNumbers =
        ((code && code.getAttribute("data-line-numbers")) ||
          pre.getAttribute("data-line-numbers")) === "1";

      enrichCodeBlockElement(targetEl, lang, hlLines, showLineNumbers);

      const wrapper = document.createElement("div");
      wrapper.className = "agy-code-block";
      const dl = (code && code.getAttribute("data-line")) || pre.getAttribute("data-line");
      const dle =
        (code && code.getAttribute("data-line-end")) || pre.getAttribute("data-line-end");
      if (dl !== null) {
        const startLine = parseInt(dl, 10);
        const rawLines = (rawCodeText.match(/\n/g) || []).length + 1;
        const endLine =
          dle !== null && !Number.isNaN(parseInt(dle, 10))
            ? parseInt(dle, 10)
            : startLine + rawLines + 1;
        if (!Number.isNaN(startLine)) {
          wrapper.classList.add("code-line");
          wrapper.setAttribute("data-line", String(startLine));
          wrapper.setAttribute("data-line-end", String(endLine));
        }
      }

      const header = document.createElement("div");
      header.className = "agy-code-header";

      const headerLeft = document.createElement("div");
      headerLeft.className = "agy-code-header-left";

      const langSpan = document.createElement("span");
      langSpan.className = "agy-code-lang";
      langSpan.textContent = lang || "code";
      headerLeft.appendChild(langSpan);

      if (title) {
        const titleSpan = document.createElement("span");
        titleSpan.className = "agy-code-title";
        titleSpan.textContent = title;
        titleSpan.title = title;
        headerLeft.appendChild(titleSpan);
      }

      const copyBtn = document.createElement("button");
      copyBtn.className = "agy-copy-btn";
      copyBtn.type = "button";
      copyBtn.textContent = "Copy";
      copyBtn.addEventListener("click", () => {
        copyToClipboard(rawCodeText).then(() => {
          copyBtn.textContent = "✓ Copied!";
          copyBtn.classList.add("copied");
          setTimeout(() => {
            copyBtn.textContent = "Copy";
            copyBtn.classList.remove("copied");
          }, 1500);
        });
      });

      header.appendChild(headerLeft);
      header.appendChild(copyBtn);

      pre.parentNode.insertBefore(wrapper, pre);
      wrapper.appendChild(header);
      wrapper.appendChild(pre);
    });
  }

  function transformCarouselPre(pre, rawText) {
    const slides = String(rawText || "")
      .split(/<!--\s*slide\s*-->/i)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!slides.length) return;

    const codeEl = pre.querySelector("code");
    const dl = (codeEl && codeEl.getAttribute("data-line")) || pre.getAttribute("data-line");
    const container = document.createElement("div");
    container.className = "agy-carousel" + (dl !== null ? " code-line" : "");
    container.setAttribute("data-agy-bound", "1");
    if (dl !== null) {
      const startLine = parseInt(dl, 10);
      const lineSpan = (String(rawText || "").match(/\n/g) || []).length + 2;
      if (!Number.isNaN(startLine)) {
        container.setAttribute("data-line", String(startLine));
        container.setAttribute("data-line-end", String(startLine + lineSpan));
      }
    }

    let idx = 0;
    const header = document.createElement("div");
    header.className = "agy-carousel-header";

    const counter = document.createElement("span");
    counter.className = "agy-carousel-counter";
    counter.textContent = "Slide 1 of " + slides.length;

    const controls = document.createElement("div");
    controls.className = "agy-carousel-controls";

    const prevBtn = document.createElement("button");
    prevBtn.className = "agy-btn agy-carousel-prev";
    prevBtn.type = "button";
    prevBtn.textContent = "← Prev";

    const nextBtn = document.createElement("button");
    nextBtn.className = "agy-btn agy-carousel-next";
    nextBtn.type = "button";
    nextBtn.textContent = "Next →";

    controls.appendChild(prevBtn);
    controls.appendChild(nextBtn);
    header.appendChild(counter);
    header.appendChild(controls);
    container.appendChild(header);

    const slideEls = slides.map((slideText, i) => {
      const el = document.createElement("div");
      el.className = "agy-carousel-slide" + (i === 0 ? " active" : "");
      const p = document.createElement("pre");
      p.textContent = slideText;
      el.appendChild(p);
      container.appendChild(el);
      return el;
    });

    function showSlide(nextIdx) {
      idx = (nextIdx + slideEls.length) % slideEls.length;
      slideEls.forEach((el, i) => el.classList.toggle("active", i === idx));
      counter.textContent = "Slide " + (idx + 1) + " of " + slideEls.length;
    }

    prevBtn.addEventListener("click", () => showSlide(idx - 1));
    nextBtn.addEventListener("click", () => showSlide(idx + 1));

    pre.replaceWith(container);
  }

  function bindInteractiveCarousels(root) {
    root
      .querySelectorAll(".agy-carousel:not([data-agy-bound='1'])")
      .forEach((carousel) => {
        carousel.setAttribute("data-agy-bound", "1");
        const slideEls = Array.from(
          carousel.querySelectorAll(".agy-carousel-slide")
        );
        if (!slideEls.length) return;
        const counter = carousel.querySelector(".agy-carousel-counter");
        const prevBtn = carousel.querySelector(".agy-carousel-prev");
        const nextBtn = carousel.querySelector(".agy-carousel-next");
        let idx = slideEls.findIndex((el) => el.classList.contains("active"));
        if (idx < 0) idx = 0;

        if (counter) {
          counter.textContent =
            "Slide " + (idx + 1) + " of " + slideEls.length;
        }

        function show(nextIdx) {
          idx = (nextIdx + slideEls.length) % slideEls.length;
          slideEls.forEach((el, i) => el.classList.toggle("active", i === idx));
          if (counter) {
            counter.textContent =
              "Slide " + (idx + 1) + " of " + slideEls.length;
          }
          transformMermaidBlocks(slideEls[idx]);
        }

        if (prevBtn) {
          const newPrev = prevBtn.cloneNode(true);
          prevBtn.replaceWith(newPrev);
          newPrev.addEventListener("click", () => show(idx - 1));
        }
        if (nextBtn) {
          const newNext = nextBtn.cloneNode(true);
          nextBtn.replaceWith(newNext);
          newNext.addEventListener("click", () => show(idx + 1));
        }
      });
  }

  function ensureHeadingIds(root) {
    const unchecked = root.querySelectorAll(
      "h1:not([id]):not([data-agy-slug='1']), h2:not([id]):not([data-agy-slug='1']), h3:not([id]):not([data-agy-slug='1']), h4:not([id]):not([data-agy-slug='1']), h5:not([id]):not([data-agy-slug='1']), h6:not([id]):not([data-agy-slug='1'])"
    );
    if (!unchecked.length) return;
    const used = new Set();
    root.querySelectorAll("[id]").forEach((el) => used.add(el.id));
    unchecked.forEach((h) => {
      h.setAttribute("data-agy-slug", "1");
      const base = (h.textContent || "")
        .trim()
        .toLowerCase()
        .replace(/[^\w\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/^-+|-+$/g, "");
      if (!base) return;
      let slug = base;
      let n = 1;
      while (used.has(slug)) {
        slug = base + "-" + n++;
      }
      h.id = slug;
      used.add(slug);
    });
  }

  function decorateLinks(root) {
    root
      .querySelectorAll("a[href]:not([data-agy-link='1'])")
      .forEach((a) => {
        a.setAttribute("data-agy-link", "1");
        a.setAttribute("draggable", "false");
        const href = a.getAttribute("href") || "";
        if (href.startsWith("file://")) {
          a.classList.add("agy-file-link");
        } else if (href.startsWith("conversation://")) {
          a.classList.add("agy-conv-link");
        }
      });

    // Add 1-click Copy buttons next to Session UUID inline code elements
    root
      .querySelectorAll(":not(pre) > code:not([data-agy-uuid-checked='1'])")
      .forEach((code) => {
        code.setAttribute("data-agy-uuid-checked", "1");
        const text = (code.textContent || "").trim();
        if (!UUID_EXACT_RE.test(text) && !UUID_SHORT_RE.test(text)) return;
        if (code.closest("a")) return;
        const copyUuid = text.replace(/\s*\(current\)$/i, "").replace(/`/g, "");
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "agy-uuid-copy-btn";
        btn.title = "Copy Session ID: " + copyUuid;
        btn.textContent = "Copy";
        btn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          copyToClipboard(copyUuid).then(() => {
            btn.textContent = "✓";
            setTimeout(() => {
              btn.textContent = "Copy";
            }, 1400);
          });
        });
        code.insertAdjacentElement("afterend", btn);
      });
  }

  let isEnhancing = false;
  function enhanceAll() {
    const root = document.body;
    if (!root || isEnhancing) return;
    isEnhancing = true;
    try {
      syncThemeClass();
      ensureKatexStylesLoaded(root);
      ensureHeadingIds(root);
      repairMangledCarousels(root);
      fixBrokenImages(root);
      transformAlerts(root);
      transformTables(root);
      transformMermaidBlocks(root);
      transformCodeBlocks(root);
      bindInteractiveCarousels(root);
      decorateLinks(root);
      window.dispatchEvent(new CustomEvent("agy.markdown.layoutChanged"));
    } finally {
      isEnhancing = false;
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", enhanceAll);
  } else {
    enhanceAll();
  }

  window.addEventListener("vscode.markdown.updateContent", () => {
    setTimeout(enhanceAll, 10);
  });

  // In Custom Editor (body.agy-review-body), DOM content is static until webview update;
  // only watch body/root class/style for theme changes so scrolling has zero observer overhead.
  let isScrolling = false;
  let scrollIdleTimer = null;
  window.addEventListener(
    "scroll",
    () => {
      isScrolling = true;
      if (scrollIdleTimer) clearTimeout(scrollIdleTimer);
      scrollIdleTimer = setTimeout(() => {
        isScrolling = false;
      }, 220);
    },
    { capture: true, passive: true }
  );

  let debounceTimer = null;
  const observer = new MutationObserver((mutations) => {
    if (isEnhancing || isScrolling) return;
    const relevant = mutations.some((m) => {
      if (m.type === "attributes") {
        return (
          m.target === document.body || m.target === document.documentElement
        );
      }
      const targetEl =
        m.target && m.target.nodeType === 1 ? m.target : m.target.parentElement;
      if (
        targetEl &&
        targetEl.closest(
          ".mermaid, .agy-uuid-copy-btn, .agy-copy-btn, .agy-carousel-counter"
        )
      ) {
        return false;
      }
      return true;
    });
    if (!relevant) return;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(enhanceAll, 120);
  });

  if (document.documentElement) {
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style", "data-vscode-theme-kind"]
    });
  }
  if (document.body) {
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["class", "style"]
    });
    if (!document.body.classList.contains("agy-review-body")) {
      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
    }
  }
})();
