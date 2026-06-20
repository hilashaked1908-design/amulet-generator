#!/usr/bin/env python3
"""Capture prototype-v2-thick PBR render and report console errors."""
import os
import subprocess
import sys
import time

from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "screenshots", "thick-shape-render.png")
PORT = os.environ.get("PORT", "8080")
URL = f"http://127.0.0.1:{PORT}/prototype-v2-thick.html"


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
    console_errors = []
    page_errors = []

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page(viewport={"width": 1400, "height": 1100})

            page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)
            page.on("pageerror", lambda err: page_errors.append(str(err)))

            page.goto(URL, wait_until="networkidle", timeout=120000)
            page.wait_for_selector("#createBtn:not([disabled])", timeout=120000)

            page.locator("#createBtn").click()
            page.wait_for_selector("#amuletContainer canvas", timeout=180000)
            page.wait_for_timeout(4000)

            status = page.locator("#status").inner_text()
            has_canvas = page.locator("#amuletContainer canvas").count() > 0
            page.locator("#amuletContainer").screenshot(path=OUT)

            print(f"saved {OUT}")
            print(f"status: {status}")
            print(f"canvas: {has_canvas}")
            if page_errors:
                print("PAGE ERRORS:")
                for e in page_errors:
                    print(f"  {e}")
            if console_errors:
                print("CONSOLE ERRORS:")
                for e in console_errors:
                    print(f"  {e}")
            if not page_errors and not console_errors and has_canvas and "PBR נכשל" not in status:
                print("OK: render succeeded without errors")
                sys.exit(0)
            sys.exit(1)
    finally:
        server.terminate()
        server.wait(timeout=5)


if __name__ == "__main__":
    main()
