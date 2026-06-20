#!/usr/bin/env python3
"""Capture metal-layer repoussé preview close-up."""
import os
import subprocess
import sys
import time

from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "screenshots", "metal-repousse-preview.png")
PORT = os.environ.get("PORT", "8080")
URL = f"http://127.0.0.1:{PORT}/prototype-v2-thick.html?metal=1&auto=1"


def start_server():
    proc = subprocess.Popen(
        [sys.executable, os.path.join(ROOT, "server.py")],
        cwd=ROOT,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    time.sleep(2)
    return proc


def main():
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    server = start_server()
    errors = []

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page(viewport={"width": 900, "height": 900})
            page.on("pageerror", lambda e: errors.append(str(e)))
            page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)

            page.goto(URL, wait_until="networkidle", timeout=120000)
            page.wait_for_selector("#amuletContainer canvas", timeout=180000)
            page.wait_for_timeout(3500)

            status = page.locator("#status").inner_text()
            page.locator("#amuletContainer").screenshot(path=OUT)
            print(f"saved {OUT}")
            print(f"status: {status}")
            if errors:
                print("ERRORS:")
                for e in errors:
                    print(f"  {e}")
                sys.exit(1)
            if "נכשל" in status or "שגיאה" in status:
                sys.exit(1)
            print("OK")
    finally:
        server.terminate()
        server.wait(timeout=5)


if __name__ == "__main__":
    main()
