import zlib, struct

def read_png(path):
    d = open(path,'rb').read()
    assert d[:8] == b'\x89PNG\r\n\x1a\n'
    i, idat, pal, trns = 8, b'', None, None
    w = h = bd = ct = None
    while i < len(d):
        ln = struct.unpack('>I', d[i:i+4])[0]; typ = d[i+4:i+8]; data = d[i+8:i+8+ln]
        if typ == b'IHDR':
            w, h, bd, ct = struct.unpack('>IIBB', data[:10])
        elif typ == b'IDAT': idat += data
        elif typ == b'PLTE': pal = data
        elif typ == b'IEND': break
        i += 12 + ln
    raw = zlib.decompress(idat)
    chans = {0:1, 2:3, 3:1, 4:2, 6:4}[ct]
    bpp = chans * (2 if bd == 16 else 1)
    stride = w * bpp
    out = bytearray(); prev = bytearray(stride)
    p = 0
    for y in range(h):
        f = raw[p]; p += 1
        line = bytearray(raw[p:p+stride]); p += stride
        for x in range(stride):
            a = line[x-bpp] if x >= bpp else 0
            b = prev[x]
            c = prev[x-bpp] if x >= bpp else 0
            if f == 1: line[x] = (line[x] + a) & 255
            elif f == 2: line[x] = (line[x] + b) & 255
            elif f == 3: line[x] = (line[x] + (a+b)//2) & 255
            elif f == 4:
                pp = a + b - c
                pa, pb, pc = abs(pp-a), abs(pp-b), abs(pp-c)
                pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                line[x] = (line[x] + pr) & 255
        out += line; prev = line
    def px(x, y):
        o = y*stride + x*bpp
        st = 2 if bd == 16 else 1
        if ct == 3:
            k = out[o]*3
            return (pal[k], pal[k+1], pal[k+2])
        if ct in (0,4): return (out[o],)*3
        return (out[o], out[o+st], out[o+2*st])
    return w, h, px


# ---------------------------------------------------------------------------
# Why this exists.
#
# The pistols were drawn three times from published dimensions and a mental
# picture of the gun, and each time the grip raked the wrong way. Measuring a
# photograph settled it in one pass. Point this at a reference image, give it
# the rectangle the gun sits in, and it walks the silhouette column by column
# and row by row so the outline can be read off in real proportions.
#
#   python3 tools/trace_png.py <image.png> <x0> <y0> <x1> <y1> [--flip]
#
# --flip mirrors the result to muzzle-left, which is the convention all the
# game's artwork uses. Neither Pillow nor numpy is installed on this machine
# and the phone screenshots come out 16-bit, hence the hand-rolled decoder.

def trace(path, box, flip=False, thresh=120, steps=50):
    x0, y0, x1, y1 = box
    w, h, px = read_png(path)
    def dark(x, y):
        r, g, b = px(x, y)
        return (r + g + b) / 3 < thresh
    cols = {}
    for x in range(max(0, x0), min(w, x1)):
        ys = [y for y in range(max(0, y0), min(h, y1)) if dark(x, y)]
        if ys:
            cols[x] = (min(ys), max(ys))
    if not cols:
        return None
    xs = sorted(cols)
    L, R = xs[0], xs[-1]
    T = min(v[0] for v in cols.values())
    B = max(v[1] for v in cols.values())
    W, H = R - L, B - T
    out = []
    for i in range(steps + 1):
        f = i / steps
        x = (R - int(W * f)) if flip else (L + int(W * f))
        x = min(max(x, L), R)
        if x in cols:
            t, b = cols[x]
            out.append((f, (t - T) / H, (b - T) / H))
    return {'aspect': W / H, 'profile': out}


if __name__ == '__main__':
    import sys
    a = sys.argv[1:]
    flip = '--flip' in a
    a = [v for v in a if v != '--flip']
    r = trace(a[0], tuple(int(v) for v in a[1:5]), flip=flip)
    print(f"aspect {r['aspect']:.3f}  (width / height)")
    print("  x%    top%   bottom%")
    for f, t, b in r['profile']:
        print(f"{100*f:5.1f}  {100*t:6.1f}  {100*b:6.1f}")
