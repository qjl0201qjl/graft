#!/usr/bin/env python3
"""生成像素风应用图标(零依赖 PNG 编码):护目镜拼装探险家,与游戏形象保持一致。用法: python3 tools/make_icons.py assets"""
import struct, zlib, os, sys

def png(path, w, h, px):
    raw = b''.join(b'\x00' + bytes(px[y*w*4:(y+1)*w*4]) for y in range(h))
    def chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    open(path, 'wb').write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0))
                           + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))

def hexc(h): return tuple(int(h[i:i+2], 16) for i in (1, 3, 5)) + (255,)
PAL = {'.': hexc('#161522'), 'O': hexc('#292338'), 'M': hexc('#ee9cb6'), 'S': hexc('#bc6684'),
       'W': hexc('#d5f5ef'), 'P': hexc('#293748'), 'G': hexc('#a7de8b'), 'g': hexc('#548656'),
       'B': hexc('#dcbd8f'), 'K': hexc('#6f5051'), 'F': hexc('#f6b562'), 'f': hexc('#d36f38'),
       'A': hexc('#97a7bb'), 'a': hexc('#637386'), 'V': hexc('#8bdaeb'), 'v': hexc('#479abb'),
       'H': hexc('#ffeec1')}
ART=[list('.'*32) for _ in range(32)]
def rect(x,y,w,h,c):
    for j in range(y,y+h):
        for i in range(x,x+w):
            if 0<=i<32 and 0<=j<32: ART[j][i]=c
for j,row in enumerate([['G','M','A'],['M','M','M'],['V','M','F']]):
    for i,c in enumerate(row):
        x,y=7+i*6,8+j*6
        rect(x,y,6,6,'O');rect(x+1,y+1,4,4,c);rect(x+1,y+4,4,1,{'G':'g','A':'a','V':'v','F':'f'}.get(c,'S'));rect(x+1,y+1,3,1,'H')
rect(10,5,1,4,'g');rect(8,5,3,2,'G');rect(11,3,3,2,'G')
rect(9,11,15,3,'K')
for x in [10,18]:
    rect(x-1,10,6,6,'B');rect(x,11,4,4,'W');rect(x+2,12,1,2,'P');rect(x,11,1,1,'H')
rect(15,12,3,1,'B');rect(12,17,9,2,'K');rect(13,17,7,1,'B');rect(19,18,2,3,'B')
rect(14,21,5,5,'K');rect(15,22,3,3,'B');rect(16,22,1,2,'H')
rect(22,20,1,3,'H');rect(21,22,3,2,'H')

def render(size, pad):
    px = bytearray(size*size*4); inner = int(size*(1-2*pad)); off = (size-inner)//2
    for y in range(size):
        for x in range(size):
            c = PAL['.']; ix, iy = x-off, y-off
            if 0 <= ix < inner and 0 <= iy < inner: c = PAL[ART[iy*len(ART)//inner][ix*len(ART[0])//inner]]
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
