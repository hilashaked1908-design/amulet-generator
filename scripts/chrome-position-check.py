#!/usr/bin/env python3
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "tmp-chrome-check"
BASE = "http://localhost:8080/questionnaire"

PAGES = [
    ("index", f"{BASE}/index.html"),
    ("amulet", f"{BASE}/amulet.html?id=0"),
]


def measure(page):
    return page.evaluate(
        """() => {
      function rect(sel) {
        const el = document.querySelector(sel);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        const round = (n) => Math.round(n * 100) / 100;
        return {
          left: round(r.left), top: round(r.top),
          right: round(r.right), bottom: round(r.bottom),
          width: round(r.width), height: round(r.height),
        };
      }
      return {
        about: rect('.pagmar-chrome__about') || rect('.pagmar__index-about') || rect('.figma-request-about'),
        close: rect('.pagmar-chrome__close:not(.pagmar__about-dismiss)') || rect('.pagmar__detail-close') || rect('.figma-close'),
      };
    }"""
    )


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    results = {}

    with sync_playwright() as p:
        browser = p.chromium.launch()
        context = browser.new_context(viewport={"width": 1920, "height": 1080}, device_scale_factor=1)

        shots = []
        for name, url in PAGES:
            page = context.new_page()
            page.goto(url, wait_until="networkidle", timeout=60000)
            page.wait_for_timeout(1500)
            results[name] = measure(page)
            full = OUT / f"{name}-full.png"
            page.screenshot(path=str(full))
            page.screenshot(path=str(OUT / f"{name}-chrome-crop.png"), clip={"x": 0, "y": 0, "width": 220, "height": 140})
            page.screenshot(path=str(OUT / f"{name}-close-crop.png"), clip={"x": 1700, "y": 0, "width": 220, "height": 140})
            shots.append(full)
            page.close()

        # Side-by-side composite
        comp = context.new_page()
        comp.set_viewport_size({"width": 3920, "height": 1160})
        comp.set_content(
            f"""<!DOCTYPE html><html><body style="margin:0;background:#111;display:flex;gap:40px;padding:20px;">
            <div style="color:#fff;font-family:sans-serif;text-align:center"><div>Index</div>
            <img src="file://{shots[0]}" width="1920" height="1080"></div>
            <div style="color:#fff;font-family:sans-serif;text-align:center"><div>Amulet detail</div>
            <img src="file://{shots[1]}" width="1920" height="1080"></div>
            </body></html>"""
        )
        comp.screenshot(path=str(OUT / "side-by-side.png"), full_page=True)
        comp.close()
        browser.close()

    (OUT / "positions.json").write_text(json.dumps(results, indent=2), encoding="utf-8")
    print(json.dumps(results, indent=2))
    print("Wrote screenshots to", OUT)


if __name__ == "__main__":
    main()
