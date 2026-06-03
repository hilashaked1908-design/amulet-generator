#!/usr/bin/env python3
"""Static server + API to read/write connections.json."""

import json
import os
from http.server import HTTPServer, SimpleHTTPRequestHandler
from urllib.parse import unquote, urlparse

ROOT = os.path.dirname(os.path.abspath(__file__))
CONNECTIONS_PATH = os.path.join(ROOT, "connections.json")
GLYPHS_DIR = os.path.join(ROOT, "glyphs")
PORT = int(os.environ.get("PORT", "8080"))


def read_connections():
    if not os.path.isfile(CONNECTIONS_PATH):
        return {"connections": []}
    with open(CONNECTIONS_PATH, encoding="utf-8") as f:
        return json.load(f)


def write_connections(data):
    with open(CONNECTIONS_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")


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
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
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

        if parsed_path.startswith("/glyphs/") and parsed_path.endswith(".svg"):
            fs_path = self.translate_path(self.path)
            if fs_path and os.path.isfile(fs_path):
                print(f"[serve] {parsed_path} -> {os.path.basename(fs_path)}")
            else:
                print(f"[serve] MISSING {parsed_path} (fs={fs_path})")

        return super().do_GET()

    def do_POST(self):
        self._set_decoded_path()
        parsed_path = urlparse(self.path).path
        if parsed_path != "/api/connections":
            self.send_error(404)
            return

        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length).decode("utf-8") if length else "{}"
        try:
            payload = json.loads(body)
        except json.JSONDecodeError:
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
        items = [c for c in items if connection_key(c) != key]
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
    print_glyphs_startup_info()
    print(f"Serving at http://localhost:{PORT}")
    print("Open editor: http://localhost:{PORT}/editor.html")
    print("All paths URL-decoded (unquote) for Hebrew filenames")
    HTTPServer(("", PORT), Handler).serve_forever()
