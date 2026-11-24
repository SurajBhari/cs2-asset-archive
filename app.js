"use strict";

const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const num = x => Number(x) || 0;
const fmtTime = s => isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}` : "–:––";
const fmtSize = b => b > 1e6 ? (b / 1e6).toFixed(1) + " MB" : Math.round(b / 1e3) + " KB";
const uniq = a => [...new Set(a.filter(Boolean))];
const byText = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true });

/* ---------------- categories ---------------- */
const RARITY = x => x.rarity?.name;
const CATS = [
  { id: "music", label: "Music Kits", files: ["music"], sub: x => x.artist,
    hay: x => [x.title, x.description], sorts: ["az", "newest"] },
  { id: "skins", label: "Skins", files: ["skins"], sub: x => [x.rarity.name, x.phase].filter(Boolean).join(" · "),
    hay: x => [x.title, x.paint_name, x.weapon_type, x.rarity.name, x.phase],
    filters: [["weapon_type", "All types"], ["weapon_title", "All weapons"], [RARITY, "All rarities", "rarity"]],
    sorts: ["newest", "rarity", "az"] },
  { id: "stickers", label: "Stickers", files: ["stickers"], sub: x => x.event ? shortEvent(x.event) : x.finish,
    hay: x => [x.title, x.event, x.team, x.player, x.finish, x.name],
    filters: [[x => x.event || "No event", "All events", "event"], ["finish", "All finishes"], [x => x.player ? "Player autograph" : x.team ? "Team" : "Other", "All kinds", "kind"], [RARITY, "All rarities", "rarity"]],
    sorts: ["newest", "rarity", "az"] },
  { id: "charms", label: "Charms", files: ["charms"], sub: x => x.highlight ? "Souvenir highlight" : x.rarity.name,
    hay: x => [x.title, x.name], filters: [[RARITY, "All rarities", "rarity"]], sorts: ["newest", "rarity", "az"] },
  { id: "agents", label: "Agents", files: ["agents"], sub: x => `${x.team} · ${x.rarity.name}`,
    hay: x => [x.title, x.team], filters: [["team", "Both sides"], [RARITY, "All rarities", "rarity"]], sorts: ["rarity", "az", "newest"] },
  { id: "patches", label: "Patches", files: ["patches"], sub: x => x.rarity.name,
    hay: x => [x.title, x.name], filters: [[RARITY, "All rarities", "rarity"]], sorts: ["newest", "rarity", "az"] },
  { id: "graffiti", label: "Graffiti", files: ["graffiti"], sub: x => x.event ? shortEvent(x.event) : x.rarity.name,
    hay: x => [x.title, x.event, x.team, x.name], filters: [[RARITY, "All rarities", "rarity"]], sorts: ["newest", "rarity", "az"] },
  { id: "containers", label: "Cases & Capsules", files: ["containers"], sub: x => x.type,
    hay: x => [x.title, x.type, x.name], filters: [["type", "All containers"]], sorts: ["newest", "az"] },
  { id: "collections", label: "Collections", files: ["collections"], sub: x => `${x.count} items`,
    hay: x => [x.title, x.description, x.id], sorts: ["newest", "az"] },
  { id: "weapons", label: "Weapons", files: ["weapons"], sub: x => x.type,
    hay: x => [x.title, x.type, x.name], filters: [["type", "All types"]], sorts: ["default", "az"] },
  { id: "collectibles", label: "Collectibles", files: ["collectibles"], sub: x => x.type,
    hay: x => [x.title, x.type, x.name], filters: [["type", "All types"]], sorts: ["newest", "az"] },
  { id: "tools", label: "Tools & Keys", files: ["tools", "keys"], sub: x => x.type || "Key",
    hay: x => [x.title, x.type, x.name], sorts: ["newest", "az"] },
];
const CAT = Object.fromEntries(CATS.map(c => [c.id, c]));
const SORT_LABEL = { newest: "Newest first", rarity: "Rarity", az: "Name A–Z", default: "Game order" };

function shortEvent(e) {
  return e.replace(/^The /, "").replace(/ (CS:GO |CS2 |Counter-Strike 2 )?(Major )?Championship$/i, "");
}

/* ---------------- data loading ---------------- */
const cache = {};
function loadFile(f) {
  return cache[f] ??= fetch(`data/${f}.json`).then(r => r.json());
}
async function loadCat(id) {
  const c = CAT[id];
  if (c.items) return c.items;
  const parts = await Promise.all(c.files.map(loadFile));
  c.items = parts.flat();
  c.items.forEach((x, i) => {
    x._cat = id;
    x._order = i;
    x._hay = c.hay(x).filter(Boolean).join(" ").toLowerCase();
  });
  c.byId = new Map(c.items.map(x => [String(x.id), x]));
  return c.items;
}

let leafIndex = null;
async function getLeafIndex() {
  if (leafIndex) return leafIndex;
  await Promise.all(["skins", "stickers", "patches", "graffiti", "music", "charms", "containers"].map(loadCat));
  const m = new Map();
  CAT.skins.items.forEach(x => m.set(`[${x.paint_name}]${x.weapon}`, x));
  CAT.stickers.items.forEach(x => m.set(`[${x.name}]sticker`, x));
  CAT.patches.items.forEach(x => m.set(`[${x.name}]patch`, x));
  CAT.graffiti.items.forEach(x => { m.set(`[${x.name}]spray`, x); m.set(`[${x.name}]sticker`, m.get(`[${x.name}]sticker`) || x); });
  CAT.music.items.forEach(x => m.set(`[${x.name}]musickit`, x));
  CAT.charms.items.forEach(x => m.set(`[${x.name}]keychain`, x));
  const byName = new Map(CAT.containers.items.map(x => [x.name, x]));
  return (leafIndex = { leaf: m, container: byName });
}

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
    const c = CAT[cat];
    await loadCat(cat);
    const x = c.byId.get(item);
    if (x) showDetail(x);
  } else if ($("#detail").open) {
    $("#detail").close();
  }
}

function renderTabs(counts) {
  $("#tabs").innerHTML = CATS.map(c =>
    `<a href="#${c.id}" data-cat="${c.id}">${c.label}${counts ? `<small>${(counts[c.id] ?? 0).toLocaleString()}</small>` : ""}</a>`).join("");
  markTab();
}
function markTab() {
  document.querySelectorAll("#tabs a").forEach(a => {
    if (a.dataset.cat === state.cat) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
}

async function openCat(id) {
  state.cat = id;
  state.q = "";
  state.filters = {};
  const c = CAT[id];
  state.sort = c.sorts[0];
  $("#q").value = "";
  $("#q").placeholder = `Search ${c.label.toLowerCase()}`;
  markTab();
  $("#results").innerHTML = `<p class="empty">Loading…</p>`;
  $("#filters").innerHTML = "";
  await loadCat(id);
  buildFilters();
  apply();
}

function filterValue(f, x) {
  return typeof f[0] === "function" ? f[0](x) : x[f[0]];
}
function buildFilters() {
  const c = CAT[state.cat];
  const sel = (c.filters || []).map((f, i) => {
    let vals = uniq(c.items.map(x => filterValue(f, x)));
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
  else if (s === "newest") list = [...list].sort((a, b) => (num(b.paint_index ?? b.id) - num(a.paint_index ?? a.id)) || b._order - a._order);
  state.list = list;
  state.shown = 0;
  $("#count").textContent = `${list.length.toLocaleString()} of ${c.items.length.toLocaleString()}`;
  $("#results").innerHTML = state.cat === "music" ? `<div class="kits" id="out"></div>` : `<div class="grid" id="out"></div>`;
  if (!list.length) $("#results").innerHTML = `<p class="empty">Nothing matches that search.</p>`;
  more();
}

function more() {
  const out = $("#out");
  if (!out || state.shown >= state.list.length) return;
  const chunk = state.list.slice(state.shown, state.shown + PAGE);
  state.shown += chunk.length;
  out.insertAdjacentHTML("beforeend", chunk.map(state.cat === "music" ? kitHTML : x => cardHTML(x)).join(""));
  if (state.cat === "music") markPlaying();
}
new IntersectionObserver(es => es[0].isIntersecting && more(), { rootMargin: "1200px" }).observe($("#more"));

/* ---------------- cards ---------------- */
function itemHref(x) { return `#${x._cat}/${encodeURIComponent(x.id)}`; }
function cardHTML(x, mini = false) {
  const c = CAT[x._cat];
  const sub = c.sub(x);
  const img = x.image || collectionFallback(x);
  return `<a class="card" href="${itemHref(x)}" style="--r:${x.rarity?.color || "var(--line)"}">
    <div class="thumb">${img ? `<img src="${img}" alt="" loading="lazy" decoding="async">` : ""}</div>
    <div class="meta"><b>${esc(x.title)}</b>${sub && !mini ? `<small>${esc(sub)}</small>` : ""}</div></a>`;
}
function collectionFallback(x) {
  if (x._cat !== "collections" || !leafIndex) return null;
  for (const k of x.items) { const it = leafIndex.leaf.get(k); if (it?.image) return it.image; }
  return null;
}

/* ---------------- music ---------------- */
const SOUND_LABEL = {
  mainmenu: "Main menu", chooseteam: "Choose team", startofmatch: "Match start", startround: "Round start",
  startaction: "Action", roundtenseccount: "Round 10s left", bombplanted: "Bomb planted", bombtenseccount: "Bomb 10s left",
  wonround: "Round won", lostround: "Round lost", roundmvpanthem: "MVP anthem", deathcam: "Death cam",
  endofmatch: "Match end", loading: "Loading screen",
};
const PLAY = '<svg viewBox="0 0 10 10"><path d="M2 1l7 4-7 4z"/></svg>';
const PAUSE = '<svg viewBox="0 0 10 10"><path d="M2 1h2v8H2zM6 1h2v8H6z"/></svg>';
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
    return `<li class="${f.startsWith("roundmvpanthem") ? "mvp" : ""}" data-src="${src}" data-title="${esc(lab)}" data-sub="${esc(k.title)}">
      <button class="play" aria-label="Play ${esc(lab)}">${PLAY}</button>
      <div class="label"><b>${esc(lab)}</b><small>${fmtTime(k.durations?.[i])}</small></div>
      <a class="dl" href="${src}" download="${k.name}_${f}.mp3" aria-label="Download ${esc(lab)}" title="${k.sizes ? fmtSize(k.sizes[i]) : ""}">mp3</a></li>`;
  }).join("")}</ul>`;
}
function kitHTML(k) {
  const total = (k.durations || []).reduce((a, b) => a + b, 0);
  return `<section class="kit" id="kit-${k.name}">
    <a href="${itemHref(k)}"><img src="${k.image}" alt="${esc(k.title)} music kit" loading="lazy" width="168" height="168"></a>
    <div>
      <h2>${esc(k.artist)}</h2>
      <div class="song">${esc(k.song)}</div>
      ${k.description ? `<p class="desc">${esc(k.description)}</p>` : ""}
      <div class="tags"><span class="tag">${k.sounds.length} sounds</span><span class="tag">${fmtTime(total)} total</span>${k.containers.length ? `<span class="tag">In ${k.containers.length} music kit box${k.containers.length > 1 ? "es" : ""}</span>` : ""}</div>
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
    li.querySelector(".play").innerHTML = on ? PAUSE : PLAY;
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

/* ---------------- detail ---------------- */
function fact(label, value) {
  return value || value === 0 ? `<dt>${label}</dt><dd>${value}</dd>` : "";
}
function catLink(cat, id, label) {
  return `<a href="#${cat}/${encodeURIComponent(id)}">${esc(label)}</a>`;
}

async function showDetail(x) {
  const dlg = $("#detail");
  const c = CAT[x._cat];
  const idx = await getLeafIndex();
  await Promise.all(["collections", "weapons"].map(loadCat));
  let facts = "", extra = "";
  const r = x.rarity;
  const rarityLine = r ? `<div class="d-rarity" style="color:${r.color}">${esc(r.name)}${x.phase ? ` · ${esc(x.phase)}` : ""}</div>` : "";
  const containersOf = list => {
    const cs = (list || []).map(n => idx.container.get(n)).filter(Boolean);
    return cs.length ? `<h3 class="sub">Found in ${cs.length} container${cs.length > 1 ? "s" : ""}</h3><div class="mini">${cs.map(y => cardHTML(y, true)).join("")}</div>` : "";
  };

  switch (x._cat) {
    case "skins": {
      const wpn = CAT.weapons.items.find(w => w.name === x.weapon);
      const lo = x.wear_min * 100, hi = x.wear_max * 100;
      facts = fact("Weapon", wpn ? catLink("weapons", wpn.id, x.weapon_title) : esc(x.weapon_title)) +
        fact("Type", esc(x.weapon_type)) +
        fact("Finish", `${esc(x.paint)} <small style="color:var(--muted)">#${x.paint_index} · ${esc(x.paint_name)}</small>`) +
        fact("Float range", `${x.wear_min.toFixed(2)} – ${x.wear_max.toFixed(2)}<div class="wearwrap"><div class="wearbar"></div><div class="wearbar" style="opacity:1;background:none;position:absolute;inset:0;margin:0"><i style="left:${lo}%;width:${hi - lo}%"></i></div></div>`) +
        fact("Exteriors", esc(x.wears.join(", "))) +
        fact("StatTrak™", x.stattrak ? "Available" : "No") +
        fact("Souvenir", x.souvenir ? "Available" : "No");
      const cols = x.collections.map(id => CAT.collections.byId.get(id)).filter(Boolean);
      if (cols.length) extra += `<h3 class="sub">Collection</h3><div class="chips">${cols.map(s => catLink("collections", s.id, s.title)).join("")}</div>`;
      extra += containersOf(x.crates);
      break;
    }
    case "stickers": case "patches": case "graffiti":
      facts = fact("Finish", esc(x.finish)) + fact("Tournament", esc(x.event)) + fact("Team", esc(x.team)) + fact("Player", esc(x.player)) + fact("Internal name", `<code>${esc(x.name)}</code>`);
      extra = containersOf(x.containers);
      break;
    case "charms":
      facts = fact("Kind", x.highlight ? "Souvenir highlight charm" : "Charm") + fact("Internal name", `<code>${esc(x.name)}</code>`);
      extra = containersOf(x.containers);
      break;
    case "music": {
      const total = (x.durations || []).reduce((a, b) => a + b, 0);
      facts = fact("Artist", esc(x.artist)) + fact("Track", esc(x.song)) + fact("Sounds", `${x.sounds.length} · ${fmtTime(total)}`) + fact("Internal name", `<code>${esc(x.name)}</code>`);
      extra = `<h3 class="sub">Sounds</h3>${tracksHTML(x)}` + containersOf(x.containers);
      break;
    }
    case "agents":
      facts = fact("Side", x.team === "T" ? "Terrorist" : "Counter-Terrorist") + fact("Internal name", `<code>${esc(x.name)}</code>`);
      break;
    case "containers": {
      const items = x.contents.map(k => idx.leaf.get(k)).filter(Boolean);
      const col = x.collection && CAT.collections.byId.get(x.collection);
      facts = fact("Type", esc(x.type)) + fact("Collection", col ? catLink("collections", col.id, col.title) : "") +
        fact("Released", esc(x.first_sale_date)) + fact("Rare special item", esc(x.rare_special)) + fact("Internal name", `<code>${esc(x.name)}</code>`);
      items.sort((a, b) => (b.rarity?.value ?? 0) - (a.rarity?.value ?? 0));
      if (items.length) extra = `<h3 class="sub">Contents · ${items.length}</h3><div class="mini">${items.map(y => cardHTML(y, true)).join("")}</div>`;
      break;
    }
    case "collections": {
      const items = x.items.map(k => idx.leaf.get(k)).filter(Boolean).sort((a, b) => (b.rarity?.value ?? 0) - (a.rarity?.value ?? 0));
      const crates = CAT.containers.items.filter(cn => cn.collection === x.id);
      facts = fact("Items", x.count) + fact("Internal name", `<code>${esc(x.id)}</code>`);
      extra = `<h3 class="sub">Items</h3><div class="mini">${items.map(y => cardHTML(y, true)).join("")}</div>` +
        (crates.length ? `<h3 class="sub">Containers</h3><div class="mini">${crates.map(y => cardHTML(y, true)).join("")}</div>` : "");
      break;
    }
    case "weapons": {
      const sk = CAT.skins.items.filter(s => s.weapon === x.name).sort((a, b) => b.rarity.value - a.rarity.value);
      facts = fact("Type", esc(x.type)) + fact("Side", esc(x.teams.map(t => t === "terrorists" ? "T" : "CT").join(" / "))) +
        fact("Price", x.price && `$${x.price}`) + fact("Damage", x.damage) + fact("Armor penetration", x.armor_pen && `${Math.round(x.armor_pen * 50)}%`) +
        fact("Magazine", x.clip && `${x.clip} / ${x.reserve}`) + fact("Fire rate", x.cycle_time && `${Math.round(60 / x.cycle_time)} RPM`) +
        fact("Move speed", x.speed) + fact("Kill reward", x.kill_award && `$${x.kill_award}`) + fact("Internal name", `<code>${esc(x.name)}</code>`);
      if (sk.length) extra = `<h3 class="sub">Skins · ${sk.length}</h3><div class="mini">${sk.map(y => cardHTML(y, true)).join("")}</div>`;
      break;
    }
    default:
      facts = fact("Type", esc(x.type || "Key")) + fact("Released", esc(x.first_sale_date)) + fact("Internal name", `<code>${esc(x.name)}</code>`);
  }

  const img = x.image || collectionFallback(x);
  const tints = x.tints ? Object.entries(x.tints) : null;
  const fname = img ? `${(x.name || x.id).toString().replace(/[^\w-]+/g, "_")}.webp` : "";
  $("#d-body").innerHTML = `
    <button class="d-close" aria-label="Close">×</button>
    <div class="d-art">${img ? `<div class="tintable" style="position:relative;display:grid;place-items:center">
        <img id="d-img" src="${img}" alt="${esc(x.title)}">
        ${tints ? `<div id="d-tint" style="position:absolute;inset:0;mix-blend-mode:multiply;-webkit-mask:url(${img}) center/contain no-repeat;mask:url(${img}) center/contain no-repeat"></div>` : ""}
      </div>` : ""}
      ${tints ? `<div class="tints">${tints.map(([n, h]) => `<button data-tint="${h}" style="background:${h}" title="${esc(n.replace(/_/g, " "))}" aria-label="${esc(n.replace(/_/g, " "))}"></button>`).join("")}</div>` : ""}
    </div>
    <div class="d-info">
      <h2 id="d-title">${esc(x.title)}</h2>
      ${rarityLine}
      ${x.description ? `<p class="d-desc">${esc(x.description)}</p>` : ""}
      <dl class="facts">${facts}</dl>
      <div class="d-actions">
        ${img ? `<a class="btn primary" href="${img}" download="${fname}">Download image</a>` : ""}
        <button class="btn" data-copy>Copy link</button>
      </div>
      ${extra}
    </div>`;
  if (tints) {
    const t = $("#d-tint");
    t.style.background = tints[0][1];
  }
  if (!dlg.open) dlg.showModal();
  dlg.scrollTop = 0;
  $(".d-info").scrollTop = 0;
  if (x._cat === "music") markPlaying();
}

$("#detail").addEventListener("click", e => {
  const dlg = $("#detail");
  if (e.target === dlg || e.target.closest(".d-close")) { history.pushState(null, "", `#${state.cat}`); dlg.close(); return; }
  const t = e.target.closest("[data-tint]");
  if (t) $("#d-tint").style.background = t.dataset.tint;
  if (e.target.closest("[data-copy]")) {
    navigator.clipboard?.writeText(location.href);
    e.target.textContent = "Copied";
  }
});
$("#detail").addEventListener("close", () => {
  if (parseHash().item) history.replaceState(null, "", `#${state.cat}`);
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
  $("#lede").textContent = `${total.toLocaleString()} Counter-Strike 2 items pulled straight out of the game files: every skin, sticker, charm, agent, case and collectible, plus all ${counts.music} music kits with every sound. Browse, play, download.`;
});
route();
