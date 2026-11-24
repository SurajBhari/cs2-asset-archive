import sys, pickle, struct
sys.path.insert(0, r'C:/Users/suraj/Desktop/cs2_tools')
from vpk import VPK
def load():
    v = VPK.__new__(VPK)
    v.dir_path = r'D:/SteamLibrary/steamapps/common/Counter-Strike Global Offensive/game/csgo/pak01_dir.vpk'
    v.base = v.dir_path[:-8]
    v.entries, v.header_len, v.tree_size = pickle.load(open(r'C:/Users/suraj/Desktop/cs2_tools/index.pkl', 'rb'))
    return v

def blocks(d):
    size, hv, ver, boff, bcnt = struct.unpack_from('<IHHII', d, 0)
    out = {}
    base = 8
    for i in range(bcnt):
        p = base + boff + i*12
        name = d[p:p+4].decode()
        off, sz = struct.unpack_from('<II', d, p+4)
        out[name] = (p+4+off, sz)
    return size, out
