#!/usr/bin/env python3
"""Unpack the marketing zip into scoped CSS, JPEG slides, and an HTML fragment."""
from __future__ import annotations

import base64
import re
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ZIP_PATH = Path("/Users/anton/Downloads/emkaro-site-carousel-less-air.zip")
IMG_DIR = ROOT / "public" / "marketing" / "landing"
CSS_PATH = ROOT / "components" / "marketing" / "emkaro-landing.css"
HTML_PATH = ROOT / "components" / "marketing" / "emkaro-landing-body.html"
PREFIX = ".emkaro-marketing"


def extract_balanced(css: str, start: int) -> tuple[str, int]:
    assert css[start] == "{"
    depth = 0
    i = start
    while i < len(css):
        ch = css[i]
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return css[start + 1 : i], i + 1
        i += 1
    raise ValueError("unbalanced css")


def prefix_selector(sel: str) -> str:
    sel = sel.strip()
    if not sel:
        return sel
    if sel.startswith(PREFIX) or sel.startswith(":root"):
        return sel.replace(":root", PREFIX, 1) if sel.startswith(":root") else sel
    if sel in ("html", "body", ":root"):
        return PREFIX
    if sel.startswith("html ") or sel.startswith("body "):
        return PREFIX + sel[4:] if sel.startswith("html") else PREFIX + sel[4:]
    if sel.startswith("#theme-switch"):
        return f"{PREFIX} {sel}"
    return f"{PREFIX} {sel}"


def prefix_rule_selectors(selector_text: str) -> str:
    parts = [prefix_selector(p) for p in selector_text.split(",")]
    return ", ".join(p for p in parts if p)


def transform_css(css: str) -> str:
    out: list[str] = []
    i = 0
    n = len(css)
    while i < n:
        while i < n and css[i] in " \t\r\n":
            out.append(css[i])
            i += 1
        if i >= n:
            break
        if css.startswith("/*", i):
            end = css.find("*/", i + 2)
            if end < 0:
                out.append(css[i:])
                break
            out.append(css[i : end + 2])
            i = end + 2
            continue
        if css[i] == "@":
            brace = css.find("{", i)
            header = css[i:brace]
            at_name = header.split(None, 1)[0].lower()
            inner, nxt = extract_balanced(css, brace)
            if at_name in ("@media", "@supports"):
                out.append(header + "{" + transform_css(inner) + "}")
            else:
                # keyframes, font-face, etc.
                out.append(css[i:nxt])
            i = nxt
            continue
        brace = css.find("{", i)
        if brace < 0:
            out.append(css[i:])
            break
        selectors = css[i:brace]
        inner, nxt = extract_balanced(css, brace)
        out.append(prefix_rule_selectors(selectors) + "{" + inner + "}")
        i = nxt
    return "".join(out)


def main() -> None:
    if not ZIP_PATH.exists():
        raise SystemExit(f"missing {ZIP_PATH}")
    with zipfile.ZipFile(ZIP_PATH) as zf:
        html = zf.read("index.html").decode("utf-8")

    css = re.search(r"<style>([\s\S]*?)</style>", html).group(1)
    IMG_DIR.mkdir(parents=True, exist_ok=True)

    n = 0

    def save_data_uri(match: re.Match[str]) -> str:
        nonlocal n
        uri = match.group(0)
        m = re.match(r"data:image/(jpeg|jpg|png|webp|gif);base64,([A-Za-z0-9+/=\s]+)$", uri, re.I)
        if not m:
            return uri
        n += 1
        ext = "jpg" if m.group(1).lower() in ("jpeg", "jpg") else m.group(1).lower()
        name = f"slide-{n:02d}.{ext}"
        raw = base64.b64decode(re.sub(r"\s+", "", m.group(2)))
        (IMG_DIR / name).write_bytes(raw)
        return f"/marketing/landing/{name}"

    html = re.sub(r"data:image/[a-zA-Z0-9+.-]+;base64,[A-Za-z0-9+/=\s]+", save_data_uri, html)

    body_m = re.search(r"<body[^>]*>([\s\S]*)</body>", html, re.I)
    body = body_m.group(1) if body_m else html
    body = re.sub(r"<script\b[\s\S]*?</script>", "", body, flags=re.I)
    # Drop CSS-only cookie banner (Next CookieConsentBanner persists consent).
    body = re.sub(
        r'<input[^>]*id="cookie-consent-toggle"[\s\S]*?</aside>',
        "",
        body,
        count=1,
        flags=re.I,
    )
    # Legal hash-modals: keep pages /privacy and /personal-data-consent as source of truth.
    body = re.sub(
        r'<section class="legal-modal" id="privacy-policy"[\s\S]*?</section>',
        "",
        body,
        count=1,
        flags=re.I,
    )
    body = re.sub(
        r'<section class="legal-modal" id="personal-data-consent"[\s\S]*?</section>',
        "",
        body,
        count=1,
        flags=re.I,
    )
    body = body.replace('href="#privacy-policy"', 'href="/privacy"')
    body = body.replace('href="#personal-data-consent"', 'href="/personal-data-consent"')
    body = re.sub(
        r'<a class="brand" href="#top">Emkaro</a>',
        '<span class="brand" id="emkaro-brand-slot">Emkaro</span>',
        body,
        count=1,
    )
    body = re.sub(
        r'<div class="clinic-grid">[\s\S]*?</div>\s*<div class="center-action">[\s\S]*?</div>',
        '<div id="emkaro-clinics-slot"></div>',
        body,
        count=1,
    )
    body = re.sub(
        r'<form class="demo-form" id="demoForm">[\s\S]*?</form>',
        '<div id="emkaro-form-slot"></div>',
        body,
        count=1,
    )
    extra_nav = """
@media (max-width:980px){
  .emkaro-marketing.nav-open .nav-links{
    display:flex !important;
    flex-direction:column;
    position:absolute;
    top:74px;
    left:0;
    right:0;
    background:#fff;
    border-bottom:1px solid #dfe7f5;
    padding:12px 20px 18px;
    z-index:40;
    gap:14px;
  }
}
.emkaro-marketing .nav{position:relative}
.emkaro-marketing .brand-hit{
  display:inline-flex;align-items:center;border:0;background:transparent;padding:0;cursor:pointer;font:inherit;
}
"""
    scoped = extra_nav + "\n" + transform_css(css)
    CSS_PATH.write_text(scoped, encoding="utf-8")
    HTML_PATH.write_text(body.strip(), encoding="utf-8")
    print(f"images: {n} -> {IMG_DIR}")
    print(f"css: {CSS_PATH} ({CSS_PATH.stat().st_size} bytes)")
    print(f"html: {HTML_PATH} ({HTML_PATH.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
