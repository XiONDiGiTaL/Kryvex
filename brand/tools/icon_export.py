#!/usr/bin/env python3
"""Build-time icon exporter for Kryvex brand assets.

Serves the brand directory on loopback and accepts PNGs rendered by Chromium
(brand/_export.html) at exactly the requested pixel sizes, writing them to
brand/icons/. Then composes kryvex.ico from the PNG set (requires Pillow).

Usage:
  python3 brand/tools/icon_export.py --port 8903   # serve; export happens in browser
  python3 brand/tools/icon_export.py --ico          # compose ICO from existing PNGs
"""
import argparse
import base64
import json
import pathlib
import struct
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

BRAND = pathlib.Path(__file__).resolve().parent.parent
ICONS = BRAND / "icons"


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(BRAND), **kw)

    def do_POST(self):
        if self.path != "/__save":
            self.send_error(404)
            return
        length = int(self.headers.get("Content-Length", "0"))
        payload = json.loads(self.rfile.read(length) or b"{}")
        name = pathlib.Path(payload.get("name", ""))
        data = payload.get("data", "")
        if name.name != str(name) or not name.name.endswith(".png") or not data:
            self.send_error(400, "bad name or empty data")
            return
        ICONS.mkdir(parents=True, exist_ok=True)
        raw = base64.b64decode(data)
        (ICONS / name.name).write_bytes(raw)
        body = json.dumps({"ok": True, "bytes": len(raw)}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/__ping":
            body = b'{"ok":true}'
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()

    def log_message(self, fmt, *args):
        sys.stderr.write("%s\n" % (fmt % args))


# Per-size source art: small variant for 16-64, full tile for 128-256.
ICO_SOURCES = {
    16: "kryvex-small-16.png",
    24: "kryvex-small-24.png",
    32: "kryvex-small-32.png",
    48: "kryvex-small-48.png",
    64: "kryvex-small-64.png",
    128: "kryvex-128.png",
    256: "kryvex-256.png",
}


def build_ico():
    """Compose a multi-resolution ICO from pre-rendered PNGs (PNG-compressed entries)."""
    from PIL import Image

    missing = [f for f in ICO_SOURCES.values() if not (ICONS / f).exists()]
    if missing:
        raise SystemExit(f"missing PNGs for ICO: {missing}")

    entries = []
    for size, fname in sorted(ICO_SOURCES.items()):
        raw = (ICONS / fname).read_bytes()
        with Image.open(ICONS / fname) as im:
            if im.size != (size, size):
                raise SystemExit(f"{fname} is {im.size}, expected {size}x{size}")
        entries.append((size, raw))

    header = struct.pack("<HHH", 0, 1, len(entries))
    offset = 6 + 16 * len(entries)
    directory = bytearray()
    for size, raw in entries:
        dim = 0 if size >= 256 else size
        directory += struct.pack("<BBBBHHII", dim, dim, 0, 0, 1, 32, len(raw), offset)
        offset += len(raw)
    out = header + bytes(directory) + b"".join(raw for _, raw in entries)
    (ICONS / "kryvex.ico").write_bytes(out)

    with Image.open(ICONS / "kryvex.ico") as ico:
        print("ico ok", ico.size, "sizes:", sorted(ico.info.get("sizes", [])))
    print("ico bytes:", len(out), "->", ICONS / "kryvex.ico")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8903)
    ap.add_argument("--ico", action="store_true")
    args = ap.parse_args()
    if args.ico:
        build_ico()
    else:
        srv = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
        print(f"serving {BRAND} on http://127.0.0.1:{args.port}", flush=True)
        srv.serve_forever()
