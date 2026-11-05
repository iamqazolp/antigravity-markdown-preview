#!/usr/bin/env python3
"""Install or update the Antigravity Markdown Review (`iamqazolp.agy-markdown-review`) VS Code extension."""

from __future__ import annotations

import json
import os
import shutil
import sys
import time
from pathlib import Path


EXT_ID = "iamqazolp.agy-markdown-review"
COPY_ITEMS = ("extension.js", "package.json", "media", "README.md", "CHANGELOG.md", "LICENSE")


def install_extension(repo_root: Path) -> list[Path]:
    """Install the extension into `~/.vscode/extensions/` (and Antigravity/Cursor if present)
    and sync Markdown Preview Enhanced (`~/.local/state/crossnote/style.less`).
    """
    pkg = json.loads((repo_root / "package.json").read_text(encoding="utf-8"))
    ext_version = str(pkg.get("version", "1.0.2"))
    ext_dir_name = f"{EXT_ID}-{ext_version}"

    home = Path.home()
    ext_roots = [
        home / ".vscode" / "extensions",
        home / ".antigravity" / "extensions",
        home / ".cursor" / "extensions",
    ]

    installed_paths: list[Path] = []
    for idx, root in enumerate(ext_roots):
        if idx > 0 and not root.exists():
            continue
        root.mkdir(parents=True, exist_ok=True)
        target = root / ext_dir_name
        previous_names: list[str] = []
        for old_dir in root.glob(f"{EXT_ID}-*"):
            if old_dir.name != ext_dir_name:
                previous_names.append(old_dir.name)
            if old_dir.is_symlink():
                old_dir.unlink()
            elif old_dir.is_dir():
                shutil.rmtree(old_dir)
        target.mkdir(parents=True, exist_ok=True)

        for item_name in COPY_ITEMS:
            src = repo_root / item_name
            if not src.exists():
                continue
            dst = target / item_name
            if src.is_dir():
                shutil.copytree(
                    src,
                    dst,
                    ignore=shutil.ignore_patterns("__pycache__", "*.pyc", ".DS_Store"),
                )
            else:
                shutil.copy2(src, dst)

        for prev_name in previous_names:
            prev_link = root / prev_name
            if not prev_link.exists() and not prev_link.is_symlink():
                try:
                    prev_link.symlink_to(target)
                except Exception:
                    pass

        installed_paths.append(target)

        manifest_path = root / "extensions.json"
        entries: list = []
        if manifest_path.exists():
            try:
                loaded = json.loads(manifest_path.read_text(encoding="utf-8", errors="ignore"))
                if isinstance(loaded, list):
                    entries = [
                        e
                        for e in loaded
                        if not (isinstance(e, dict) and e.get("identifier", {}).get("id") == EXT_ID)
                    ]
            except Exception:
                entries = []

        target_posix = target.as_posix()
        entries.append(
            {
                "identifier": {"id": EXT_ID},
                "version": ext_version,
                "location": {
                    "$mid": 1,
                    "fsPath": str(target),
                    "external": f"file://{target_posix}",
                    "path": target_posix,
                    "scheme": "file",
                },
                "relativeLocation": ext_dir_name,
                "metadata": {
                    "installedTimestamp": int(time.time() * 1000),
                    "pinned": False,
                    "source": "vsix",
                    "publisherDisplayName": "iamqazolp",
                    "targetPlatform": "undefined",
                    "updated": False,
                    "private": False,
                    "isPreReleaseVersion": False,
                    "hasPreReleaseVersion": False,
                },
            }
        )
        manifest_path.write_text(json.dumps(entries), encoding="utf-8", newline="\n")

    try:
        crossnote_dir = home / ".local" / "state" / "crossnote"
        crossnote_dir.mkdir(parents=True, exist_ok=True)
        css_text = (repo_root / "media" / "antigravity-markdown.css").read_text(encoding="utf-8")
        style_less = crossnote_dir / "style.less"
        begin_marker = "/* BEGIN ANTIGRAVITY MARKDOWN STYLE */"
        end_marker = "/* END ANTIGRAVITY MARKDOWN STYLE */"
        block = f"{begin_marker}\n{css_text}\n{end_marker}"
        existing = style_less.read_text(encoding="utf-8", errors="ignore") if style_less.exists() else ""
        if begin_marker in existing and end_marker in existing:
            s_idx = existing.index(begin_marker)
            e_idx = existing.index(end_marker) + len(end_marker)
            existing = existing[:s_idx] + block + existing[e_idx:]
        else:
            existing = existing.rstrip() + "\n\n" + block + "\n"
        style_less.write_text(existing, encoding="utf-8", newline="\n")
    except Exception:
        pass

    return installed_paths


def main() -> None:
    repo_root = Path(__file__).resolve().parent
    for ext_dir in install_extension(repo_root):
        print(f"Installed VS Code extension: {ext_dir}")


if __name__ == "__main__":
    main()
