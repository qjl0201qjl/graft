#!/usr/bin/env python3
"""生成像素风应用图标(零依赖 PNG 编码):一坨 3×3 的肉,带眼睛。用法: python3 tools/make_icons.py assets"""
import struct, zlib, os, sys

def png(path, w, h, px):
    raw = b''.join(b'\x00' + bytes(px[y*w*4:(y+1)*w*4]) for y in range(h))
    def chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    open(path, 'wb').write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0))
                           + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))

def hexc(h): return tuple(int(h[i:i+2], 16) for i in (1, 3, 5)) + (255,)
ART = [
 "................","................","................",
 "...OOOOOOOOOO...","...OMMMMMMMMO...","...OMWWMMWWMO...","...OMWPMMWPMO...",
 "...OMMMMMMMMO...","...OMMMMMMMMO...","...OMMMDDMMMO...","...OMMMMMMMMO...",
 "...OSSSSSSSSO...","...OOOOOOOOOO...","................","....GGGGGGGG....","................",
]
PAL = {'.': hexc('#0b0a10'), 'O': hexc('#150c16'), 'M': hexc('#ff8fa3'), 'S': hexc('#d75f78'),
       'W': hexc('#fff8fa'), 'P': hexc('#3a1524'), 'D': hexc('#3a1524'), 'G': hexc('#2a2342')}

def render(size, pad):
    px = bytearray(size*size*4); inner = int(size*(1-2*pad)); off = (size-inner)//2
    for y in range(size):
        for x in range(size):
            c = PAL['.']; ix, iy = x-off, y-off
            if 0 <= ix < inner and 0 <= iy < inner: c = PAL[ART[iy*16//inner][ix*16//inner]]
            if c == PAL['.']:
                dx, dy = (x-size/2)/size, (y-size/2.2)/size
                g = max(0.0, 0.32 - (dx*dx+dy*dy)*1.6)
                c = (int(11+70*g), int(10+50*g), int(16+120*g), 255)
            i = (y*size+x)*4; px[i:i+4] = bytes(c)
    return px

out = sys.argv[1] if len(sys.argv) > 1 else 'assets'
os.makedirs(out, exist_ok=True)
for name, size, pad in [('icon-180.png',180,0.06),('icon-192.png',192,0.06),('icon-512.png',512,0.06),('icon-maskable-512.png',512,0.16)]:
    png(os.path.join(out, name), size, size, render(size, pad)); print('wrote', name)
