#!/usr/bin/env python3
"""
Clara Claws Blog — Index Generator & Content Validator

Walks content/, parses YAML frontmatter from all .md files,
generates manifest.jsonl and categories.json, validates content.
"""

import json
import os
import re
import sys
from pathlib import Path

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

ROOT = Path(__file__).resolve().parent.parent
CONTENT_DIR = ROOT / "content"
MANIFEST_PATH = ROOT / "manifest.jsonl"
CATEGORIES_PATH = ROOT / "categories.json"

REQUIRED_FIELDS = [
    "id", "title", "slug", "date", "type", "category",
    "tags", "score", "sponsored",
]

VALID_TYPES = {"review", "guide", "comparison", "sponsored"}
VALID_CATEGORIES = {"models", "tools", "apis", "skills"}

# ---------------------------------------------------------------------------
# Frontmatter parser (no external deps)
# ---------------------------------------------------------------------------

def parse_frontmatter(text: str) -> tuple[dict, str]:
    """Parse YAML-ish frontmatter from markdown text. Returns (meta, body)."""
    if not text.startswith("---"):
        return {}, text

    end = text.find("---", 3)
    if end == -1:
        return {}, text

    raw = text[3:end].strip()
    body = text[end + 3:].strip()
    meta = {}

    for line in raw.split("\n"):
        line = line.strip()
        if not line or line.startswith("#"):
            continue

        colon_idx = line.find(":")
        if colon_idx == -1:
            continue

        key = line[:colon_idx].strip()
        value = line[colon_idx + 1:].strip()

        # Parse arrays: [item1, item2, item3]
        if value.startswith("[") and value.endswith("]"):
            inner = value[1:-1]
            if inner.strip():
                items = [
                    item.strip().strip('"').strip("'")
                    for item in inner.split(",")
                ]
                meta[key] = items
            else:
                meta[key] = []
            continue

        # Parse booleans
        if value.lower() == "true":
            meta[key] = True
            continue
        if value.lower() == "false":
            meta[key] = False
            continue

        # Parse numbers
        try:
            if "." in value:
                meta[key] = float(value)
            else:
                meta[key] = int(value)
            continue
        except ValueError:
            pass

        # Strip quotes from strings
        if (value.startswith('"') and value.endswith('"')) or \
           (value.startswith("'") and value.endswith("'")):
            value = value[1:-1]

        meta[key] = value

    return meta, body


def estimate_tokens(text: str) -> int:
    """Rough token estimate: word_count * 1.3"""
    words = len(text.split())
    return int(words * 1.3)


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

def validate_article(meta: dict, filepath: Path) -> list[str]:
    """Return list of validation errors for an article."""
    errors = []
    rel = filepath.relative_to(ROOT)

    for field in REQUIRED_FIELDS:
        if field not in meta:
            errors.append(f"{rel}: missing required field '{field}'")

    if "type" in meta and meta["type"] not in VALID_TYPES:
        errors.append(
            f"{rel}: invalid type '{meta['type']}' "
            f"(expected one of {VALID_TYPES})"
        )

    if "category" in meta and meta["category"] not in VALID_CATEGORIES:
        errors.append(
            f"{rel}: invalid category '{meta['category']}' "
            f"(expected one of {VALID_CATEGORIES})"
        )

    if "score" in meta:
        score = meta["score"]
        if not isinstance(score, (int, float)) or score < 0.0 or score > 1.0:
            errors.append(f"{rel}: score must be 0.0-1.0, got {score}")

    if "confidence" in meta:
        conf = meta["confidence"]
        if not isinstance(conf, (int, float)) or conf < 0.0 or conf > 1.0:
            errors.append(f"{rel}: confidence must be 0.0-1.0, got {conf}")

    return errors


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    if not CONTENT_DIR.exists():
        print(f"ERROR: Content directory not found: {CONTENT_DIR}")
        sys.exit(1)

    articles = []
    all_errors = []

    # Walk content directory for index.md files (one per post directory)
    md_files = sorted(CONTENT_DIR.rglob("index.md"))

    if not md_files:
        print("WARNING: No index.md files found in content/")

    for filepath in md_files:
        text = filepath.read_text(encoding="utf-8")
        meta, body = parse_frontmatter(text)

        if not meta:
            all_errors.append(f"{filepath.relative_to(ROOT)}: no frontmatter found")
            continue

        # Validate
        errors = validate_article(meta, filepath)
        all_errors.extend(errors)

        # Compute token count from body
        token_count = estimate_tokens(body)
        meta["tokens"] = token_count

        # Post directory path (parent of index.md)
        post_dir = filepath.parent
        dir_path = "/" + str(post_dir.relative_to(ROOT))

        # Collect sibling files (everything except index.md)
        files = []
        for f in sorted(post_dir.iterdir()):
            if f.name == "index.md" or f.is_dir():
                continue
            files.append(f.name)

        articles.append({
            "meta": meta,
            "path": dir_path,
            "body_tokens": token_count,
            "files": files,
        })

    # Report errors
    if all_errors:
        print(f"\n{'='*60}")
        print(f"VALIDATION ERRORS ({len(all_errors)})")
        print(f"{'='*60}")
        for err in all_errors:
            print(f"  ✗ {err}")
        print()

    # Sort articles by date descending
    articles.sort(
        key=lambda a: a["meta"].get("date", ""),
        reverse=True,
    )

    # --- Generate manifest.jsonl ---
    with open(MANIFEST_PATH, "w", encoding="utf-8") as f:
        for article in articles:
            m = article["meta"]
            entry = {
                "id": m.get("id", ""),
                "title": m.get("title", ""),
                "type": m.get("type", ""),
                "category": m.get("category", ""),
                "score": m.get("score", 0),
                "tokens": article["body_tokens"],
                "date": str(m.get("date", "")),
                "tags": m.get("tags", []),
                "path": article["path"],
                "sponsored": m.get("sponsored", False),
            }
            if article.get("files"):
                entry["files"] = article["files"]
            f.write(json.dumps(entry, separators=(",", ":")) + "\n")

    print(f"Generated {MANIFEST_PATH.relative_to(ROOT)} ({len(articles)} articles)")

    # --- Generate categories.json ---
    categories = {}
    for article in articles:
        m = article["meta"]
        cat = m.get("category", "uncategorized")
        if cat not in categories:
            categories[cat] = []
        categories[cat].append({
            "id": m.get("id", ""),
            "title": m.get("title", ""),
            "type": m.get("type", ""),
            "score": m.get("score", 0),
            "tokens": article["body_tokens"],
            "path": article["path"],
        })

    with open(CATEGORIES_PATH, "w", encoding="utf-8") as f:
        json.dump(categories, f, indent=2, ensure_ascii=False)
        f.write("\n")

    print(f"Generated {CATEGORIES_PATH.relative_to(ROOT)} ({len(categories)} categories)")

    # Summary
    print(f"\n{'='*60}")
    print(f"BUILD SUMMARY")
    print(f"{'='*60}")
    print(f"  Articles:   {len(articles)}")
    print(f"  Categories: {len(categories)}")
    print(f"  Errors:     {len(all_errors)}")

    if all_errors:
        print(f"\nBuild completed with {len(all_errors)} error(s).")
        sys.exit(1)
    else:
        print(f"\nBuild completed successfully.")


if __name__ == "__main__":
    main()
