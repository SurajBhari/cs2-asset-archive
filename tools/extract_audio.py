"""Extract every music kit sound from vsnd_c and encode to MP3."""
import json, os, struct, subprocess, sys
from concurrent.futures import ThreadPoolExecutor
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import load, blocks, SITE, WORK

BITRATE = os.environ.get('MP3_BITRATE', '72k')
vpk = load()
sounds = json.load(open(os.path.join(WORK, 'sounds.json')))


def job(kit, name):
    dst = f'{SITE}/audio/{kit}/{name}.mp3'
    if os.path.exists(dst):
        return None
    d = vpk.read(f'sounds/music/{kit}/{name}.vsnd_c')
    size, b = blocks(d)
    o, s = b['DATA']
    if s >= 32:
        rate, typ, ch = struct.unpack_from('<HBB', d, o)
        stream_len = struct.unpack_from('<I', d, o + 28)[0] or len(d) - size
    else:  # KV3 CTRL-described sounds: format named in the CTRL block, 44.1k stereo
        ctrl = d[slice(*(lambda o2, s2: (o2, o2 + s2))(*b['CTRL']))] if 'CTRL' in b else b''
        head = d[size:size + 3]
        is_mp3 = b'MP3' in ctrl or head[:3] == b'ID3' or (head[0] == 0xFF and head[1] & 0xE0 == 0xE0)
        rate, typ, ch, stream_len = 44100, 2 if is_mp3 else 0, 2, len(d) - size
    payload = d[size:size + stream_len]
    if typ == 2:
        inp = ['-f', 'mp3', '-i', 'pipe:0']
    elif typ == 0:
        inp = ['-f', 's16le', '-ar', str(rate), '-ac', str(ch), '-i', 'pipe:0']
    else:
        return f'{kit}/{name}: unknown type {typ}'
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    cmd = ['ffmpeg', '-v', 'error', '-y', *inp, '-map_metadata', '-1', '-c:a', 'libmp3lame', '-b:a', BITRATE, '-ar', '44100', dst]
    r = subprocess.run(cmd, input=payload, capture_output=True)
    if r.returncode:
        if os.path.exists(dst):
            os.remove(dst)
        return f'{kit}/{name}: {r.stderr.decode(errors="replace")[:200]}'
    return None


jobs = [(k, n) for k, files in sounds.items() for n in files]
with ThreadPoolExecutor(max(1, os.cpu_count() - 2)) as ex:
    errs = [e for e in ex.map(lambda a: job(*a), jobs) if e]
print('jobs', len(jobs), 'errors', len(errs))
for e in errs:
    print(e)
