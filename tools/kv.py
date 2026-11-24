"""Tolerant KeyValues (VDF) text parser. Duplicate keys merge (dicts) or keep last (strings)."""
import re

TOK = re.compile(r'"((?:[^"\\]|\\.)*)"|([{}])|(//[^\n]*)|([^\s{}"]+)')


def parse(text, multi=False):
    """multi=True keeps repeated string keys as lists (needed for loot lists etc.)."""
    stack = [{}]
    key = None
    for m in TOK.finditer(text):
        q, br, com, bare = m.groups()
        if com is not None:
            continue
        if br == '{':
            cur = stack[-1]
            if key in cur and isinstance(cur[key], dict):
                new = cur[key]
            else:
                new = {}
                cur[key] = new
            stack.append(new)
            key = None
        elif br == '}':
            if len(stack) > 1:
                stack.pop()
            key = None
        else:
            tok = q if q is not None else bare
            if key is None:
                key = tok
            else:
                if q is None and tok.startswith('['):
                    continue  # platform conditional like [$WIN32]
                val = tok.replace('\\"', '"').replace('\\n', '\n')
                cur = stack[-1]
                if multi and key in cur and not isinstance(cur[key], dict):
                    if isinstance(cur[key], list):
                        cur[key].append(val)
                    else:
                        cur[key] = [cur[key], val]
                else:
                    cur[key] = val
                key = None
    return stack[0]
