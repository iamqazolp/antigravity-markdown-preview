# Change Log

All notable changes to the **Antigravity Markdown Review** (`agy-markdown-review`) extension will be documented in this file.

## [1.1.1] - 2026-11-05

### Added
- **GitHub Links & 1-Click Diagnostic Issue Reporter (`agyMarkdown.openGitHub`, `agyMarkdown.reportIssue`)**:
  - Added **GitHub / Report Issue ↗** to the review toolbar `⋮` menu and Command Palette.
  - Pre-fills GitHub bug reports and feature requests with extension version, IDE name/version, OS architecture, and active VS Code color theme.
  - Added live VS Code Marketplace, Downloads, GitHub Repo, and Issue badges to `README.md`.
- **Privacy-First Telemetry with Automatic Author Exclusion & Marketplace Inspector (`agyMarkdown.showTelemetryStats`, `agyMarkdown.telemetry`)**:
  - Uses VS Code's native `vscode.env.createTelemetryLogger` (respecting `telemetry.telemetryLevel` and `agyMarkdown.telemetry`) while automatically detecting and excluding the author's development machine (`iamqazolp` / Extension Development Host) so zero author events are ever recorded.
  - Added **Antigravity: Show Extension Telemetry & Marketplace Stats** to query the live VS Code Marketplace Gallery API and break down real **In-App Installs (`install`)** vs **Direct VSIX Mirror/Scanner Downloads (`downloadCount`)** vs **Extension Updates (`updateCount`)**.

## [1.1.0] - 2026-11-05

### Added
- **PDF Export — Themed & Unthemed (`agyMarkdown.exportPdf`, `agyMarkdown.exportPdfThemed`, `agyMarkdown.exportPdfUnthemed`)**:
  - **Export PDF (Themed)**: Full-bleed vector PDF preserving the active VS Code theme's exact background color, surface tints, and syntax highlighting palette across every page, including rendered Mermaid diagrams and KaTeX math.
  - **Export PDF (Unthemed)**: Print-friendly vector PDF with a clean white background, crisp slate code blocks, and high-contrast light syntax highlighting.
  - Accessible directly from the review toolbar `⋮` menu (**Export PDF (Themed)** / **Export PDF (Unthemed)**) and the Command Palette.

## [1.0.1] - 2026-11-05

### Fixed
- Use direct `raw.githubusercontent.com` image URLs (`--baseImagesUrl`) and standard Markdown image syntax in `README.md` so all screenshots and animated GIFs render immediately on the VS Code Marketplace and Open VSX pages.
- Fix `file://` and `conversation://` link parsing when link labels contain mixed inline formatting (`<strong>`, `<em>`, `<code>`, `<span>`).

## [1.0.0] - 2026-11-05

### Added
- **Antigravity Artifact Viewer Custom Editor (`antigravity.markdownReview`)**: Default custom review editor for `.md` and `.markdown` files with a sticky review toolbar, document origin badge, and instant **Split Edit** toggle.
- **Universal Preview Support**: Applies Google Antigravity's typography, layout, and interactive components across the Antigravity Custom Editor, VS Code's built-in Markdown Preview, and Markdown Preview Enhanced (Crossnote).
- **Okaidia/Monokai & Crisp Light Syntax Highlighting**:
  - Full `.hljs-*` (Highlight.js) and `.token.*` (Prism.js) token styling for Dark Mode, Light Mode, and Print/PDF export.
  - Live active VS Code theme integration (`agyMarkdown.useThemePalette`): automatically extracts `semanticTokenColors`, `tokenColors`, and workbench surface colors (`notebook.cellEditorBackground`, `sideBar.background`) from the active theme and blends them into code wells, headers, inline code pills, and callout alerts.
  - Recursive syntax highlighting for nested code fences inside ```` ```markdown ```` blocks.
  - Fine-grained semantic sub-token enrichment (function/method invocations, PascalCase classes/types, `self`/`cls`/`this`/`super`, `@decorators`, keyword arguments, CUDA built-ins/qualifiers, shell commands, CLI `--flags`, and `ENV_VAR=` assignments).
  - Support for 65+ language aliases (`cuda`, `ptx`, `mojo`, `triton`, `pyspark`, `ts`, `tsx`, `sh`, `zsh`, `tf`, `hcl`, `toml`, `dotenv`, SQL dialects, Diff blocks, directory trees) plus automatic language detection for untagged code fences.
  - Code fence metadata: line range highlighting (`{1,3-5}` or `hl_lines="1 3-5"`), filename badges (`title="file.py"`), and optional line numbers (`showLineNumbers` or `agyMarkdown.codeLineNumbers`).
- **Interactive Antigravity Markdown Extensions**:
  - GitHub-style callout alerts (`[!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]`, `[!CAUTION]`) with SVG icons.
  - Interactive `` ````carousel `` slide decks with `<!-- slide -->` separators and keyboard/button navigation.
  - Local offline **Mermaid** diagram rendering (`mermaid.min.js`) and **KaTeX** math typesetting (`katex.min.css` + bundled fonts).
  - Clickable `file:///path#L10-L20` workspace navigation (opens at exact line range) and `conversation://` session links with 1-click UUID copy pills.
- **Smooth Bidirectional Scroll Synchronization (Raw ↔ Preview)**:
  - Frame-rate-independent `requestAnimationFrame` exponential smoothing from raw editor to preview.
  - User-input-gated preview-to-raw scroll tracking without feedback loops or trackpad momentum interruption.
