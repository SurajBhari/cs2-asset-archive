"""List the pak01_NNN.vpk chunks that hold images/sounds not yet on the site.

Run after build_data.py. Prints one DepotDownloader filelist line per chunk, e.g.
    regex:^game[\\\\/]csgo[\\\\/]pak01_123\\.vpk$
and nothing when everything is already extracted.
"""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import load, SITE, WORK

vpk = load()
images = json.load(open(os.path.join(WORK, 'images.json')))
sounds = json.load(open(os.path.join(WORK, 'sounds.json')))

needed = [src for out, src in images.items() if not os.path.exists(os.path.join(SITE, out))]
needed += [f'sounds/music/{kit}/{name}.vsnd_c' for kit, names in sounds.items() for name in names
           if not os.path.exists(os.path.join(SITE, 'audio', kit, f'{name}.mp3'))]

chunks = sorted({vpk.entries[p][0] for p in needed if vpk.entries[p][2] and vpk.entries[p][0] != 0x7FFF})
print(f'{len(needed)} new files in {len(chunks)} chunks', file=sys.stderr)
for c in chunks:
    print(rf'regex:^game[\\/]csgo[\\/]pak01_{c:03d}\.vpk$')
