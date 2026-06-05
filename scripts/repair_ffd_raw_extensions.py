#!/usr/bin/env python3
"""
Create openable aliases for FFD reports that were saved with the wrong suffix.

The official downloader previously appended ".pdf" to every downloaded file.
Some FFD items are real Word documents, so they landed as "*.docx.pdf" and
Preview tries to open them as PDFs. This script keeps the original raw files in
place and adds ".docx" symlinks for manual viewing.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any


ARCHIVE_ROOT = Path.home() / "Desktop" / "FFD研报库"
RAW_ROOT = ARCHIVE_ROOT / "_raw"
WORD_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


def read_head(path: Path, size: int = 8) -> bytes:
    with path.open("rb") as f:
        return f.read(size)


def read_sidecar(path: Path) -> dict[str, Any]:
    sidecar = Path(f"{path}.ffd-meta.json")
    if not sidecar.exists():
        return {}
    try:
        return json.loads(sidecar.read_text(encoding="utf-8"))
    except Exception:
        return {}


def is_word_payload(path: Path) -> bool:
    meta = read_sidecar(path)
    mime = str(meta.get("mime_type") or "").lower()
    original_name = str(meta.get("file_name") or "").lower()
    if mime == WORD_MIME or original_name.endswith(".docx"):
        return True
    try:
        return path.name.lower().endswith(".docx.pdf") and read_head(path).startswith(b"PK")
    except OSError:
        return False


def corrected_docx_path(path: Path) -> Path | None:
    if not path.name.lower().endswith(".docx.pdf"):
        return None
    return path.with_name(path.name[:-4])


def relative_target(source: Path, dest: Path) -> str:
    return os.path.relpath(source, dest.parent)


def ensure_symlink(link: Path, target: Path) -> str:
    if link.exists() or link.is_symlink():
        try:
            if link.is_symlink() and link.resolve() == target.resolve():
                return "existing"
        except OSError:
            pass
        return "conflict"
    link.symlink_to(relative_target(target, link))
    return "created"


def repair_raw_links() -> dict[str, int]:
    counts = {"created": 0, "existing": 0, "conflict": 0, "skipped": 0}
    if not RAW_ROOT.exists():
        return counts

    for path in RAW_ROOT.rglob("*"):
        if path.is_symlink() or not path.is_file():
            continue
        link = corrected_docx_path(path)
        if link is None or not is_word_payload(path):
            counts["skipped"] += 1
            continue
        outcome = ensure_symlink(link, path)
        counts[outcome] += 1
    return counts


def repair_category_links() -> dict[str, int]:
    counts = {"created": 0, "existing": 0, "conflict": 0, "skipped": 0}
    if not ARCHIVE_ROOT.exists():
        return counts

    for path in ARCHIVE_ROOT.rglob("*"):
        try:
            if RAW_ROOT in path.parents:
                continue
        except RuntimeError:
            pass
        if not path.is_symlink() or not path.name.lower().endswith(".docx.pdf"):
            continue

        target = path.resolve()
        if not target.exists() or not is_word_payload(target):
            counts["skipped"] += 1
            continue

        raw_docx = corrected_docx_path(target)
        display_target = raw_docx if raw_docx and raw_docx.exists() else target
        display_link = path.with_name(path.name[:-4])
        outcome = ensure_symlink(display_link, display_target)
        counts[outcome] += 1
    return counts


def main() -> None:
    raw = repair_raw_links()
    category = repair_category_links()
    print("raw_links", raw)
    print("category_links", category)


if __name__ == "__main__":
    main()
