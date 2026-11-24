# CS2 Asset Archive

Every item in Counter-Strike 2, extracted straight from the game files and put on one browsable site.

**Site:** https://surajbhari.com/cs2-asset-archive/

| Category | Count | What you get |
| --- | ---: | --- |
| Music kits | 110 | All 1,697 sounds (main menu, round start, bomb planted, MVP anthems, match end…), 14.9 hours of audio, playable and downloadable as MP3 |
| Skins | 2,248 | Every weapon, knife and glove finish with rarity, float range, exteriors, StatTrak/Souvenir availability, Doppler phase, collection and cases |
| Stickers | 12,335 | Every sticker including all tournament team and autograph stickers, with event, team, player, finish and the capsules they drop from |
| Cases & capsules | 847 | Weapon cases, sticker/autograph capsules, souvenir packages, patch packs, graffiti boxes, music kit boxes, with full contents |
| Collectibles | 650 | Pins, tournament coins, Premier and service medals, Major and Pick'Em trophies, operation coins |
| Graffiti | 147 | Every spray, with a preview of all 19 tint colours |
| Charms | 143 | Every charm, including souvenir highlight charms |
| Patches | 112 | Every agent patch |
| Collections | 97 | Every collection and the items in it |
| Tools & keys | 96 | Case keys, name tags, storage units, viewer passes and the rest |
| Weapons | 76 | Base weapons with price, damage, armor penetration, magazine, fire rate and their skins |
| Agents | 63 | Every agent with side and rarity |

Every item has its own link (for example `#skins/weapon_ak47-cu_ak47_cobra`), a detail view and a download button for its image.

## Data

All of it is plain JSON in [`data/`](data/), one file per category, so you can use it without the site:

```
data/skins.json        data/stickers.json     data/music.json
data/containers.json   data/collections.json  data/charms.json
data/agents.json       data/patches.json      data/graffiti.json
data/collectibles.json data/tools.json        data/keys.json
data/weapons.json      data/meta.json
```

Images are WebP under `img/<category>/`, audio is MP3 (72 kbps) under `audio/<music_kit>/<sound>.mp3`.

## How it was extracted

Source: CS2 build 2000948 (patch 1.42.0.0, 19 Nov 2026). The scripts are in [`tools/`](tools/), pure Python, no Valve tools needed:

1. `vpk.py` reads the `pak01_dir.vpk` index (145k files) and pulls files out of the archive chunks.
2. `kv.py` parses KeyValues text. `build_data.py` reads `scripts/items/items_game.txt` and `resource/csgo_english.txt`, resolves prefabs, loot lists, revolving case series and item sets, and writes the JSON.
3. `extract_images.py` decodes Source 2 `.vtex_c` textures (embedded PNG, LZ4-compressed BGRA mips, DXT/BC formats) and writes WebP.
4. `extract_audio.py` unpacks `.vsnd_c` sounds (MP3 streams and raw PCM16, both the old binary header and the newer KV3 one) and re-encodes them with ffmpeg.
5. `durations.py` adds track lengths to `music.json`.

To run them yourself, point `CS2_DIR` at your `game/csgo` folder (defaults are in `common.py`). Needs Python 3, Pillow, `lz4` and ffmpeg.

## Staying up to date

[`.github/workflows/update.yml`](.github/workflows/update.yml) checks [SteamTracking/GameTracking-CS2](https://github.com/SteamTracking/GameTracking-CS2) every 30 minutes. When its head commit changes (that repo commits on every CS2 update), the workflow:

1. rebuilds `data/` from the new `items_game.txt` and `csgo_english.txt`,
2. downloads `pak01_dir.vpk` from Steam with [DepotDownloader](https://github.com/SteamRE/DepotDownloader) (anonymous login),
3. works out which `pak01_NNN.vpk` chunks hold images or sounds that aren't on the site yet (`tools/plan_downloads.py`) and downloads only those,
4. extracts them and commits.

The last tracker commit it built from is in `.tracking-sha`. You can also run it by hand from the Actions tab. Assets that already exist are not re-extracted, so if Valve redraws an existing image, delete it and run the workflow.

## Legal

All art, audio, item names and descriptions belong to Valve and the respective artists, teams and players. This is an unofficial fan archive and is not affiliated with or endorsed by Valve.
