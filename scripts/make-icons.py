#!/usr/bin/env python3
"""Generuje ikony PWA bez zewnętrznych bibliotek.

Rysuje pierścień produktywności na fioletowym tle — ten sam motyw, co wskaźnik
w aplikacji. Uruchom: python3 scripts/make-icons.py
"""
import math
import os
import struct
import zlib

OUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'public', 'icons')
SIZES = [(180, 'apple-touch-icon.png'), (192, 'icon-192.png'), (512, 'icon-512.png')]
SS = 3  # nadpróbkowanie — wygładza krawędzie

BG_TOP = (139, 123, 240)
BG_BOTTOM = (74, 58, 167)
RING_BG = (255, 255, 255, 60)
RING_FG = (255, 255, 255, 255)


def blend(dst, src):
    """src nad dst, oba RGBA z alfą 0-255."""
    a = src[3] / 255.0
    if a == 0:
        return dst
    return (
        round(src[0] * a + dst[0] * (1 - a)),
        round(src[1] * a + dst[1] * (1 - a)),
        round(src[2] * a + dst[2] * (1 - a)),
        255,
    )


def sample(x, y, size):
    """Kolor jednego (nadpróbkowanego) piksela."""
    t = y / max(1, size - 1)
    base = (
        round(BG_TOP[0] + (BG_BOTTOM[0] - BG_TOP[0]) * t),
        round(BG_TOP[1] + (BG_BOTTOM[1] - BG_TOP[1]) * t),
        round(BG_TOP[2] + (BG_BOTTOM[2] - BG_TOP[2]) * t),
        255,
    )

    cx = cy = size / 2.0
    dx, dy = x - cx + 0.5, y - cy + 0.5
    dist = math.hypot(dx, dy)

    outer = size * 0.345
    inner = size * 0.245
    if not (inner <= dist <= outer):
        return base

    # Kąt liczony od godziny 12, zgodnie z ruchem wskazówek.
    angle = (math.degrees(math.atan2(dx, -dy)) + 360) % 360
    filled = angle <= 278
    return blend(base, RING_FG if filled else RING_BG)


def render(size):
    big = size * SS
    rows = []
    for y in range(size):
        row = bytearray()
        for x in range(size):
            r = g = b = 0
            for sy in range(SS):
                for sx in range(SS):
                    px = sample(x * SS + sx, y * SS + sy, big)
                    r += px[0]
                    g += px[1]
                    b += px[2]
            n = SS * SS
            row += bytes((r // n, g // n, b // n, 255))
        rows.append(bytes(row))
    return rows


def write_png(path, size, rows):
    raw = b''.join(b'\x00' + row for row in rows)

    def chunk(tag, payload):
        data = tag + payload
        return struct.pack('>I', len(payload)) + data + struct.pack('>I', zlib.crc32(data) & 0xFFFFFFFF)

    png = b'\x89PNG\r\n\x1a\n'
    png += chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0))
    png += chunk(b'IDAT', zlib.compress(raw, 9))
    png += chunk(b'IEND', b'')
    with open(path, 'wb') as f:
        f.write(png)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for size, name in SIZES:
        write_png(os.path.join(OUT_DIR, name), size, render(size))
        print(f'{name}: {size}x{size}')


if __name__ == '__main__':
    main()
