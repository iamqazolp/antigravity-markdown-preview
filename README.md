# Antigravity Markdown Review (`iamqazolp.agy-markdown-review`)

Applies Google Antigravity's Artifact Viewer styling and interactive enhancements to Markdown previews and custom review editors in VS Code / Antigravity.

## Features

- **Antigravity Artifact Viewer Styling**: GitHub-style callout alerts (`[!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]`, `[!CAUTION]`), interactive ````carousel` slide decks, Mermaid diagrams, KaTeX math, syntax-highlighted code blocks with 1-click copy headers, and `file://` / `conversation://` link navigation.
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
