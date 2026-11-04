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

  function detectLanguage(pre, code) {
    const classes = ((code ? code.className : "") + " " + pre.className).split(
      /\s+/
    );
    for (const cls of classes) {
      const m = cls.match(/^(?:language-|lang-)(.+)$/i);
      if (m && m[1] && m[1] !== "text" && m[1] !== "plaintext") {
        return m[1].toLowerCase();
      }
    }
    return pre.getAttribute("data-lang") || "";
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

      const wrapper = document.createElement("div");
      wrapper.className = "agy-code-block";
      const dl = (code && code.getAttribute("data-line")) || pre.getAttribute("data-line");
      const dle =
        (code && code.getAttribute("data-line-end")) || pre.getAttribute("data-line-end");
      if (dl !== null) {
        const startLine = parseInt(dl, 10);
        const rawLines =
          (((code ? code.textContent : pre.textContent) || "")
            .replace(/\n$/, "")
            .match(/\n/g) || []).length + 1;
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

      const langSpan = document.createElement("span");
      langSpan.className = "agy-code-lang";
      langSpan.textContent = lang || "code";

      const copyBtn = document.createElement("button");
      copyBtn.className = "agy-copy-btn";
      copyBtn.type = "button";
      copyBtn.textContent = "Copy";
      copyBtn.addEventListener("click", () => {
        const raw = code ? code.innerText : pre.innerText;
        copyToClipboard(raw).then(() => {
          copyBtn.textContent = "Copied!";
          setTimeout(() => {
            copyBtn.textContent = "Copy";
          }, 1500);
        });
      });

      header.appendChild(langSpan);
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
