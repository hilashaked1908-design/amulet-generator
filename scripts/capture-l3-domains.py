#!/usr/bin/env python3
"""Capture summoning L3 renders per domain for color verification."""
import os
import subprocess
import sys
import time

from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "screenshots", "l3-domains")
PORT = os.environ.get("PORT", "8080")
URL = f"http://127.0.0.1:{PORT}/prototype-v2-unified.html"

DOMAINS = [
    ("housing", "מגורים"),
    ("livelihood", "פרנסה"),
    ("love", "אהבה"),
    ("meaning", "משמעות"),
    ("family", "משפחה"),
    ("health", "בריאות"),
]


def start_server():
    proc = subprocess.Popen(
        [sys.executable, os.path.join(ROOT, "server.py")],
        cwd=ROOT,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    time.sleep(1.5)
    return proc


def click_option(page, group, value):
    page.locator(f'.field[data-group="{group}"] button[data-value="{value}"]').click()


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    server = start_server()
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page(viewport={"width": 1400, "height": 1100})
            page.goto(URL, wait_until="networkidle", timeout=120000)

            click_option(page, "amuletType", "summoning")

            for domain_key, label in DOMAINS:
                click_option(page, "domain", domain_key)
                page.locator("#createBtn").click()
                page.wait_for_selector("#amuletContainer canvas", timeout=120000)
                page.wait_for_timeout(2500)
                out = os.path.join(OUT_DIR, f"l3-{domain_key}.png")
                page.locator("#amuletContainer").screenshot(path=out)
                print(f"saved {out} ({label})")

            browser.close()
    finally:
        server.terminate()
        server.wait(timeout=5)


if __name__ == "__main__":
    main()
