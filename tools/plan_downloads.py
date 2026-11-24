"""List the pak01_NNN.vpk chunks that hold images/sounds not yet on the site.

Run after build_data.py. Prints one DepotDownloader filelist line per chunk, e.g.
    regex:^game[\\\\/]csgo[\\\\/]pak01_123\\.vpk$
and nothing when everything is already extracted.
"""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import load, SITE, WORK, safe_path

vpk = load()


def exists(rel):
    try:
        return os.path.exists(safe_path(rel))
    except ValueError:
        return True  # unsafe name: never download or write it

images = json.load(open(os.path.join(WORK, 'images.json')))
sounds = json.load(open(os.path.join(WORK, 'sounds.json')))

needed = [src for out, src in images.items() if not exists(out)]
needed += [f'sounds/music/{kit}/{name}.vsnd_c' for kit, names in sounds.items() for name in names
           if not exists(f'audio/{kit}/{name}.mp3')]

chunks = sorted({vpk.entries[p][0] for p in needed if vpk.entries[p][2] and vpk.entries[p][0] != 0x7FFF})
print(f'{len(needed)} new files in {len(chunks)} chunks', file=sys.stderr)
for c in chunks:
    print(rf'regex:^game[\\/]csgo[\\/]pak01_{c:03d}\.vpk$')
