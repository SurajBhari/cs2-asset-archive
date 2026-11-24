"use strict";

const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const num = x => Number(x) || 0;
const fmtTime = s => isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}` : "–:––";
const fmtSize = b => b > 1e6 ? (b / 1e6).toFixed(1) + " MB" : Math.round(b / 1e3) + " KB";
const uniq = a => [...new Set(a.filter(Boolean))];
const byText = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true });
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

function shortEvent(e) {
  return e.replace(/^The /, "").replace(/ (CS:GO |CS2 |Counter-Strike 2 )?(Major )?Championship$/i, "");
}

/* ---------------- categories ----------------
   tile(x) -> { kicker, name, sub, rar }  (rar: colour the sub line with the rarity colour) */
const RARITY = x => x.rarity?.name;
const CATS = [
  { id: "music", label: "Music kits", files: ["music"], icon: "img/music/valve_cs2_01.webp",
    tile: x => ({ kicker: x.artist, name: x.song }), hay: x => [x.title, x.description], sorts: ["az", "newest"] },
  { id: "skins", label: "Skins", files: ["skins"], icon: "img/skins/weapon_ak47/cu_ak47_cobra.webp",
    tile: x => ({ kicker: (x.weapon_type === "Knife" || x.weapon_type === "Gloves" ? "★ " : "") + x.weapon_title, name: x.paint, sub: x.phase ? `${x.rarity.name}, ${x.phase}` : x.rarity.name, rar: 1 }),
    hay: x => [x.title, x.paint_name, x.weapon_type, x.rarity.name, x.phase],
    filters: [["weapon_type", "All types"], ["weapon_title", "All weapons"], [RARITY, "All rarities", "rarity"]],
    sorts: ["newest", "rarity", "az"] },
  { id: "stickers", label: "Stickers", files: ["stickers"], icon: "img/stickers/antwerp2022-astr-glitter.webp",
    tile: x => ({ name: x.title.replace(/ \| [^|]+$/, ""), sub: x.event ? shortEvent(x.event) : x.rarity.name, rar: !x.event }),
    hay: x => [x.title, x.event, x.team, x.player, x.finish, x.name],
    filters: [[x => x.event || "No event", "All events", "event"], ["finish", "All finishes"], [x => x.player ? "Player autograph" : x.team ? "Team" : "Other", "All kinds"], [RARITY, "All rarities", "rarity"]],
    sorts: ["newest", "rarity", "az"] },
  { id: "charms", label: "Charms", files: ["charms"], icon: "img/charms/kc_missinglink_ava.webp",
    tile: x => ({ name: x.title, sub: x.highlight ? "Souvenir highlight" : x.rarity.name, rar: !x.highlight }),
    hay: x => [x.title, x.name], filters: [[RARITY, "All rarities", "rarity"]], sorts: ["newest", "rarity", "az"] },
  { id: "agents", label: "Agents", files: ["agents"], icon: "img/agents/customplayer_tm_leet_variantg.webp",
    tile: x => { const [n, f] = x.title.split(" | "); return { kicker: f, name: n, sub: x.rarity.name, rar: 1 }; },
    hay: x => [x.title, x.team === "T" ? "terrorist" : "counter-terrorist"], filters: [[x => x.team === "T" ? "Terrorists" : "Counter-Terrorists", "Both sides"], [RARITY, "All rarities", "rarity"]], sorts: ["rarity", "az", "newest"] },
  { id: "patches", label: "Patches", files: ["patches"], icon: "img/patches/case-op11-patch-op11-anchor.webp",
    tile: x => ({ name: x.title, sub: x.rarity.name, rar: 1 }),
    hay: x => [x.title, x.name], filters: [[RARITY, "All rarities", "rarity"]], sorts: ["newest", "rarity", "az"] },
  { id: "graffiti", label: "Graffiti", files: ["graffiti"], icon: "img/graffiti/default-axes-crossed.webp",
    tile: x => ({ name: x.title.replace(/ \| [^|]+$/, ""), sub: x.event ? shortEvent(x.event) : x.rarity.name, rar: !x.event }),
    hay: x => [x.title, x.event, x.team, x.name], filters: [[RARITY, "All rarities", "rarity"]], sorts: ["newest", "rarity", "az"] },
  { id: "containers", label: "Cases", files: ["containers"], icon: "img/containers/crate_community_33.webp",
    tile: x => ({ name: x.title, sub: x.type }),
    hay: x => [x.title, x.type, x.name], filters: [["type", "All containers"]], sorts: ["newest", "az"] },
  { id: "collections", label: "Collections", files: ["collections"], icon: "img/collections/set_community_33.webp",
    tile: x => ({ name: x.title, sub: `${x.count} items` }),
    hay: x => [x.title, x.description, x.id], sorts: ["newest", "az"] },
  { id: "weapons", label: "Weapons", files: ["weapons"], icon: "img/weapons/weapon_awp.webp",
    tile: x => ({ name: x.title, sub: x.type }),
    hay: x => [x.title, x.type, x.name], filters: [["type", "All types"]], sorts: ["default", "az"] },
  { id: "collectibles", label: "Collectibles", files: ["collectibles"], icon: "img/collectibles/collectible-pin-aces-high.webp",
    tile: x => ({ name: x.title, sub: x.type }),
    hay: x => [x.title, x.type, x.name], filters: [["type", "All types"]], sorts: ["newest", "az"] },
  { id: "tools", label: "Tools and keys", files: ["tools", "keys"], icon: "img/tools/name-tag.webp",
    tile: x => ({ name: x.title, sub: x.type || "Key" }),
    hay: x => [x.title, x.type, x.name], sorts: ["newest", "az"] },
];
const CAT = Object.fromEntries(CATS.map(c => [c.id, c]));
const SORT_LABEL = { newest: "Newest first", rarity: "Rarest first", az: "Name, A to Z", default: "Game order" };

/* ---------------- data ---------------- */
const cache = {};
const loadFile = f => cache[f] ??= fetch(`data/${f}.json`).then(r => r.json());
async function loadCat(id) {
  const c = CAT[id];
  if (c.items) return c.items;
  c.items ??= null;
  const parts = await Promise.all(c.files.map(loadFile));
  if (c.items) return c.items;
  const items = parts.flat();
  items.forEach((x, i) => {
    x._cat = id;
    x._order = i;
    x._hay = c.hay(x).filter(Boolean).join(" ").toLowerCase();
  });
  c.byId = new Map(items.map(x => [String(x.id), x]));
  return (c.items = items);
}

let leafIndex = null;
async function getLeafIndex() {
  if (leafIndex) return leafIndex;
  await Promise.all(["skins", "stickers", "patches", "graffiti", "music", "charms", "containers"].map(loadCat));
  const m = new Map();
  CAT.skins.items.forEach(x => m.set(`[${x.paint_name}]${x.weapon}`, x));
  CAT.stickers.items.forEach(x => m.set(`[${x.name}]sticker`, x));
  CAT.patches.items.forEach(x => m.set(`[${x.name}]patch`, x));
  CAT.graffiti.items.forEach(x => { m.set(`[${x.name}]spray`, x); if (!m.has(`[${x.name}]sticker`)) m.set(`[${x.name}]sticker`, x); });
  CAT.music.items.forEach(x => m.set(`[${x.name}]musickit`, x));
  CAT.charms.items.forEach(x => m.set(`[${x.name}]keychain`, x));
  return (leafIndex = { leaf: m, container: new Map(CAT.containers.items.map(x => [x.name, x])) });
}

/* ---------------- tiles ---------------- */
const itemHref = x => `#${x._cat}/${encodeURIComponent(x.id)}`;
function tileHTML(x, { link = true } = {}) {
  const t = CAT[x._cat].tile(x);
  const img = x.image || collectionFallback(x);
  const tag = link ? "a" : "div";
  const kicker = t.kicker ? `<span class="tile-kicker">${t.kicker.startsWith("★") ? `<span class="star">★</span>${esc(t.kicker.slice(1))}` : esc(t.kicker)}</span>` : "";
  return `<${tag} class="tile"${link ? ` href="${itemHref(x)}"` : ""} style="--r:${x.rarity?.color || "#4a5466"}">
    <div class="tile-art">${img ? `<img src="${img}" alt="" loading="lazy" decoding="async">` : ""}</div>
    <div class="tile-text">${kicker}<span class="tile-name">${esc(t.name)}</span>${t.sub ? `<span class="tile-sub${t.rar && x.rarity ? "" : " plain"}">${esc(t.sub)}</span>` : ""}</div></${tag}>`;
}
function collectionFallback(x) {
  if (x._cat !== "collections" || !leafIndex) return null;
  for (const k of x.items) { const it = leafIndex.leaf.get(k); if (it?.image) return it.image; }
  return null;
}

/* ---------------- case reel ---------------- */
const ODDS = [["rare", .7992], ["mythical", .1598], ["legendary", .032], ["ancient", .0064], ["gold", .0026]];
let reelCases = null, spinning = false;
async function spin() {
  if (spinning) return;
  spinning = true;
  $("#spin").disabled = true;
  const [containers, skins] = await Promise.all([loadCat("containers"), loadCat("skins")]);
  if (!reelCases) {
    const skinByKey = new Map(skins.map(s => [`[${s.paint_name}]${s.weapon}`, s]));
    reelCases = containers.filter(c => c.type === "Weapon Case").map(c => {
      const pool = {};
      c.contents.map(k => skinByKey.get(k)).filter(Boolean).forEach(s => (pool[s.rarity.key] ??= []).push(s));
      return { c, pool };
    }).filter(r => Object.keys(r.pool).length >= 3);
  }
  const { c, pool } = reelCases[Math.floor(Math.random() * reelCases.length)];
  const pick = () => {
    let r = Math.random(), key = "rare";
    for (const [k, p] of ODDS) { if (r < p) { key = k; break; } r -= p; }
    if (key === "gold") return { gold: true };
    const order = ["rare", "mythical", "legendary", "ancient"];
    for (let i = order.indexOf(key); i >= 0; i--) if (pool[order[i]]) return pool[order[i]][Math.floor(Math.random() * pool[order[i]].length)];
    const any = Object.values(pool).flat();
    return any[Math.floor(Math.random() * any.length)];
  };
  const N = 60, WIN = 52;
  const strip = Array.from({ length: N }, pick);
  const won = strip[WIN];
  const goldTile = `<div class="tile" style="--r:#e0aa3e"><div class="tile-art" style="font:800 72px/1 var(--font);color:var(--gold)">★</div><div class="tile-text"><span class="tile-name">Rare special item</span><span class="tile-sub">${esc(c.rare_special || "Exceedingly rare")}</span></div></div>`;
  const track = $("#reel-track");
  track.classList.remove("spinning");
  track.style.transform = "translateX(0)";
  track.innerHTML = strip.map(x => x.gold ? goldTile : tileHTML(x, { link: false })).join("");
  reelStop = { index: WIN, jitter: (Math.random() - .5) * .7 };
  $("#won").innerHTML = `<small>Opening the ${esc(c.title)}…</small>`;
  track.getBoundingClientRect();
  requestAnimationFrame(() => {
    if (!reduceMotion) track.classList.add("spinning");
    placeReel();
    setTimeout(() => {
      const caseLink = `<a href="#containers/${encodeURIComponent(c.id)}">${esc(c.title)}</a>`;
      $("#won").innerHTML = won.gold
        ? `<small>From the ${caseLink}</small><span class="rar" style="color:var(--gold)">★ Rare special item</span>, ${esc(c.rare_special || "a knife or gloves")}`
        : `<small>From the ${caseLink}</small><a href="${itemHref(won)}">${esc(won.title)}</a> <span class="rar" style="color:${won.rarity.color}">${esc(won.rarity.name)}</span>`;
      $("#won").classList.remove("reveal");
      void $("#won").offsetWidth;
      $("#won").classList.add("reveal");
      spinning = false;
      $("#spin").disabled = false;
    }, reduceMotion ? 50 : 6300);
  });
}
let reelStop = null;
// Centre the winning tile under the marker for the current tile width (also re-run on resize).
function placeReel() {
  const track = $("#reel-track");
  if (!reelStop || !track.children.length) return;
  const tileW = track.children[0].getBoundingClientRect().width + 6;
  const x = reelStop.index * tileW + tileW / 2 + reelStop.jitter * tileW - track.parentElement.clientWidth / 2;
  track.style.transform = `translateX(${-x}px)`;
}
addEventListener("resize", () => {
  if (spinning) return;
  $("#reel-track").classList.remove("spinning");
  placeReel();
});
$("#spin").onclick = spin;

/* ---------------- state + routing ---------------- */
const state = { cat: null, q: "", filters: {}, sort: null, list: [], shown: 0 };
const PAGE = 120;

function parseHash() {
  const [cat, ...rest] = location.hash.slice(1).split("/");
  return { cat: CAT[cat] ? cat : "music", item: rest.length ? decodeURIComponent(rest.join("/")) : null };
}
async function route() {
  const { cat, item } = parseHash();
  if (cat !== state.cat) await openCat(cat);
  if (item) {
    await loadCat(cat);
    const x = CAT[cat].byId.get(item);
    if (x) showDetail(x);
  } else if ($("#detail").open) {
    $("#detail").close();
  }
}

function renderTabs(counts) {
  $("#tabs").innerHTML = CATS.map(c => `<a href="#${c.id}" data-cat="${c.id}"><img src="${c.icon}" alt="" loading="lazy"><span>${c.label}</span><small>${counts ? (counts[c.id] ?? 0).toLocaleString() : "&nbsp;"}</small></a>`).join("");
  markTab();
}
function markTab() {
  document.querySelectorAll("#tabs a").forEach(a => {
    if (a.dataset.cat === state.cat) {
      a.setAttribute("aria-current", "page");
      const rail = $("#tabs");
      if (a.offsetLeft + a.offsetWidth > rail.scrollLeft + rail.clientWidth || a.offsetLeft < rail.scrollLeft) rail.scrollLeft = a.offsetLeft - 16;
    }
    else a.removeAttribute("aria-current");
  });
}

async function openCat(id) {
  const fromTab = state.cat !== null;
  state.cat = id;
  state.q = "";
  state.filters = {};
  const c = CAT[id];
  state.sort = c.sorts[0];
  $("#q").value = "";
  $("#q").placeholder = `Search ${c.label.toLowerCase()}`;
  markTab();
  $("#results").innerHTML = `<p class="empty">Loading ${esc(c.label.toLowerCase())}…</p>`;
  $("#filters").innerHTML = "";
  if (fromTab) {
    const top = $("#browse").getBoundingClientRect().top + scrollY;
    if (scrollY > top) scrollTo({ top, behavior: "instant" });
  }
  await loadCat(id);
  buildFilters();
  apply();
}

const filterValue = (f, x) => typeof f[0] === "function" ? f[0](x) : x[f[0]];
function buildFilters() {
  const c = CAT[state.cat];
  const sel = (c.filters || []).map((f, i) => {
    const vals = uniq(c.items.map(x => filterValue(f, x)));
    if (f[2] === "rarity") {
      const rank = new Map(c.items.map(x => [x.rarity.name, x.rarity.value]));
      vals.sort((a, b) => rank.get(a) - rank.get(b));
    } else if (f[2] === "event") {
      const yr = v => +(v.match(/\b(19|20)\d\d\b/)?.[0] || 0);
      vals.sort((a, b) => yr(b) - yr(a) || byText(a, b));
    } else vals.sort(byText);
    if (vals.length < 2) return "";
    return `<select data-f="${i}" aria-label="${esc(f[1])}"><option value="">${esc(f[1])}</option>${vals.map(v => `<option>${esc(v)}</option>`).join("")}</select>`;
  }).join("");
  const sorts = c.sorts.length > 1 ? `<select data-sort aria-label="Sort">${c.sorts.map(s => `<option value="${s}">${SORT_LABEL[s]}</option>`).join("")}</select>` : "";
  $("#filters").innerHTML = sel + sorts;
}

function apply() {
  const c = CAT[state.cat];
  const terms = state.q.toLowerCase().split(/\s+/).filter(Boolean);
  let list = c.items.filter(x => terms.every(t => x._hay.includes(t)) &&
    Object.entries(state.filters).every(([i, v]) => !v || filterValue(c.filters[i], x) === v));
  const s = state.sort;
  if (s === "az") list = [...list].sort((a, b) => byText(a.title, b.title));
  else if (s === "rarity") list = [...list].sort((a, b) => b.rarity.value - a.rarity.value || byText(a.title, b.title));
  else if (s === "newest") {
    // Glove finishes are numbered from 10000; rank them inside their own series so they don't swamp the top.
    const key = x => x.paint_index != null ? x.paint_index % 10000 : num(x.id);
    list = [...list].sort((a, b) => (key(b) - key(a)) || b._order - a._order);
  }
  state.list = list;
  state.shown = 0;
  $("#count").textContent = list.length === c.items.length ? `${list.length.toLocaleString()} items` : `${list.length.toLocaleString()} of ${c.items.length.toLocaleString()}`;
  $("#results").innerHTML = list.length
    ? `<div class="${state.cat === "music" ? "kits" : "grid"}" id="out"></div>`
    : `<p class="empty">No ${esc(c.label.toLowerCase())} match “${esc(state.q)}”. Try a shorter search or clear the filters.</p>`;
  more();
}
function more() {
  const out = $("#out");
  if (!out || state.shown >= state.list.length) return;
  const chunk = state.list.slice(state.shown, state.shown + PAGE);
  state.shown += chunk.length;
  out.insertAdjacentHTML("beforeend", chunk.map(x => state.cat === "music" ? kitHTML(x) : tileHTML(x)).join(""));
  if (state.cat === "music") markPlaying();
}
new IntersectionObserver(es => es[0].isIntersecting && more(), { rootMargin: "1200px" }).observe($("#more"));

/* ---------------- music ---------------- */
const SOUND_LABEL = {
  mainmenu: "Main menu", chooseteam: "Choose team", startofmatch: "Match start", startround: "Round start",
  startaction: "Action", roundtenseccount: "Round, 10 seconds left", bombplanted: "Bomb planted", bombtenseccount: "Bomb, 10 seconds left",
  wonround: "Round won", lostround: "Round lost", roundmvpanthem: "MVP anthem", deathcam: "Death cam",
  endofmatch: "Match end", loading: "Loading screen",
};
const PLAY = '<svg viewBox="0 0 10 10"><path d="M2.5 1l6.5 4-6.5 4z"/></svg>';
const PAUSE = '<svg viewBox="0 0 10 10"><path d="M2 1h2v8H2zM6 1h2v8H6z"/></svg>';
const DL = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v8M4.5 6.5 8 10l3.5-3.5M3 13h10"/></svg>';
function soundLabel(file, files) {
  const m = file.match(/^(.*?)_(\d+)$/);
  const base = m ? m[1] : file;
  const n = m && files.some(f => f !== file && f.startsWith(base + "_")) ? ` ${+m[2]}` : "";
  return (SOUND_LABEL[base] || base) + n;
}
function tracksHTML(k) {
  return `<ul class="tracks">${k.sounds.map((f, i) => {
    const src = `audio/${k.name}/${f}.mp3`;
    const lab = soundLabel(f, k.sounds);
    return `<li class="${f.startsWith("roundmvpanthem") ? "mvp" : ""}" data-src="${src}" data-title="${esc(lab)}" data-sub="${esc(k.title)}" data-cover="${k.image}">
      <button class="play" aria-label="Play ${esc(lab)}">${PLAY}</button>
      <div class="label"><b>${esc(lab)}</b><small>${fmtTime(k.durations?.[i])}</small></div>
      <a class="dl" href="${src}" download="${k.name}_${f}.mp3" aria-label="Download ${esc(lab)} (${k.sizes ? fmtSize(k.sizes[i]) : "mp3"})" title="Download mp3${k.sizes ? `, ${fmtSize(k.sizes[i])}` : ""}">${DL}</a></li>`;
  }).join("")}</ul>`;
}
function kitHTML(k) {
  const total = (k.durations || []).reduce((a, b) => a + b, 0);
  return `<section class="kit" id="kit-${k.name}">
    <a class="kit-cover" href="${itemHref(k)}" aria-label="${esc(k.title)} details"><img src="${k.image}" alt="" loading="lazy" width="200" height="200"></a>
    <div>
      <h2 class="display">${esc(k.artist)}</h2>
      <div class="song">${esc(k.song)}</div>
      ${k.description ? `<p class="desc">${esc(k.description)}</p>` : ""}
      <div class="facts-inline"><span><b>${k.sounds.length}</b> sounds</span><span><b>${fmtTime(total)}</b> of music</span>${k.containers.length ? `<span>In <b>${k.containers.length}</b> music kit box${k.containers.length > 1 ? "es" : ""}</span>` : ""}</div>
      ${tracksHTML(k)}
    </div></section>`;
}

/* ---------------- player ---------------- */
const audio = new Audio();
audio.preload = "none";
let nowSrc = null;
function markPlaying() {
  document.querySelectorAll(".tracks li").forEach(li => {
    const on = li.dataset.src === nowSrc && !audio.paused;
    li.classList.toggle("playing", on);
    const b = li.querySelector(".play");
    b.innerHTML = on ? PAUSE : PLAY;
    b.setAttribute("aria-label", `${on ? "Pause" : "Play"} ${li.dataset.title}`);
  });
  $("#p-toggle").innerHTML = audio.paused ? PLAY : PAUSE;
  $("#p-toggle").setAttribute("aria-label", audio.paused ? "Play" : "Pause");
}
function playTrack(li) {
  if (nowSrc === li.dataset.src) { audio.paused ? audio.play() : audio.pause(); return; }
  nowSrc = li.dataset.src;
  audio.src = nowSrc;
  audio.play();
  $("#player").hidden = false;
  $("#p-title").textContent = li.dataset.title;
  $("#p-sub").textContent = li.dataset.sub;
  $("#p-cover").src = li.dataset.cover;
}
["play", "pause", "ended"].forEach(e => audio.addEventListener(e, markPlaying));
audio.addEventListener("timeupdate", () => {
  $("#p-bar i").style.width = (audio.currentTime / audio.duration * 100 || 0) + "%";
  $("#p-time").textContent = `${fmtTime(audio.currentTime)} / ${fmtTime(audio.duration)}`;
});
$("#p-toggle").onclick = () => audio.paused ? audio.play() : audio.pause();
$("#p-close").onclick = () => { audio.pause(); nowSrc = null; $("#player").hidden = true; markPlaying(); };
$("#p-bar").onclick = e => {
  const r = e.currentTarget.getBoundingClientRect();
  if (audio.duration) audio.currentTime = (e.clientX - r.left) / r.width * audio.duration;
};

/* ---------------- inspect dialog ---------------- */
const fact = (label, value) => value || value === 0 ? `<dt>${label}</dt><dd>${value}</dd>` : "";
const catLink = (cat, id, label) => `<a href="#${cat}/${encodeURIComponent(id)}">${esc(label)}</a>`;
const WEARS = [["Factory New", 0, .07, "#5fb760"], ["Minimal Wear", .07, .15, "#9cc24f"], ["Field-Tested", .15, .38, "#d8c447"], ["Well-Worn", .38, .45, "#e0913f"], ["Battle-Scarred", .45, 1, "#d9534f"]];
function floatHTML(x) {
  // Each exterior band splits into: below the skin's min float, inside its range, above its max float.
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const segs = WEARS.map(([n, a, b, col]) => {
    const lo = clamp(x.wear_min, a, b), hi = clamp(x.wear_max, a, b);
    return [[a, lo, ""], [lo, hi, "in"], [hi, b, ""]].filter(([s, e]) => e > s)
      .map(([s, e, cls]) => `<span class="${cls}" style="width:${(e - s) * 100}%;background:${col}" title="${n}"></span>`).join("");
  }).join("");
  return `${x.wear_min.toFixed(2)} to ${x.wear_max.toFixed(2)}<div class="float"><div class="float-bar">${segs}</div><div class="float-scale"><span>0.00</span><span>1.00</span></div></div>`;
}
const grid = (title, items, count = true) => items.length ? `<h3 class="sub">${title}${count ? `<small>${items.length}</small>` : ""}</h3><div class="mini">${items.map(y => tileHTML(y)).join("")}</div>` : "";

async function showDetail(x) {
  const dlg = $("#detail");
  const idx = await getLeafIndex();
  await Promise.all(["collections", "weapons"].map(loadCat));
  let facts = "", extra = "", kicker = "";
  const containersOf = list => grid("Found in", (list || []).map(n => idx.container.get(n)).filter(Boolean));

  switch (x._cat) {
    case "skins": {
      const wpn = CAT.weapons.items.find(w => w.name === x.weapon);
      kicker = x.weapon_type;
      facts = fact("Weapon", wpn ? catLink("weapons", wpn.id, x.weapon_title) : esc(x.weapon_title)) +
        fact("Finish", `${esc(x.paint)} <code>#${x.paint_index}, ${esc(x.paint_name)}</code>`) +
        fact("Float range", floatHTML(x)) +
        fact("Exteriors", esc(x.wears.join(", "))) +
        fact("StatTrak™", x.stattrak ? "Available" : "Not available") +
        fact("Souvenir", x.souvenir ? "Available" : "Not available");
      const cols = x.collections.map(id => CAT.collections.byId.get(id)).filter(Boolean);
      if (cols.length) extra += `<h3 class="sub">Collection</h3><div class="chips">${cols.map(s => catLink("collections", s.id, s.title)).join("")}</div>`;
      extra += containersOf(x.crates);
      break;
    }
    case "stickers": case "patches": case "graffiti":
      kicker = { stickers: "Sticker", patches: "Patch", graffiti: "Graffiti" }[x._cat];
      facts = fact("Finish", esc(x.finish)) + fact("Tournament", esc(x.event)) + fact("Team", esc(x.team)) + fact("Player", esc(x.player)) + fact("File name", `<code>${esc(x.name)}</code>`);
      extra = containersOf(x.containers);
      break;
    case "charms":
      kicker = x.highlight ? "Souvenir highlight charm" : "Charm";
      facts = fact("File name", `<code>${esc(x.name)}</code>`);
      extra = containersOf(x.containers);
      break;
    case "music": {
      const total = (x.durations || []).reduce((a, b) => a + b, 0);
      kicker = "Music kit";
      facts = fact("Artist", esc(x.artist)) + fact("Track", esc(x.song)) + fact("Sounds", `${x.sounds.length}, ${fmtTime(total)} in total`) + fact("File name", `<code>${esc(x.name)}</code>`);
      extra = `<h3 class="sub">Sounds</h3>${tracksHTML(x)}` + containersOf(x.containers);
      break;
    }
    case "agents":
      kicker = x.team === "T" ? "Terrorist agent" : "Counter-Terrorist agent";
      facts = fact("File name", `<code>${esc(x.name)}</code>`);
      break;
    case "containers": {
      const items = x.contents.map(k => idx.leaf.get(k)).filter(Boolean).sort((a, b) => (b.rarity?.value ?? 0) - (a.rarity?.value ?? 0));
      const col = x.collection && CAT.collections.byId.get(x.collection);
      kicker = x.type;
      facts = fact("Collection", col ? catLink("collections", col.id, col.title) : "") + fact("Released", esc(x.first_sale_date)) +
        fact("Rare special item", x.rare_special ? `<span class="star">${esc(x.rare_special)}</span>` : "") + fact("File name", `<code>${esc(x.name)}</code>`);
      extra = grid("Contents", items);
      break;
    }
    case "collections": {
      const items = x.items.map(k => idx.leaf.get(k)).filter(Boolean).sort((a, b) => (b.rarity?.value ?? 0) - (a.rarity?.value ?? 0));
      kicker = "Collection";
      facts = fact("Items", x.count) + fact("File name", `<code>${esc(x.id)}</code>`);
      extra = grid("Items", items) + grid("Cases and packages", CAT.containers.items.filter(cn => cn.collection === x.id));
      break;
    }
    case "weapons": {
      const sk = CAT.skins.items.filter(s => s.weapon === x.name).sort((a, b) => b.rarity.value - a.rarity.value);
      kicker = x.type;
      facts = fact("Side", esc(x.teams.map(t => t === "terrorists" ? "Terrorists" : "Counter-Terrorists").join(" and "))) +
        fact("Price", x.price && `$${x.price}`) + fact("Damage", x.damage) + fact("Armor penetration", x.armor_pen && `${Math.round(x.armor_pen * 50)}%`) +
        fact("Magazine", x.clip && `${x.clip} rounds, ${x.reserve} in reserve`) + fact("Fire rate", x.cycle_time && `${Math.round(60 / x.cycle_time)} rounds per minute`) +
        fact("Movement speed", x.speed) + fact("Kill reward", x.kill_award && `$${x.kill_award}`) + fact("File name", `<code>${esc(x.name)}</code>`);
      extra = grid("Skins", sk);
      break;
    }
    default:
      kicker = x.type || "Key";
      facts = fact("Released", esc(x.first_sale_date)) + fact("File name", `<code>${esc(x.name)}</code>`);
  }

  const img = x.image || collectionFallback(x);
  const tints = x.tints ? Object.entries(x.tints) : null;
  const fname = `${String(x.name || x.id).replace(/[^\w-]+/g, "_")}.webp`;
  const r = x.rarity;
  $("#d-body").style.setProperty("--r", r?.color || "#4a5466");
  $("#d-body").innerHTML = `
    <button class="d-close" aria-label="Close">×</button>
    <div class="d-art">${img ? `<div style="position:relative;display:grid;place-items:center">
        <img src="${img}" alt="${esc(x.title)}">
        ${tints ? `<div id="d-tint" style="position:absolute;inset:0;mix-blend-mode:multiply;background:${tints[0][1]};-webkit-mask:url(${img}) center/contain no-repeat;mask:url(${img}) center/contain no-repeat"></div>` : ""}
      </div>` : ""}
      ${tints ? `<div class="tints" role="group" aria-label="Spray colour">${tints.map(([n, h], i) => `<button data-tint="${h}" aria-pressed="${i === 0}" style="background:${h}" title="${esc(n.replace(/_/g, " "))}" aria-label="${esc(n.replace(/_/g, " "))}"></button>`).join("")}</div>` : ""}
    </div>
    <div class="d-info">
      ${kicker ? `<div class="d-kicker">${esc(kicker)}</div>` : ""}
      <h2 class="display" id="d-title">${esc(x.title)}</h2>
      ${r ? `<div class="d-rarity">${esc(r.name)}${x.phase ? `, ${esc(x.phase)}` : ""}</div>` : ""}
      ${x.description ? `<p class="d-desc">${esc(x.description)}</p>` : ""}
      <dl class="facts">${facts}</dl>
      <div class="d-actions">
        ${img ? `<a class="btn gold" href="${img}" download="${fname}">Download image</a>` : ""}
        <button class="btn" data-copy>Copy link</button>
      </div>
      ${extra}
    </div>`;
  if (!dlg.open) dlg.showModal();
  $(".d-info").scrollTop = 0;
  $(".d-inner")?.scrollTo?.(0, 0);
  if (x._cat === "music") markPlaying();
}

$("#detail").addEventListener("click", e => {
  const dlg = $("#detail");
  if (e.target === dlg || e.target.closest(".d-close")) { dlg.close(); return; }
  const t = e.target.closest("[data-tint]");
  if (t) {
    $("#d-tint").style.background = t.dataset.tint;
    document.querySelectorAll("[data-tint]").forEach(b => b.setAttribute("aria-pressed", b === t));
  }
  const copy = e.target.closest("[data-copy]");
  if (copy) {
    navigator.clipboard?.writeText(location.href);
    copy.textContent = "Link copied";
  }
});
$("#detail").addEventListener("close", () => {
  if (parseHash().item) history.pushState(null, "", `#${state.cat}`);
});

/* ---------------- events ---------------- */
document.addEventListener("click", e => {
  const btn = e.target.closest("button.play");
  if (btn) playTrack(btn.closest("li"));
});
let qTimer;
$("#q").addEventListener("input", e => {
  clearTimeout(qTimer);
  qTimer = setTimeout(() => { state.q = e.target.value; apply(); }, 120);
});
$("#filters").addEventListener("change", e => {
  const s = e.target;
  if (s.dataset.sort !== undefined) state.sort = s.value;
  else state.filters[s.dataset.f] = s.value;
  apply();
});
window.addEventListener("hashchange", route);
document.addEventListener("keydown", e => {
  if (e.key === "/" && document.activeElement.tagName !== "INPUT" && !$("#detail").open) { e.preventDefault(); $("#q").focus(); }
});

/* ---------------- boot ---------------- */
renderTabs();
loadFile("meta").then(m => {
  const counts = { ...m.counts, tools: (m.counts.tools || 0) + (m.counts.keys || 0) };
  renderTabs(counts);
  const total = Object.entries(counts).filter(([k]) => k !== "keys").reduce((a, [, v]) => a + v, 0);
  const songs = (m.counts.music || 0);
  $("#stats").innerHTML = `<b>${total.toLocaleString()}</b> items and <b>${songs}</b> music kits from Counter-Strike 2, taken straight from the game files.`;
});
route();
spin();
