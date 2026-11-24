import json, subprocess, os
from concurrent.futures import ThreadPoolExecutor
SITE = r'C:/Users/suraj/Desktop/cs2-kits-repo'
m = json.load(open(f'{SITE}/data/music.json', encoding='utf-8'))
def dur(p):
    r = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', p], capture_output=True, text=True)
    return round(float(r.stdout.strip() or 0), 2)
with ThreadPoolExecutor(12) as ex:
    for k in m:
        paths = [f"{SITE}/audio/{k['name']}/{s}.mp3" for s in k['sounds']]
        k['durations'] = list(ex.map(dur, paths))
        k['sizes'] = [os.path.getsize(p) for p in paths]
json.dump(m, open(f'{SITE}/data/music.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print(sum(sum(k['durations']) for k in m) / 60, 'min')
