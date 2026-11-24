"""Build the site's JSON catalogue from items_game.txt + csgo_english.txt."""
import json, os, re, sys
from collections import defaultdict
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kv
from common import load, SITE, RAW, WORK, CS2_DIR, SAFE_OUT


g = kv.parse(open(f'{RAW}/items_game.txt', encoding='utf-8').read(), multi=True)['items_game']
L = {k.lower(): v for k, v in kv.parse(open(f'{RAW}/csgo_english.txt', encoding='utf-8-sig').read())['lang']['Tokens'].items()}
vpk = load()
FILES = set(vpk.entries)

TAG = re.compile(r'<[^>]+>')


def loc(key, default=None):
    if not key:
        return default
    v = L.get(key.lstrip('#').lower())
    if v is None:
        return default
    return TAG.sub('', v).replace('\\n', '\n').strip()


def first(v):
    return v[0] if isinstance(v, list) else v


images = {}  # out relative path -> vpk path


def image(econ_path, out):
    """econ_path like 'econ/weapon_cases/crate_valve_1' -> registers extraction, returns site path."""
    if not econ_path or not SAFE_OUT.match(out):
        return None
    p = econ_path.lower().strip('/')
    if p.startswith('panorama/images/'):
        p = p[len('panorama/images/'):]
    for cand in (f'panorama/images/{p}_png.vtex_c', f'panorama/images/{p}.vtex_c'):
        if cand in FILES:
            images[out] = cand
            return out
    return None


def slug(s):
    return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')


# ---------- rarities ----------
colors = {k: v.get('hex_color') for k, v in g['colors'].items()}
RAR = {}
for k, r in g['rarities'].items():
    RAR[k] = {
        'key': k, 'value': int(r['value']),
        'weapon': loc(r.get('loc_key_weapon')), 'generic': loc(r.get('loc_key')),
        'character': loc(r.get('loc_key_character')), 'color': colors.get(r.get('color')),
    }


def rarity(key, kind='generic'):
    r = RAR.get(key or 'default') or RAR['default']
    return {'key': r['key'], 'name': r[kind] or r['generic'], 'color': r['color'], 'value': r['value']}


# ---------- prefab resolution ----------
prefabs = g['prefabs']


def deep_merge(base, over):
    out = dict(base)
    for k, v in over.items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = deep_merge(out[k], v)
        else:
            out[k] = v
    return out


def resolve(entry, seen=()):
    res = {}
    chain = []
    for p in (first(entry.get('prefab')) or '').split():
        if p in prefabs and p not in seen:
            sub, subchain = resolve(prefabs[p], seen + (p,))
            res = deep_merge(res, sub)
            chain += [p] + subchain
    return deep_merge(res, entry), chain


items = {}
for iid, it in g['items'].items():
    if not isinstance(it, dict) or iid == 'default':
        continue
    r, chain = resolve(it)
    r['_chain'] = chain
    r['_id'] = iid
    items[iid] = r
by_name = {it['name']: it for it in items.values() if 'name' in it}

# ---------- weapons ----------
WEAPON_TYPES = [('melee', 'Knife'), ('hands', 'Gloves'), ('sniper_rifle', 'Sniper Rifle'), ('rifle', 'Rifle'),
                ('smg', 'SMG'), ('shotgun', 'Shotgun'), ('machinegun', 'Machine Gun'), ('secondary', 'Pistol'),
                ('grenade', 'Grenade'), ('equipment', 'Equipment'), ('c4', 'Equipment')]


def weapon_type(it):
    ch = set(it['_chain'])
    if any(c.startswith('hands') for c in ch) or it['name'].endswith('_gloves') or it['name'] in ('leather_handwraps',):
        return 'Gloves'
    for key, label in WEAPON_TYPES:
        if key in ch:
            return label
    return None


weapons = {}
for it in items.values():
    n = it.get('name', '')
    wt = weapon_type(it) if n else None
    if not wt or not it.get('item_name'):
        continue
    if n.startswith(('weapon_', 'studded_', 'leather_', 'sporty_', 'slick_', 'motorcycle_', 'specialist_', 'bloodhound')) or wt in ('Knife', 'Gloves'):
        if n in ('weapon_knife', 'weapon_knife_t', 'weapon_knifegg', 'weapon_knife_ghost') and False:
            continue
        stats = it.get('attributes', {})
        w = {
            'id': it['_id'], 'name': n, 'title': loc(it.get('item_name'), n), 'type': wt,
            'description': loc(it.get('item_description')),
            'image': image(it.get('image_inventory'), f'img/weapons/{n}.webp'),
            'teams': sorted(k for k in (it.get('used_by_classes') or {}) if k != 'noteam'),
        }
        for stat_key, label in [('primary clip size', 'clip'), ('primary reserve ammo max', 'reserve'), ('damage', 'damage'),
                                ('armor ratio', 'armor_pen'), ('cycletime', 'cycle_time'), ('max player speed', 'speed'),
                                ('in game price', 'price'), ('kill award', 'kill_award'), ('range modifier', 'range_mod'),
                                ('penetration', 'penetration'), ('headshot multiplier', 'hs_mult')]:
            v = stats.get(stat_key)
            if isinstance(v, (str, list)):
                w[label] = first(v)
        weapons[n] = w

# ---------- loot lists ----------
cll = g['client_loot_lists']
RARITY_SUFFIX = ['_common', '_uncommon', '_rare', '_mythical', '_legendary', '_ancient', '_immortal']


def walk_loot(name, seen=None):
    """Yield (entry_key, rarity_from_list) for every leaf in the loot list tree."""
    seen = seen or set()
    if name in seen or name not in cll:
        return
    seen.add(name)
    lst = cll[name]
    lr = next((s[1:] for s in RARITY_SUFFIX if name.endswith(s)), None)
    for k in lst:
        if k in cll:
            for leaf, r in walk_loot(k, seen):
                yield leaf, r or lr
        elif k.startswith('['):
            yield k, lr


LEAF = re.compile(r'^\[([^\]]+)\](.+)$')
combo_rarity = {}
for lname in cll:
    for leaf, r in walk_loot(lname):
        if r and leaf not in combo_rarity:
            combo_rarity[leaf] = r

# ---------- collections ----------
collections = {}
combo_sets = defaultdict(list)
for sid, s in g['item_sets'].items():
    entry = {'id': sid, 'title': loc(s.get('name'), sid), 'description': loc(s.get('set_description')),
             'is_collection': s.get('is_collection') == '1', 'items': list((s.get('items') or {}).keys()),
             'image': image(f'econ/set_icons/{sid}', f'img/collections/{sid}.webp')}
    collections[sid] = entry
    for k in entry['items']:
        combo_sets[k].append(sid)

# ---------- containers ----------
CONTAINER_PREFABS = {'weapon_case': 'Weapon Case', 'sticker_capsule': 'Sticker Capsule', 'patch_capsule': 'Patch Pack',
                     'graffiti_box': 'Graffiti Box', 'weapon_case_souvenirpkg': 'Souvenir Package',
                     'weapon_case_selfopening_collection': 'Collection Package', 'bundle_base': 'Bundle',
                     'weapon_case_base': 'Container'}
rev = g['revolving_loot_lists']
containers = []
combo_crates = defaultdict(list)
for it in items.values():
    ch = it['_chain']
    kind = next((CONTAINER_PREFABS[c] for c in ch if c in CONTAINER_PREFABS), None)
    if not kind or not it.get('item_name') or it.get('name', '').startswith('coupon'):
        continue
    nm = it.get('name', '')
    if kind == 'Container':
        kind = ('Autograph Capsule' if 'signature_pack' in nm else 'Sticker Capsule' if 'sticker' in nm
                else 'Patch Pack' if 'patch' in nm else 'Agent Dossier' if 'dossier' in nm
                else 'Graffiti Box' if 'spray' in nm else 'Pin Capsule' if 'pins' in nm else 'Container')
    if 'musickit' in it.get('name', '') or 'music' in (it.get('item_name') or '').lower():
        kind = 'Music Kit Box'
    if 'keychain' in it.get('name', '') or 'charm' in (it.get('item_name') or '').lower():
        kind = 'Charm Capsule'
    attrs = it.get('attributes') or {}
    series = attrs.get('set supply crate series')
    series = first(series.get('value')) if isinstance(series, dict) else None
    lootname = first(rev.get(series)) if series else None
    if not lootname and it.get('loot_list_name'):
        lootname = first(it['loot_list_name'])
    contents = []
    if lootname:
        for leaf, r in walk_loot(lootname):
            contents.append(leaf)
            combo_crates[leaf].append(it['name'])
    rare = it.get('loot_list_rare_item_name')
    tagset = ((it.get('tags') or {}).get('ItemSet') or {}).get('tag_value')
    containers.append({
        'id': it['_id'], 'name': it['name'], 'title': loc(it.get('item_name'), it['name']), 'type': kind,
        'description': loc(it.get('item_description')),
        'image': image(it.get('image_inventory'), f"img/containers/{it['name']}.webp"),
        'collection': tagset, 'contents': contents, 'rare_special': loc(first(rare)) if rare else None,
        'first_sale_date': it.get('first_sale_date'),
        'key': (it.get('tool') or {}).get('restriction'),
    })

# ---------- paint kits / skins ----------
pk_by_name = {p['name']: (pid, p) for pid, p in g['paint_kits'].items() if isinstance(p, dict) and 'name' in p}
weapon_names = sorted(weapons, key=len, reverse=True)
combos = set()
for k in combo_rarity:
    m = LEAF.match(k)
    if m and m.group(2) in weapons:
        combos.add((m.group(2), m.group(1)))
for sid, s in collections.items():
    for k in s['items']:
        m = LEAF.match(k)
        if m and m.group(2) in weapons:
            combos.add((m.group(2), m.group(1)))
gen = {}
for f in FILES:
    if f.startswith('panorama/images/econ/default_generated/') and f.endswith('_png.vtex_c'):
        stem = f.rsplit('/', 1)[1][:-len('_png.vtex_c')]
        for wear in ('_light', '_medium', '_heavy'):
            if stem.endswith(wear):
                base = stem[:-len(wear)]
                for w in weapon_names:
                    if base.startswith(w + '_') and base[len(w) + 1:] in pk_by_name:
                        combos.add((w, base[len(w) + 1:]))
                        gen.setdefault((w, base[len(w) + 1:]), {})[wear[1:]] = f
                        break
                break

PHASES = {'phase1': 'Phase 1', 'phase2': 'Phase 2', 'phase3': 'Phase 3', 'phase4': 'Phase 4', 'ruby': 'Ruby',
          'sapphire': 'Sapphire', 'blackpearl': 'Black Pearl', 'emerald': 'Emerald'}
WEARS = [('Factory New', 0, .07), ('Minimal Wear', .07, .15), ('Field-Tested', .15, .38), ('Well-Worn', .38, .45), ('Battle-Scarred', .45, 1)]
pkr = g['paint_kits_rarity']
skins = []
for w, pkn in sorted(combos):
    pid, pk = pk_by_name[pkn]
    wpn = weapons[w]
    key = f'[{pkn}]{w}'
    rk = combo_rarity.get(key)
    if wpn['type'] in ('Knife', 'Gloves'):
        rk = 'ancient'
    if not rk:
        rk = first(pkr.get(pkn)) or 'common'
    imgs = gen.get((w, pkn), {})
    out_img = None
    for wear in ('light', 'medium', 'heavy'):
        if wear in imgs:
            out_img = f'img/skins/{w}/{pkn}.webp'
            images[out_img] = imgs[wear]
            break
    wmin, wmax = float(pk.get('wear_remap_min', 0)), float(pk.get('wear_remap_max', 1))
    phase = next((v for k2, v in PHASES.items() if k2 in pkn and ('doppler' in pkn or 'marbleized' in pkn or 'gamma' in pkn or k2 in ('ruby', 'sapphire', 'blackpearl', 'emerald'))), None)
    name = loc(pk.get('description_tag'), pkn)
    crates = sorted(set(combo_crates.get(key, [])))
    sets = combo_sets.get(key, [])
    star = wpn['type'] in ('Knife', 'Gloves')
    skins.append({
        'id': f'{w}-{pkn}', 'title': f"{'★ ' if star else ''}{wpn['title']} | {name}", 'weapon': w, 'weapon_title': wpn['title'],
        'weapon_type': wpn['type'], 'paint': name, 'paint_index': int(pid), 'paint_name': pkn,
        'description': loc(pk.get('description_string')) if pk.get('description_string', '').lower() != pk.get('description_tag', '').lower() else None,
        'rarity': rarity(rk, 'weapon'), 'wear_min': wmin, 'wear_max': wmax,
        'wears': [n for n, a, b in WEARS if a < wmax and b > wmin],
        'phase': phase, 'collections': sets, 'crates': crates,
        'stattrak': bool(crates) or star, 'souvenir': any(c in combo_crates for c in []),
        'legacy_model': pk.get('use_legacy_model') == '1', 'seed': pk.get('seed'), 'style': pk.get('style'),
        'image': out_img,
    })
# souvenir: skin in a collection that has a souvenir package
souv_sets = {c['collection'] for c in containers if c['type'] == 'Souvenir Package' and c['collection']}
for s in skins:
    s['souvenir'] = any(x in souv_sets for x in s['collections'])

# ---------- sticker kits ----------
teams = {k: loc(f'CSGO_TeamID_{k}', v.get('tag')) for k, v in g['pro_teams'].items()}
players = {k: v.get('name') for k, v in g['pro_players'].items()}
events = {}
for k in range(1, 80):
    n = loc(f'CSGO_Tournament_Event_Name_{k}')
    if n:
        events[str(k)] = n
FINISH = [('lenticular', 'Lenticular'), ('glitter', 'Glitter'), ('holo', 'Holo'), ('foil', 'Foil'), ('gold', 'Gold'),
          ('embroidered', 'Embroidered'), ('champion', 'Champion')]
tints = {k: v.get('hex_color') for k, v in g['graffiti_tints'].items()}
stickers, patches, graffiti = [], [], []
for sid, s in g['sticker_kits'].items():
    if not isinstance(s, dict) or sid == '0' or 'name' not in s:
        continue
    n = s['name']
    is_patch = 'patch_material' in s
    is_spray = n.startswith('spray_') or 'spraykit' in (s.get('item_name') or '').lower()
    mat = s.get('patch_material') if is_patch else s.get('sticker_material')
    if not mat:
        continue
    cat = 'patches' if is_patch else 'graffiti' if is_spray else 'stickers'
    src = f"econ/{'patches' if is_patch else 'stickers'}/{mat}"
    key = f"[{n}]{'patch' if is_patch else 'spray' if is_spray else 'sticker'}"
    lower = n.lower()
    finish = next((v for k2, v in FINISH if k2 in lower.split('_') or lower.endswith(k2)), 'Paper' if not is_spray else None)
    item = {
        'id': sid, 'name': n, 'title': loc(s.get('item_name'), n), 'description': loc(s.get('description_string')) or None,
        'rarity': rarity(first(s.get('item_rarity')) or ('common' if is_spray else 'rare')),
        'finish': finish if not is_patch else None,
        'event': events.get(s.get('tournament_event_id')), 'event_id': s.get('tournament_event_id'),
        'team': teams.get(s.get('tournament_team_id')), 'player': players.get(s.get('tournament_player_id')),
        'containers': sorted(set(combo_crates.get(key, []) + combo_crates.get(f'[{n}]sticker', []))),
        'image': image(src, f'img/{cat}/{slug(mat)}.webp'),
    }
    if item['image'] is None:
        continue
    {'stickers': stickers, 'patches': patches, 'graffiti': graffiti}[cat].append(item)
for gr in graffiti:
    gr['tints'] = tints if gr['rarity']['key'] == 'common' and not gr['event'] else None

# ---------- charms ----------
charms = []
for cid, c in g['keychain_definitions'].items():
    if not isinstance(c, dict) or 'name' not in c:
        continue
    n = c['name']
    base_kc = next((b for b in g['keychain_definitions'].values() if isinstance(b, dict) and b.get('name') == c.get('base')), None)
    if base_kc:
        c = {**base_kc, **c}
    charms.append({'id': cid, 'name': n, 'title': loc(c.get('loc_name'), n), 'description': loc(c.get('loc_description')),
                   'rarity': rarity(first(c.get('item_rarity'))), 'highlight': bool(c.get('highlight_reel')),
                   'containers': sorted(set(combo_crates.get(f'[{n}]keychain', []))),
                   'image': image(c.get('image_inventory'), f'img/charms/{n}.webp')})

# ---------- music kits ----------
SOUND_ORDER = ['mainmenu', 'chooseteam', 'startofmatch', 'startround', 'startaction', 'roundtenseccount', 'bombplanted',
               'bombtenseccount', 'wonround', 'lostround', 'roundmvpanthem', 'deathcam', 'endofmatch', 'loading']
music = []
sound_files = defaultdict(list)
for f in FILES:
    if f.startswith('sounds/music/') and f.endswith('.vsnd_c') and f.count('/') == 3:
        _, _, kit, fn = f.split('/')
        if SAFE_OUT.match(f"audio/{kit}/{fn[:-len('.vsnd_c')]}.mp3"):
            sound_files[kit].append(fn[:-len('.vsnd_c')])


def sound_key(fn):
    base = re.sub(r'_\d+$', '', fn)
    return (SOUND_ORDER.index(base) if base in SOUND_ORDER else 99, fn)


for mid, m in g['music_definitions'].items():
    if not isinstance(m, dict) or 'name' not in m:
        continue
    n = m['name']
    full = loc(m.get('loc_name'), n)
    artist, _, song = full.partition(', ')
    music.append({'id': mid, 'name': n, 'title': full, 'artist': artist, 'song': song or full,
                  'description': loc(m.get('loc_description')),
                  'containers': sorted(set(combo_crates.get(f'[{n}]musickit', []))),
                  'sounds': sorted(sound_files.get(n, []), key=sound_key),
                  'image': image(m.get('image_inventory'), f'img/music/{n}.webp')})

# ---------- agents, collectibles, tools, keys ----------
agents, collectibles, tools, keys = [], [], [], []
COLLECT = ('collectible', 'attendance_pin', 'commodity_pin', 'majors_trophy', 'pickem_trophy', 'operation_coin',
           'prestige_coin', 'premier_season_coin', 'map_token', 'steam_badge', 'flair_pin', 'season')
for it in items.values():
    ch = it['_chain']
    n = it.get('name', '')
    if not it.get('item_name'):
        continue
    base = {'id': it['_id'], 'name': n, 'title': re.sub(r'\s+', ' ', loc(it.get('item_name'), n)), 'description': loc(it.get('item_description')),
            'rarity': rarity(first(it.get('item_rarity'))), 'first_sale_date': it.get('first_sale_date')}
    is_coin = 'coin' in n.lower() or (base['title'] or '').endswith('Coin')
    if 'customplayertradable' in ch:
        teams_ = sorted(k for k in (it.get('used_by_classes') or {}))
        base['rarity'] = rarity(first(it.get('item_rarity')), 'character')
        base['team'] = 'T' if 'terrorists' in teams_ else 'CT'
        base['image'] = image(it.get('image_inventory'), f'img/agents/{n}.webp')
        agents.append(base)
    elif is_coin or any(c.startswith(COLLECT) or c.endswith('_coin') for c in ch):
        pf = next((c for c in ch if c.startswith(COLLECT) or c.endswith('_coin')), '')
        base['type'] = ('Tournament Coin' if is_coin and not pf.endswith('coin') else
                        'Operation Coin' if re.match(r'season\d+_coin|operation_coin', pf) else
                        {'premier_season_coin': 'Premier Coin', 'prestige_coin': 'Service Medal', 'map_token': 'Map Token',
                         'majors_trophy': 'Major Trophy', 'pickem_trophy': "Pick'Em Trophy", 'attendance_pin': 'Pin',
                         'commodity_pin': 'Pin', 'flair_pin': 'Pin', 'season_pass': 'Operation Pass',
                         'season_tiers': 'Operation Pass', 'collectible_untradable_coin': 'Service Coin',
                         'steam_badge': 'Badge'}.get(pf, 'Collectible'))
        base['image'] = image(it.get('image_inventory'), f'img/collectibles/{slug(n)}.webp')
        collectibles.append(base)
    elif 'weapon_case_key' in ch:
        base['image'] = image(it.get('image_inventory'), f'img/keys/{slug(n)}.webp')
        keys.append(base)
    elif any(c in ('csgo_tool', 'valve csgo_tool', 'season_pass', 'fan_token', 'fan_shield', 'season_tiers', 'recipe') for c in ch) or 'tool' in it and 'type' in (it.get('tool') or {}):
        if any(c in CONTAINER_PREFABS for c in ch):
            continue
        base['type'] = ((it.get('tool') or {}).get('type') or (ch[0] if ch else 'tool')).replace('_', ' ').title()
        base['image'] = image(it.get('image_inventory'), f'img/tools/{slug(n)}.webp')
        tools.append(base)

# ---------- write ----------
for c in collections.values():
    c['count'] = len(c['items'])
os.makedirs(f'{SITE}/data', exist_ok=True)
out = {'skins': skins, 'stickers': stickers, 'patches': patches, 'graffiti': graffiti, 'charms': charms, 'music': music,
       'agents': agents, 'containers': containers, 'collectibles': collectibles, 'tools': tools, 'keys': keys,
       'weapons': list(weapons.values()), 'collections': list(collections.values())}
for k, v in out.items():
    json.dump(v, open(f'{SITE}/data/{k}.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print(f'{k:12} {len(v):6}  with image: {sum(1 for x in v if x.get("image"))}')
STEAM_INF = os.environ.get('STEAM_INF', os.path.join(CS2_DIR, 'steam.inf'))
meta = {'events': events, 'rarities': RAR, 'counts': {k: len(v) for k, v in out.items()},
        'game_build': open(STEAM_INF).read() if os.path.exists(STEAM_INF) else None}
json.dump(meta, open(f'{SITE}/data/meta.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
json.dump(images, open(os.path.join(WORK, 'images.json'), 'w'), indent=0)
json.dump({k: v for k, v in sound_files.items()}, open(os.path.join(WORK, 'sounds.json'), 'w'), indent=0)
print('images', len(images))
