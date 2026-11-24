"""Minimal VPK v2 reader for CS2 pak01."""
import struct, os

class VPK:
    def __init__(self, dir_path):
        self.dir_path = dir_path
        self.base = dir_path[:-len("_dir.vpk")]
        self.entries = {}
        with open(dir_path, "rb") as f:
            sig, ver, tree_size = struct.unpack("<III", f.read(12))
            assert sig == 0x55AA1234, hex(sig)
            if ver == 2:
                f.read(16)
                self.header_len = 28
            else:
                self.header_len = 12
            self.tree_size = tree_size
            tree = f.read(tree_size)
        self._parse(tree)

    def _parse(self, t):
        p = 0
        def rs():
            nonlocal p
            e = t.index(b"\0", p); s = t[p:e].decode("utf-8", "replace"); p = e + 1; return s
        while True:
            ext = rs()
            if not ext: break
            while True:
                d = rs()
                if not d: break
                while True:
                    n = rs()
                    if not n: break
                    crc, pre, arc, off, ln, term = struct.unpack_from("<IHHIIH", t, p); p += 18
                    preload = t[p:p+pre]; p += pre
                    path = (f"{d}/" if d != " " else "") + n + (f".{ext}" if ext != " " else "")
                    self.entries[path] = (arc, off, ln, preload)

    def read(self, path):
        arc, off, ln, pre = self.entries[path]
        if ln == 0: return pre
        if arc == 0x7FFF:
            fn = self.dir_path; off += self.header_len + self.tree_size
        else:
            fn = f"{self.base}_{arc:03d}.vpk"
        with open(fn, "rb") as f:
            f.seek(off); return pre + f.read(ln)
