#!/usr/bin/env python3
"""Capture stone / opal-glass / rough-metal renders from prototype-v2-thick.html."""
import os
import subprocess
import sys
import time

from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "screenshots", "materials-compare")
PORT = os.environ.get("PORT", "8080")
URL = f"http://127.0.0.1:{PORT}/prototype-v2-thick.html"

SHOTS = [
    ("stone", "stone", "care_health", "L3 stone + L2 metal (care_health)"),
    ("opal-glass", "opal", "care_health", "L3 opal glass + L2 metal (care_health)"),
    ("metal-rough", "opal", "creation_spirit", "L3 opal + L2 rough metal (creation_spirit)"),
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

            for slug, l3_mat, occupation, label in SHOTS:
                click_option(page, "l3Material", l3_mat)
                click_option(page, "occupation", occupation)
                page.locator("#createBtn").click()
                page.wait_for_selector("#amuletContainer canvas", timeout=120000)
                page.wait_for_timeout(3000)
                out = os.path.join(OUT_DIR, f"after-{slug}.png")
                page.locator("#amuletContainer").screenshot(path=out)
                status = page.locator("#status").inner_text()
                print(f"saved {out}")
                print(f"  {label}")
                print(f"  status: {status[:120]}")

            browser.close()
    finally:
        server.terminate()
        server.wait(timeout=5)


if __name__ == "__main__":
    main()
