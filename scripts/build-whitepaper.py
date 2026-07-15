#!/usr/bin/env python3
"""Render WHITEPAPER.md into a styled PDF.

Outputs two copies:
    web/public/whitepaper.pdf      — served from the live site
    ~/Desktop/Nonce-Whitepaper.pdf — convenience local copy

Requires `marked` (fetched on-demand via npx) and a Chrome install at the
standard macOS location for headless print-to-PDF.

Run from anywhere:
    python3 scripts/build-whitepaper.py
"""

import os
import pathlib
import shutil
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
MD = ROOT / "WHITEPAPER.md"
WEB_PUBLIC_PDF = ROOT / "web" / "public" / "whitepaper.pdf"
DESKTOP_PDF = pathlib.Path.home() / "Desktop" / "Nonce-Whitepaper.pdf"
TMP = pathlib.Path("/tmp/nonce-whitepaper")
HTML = TMP / "index.html"

CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
CSS = """
@page { size: A4; margin: 24mm 22mm 24mm 22mm; }
html, body { margin: 0; padding: 0; }
body {
  font-family: "Iowan Old Style","Charter","Georgia","Hoefler Text",serif;
  font-size: 10.5pt; line-height: 1.55; color: #111;
  -webkit-font-smoothing: antialiased;
}
h1 {
  font-size: 26pt; font-weight: 700; margin: 0 0 4pt 0;
  letter-spacing: -0.01em; line-height: 1.1;
}
h1 + p { font-size: 13pt; color: #444; margin: 0 0 4pt 0; font-style: italic; }
h1 + p + p { font-size: 10pt; color: #888; margin-bottom: 26pt; font-style: normal; }
h2 {
  font-size: 14pt; font-weight: 700; margin-top: 22pt; margin-bottom: 8pt;
  padding-bottom: 4pt; border-bottom: 1px solid #d0d0d0;
  page-break-after: avoid;
}
h3 { font-size: 11.5pt; margin-top: 16pt; margin-bottom: 4pt; page-break-after: avoid; }
p { margin: 0 0 9pt 0; text-align: justify; hyphens: auto; -webkit-hyphens: auto; }
strong { color: #000; font-weight: 700; }
code, pre, kbd, samp { font-family: "SF Mono","Menlo","Monaco","Consolas",monospace; font-size: 9.5pt; }
p code, li code, td code { background: #f3f3f3; padding: 1px 4px; border-radius: 2px; }
pre {
  background: #f6f6f6; border: 1px solid #e5e5e5; padding: 10pt 12pt;
  border-radius: 3px; overflow: hidden; white-space: pre-wrap;
  word-break: break-all; margin: 10pt 0; line-height: 1.45;
  page-break-inside: avoid;
}
pre code { background: transparent; padding: 0; }
table { border-collapse: collapse; margin: 12pt 0; width: 100%; page-break-inside: avoid; }
th, td { text-align: left; padding: 6pt 10pt; border-bottom: 1px solid #ddd; vertical-align: top; }
th { border-bottom: 2px solid #222; font-weight: 700; }
a { color: #0651a5; text-decoration: none; }
ul, ol { margin: 0 0 10pt 0; padding-left: 20pt; }
li { margin: 2pt 0; }
hr { border: none; border-top: 1px solid #ddd; margin: 16pt 0; }
"""

def main() -> None:
    if not MD.exists():
        sys.exit(f"missing source markdown: {MD}")
    if not pathlib.Path(CHROME).exists():
        sys.exit(f"Chrome not found at {CHROME}; install Google Chrome or adjust path")

    TMP.mkdir(parents=True, exist_ok=True)

    body = subprocess.check_output(
        ["npx", "--yes", "marked@latest", str(MD)],
        stderr=subprocess.DEVNULL,
    ).decode()

    html = (
        '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">'
        '<title>Nonce Whitepaper</title>'
        f'<style>{CSS}</style></head><body>{body}</body></html>'
    )
    HTML.write_text(html)

    WEB_PUBLIC_PDF.parent.mkdir(parents=True, exist_ok=True)

    subprocess.check_call([
        CHROME,
        "--headless=new", "--disable-gpu",
        "--no-pdf-header-footer",
        "--virtual-time-budget=5000",
        f"--print-to-pdf={WEB_PUBLIC_PDF}",
        f"file://{HTML}",
    ])

    shutil.copy(WEB_PUBLIC_PDF, DESKTOP_PDF)

    size_kb = WEB_PUBLIC_PDF.stat().st_size // 1024
    print(f"wrote {WEB_PUBLIC_PDF} ({size_kb} KB)")
    print(f"wrote {DESKTOP_PDF} (copy)")

if __name__ == "__main__":
    main()
