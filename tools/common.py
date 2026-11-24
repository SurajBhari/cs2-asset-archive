"""Shared paths and Source 2 resource helpers. Paths can be overridden with environment variables."""
import os, struct, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from vpk import VPK  # noqa: E402

# Folder holding pak01_dir.vpk (and whichever pak01_NNN.vpk chunks are present).
CS2_DIR = os.environ.get('CS2_DIR', r'D:/SteamLibrary/steamapps/common/Counter-Strike Global Offensive/game/csgo')
# The website repo (this repo's root by default).
SITE = os.environ.get('SITE_DIR', os.path.dirname(HERE))
# Scratch space: raw text files, job lists, index cache.
WORK = os.environ.get('WORK_DIR', os.path.join(HERE, '.work'))
RAW = os.path.join(WORK, 'raw')

# Output paths are built from names in upstream game data; only accept plain relative paths.
import re  # noqa: E402
SAFE_OUT = re.compile(r'^(img/[a-z0-9_-]+(/[a-z0-9_-]+)*\.webp|audio/[a-z0-9_-]+/[a-z0-9_-]+\.mp3)$', re.I)


def safe_path(rel):
    """Absolute path inside SITE for a generated asset, or ValueError if rel isn't a plain img/ or audio/ path."""
    if not SAFE_OUT.match(rel) or '..' in rel:
        raise ValueError(f'unsafe output path: {rel!r}')
    return os.path.join(SITE, rel)
os.makedirs(RAW, exist_ok=True)


def load():
    """Open pak01_dir.vpk (parses its ~145k-entry directory tree; takes a couple of seconds)."""
    return VPK(os.path.join(CS2_DIR, 'pak01_dir.vpk'))


def blocks(d):
    """Return (header size, {block name: (absolute offset, size)}) for a compiled Source 2 resource."""
    size, hv, ver, boff, bcnt = struct.unpack_from('<IHHII', d, 0)
    out = {}
    for i in range(bcnt):
        p = 8 + boff + i * 12
        name = d[p:p + 4].decode()
        off, sz = struct.unpack_from('<II', d, p + 4)
        out[name] = (p + 4 + off, sz)
    return size, out
