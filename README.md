# Antigravity Markdown Review (`iamqazolp.agy-markdown-review`)

Applies Google Antigravity's Artifact Viewer styling and interactive enhancements to Markdown previews and custom review editors in VS Code / Antigravity.

## Features

- **Antigravity Artifact Viewer Styling**: GitHub-style callout alerts (`[!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]`, `[!CAUTION]`), interactive ````carousel` slide decks, Mermaid diagrams, KaTeX math, syntax-highlighted code blocks with 1-click copy headers, and `file://` / `conversation://` link navigation.
- **Full Syntax & Line Code Highlighting**:
  - **Okaidia Dark & Crisp Light Palettes**: Consistent syntax coloring across the Antigravity Custom Editor, VS Code's built-in Markdown Preview (`.hljs-*`), and Markdown Preview Enhanced (`.token.*`).
  - **Semantic Sub-Token Enrichment & 65+ Language Aliases**: Highlights function/method invocations, PascalCase types/classes, `self`/`cls`/`this`/`super`, decorators, keyword arguments, shell commands/flags/`ENV_VAR=` assignments, CUDA kernels (`cuda`, `cu`, `ptx`), `mojo`, `triton`, `pyspark`, `toml`, `dotenv`, SQL dialects, Diff blocks, directory trees, and auto-detects untagged code fences.
  - **Fence Metadata (`{1,3-5}`, `title="..."`, `showLineNumbers`)**: Highlight specific lines with `{1,3-5}` or `hl_lines="1 3-5"`, display a filename badge with `title="file.py"`, and enable non-selectable line numbers per block with `showLineNumbers` (or globally via `agyMarkdown.codeLineNumbers`).
- **Toggleable Split Edit Mode**: Click **Split Edit** in the review toolbar to open or close the raw Markdown editor pane beside the preview at the exact line you are reading.
- **Smooth Bidirectional Scroll Sync (Raw ↔ Preview)**:
  - **Raw → Preview**: Frame-rate-independent `requestAnimationFrame` exponential smoothing glides the preview to match the raw editor's scroll position.
  - **Preview → Raw**: User-input-gated scroll tracking updates the raw editor on line boundaries without feedback loops or trackpad momentum interruption.
  - **Toolbar Toggle**: Use the **⇅ Sync Scroll** button in the review toolbar (or the `agyMarkdown.syncScroll` setting) to toggle scroll synchronization at any time.

## Installation

```bash
python3 install.py
```

Then reload your VS Code / Antigravity window (`Developer: Reload Window`).
