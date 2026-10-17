// Loads data/*.csv and renders the Shoes and Game log views.

// Minimal CSV parser that handles quoted fields with commas and "" escapes.
function parseCSV(text) {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some(f => f !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some(f => f !== "")) rows.push(row);
  const [head, ...body] = rows;
  return body.map(r => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])));
}

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const TYPE_LABEL = { signature: "Signature", pe: "PE", general: "General" };
const shoeName = s => s.model?.startsWith("Air Jordan") || s.model?.startsWith(s.brand) ? s.model : `${s.brand} ${s.model}`;
const TYPE_CLASS = { signature: "sig", pe: "pe", general: "gen" };

function fmtDate(d) {
  if (!d) return "";
  const [y, m, day] = d.split("-").map(Number);
  if (!m) return String(y);
  const mon = new Date(y, m - 1, 1).toLocaleString("en-US", { month: "short" });
  return day ? `${mon} ${day}, ${y}` : `${mon} ${y}`;
}

const state = { view: "shoes", q: "", type: "all", league: "all" };
const db = { players: {}, shoes: [], shoesById: {}, sightings: [], sources: {} };
const out = document.getElementById("out"), count = document.getElementById("count");

function swatches(colors) {
  const list = (colors || "").split("|").filter(Boolean);
  return list.length ? `<span class="swatches" aria-label="Colorway">${list.map(c => `<span class="sw" style="background:${esc(c)}"></span>`).join("")}</span>` : "";
}

function sourceLinks(type, id) {
  const list = db.sources[`${type}:${id}`] || [];
  if (!list.length) return "";
  return `<span>${list.length > 1 ? "Sources" : "Source"}: ${list.map(x => x.url ? `<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.source)}</a>` : esc(x.source)).join(" · ")}</span>`;
}

function matches(text) {
  const q = state.q.trim().toLowerCase();
  return !q || text.toLowerCase().includes(q);
}

function renderShoes() {
  const rows = db.shoes.filter(s => {
    const p = db.players[s.player_id] || {};
    return (state.type === "all" || s.type === state.type) &&
      (state.league === "all" || s.league === state.league) &&
      matches([p.name, p.current_team, s.team_at_release, s.brand, s.model, s.colorway, s.note].join(" "));
  });
  count.textContent = `${rows.length} of ${db.shoes.length} shoes`;
  if (!rows.length) { out.innerHTML = `<div class="empty">No shoes match. Try a different search or clear the filters.</div>`; return; }
  out.innerHTML = rows.map(s => {
    const p = db.players[s.player_id] || {};
    const worn = s.team_at_release && s.team_at_release !== p.current_team ? ` · released at ${esc(s.team_at_release)}` : "";
    return `
    <article class="entry">
      <div class="who">
        <div class="player">${p.name ? `<a href="#" data-player="${esc(p.name)}">${esc(p.name)}</a>` : esc(s.team_at_release || "General release")}</div>
        <div class="meta">${p.name ? esc(p.current_team || "") + worn : (s.type === "pe" ? "Team PE" : "")}${s.release_date ? " · " + esc(fmtDate(s.release_date)) : ""}</div>
      </div>
      <div class="tags">
        <span class="tag ${TYPE_CLASS[s.type] || "gen"}">${esc(TYPE_LABEL[s.type] || s.type)}</span>
        <span class="tag lvl">${s.league === "NCAA" ? "College" : esc(s.league)}</span>
        ${s.wbb_confirmed === "no" ? `<span class="tag lvl" title="Not yet confirmed as worn by a women's team">WBB unconfirmed</span>` : ""}
      </div>
      <div class="shoe">${esc(shoeName(s))}${s.colorway ? ` <span class="meta">“${esc(s.colorway)}”</span>` : ""}</div>
      ${s.note ? `<p class="note">${esc(s.note)}</p>` : ""}
      <div class="sku">
        ${swatches(s.colors)}
        ${s.style_code ? `<span>${esc(s.style_code)}</span>` : ""}
        ${sourceLinks("shoe", s.id)}
      </div>
    </article>`;
  }).join("");
}

function renderLog() {
  const rows = db.sightings.filter(g => {
    const p = db.players[g.player_id] || {}, s = db.shoesById[g.shoe_id] || {};
    return (state.type === "all" || s.type === state.type) &&
      (state.league === "all" || g.league === state.league) &&
      matches([p.name, g.team_at_time, g.opponent, s.brand, s.model, g.note].join(" "));
  }).sort((a, b) => b.date.localeCompare(a.date));
  count.textContent = `${rows.length} of ${db.sightings.length} games logged`;
  if (!db.sightings.length) {
    out.innerHTML = `<div class="empty">No games logged yet. Game-by-game sightings start when the 2026-27 college season tips off in November. Each one is a row in <code>data/sightings.csv</code>.</div>`;
    return;
  }
  if (!rows.length) { out.innerHTML = `<div class="empty">No games match. Try a different search or clear the filters.</div>`; return; }
  out.innerHTML = rows.map(g => {
    const p = db.players[g.player_id] || {}, s = db.shoesById[g.shoe_id] || {};
    return `
    <article class="entry">
      <div class="who">
        <div class="player">${p.name ? `<a href="#" data-player="${esc(p.name)}">${esc(p.name)}</a>` : `${esc(g.team_at_time)} (team)`}</div>
        <div class="meta">${esc(g.team_at_time)}${g.opponent ? " vs " + esc(g.opponent) : ""} · ${esc(fmtDate(g.date))}</div>
      </div>
      <div class="tags">
        <span class="tag ${TYPE_CLASS[s.type] || "gen"}">${esc(TYPE_LABEL[s.type] || "Shoe")}</span>
        <span class="tag lvl">${g.league === "NCAA" ? "College" : esc(g.league)}</span>
      </div>
      <div class="shoe">${esc(s.model ? shoeName(s) : g.shoe_id)}${s.colorway ? ` <span class="meta">“${esc(s.colorway)}”</span>` : ""}</div>
      ${g.note ? `<p class="note">${esc(g.note)}</p>` : ""}
      <div class="sku">
        ${swatches(s.colors)}
        ${g.photo_url ? `<a href="${esc(g.photo_url)}" target="_blank" rel="noopener">Photo</a>` : ""}
        ${sourceLinks("sighting", g.id)}
      </div>
    </article>`;
  }).join("");
}

function render() { state.view === "shoes" ? renderShoes() : renderLog(); }

function wireSeg(id, key) {
  const group = document.getElementById(id);
  group.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    state[key] = b.dataset.v;
    group.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", x === b));
    render();
  });
}

const search = document.getElementById("q");
search.addEventListener("input", e => { state.q = e.target.value; render(); });
wireSeg("type-filter", "type");
wireSeg("league-filter", "league");
document.querySelectorAll(".tabs button").forEach(b => b.addEventListener("click", () => {
  state.view = b.dataset.view;
  document.querySelectorAll(".tabs button").forEach(x => x.setAttribute("aria-selected", x === b));
  render();
}));
out.addEventListener("click", e => {
  const a = e.target.closest("[data-player]"); if (!a) return;
  e.preventDefault();
  search.value = state.q = a.dataset.player;
  render();
});

Promise.all(["players", "shoes", "sightings", "sources"].map(f => fetch(`data/${f}.csv`).then(r => {
  if (!r.ok) throw new Error(`Couldn't load data/${f}.csv (${r.status})`);
  return r.text();
}).then(parseCSV))).then(([players, shoes, sightings, sources]) => {
  sources.forEach(x => (db.sources[`${x.entry_type}:${x.entry_id}`] ||= []).push(x));
  players.forEach(p => db.players[p.id] = p);
  db.shoes = shoes;
  shoes.forEach(s => db.shoesById[s.id] = s);
  db.sightings = sightings;
  render();
}).catch(err => {
  out.innerHTML = `<div class="empty">${esc(err.message)}. If you opened this file directly, run it through a local server or GitHub Pages instead.</div>`;
});
