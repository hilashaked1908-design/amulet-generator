#!/usr/bin/env python3
"""Static server + API to read/write connections.json."""

import json
import os
import re
import secrets
import base64
import binascii
import gzip
import shutil
import signal
import socket
import sys
import time
import traceback
from http.server import HTTPServer, SimpleHTTPRequestHandler
from socketserver import ThreadingMixIn
from urllib.parse import unquote, urlparse

ROOT = os.path.dirname(os.path.abspath(__file__))
# DATA_DIR holds everything written at runtime (generator output). Defaults to
# ROOT so local runs behave exactly as before; in the cloud point it at a
# persistent disk (e.g. /var/data) so user-generated files survive redeploys.
DATA_DIR = os.path.abspath(os.environ.get("DATA_DIR", ROOT))
CONNECTIONS_PATH = os.path.join(DATA_DIR, "connections.json")
GLYPHS_DIR = os.path.join(DATA_DIR, "glyphs")
LETTERS_DIR = os.path.join(ROOT, "אותיות")
EXPORTS_DIR = os.path.join(DATA_DIR, "questionnaire", "exports")
PORT = int(os.environ.get("PORT", "8080"))
_default_legacy = "8765" if PORT == 8080 else ("8080" if PORT == 8765 else "0")
LEGACY_PORT = int(os.environ.get("LEGACY_PORT", _default_legacy or "0"))
GLYPH_FILE_RE = re.compile(r"^.\d+\.svg$", re.UNICODE)
SERVER_VERSION = 2
PAGMAR_BUILD = "20250712-export-barcode"


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


def ensure_exports_dir():
    os.makedirs(EXPORTS_DIR, exist_ok=True)


def seed_data_dir():
    """When DATA_DIR is a separate persistent disk, seed it from the repo copy
    on first boot so connections/glyphs aren't empty. No-op when DATA_DIR==ROOT."""
    if DATA_DIR == ROOT:
        return
    os.makedirs(DATA_DIR, exist_ok=True)

    src_connections = os.path.join(ROOT, "connections.json")
    if not os.path.isfile(CONNECTIONS_PATH) and os.path.isfile(src_connections):
        shutil.copy2(src_connections, CONNECTIONS_PATH)
        print(f"[seed] connections.json -> {CONNECTIONS_PATH}")

    os.makedirs(GLYPHS_DIR, exist_ok=True)
    src_glyphs = os.path.join(ROOT, "glyphs")
    if os.path.isdir(src_glyphs):
        for name in os.listdir(src_glyphs):
            src = os.path.join(src_glyphs, name)
            dst = os.path.join(GLYPHS_DIR, name)
            if os.path.isfile(src) and not os.path.exists(dst):
                shutil.copy2(src, dst)

    ensure_exports_dir()


def save_export_share_png(data_url):
    prefix = "data:image/png;base64,"
    if not isinstance(data_url, str) or not data_url.startswith(prefix):
        raise ValueError("Expected PNG data URL")
    raw = base64.b64decode(data_url[len(prefix) :], validate=True)
    if not raw:
        raise ValueError("Empty PNG payload")
    if len(raw) > 8 * 1024 * 1024:
        raise ValueError("PNG too large")
    ensure_exports_dir()
    share_id = secrets.token_hex(8)
    path = os.path.join(EXPORTS_DIR, share_id + ".png")
    with open(path, "wb") as f:
        f.write(raw)
    return share_id


def get_lan_ip():
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.connect(("8.8.8.8", 80))
        ip = sock.getsockname()[0]
        sock.close()
        return ip
    except OSError:
        return None


def get_public_origin():
    """Explicit public URL for share links (set in cloud). None when unset."""
    explicit = os.environ.get("PUBLIC_ORIGIN") or os.environ.get("RENDER_EXTERNAL_URL")
    if explicit:
        return explicit.strip().rstrip("/")
    return None


def get_share_origin():
    # In the cloud the public URL is provided explicitly; the LAN IP fallback is
    # only meaningful for local (same-Wi-Fi) usage.
    public = get_public_origin()
    if public:
        return public
    lan_ip = get_lan_ip()
    if lan_ip:
        return f"http://{lan_ip}:{PORT}"
    return f"http://127.0.0.1:{PORT}"


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
        if path.endswith((".js", ".mjs", ".html", ".css")):
            # Allow caching WITH revalidation: the browser keeps the file and
            # gets a tiny 304 when unchanged, instead of re-downloading every
            # load. Content is versioned via ?v= query strings for busting.
            self.send_header("Cache-Control", "no-cache")
        elif "/questionnaire/exports/" in path:
            self.send_header("Cache-Control", "no-cache")
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
        # Serve runtime-written files from DATA_DIR when it's a separate disk.
        if DATA_DIR != ROOT and parts:
            if parts[0] == "glyphs":
                return os.path.join(GLYPHS_DIR, *parts[1:])
            if parts[:2] == ["questionnaire", "exports"]:
                return os.path.join(EXPORTS_DIR, *parts[2:])
        return os.path.join(self.directory, *parts)

    _GZIP_EXTS = (".js", ".mjs", ".css", ".html", ".svg", ".json")

    def _maybe_serve_gzip(self):
        """Serve compressible static files gzip-compressed, with 304 support."""
        if "gzip" not in (self.headers.get("Accept-Encoding") or "").lower():
            return False
        parsed = urlparse(self.path).path
        if not parsed.endswith(self._GZIP_EXTS):
            return False
        fs_path = self.translate_path(self.path)
        if not fs_path or not os.path.isfile(fs_path):
            return False
        try:
            st = os.stat(fs_path)
        except OSError:
            return False
        last_modified = self.date_time_string(st.st_mtime)
        if self.headers.get("If-Modified-Since") == last_modified:
            self.send_response(304)
            self.end_headers()
            return True
        try:
            with open(fs_path, "rb") as f:
                payload = gzip.compress(f.read(), 6)
        except OSError:
            return False
        self.send_response(200)
        self.send_header("Content-Type", self.guess_type(fs_path))
        self.send_header("Content-Encoding", "gzip")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Last-Modified", last_modified)
        self.send_header("Vary", "Accept-Encoding")
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(payload)
        return True

    def do_GET(self):
        self._set_decoded_path()
        parsed_path = urlparse(self.path).path

        if parsed_path == "/api/server-info":
            self._send_json({
                "ok": True,
                "version": SERVER_VERSION,
                "glyphUpload": True,
                "exportShare": True,
                "build": PAGMAR_BUILD,
                "shareOrigin": get_share_origin(),
            })
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

        if parsed_path in ("/design", "/design/", "/questionnaire/design", "/questionnaire/design.html"):
            self.send_response(302)
            self.send_header(
                "Location",
                f"/questionnaire/index.html?create=1&pagmarFresh={PAGMAR_BUILD}",
            )
            self.end_headers()
            return

        if parsed_path in ("/open", "/open/"):
            self.send_response(302)
            self.send_header(
                "Location",
                f"/questionnaire/open.html?pagmarFresh={PAGMAR_BUILD}",
            )
            self.end_headers()
            return

        if parsed_path in ("/questionnaire/open", "/questionnaire/open/"):
            self.send_response(302)
            self.send_header(
                "Location",
                f"/questionnaire/open.html?pagmarFresh={PAGMAR_BUILD}",
            )
            self.end_headers()
            return

        if parsed_path in (
            "/questionnaire/create",
            "/questionnaire/create.html",
        ):
            self.send_response(302)
            self.send_header(
                "Location",
                f"/questionnaire/index.html?create=1&pagmarFresh={PAGMAR_BUILD}",
            )
            self.end_headers()
            return

        if parsed_path in ("/go", "/go/", "/site", "/site/"):
            self.send_response(302)
            self.send_header(
                "Location",
                f"/questionnaire/open.html?pagmarFresh={PAGMAR_BUILD}",
            )
            self.end_headers()
            return

        if parsed_path in ("/questionnaire/index", "/questionnaire"):
            self.send_response(301)
            self.send_header(
                "Location",
                f"/questionnaire/index.html?pagmarFresh={PAGMAR_BUILD}",
            )
            self.end_headers()
            return

        if parsed_path.startswith("/glyphs/") and parsed_path.endswith(".svg"):
            fs_path = self.translate_path(self.path)
            if fs_path and os.path.isfile(fs_path):
                print(f"[serve] {parsed_path} -> {os.path.basename(fs_path)}")
            else:
                print(f"[serve] MISSING {parsed_path} (fs={fs_path})")

        if self._maybe_serve_gzip():
            return
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

    def _handle_export_share(self):
        payload = self._read_json_body()
        if payload is None:
            self.send_error(400, "Invalid JSON")
            return
        try:
            share_id = save_export_share_png(payload.get("image"))
        except ValueError as err:
            self.send_error(400, str(err))
            return
        except (OSError, binascii.Error) as err:
            print(f"[API] export-share failed: {err}")
            self.send_error(500, "Failed to save export image")
            return
        image_url = f"/questionnaire/exports/{share_id}.png"
        view_url = f"/questionnaire/export-share.html?id={share_id}"
        print(f"[API] POST /api/export-share -> {share_id}.png ({os.path.getsize(os.path.join(EXPORTS_DIR, share_id + '.png'))} bytes)")
        self._send_json({
            "ok": True,
            "id": share_id,
            "imageUrl": image_url,
            "viewUrl": view_url,
        })

    def do_POST(self):
        self._set_decoded_path()
        parsed_path = urlparse(self.path).path
        if parsed_path == "/api/glyphs":
            self._handle_glyph_upload()
            return
        if parsed_path == "/api/export-share":
            self._handle_export_share()
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
    seed_data_dir()
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
