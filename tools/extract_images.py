"""Decode Source 2 .vtex_c panorama images to WebP."""
import io, json, os, struct, sys
from multiprocessing import Pool
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lz4.block
from PIL import Image
from common import load, blocks, SITE, WORK, safe_path

QUALITY = int(os.environ.get('WEBP_Q', '80'))
BPP = {4: 4, 28: 4}          # uncompressed formats: bytes per pixel
BCN = {1: (1, 8), 2: (3, 16), 20: (7, 16), 27: (4, 8), 21: (5, 16)}  # format -> (pillow bcn n, bytes per 4x4 block)


def mip_size(fmt, w, h):
    if fmt in BPP:
        return w * h * BPP[fmt]
    n, bs = BCN[fmt]
    return max(1, (w + 3) // 4) * max(1, (h + 3) // 4) * bs


def decode(d):
    hsize, b = blocks(d)
    o, _ = b['DATA']
    w, h, depth = struct.unpack_from('<HHH', d, o + 20)
    fmt, mips = d[o + 26], d[o + 27]
    xoff_pos = o + 32
    xoff, xcnt = struct.unpack_from('<II', d, xoff_pos)
    compressed = None
    crop = None
    p = xoff_pos + xoff
    for i in range(xcnt):
        typ, off, size = struct.unpack_from('<III', d, p)
        dp = p + 4 + off
        if typ == 4:
            int1, moff, mcount = struct.unpack_from('<III', d, dp)
            if int1 == 1:
                compressed = list(struct.unpack_from(f'<{mcount}i', d, dp + 4 + moff))
        elif typ == 3:
            nw, nh = struct.unpack_from('<HH', d, dp)
            if 0 < nw <= w and 0 < nh <= h and (nw, nh) != (w, h):
                crop = (nw, nh)
        p += 12
    data = d[hsize:]
    if fmt in (16, 18, 15):  # PNG / JPEG payload
        im = Image.open(io.BytesIO(data))
        im.load()
        return im.convert('RGBA')
    # skip smaller mips (stored smallest first)
    pos = 0
    for m in range(mips - 1, 0, -1):
        pos += compressed[m] if compressed else mip_size(fmt, max(1, w >> m), max(1, h >> m))
    raw_len = mip_size(fmt, w, h)
    if compressed:
        raw = lz4.block.decompress(data[pos:pos + compressed[0]], uncompressed_size=raw_len)
    else:
        raw = data[pos:pos + raw_len]
    if fmt == 28:
        im = Image.frombytes('RGBA', (w, h), raw, 'raw', 'BGRA')
    elif fmt == 4:
        im = Image.frombytes('RGBA', (w, h), raw)
    else:
        n, _ = BCN[fmt]
        im = Image.frombytes('RGBA', (w, h), raw, 'bcn', n)
    if crop:
        im = im.crop((0, 0) + crop)
    return im


vpk = None


def work(job):
    global vpk
    out, src = job
    try:
        dst = safe_path(out)
    except ValueError as e:
        return out, f'ERR {e}'
    if os.path.exists(dst):
        return out, 'skip'
    if vpk is None:
        vpk = load()
    try:
        im = decode(vpk.read(src))
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        im.save(dst, 'WEBP', quality=QUALITY, method=5)
        return out, 'ok'
    except Exception as e:
        return out, f'ERR {type(e).__name__}: {e}'


if __name__ == '__main__':
    jobs = sorted(json.load(open(os.path.join(WORK, 'images.json'))).items())
    if len(sys.argv) > 1:
        jobs = [j for j in jobs if any(a in j[0] for a in sys.argv[1:])]
    errs = []
    with Pool(max(1, os.cpu_count() - 2)) as pool:
        for i, (out, st) in enumerate(pool.imap_unordered(work, jobs, chunksize=16)):
            if st.startswith('ERR'):
                errs.append((out, st))
            if i % 1000 == 0:
                print(i, len(jobs), flush=True)
    print('done', len(jobs), 'errors', len(errs))
    for e in errs[:40]:
        print(e)
    json.dump(errs, open(os.path.join(WORK, 'image_errors.json'), 'w'), indent=0)
