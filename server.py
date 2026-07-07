#!/usr/bin/env python3
"""Static server + API to read/write connections.json."""

import json
import os
import re
import signal
import sys
import time
import traceback
from http.server import HTTPServer, SimpleHTTPRequestHandler
from socketserver import ThreadingMixIn
from urllib.parse import unquote, urlparse

ROOT = os.path.dirname(os.path.abspath(__file__))
CONNECTIONS_PATH = os.path.join(ROOT, "connections.json")
GLYPHS_DIR = os.path.join(ROOT, "glyphs")
LETTERS_DIR = os.path.join(ROOT, "אותיות")
PORT = int(os.environ.get("PORT", "8080"))
_default_legacy = "8765" if PORT == 8080 else ("8080" if PORT == 8765 else "0")
LEGACY_PORT = int(os.environ.get("LEGACY_PORT", _default_legacy or "0"))
GLYPH_FILE_RE = re.compile(r"^.\d+\.svg$", re.UNICODE)
SERVER_VERSION = 2


def read_connections():
    if not os.path.isfile(CONNECTIONS_PATH):
        return {"connections": []}
    with open(CONNECTIONS_PATH, encoding="utf-8") as f:
        return json.load(f)


def write_connections(data):
    with open(CONNECTIONS_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")


def glyph_filename_for_letter(letter):
    if not letter or len(letter) != 1:
        raise ValueError("Invalid letter")
    return "א1.svg" if letter == "א" else f"{letter}2.svg"


def is_valid_glyph_filename(filename):
    return bool(GLYPH_FILE_RE.match(filename))


def bootstrap_glyph_from_letters(filename):
    """Copy אותיות/<filename> into glyphs/ only when glyphs/ is missing that file."""
    if not is_valid_glyph_filename(filename):
        return False
    dst = os.path.join(GLYPHS_DIR, filename)
    if os.path.isfile(dst):
        return False
    src = os.path.join(LETTERS_DIR, filename)
    if not os.path.isfile(src):
        return False
    try:
        os.makedirs(GLYPHS_DIR, exist_ok=True)
        with open(src, "rb") as f:
            data = f.read()
        with open(dst, "wb") as f:
            f.write(data)
        print(f"[bootstrap] אותיות/{filename} → glyphs/{filename}")
        return True
    except OSError as err:
        print(f"[bootstrap] failed for {filename}: {err}")
        return False


def bootstrap_all_glyphs_from_letters():
    if not os.path.isdir(LETTERS_DIR):
        return []
    return [name for name in sorted(os.listdir(LETTERS_DIR)) if bootstrap_glyph_from_letters(name)]


def save_glyph_file(letter, svg_text):
    filename = glyph_filename_for_letter(letter)
    text = (svg_text or "").strip()
    lower = text.lower()
    if "<svg" not in lower:
        raise ValueError("Invalid SVG content")
    if "</svg>" not in lower:
        raise ValueError("SVG must contain </svg>")
    os.makedirs(GLYPHS_DIR, exist_ok=True)
    path = os.path.join(GLYPHS_DIR, filename)
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)
        if not text.endswith("\n"):
            f.write("\n")
    print(f"[API] saved glyph {filename} ({len(text)} bytes)")
    return filename


def decode_request_path(raw_path):
    """Decode URL-encoded paths so Hebrew filenames resolve on disk."""
    parsed = urlparse(raw_path)
    path = unquote(parsed.path, encoding="utf-8")
    if parsed.query:
        return path + "?" + parsed.query
    return path


def round_glyph(g):
    size = float(g.get("size", 150))
    scale = float(g.get("scale", 1))
    if size <= 0:
        size = 150
    if scale <= 0:
        scale = 1
    return {
        "x": round(float(g["x"]), 2),
        "y": round(float(g["y"]), 2),
        "rotation": round(float(g.get("rotation", 0)), 2),
        "scale": round(scale, 4),
        "size": round(size, 2),
        "flipX": bool(g.get("flipX")),
        "flipY": bool(g.get("flipY")),
    }


def connection_key(c):
    return (c.get("from"), c.get("to"), c.get("intent"))


def round_symbol(s):
    allowed = ("circle", "triangle", "arc", "dot")
    sym_type = s.get("type")
    if sym_type not in allowed:
        raise ValueError(f"symbol type must be one of {allowed}")
    size = float(s.get("size", 60))
    scale = float(s.get("scale", 1))
    if size <= 0:
        size = 60
    if scale <= 0:
        scale = 1
    fill_mode = s.get("fillMode", "stroke")
    if fill_mode not in ("stroke", "fill", "both"):
        fill_mode = "stroke"
    stroke_w = float(s.get("strokeWidth", 2))
    stroke_w = max(1.0, min(10.0, stroke_w))
    tri_ratio = float(s.get("triangleRatio", 1))
    tri_ratio = max(0.5, min(2.0, tri_ratio))
    arc_angle = float(s.get("arcAngle", 180))
    arc_angle = max(30.0, min(330.0, arc_angle))
    return {
        "type": sym_type,
        "x": round(float(s["x"]), 2),
        "y": round(float(s["y"]), 2),
        "rotation": round(float(s.get("rotation", 0)), 2),
        "scale": round(scale, 4),
        "size": round(size, 2),
        "flipX": bool(s.get("flipX")),
        "flipY": bool(s.get("flipY")),
        "strokeWidth": round(stroke_w, 2),
        "fillMode": fill_mode,
        "triangleRatio": round(tri_ratio, 2),
        "arcAngle": round(arc_angle, 2),
    }


def build_entry(conn):
    from_glyph = conn.get("fromGlyph")
    to_glyph = conn.get("toGlyph")
    if not from_glyph or not to_glyph:
        raise ValueError("connection must include fromGlyph and toGlyph")

    entry = {
        "from": conn["from"],
        "to": conn["to"],
        "intent": conn["intent"],
        "fromGlyph": round_glyph(from_glyph),
        "toGlyph": round_glyph(to_glyph),
    }
    raw_symbols = conn.get("symbols")
    if raw_symbols:
        entry["symbols"] = [round_symbol(s) for s in raw_symbols]
    return entry


class Handler(SimpleHTTPRequestHandler):
    extensions_map = {
        **getattr(SimpleHTTPRequestHandler, "extensions_map", {}),
        ".js": "application/javascript",
        ".mjs": "application/javascript",
    }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def handle_one_request(self):
        try:
            super().handle_one_request()
        except (BrokenPipeError, ConnectionResetError):
            # Browser cancelled a request — not a server crash.
            pass
        except Exception:
            traceback.print_exc()
            raise

    def log_message(self, format, *args):
        # Skip noisy health checks from start-server.sh.
        try:
            if args and str(args[0]).startswith("GET / "):
                return
        except Exception:
            pass
        super().log_message(format, *args)

    def end_headers(self):
        path = urlparse(self.path).path
        if path.endswith((".js", ".html", ".css")):
            self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        elif (
            "/questionnaire/seed/" in path
            or path.startswith("/fonts/")
            or path.startswith("/glyphs/")
            or path.endswith((".png", ".jpg", ".jpeg", ".webp", ".svg", ".woff", ".woff2", ".otf", ".ttf", ".glb"))
        ):
            self.send_header("Cache-Control", "public, max-age=31536000, immutable")
        else:
            self.send_header("Cache-Control", "no-cache")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def _set_decoded_path(self):
        """Decode self.path once for every request (static files + APIs)."""
        self.path = decode_request_path(self.path)

    def translate_path(self, path):
        """Map URL path to filesystem path with UTF-8 decode (Hebrew filenames)."""
        path = decode_request_path(path)
        path = urlparse(path).path
        parts = [p for p in path.split("/") if p]
        if ".." in parts:
            return None
        return os.path.join(self.directory, *parts)

    def do_GET(self):
        self._set_decoded_path()
        parsed_path = urlparse(self.path).path

        if parsed_path == "/api/server-info":
            self._send_json({"ok": True, "version": SERVER_VERSION, "glyphUpload": True})
            return
        if parsed_path == "/api/glyphs":
            data = self._list_glyphs()
            print(f"[API] GET /api/glyphs -> {len(data.get('files', []))} files")
            self._send_json(data)
            return
        if parsed_path == "/api/connections":
            data = read_connections()
            print(f"[API] GET /api/connections -> {len(data.get('connections', []))} entries")
            self._send_json(data)
            return

        if parsed_path in ("/go", "/go/"):
            self.send_response(302)
            self.send_header("Location", "/questionnaire/index.html")
            self.end_headers()
            return

        if parsed_path in ("/questionnaire/index", "/questionnaire"):
            self.send_response(301)
            self.send_header("Location", "/questionnaire/index.html")
            self.end_headers()
            return

        if parsed_path.startswith("/glyphs/") and parsed_path.endswith(".svg"):
            fs_path = self.translate_path(self.path)
            if fs_path and os.path.isfile(fs_path):
                print(f"[serve] {parsed_path} -> {os.path.basename(fs_path)}")
            else:
                print(f"[serve] MISSING {parsed_path} (fs={fs_path})")

        return super().do_GET()

    def _read_json_body(self):
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length).decode("utf-8") if length else "{}"
        try:
            return json.loads(body)
        except json.JSONDecodeError:
            return None

    def _handle_glyph_upload(self):
        payload = self._read_json_body()
        if payload is None:
            self.send_error(400, "Invalid JSON")
            return
        letter = (payload.get("letter") or "").strip()
        svg = payload.get("svg") or ""
        try:
            filename = save_glyph_file(letter, svg)
        except ValueError as err:
            self.send_error(400, str(err))
            return
        self._send_json({"ok": True, "letter": letter, "filename": filename})

    def do_POST(self):
        self._set_decoded_path()
        parsed_path = urlparse(self.path).path
        if parsed_path == "/api/glyphs":
            self._handle_glyph_upload()
            return
        if parsed_path != "/api/connections":
            self.send_error(404)
            return

        payload = self._read_json_body()
        if payload is None:
            self.send_error(400, "Invalid JSON")
            return

        conn = payload.get("connection")
        if not conn:
            self.send_error(400, "Missing connection object")
            return

        for field in ("from", "to", "intent"):
            if field not in conn:
                self.send_error(400, f"Missing field: {field}")
                return

        try:
            entry = build_entry(conn)
        except ValueError as e:
            self.send_error(400, str(e))
            return

        data = read_connections()
        items = data.get("connections", [])
        key = connection_key(entry)
        rev_key = (entry["to"], entry["from"], entry["intent"])
        items = [c for c in items if connection_key(c) not in (key, rev_key)]
        items.append(entry)
        data["connections"] = items
        write_connections(data)

        fg = entry["fromGlyph"]
        tg = entry["toGlyph"]
        print(
            f"[API] POST {entry['from']}->{entry['to']} ({entry['intent']}) "
            f"A=({fg['x']},{fg['y']}) B=({tg['x']},{tg['y']})"
        )
        self._send_json({"ok": True, "connection": entry, "connections": items})

    def _list_glyphs(self):
        manifest = os.path.join(GLYPHS_DIR, "manifest.json")
        if os.path.isfile(manifest):
            with open(manifest, encoding="utf-8") as f:
                data = json.load(f)
            files = data.get("files", [])
        else:
            files = sorted(f for f in os.listdir(GLYPHS_DIR) if f.endswith(".svg"))
        return {"files": files}

    def _send_json(self, obj, status=200):
        raw = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)


class ThreadingHTTPServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def print_glyphs_startup_info():
    """Print resolved paths and glyph inventory when the server starts."""
    print("=" * 60)
    print(f"server.py location: {os.path.abspath(__file__)}")
    print(f"ROOT (static root):  {ROOT}")
    print(f"cwd at startup:      {os.getcwd()}")
    print(f"GLYPHS_DIR:          {GLYPHS_DIR}")
    print(f"GLYPHS_DIR exists:   {os.path.isdir(GLYPHS_DIR)}")
    if not os.path.isdir(GLYPHS_DIR):
        print("WARNING: glyphs/ folder not found next to server.py!")
        return
    entries = sorted(os.listdir(GLYPHS_DIR))
    svg_files = [f for f in entries if f.endswith(".svg")]
    print(f"Files in glyphs/ ({len(entries)} total, {len(svg_files)} SVG):")
    for name in entries:
        full = os.path.join(GLYPHS_DIR, name)
        if os.path.isfile(full):
            print(f"  {name}  ({os.path.getsize(full)} bytes)")
        else:
            print(f"  {name}/")
    manifest = os.path.join(GLYPHS_DIR, "manifest.json")
    if os.path.isfile(manifest):
        with open(manifest, encoding="utf-8") as f:
            listed = json.load(f).get("files", [])
        print(f"manifest.json lists {len(listed)} files")
    print("=" * 60)


if __name__ == "__main__":
    bootstrapped = bootstrap_all_glyphs_from_letters()
    if bootstrapped:
        print(f"Bootstrapped {len(bootstrapped)} missing glyph(s) from אותיות/: {', '.join(bootstrapped)}")
    print_glyphs_startup_info()
    print("Glyph files are read from glyphs/ only. Use editor upload or save directly there.")
    print(f"Serving at http://localhost:{PORT}", flush=True)
    if LEGACY_PORT and LEGACY_PORT != PORT:
        print(f"Legacy port: http://localhost:{LEGACY_PORT} (same site — old bookmarks)", flush=True)
    print(f"Open editor: http://localhost:{PORT}/editor.html", flush=True)
    print(f"Open prototype: http://localhost:{PORT}/prototype-v2-thick.html", flush=True)
    print(f"Open garden: http://localhost:{PORT}/questionnaire/index.html", flush=True)
    print("All paths URL-decoded (unquote) for Hebrew filenames", flush=True)

    servers = []

    def bind_server(port):
        for attempt in range(6):
            try:
                httpd = ThreadingHTTPServer(("", port), Handler)
                servers.append(httpd)
                return httpd
            except OSError as err:
                if getattr(err, "errno", None) in (48, 98, 10048) and attempt < 5:
                    print(f"Port {port} busy, retrying in 2s ({attempt + 1}/5)...", flush=True)
                    time.sleep(2)
                    continue
                if getattr(err, "errno", None) in (48, 98, 10048):
                    print(f"\nPort {port} is already in use.")
                    print(f"If another server is running, open: http://localhost:{port}/questionnaire/index.html")
                    print("To stop the old server: bash start-server.sh stop")
                    sys.exit(1)
                raise

    def shutdown(signum, _frame):
        print(f"\nReceived signal {signum}, shutting down...", flush=True)
        for httpd in servers:
            httpd.shutdown()

    bind_server(PORT)
    if LEGACY_PORT and LEGACY_PORT != PORT:
        try:
            bind_server(LEGACY_PORT)
        except SystemExit:
            raise
        except OSError as err:
            print(f"Warning: legacy port {LEGACY_PORT} unavailable ({err})", flush=True)

    signal.signal(signal.SIGTERM, shutdown)
    signal.signal(signal.SIGINT, shutdown)

    import threading

    threads = []
    for httpd in servers:
        thread = threading.Thread(target=httpd.serve_forever, daemon=True)
        thread.start()
        threads.append(thread)

    try:
        for thread in threads:
            thread.join()
    except KeyboardInterrupt:
        print("\nServer stopped.", flush=True)
    finally:
        for httpd in servers:
            httpd.server_close()
