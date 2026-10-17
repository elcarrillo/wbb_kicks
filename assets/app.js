// Loads data/*.csv and renders every page of the site from the URL hash:
// #  home · #games · #shoes · #players · #teams · #brands
// #player-<id> · #team-<slug> · #brand-<slug> · #shoe-<id>

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
const slug = s => String(s).toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const TYPE_LABEL = { signature: "Signature", pe: "PE", general: "General release" };
const TYPE_CLASS = { signature: "sig", pe: "pe", general: "gen" };
const shoeName = s => s.model?.startsWith("Air Jordan") || s.model?.startsWith(s.brand) ? s.model : `${s.brand} ${s.model}`;
const teamsOf = s => (s.teams || "").split("|").filter(Boolean);
const plural = (n, one, many = one + "s") => `${n} ${n === 1 ? one : many}`;
// The site's catalog is college-only: a shoe shows there if it's a college release or a college game logged it.
const isCollege = s => s.league === "NCAA" || db.sightings.some(g => g.shoe_id === s.id && g.league === "NCAA");

function fmtDate(d) {
  if (!d) return "—";
  const [y, m, day] = d.split("-").map(Number);
  if (!m) return String(y);
  const mon = new Date(y, m - 1, 1).toLocaleString("en-US", { month: "short" });
  return day ? `${mon} ${day}, ${y}` : `${mon} ${y}`;
}

// Newest first; entries with no date go last.
const byDateDesc = key => (a, b) => (!a[key]) - (!b[key]) || (b[key] || "").localeCompare(a[key] || "");

const db = { players: {}, shoes: [], shoesById: {}, sightings: [], sources: {}, teams: {}, brands: {} };
const app = document.getElementById("app");
const ui = { q: "", type: "all" };

// ---------- links and small pieces ----------
const playerLink = p => p ? `<a href="#player-${esc(p.id)}">${esc(p.name)}</a>` : "";
const teamLink = t => t ? `<a href="#team-${slug(t)}">${esc(t)}</a>` : "";
const brandLink = b => `<a href="#brand-${slug(b)}">${esc(b)}</a>`;
const shoeLink = s => `<a href="#shoe-${esc(s.id)}">${esc(shoeName(s))}</a>`;
const typeTag = s => `<span class="tag ${TYPE_CLASS[s.type] || "gen"}">${esc(TYPE_LABEL[s.type] || "Shoe")}</span>`;
// College is the default on this site, so only pro shoes get a league tag on cards.
const leagueTag = l => l ? `<span class="tag lvl">${l === "NCAA" ? "College" : esc(l)}</span>` : "";
const proTag = l => l && l !== "NCAA" ? leagueTag(l) : "";
const unconfirmedTag = s => s.wbb_confirmed === "no" ? `<span class="tag lvl" title="Not yet confirmed as worn by a women's team">WBB unconfirmed</span>` : "";

function thumb(s) {
  if (s.image_url) return `<img class="thumb" src="${esc(s.image_url)}" alt="${esc(shoeName(s))}" loading="lazy">`;
  return `<span class="thumb ph ${TYPE_CLASS[s.type] || "gen"}" aria-hidden="true">${esc((s.brand || "?").slice(0, 1))}</span>`;
}

function sourceLinks(type, id) {
  const list = db.sources[`${type}:${id}`] || [];
  return list.map(x => x.url ? `<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.source)}</a>` : esc(x.source)).join(" · ");
}

const tiles = items => `<div class="tiles">${items.map(([n, label]) => `<div class="tile"><b>${n}</b><span>${esc(label)}</span></div>`).join("")}</div>`;
const section = (title, body, more = "") => `<section class="panel"><div class="panel-head"><h2>${esc(title)}</h2>${more}</div>${body}</section>`;
const crumbs = (...parts) => `<nav class="crumbs" aria-label="Breadcrumb"><a href="#">Home</a>${parts.map(p => ` › ${p}`).join("")}</nav>`;
const empty = msg => `<p class="empty">${msg}</p>`;

// Ranked list with a share bar, like a leaderboard.
function ranked(rows, total) {
  if (!rows.length) return empty("Nothing here yet.");
  return `<ol class="ranked">${rows.map(([label, n, extra = ""], i) => `
    <li><span class="rank">${i + 1}</span><span class="rlabel">${label}${extra ? `<small>${extra}</small>` : ""}</span>
      <span class="rbar"><i style="width:${Math.round(100 * n / total)}%"></i></span><span class="rnum">${n}</span></li>`).join("")}</ol>`;
}

function shoeCard(s) {
  const p = db.players[s.player_id];
  const who = p ? `${playerLink(p)}${s.team_at_release ? ` · ${teamLink(s.team_at_release)}` : ""}`
    : s.team_at_release ? `${teamLink(s.team_at_release)} team PE` : "General release";
  return `<article class="card">
    <div class="card-top">${thumb(s)}<div class="tags">${typeTag(s)}${proTag(s.league)}${!isCollege(s) && s.player_id && teamsOf(s).some(t => t === db.players[s.player_id]?.school) ? `<span class="tag lvl">Alumni</span>` : ""}${unconfirmedTag(s)}</div></div>
    <h3 class="shoe"><a href="#shoe-${esc(s.id)}">${esc(shoeName(s))}</a></h3>
    ${s.colorway ? `<div class="colorway">${esc(s.colorway)}</div>` : ""}
    <div class="who">${who}</div>
    <div class="date">${esc(fmtDate(s.release_date))}</div>
  </article>`;
}
const shoeGrid = shoes => shoes.length ? `<div class="grid">${shoes.map(shoeCard).join("")}</div>` : empty("No shoes match.");

function gameTable(games, { showWho = true } = {}) {
  if (!games.length) return empty("No games logged yet. Game-by-game tracking starts when the 2026-27 college season tips off in November.");
  return `<div class="table-wrap"><table>
    <thead><tr><th>Date</th>${showWho ? "<th>Player</th>" : ""}<th>Team</th><th>Opponent</th><th>Shoe</th><th>Type</th><th>Sources</th></tr></thead>
    <tbody>${games.map(g => {
      const p = db.players[g.player_id], s = db.shoesById[g.shoe_id] || {};
      return `<tr><td class="num">${esc(fmtDate(g.date))}</td>${showWho ? `<td>${p ? playerLink(p) : "Whole team"}</td>` : ""}
        <td>${teamLink(g.team_at_time)}</td><td>${esc(g.opponent)}</td>
        <td>${s.id ? shoeLink(s) : esc(g.shoe_id)}${s.colorway ? `<small>${esc(s.colorway)}</small>` : ""}</td>
        <td>${s.id ? typeTag(s) : ""}</td><td class="src">${sourceLinks("sighting", g.id)}</td></tr>`;
    }).join("")}</tbody></table></div>`;
}

function brandShare(shoes) {
  const c = {};
  shoes.forEach(s => c[s.brand] = (c[s.brand] || 0) + 1);
  return ranked(Object.entries(c).sort((a, b) => b[1] - a[1]).map(([b, n]) => [brandLink(b), n, `${Math.round(100 * n / shoes.length)}%`]), shoes.length);
}

// ---------- filters for the Shoes page ----------
function filterBar() {
  const seg = (key, opts) => `<div class="seg" role="group" aria-label="${key}">${opts.map(([v, l]) =>
    `<button type="button" data-key="${key}" data-v="${v}" aria-pressed="${ui[key] === v}">${l}</button>`).join("")}</div>`;
  return `<div class="bar">
    <input type="search" id="q" placeholder="Search player, team, shoe or brand" aria-label="Search" value="${esc(ui.q)}">
    <span class="seg-label">Type</span>${seg("type", [["all", "All"], ["pe", "PE"], ["signature", "Signature"], ["general", "General"]])}
  </div>`;
}
function filteredShoes() {
  const q = ui.q.trim().toLowerCase();
  return db.shoes.filter(s => {
    const p = db.players[s.player_id] || {};
    return isCollege(s) && (ui.type === "all" || s.type === ui.type) &&
      (!q || [p.name, s.teams, s.brand, s.model, s.colorway, s.note].join(" ").toLowerCase().includes(q));
  }).sort(byDateDesc("release_date"));
}

// ---------- pages ----------
const pages = {
  home() {
    const college = db.shoes.filter(isCollege);
    const pes = college.filter(s => s.type === "pe");
    const teamPEs = {};
    pes.forEach(s => teamsOf(s).forEach(t => teamPEs[t] = (teamPEs[t] || 0) + 1));
    const collegeTeams = Object.keys(db.teams).filter(k => db.teams[k].league === "NCAA");
    return `
      <section class="hero">
        <h1>Every shoe in women's college hoops.</h1>
        <p>PEs, signature shoes and what players actually wear in games, with a source on every entry.</p>
      </section>
      ${tiles([[college.length, "College shoes"], [pes.length, "PEs"], [Object.keys(db.players).length, "Players"], [collegeTeams.length, "College teams"], [db.sightings.filter(g => g.league === "NCAA").length, "College games logged"]])}
      ${section("Latest games & shoes worn", gameTable(db.sightings.filter(g => g.league === "NCAA").sort(byDateDesc("date")).slice(0, 8)), `<a class="more" href="#games">All games →</a>`)}
      <div class="cols">
        ${section("Newest PEs", shoeGrid([...pes].sort(byDateDesc("release_date")).slice(0, 4)), `<a class="more" href="#shoes">All shoes →</a>`)}
        <div class="stack">
          ${section("Most PEs by team", ranked(Object.entries(teamPEs).sort((a, b) => b[1] - a[1]).map(([t, n]) => [teamLink(t), n]), pes.length), `<a class="more" href="#teams">Teams →</a>`)}
          ${section("Brand share", brandShare(college), `<a class="more" href="#brands">Brands →</a>`)}
        </div>
      </div>
      ${section("College shoes", shoeGrid([...college].sort(byDateDesc("release_date"))))}`;
  },

  games() {
    return `${crumbs("Games")}<h1 class="page-title">Games</h1>
      <p class="lede">Who wore what, game by game.</p>
      ${section("All logged college games", gameTable(db.sightings.filter(g => g.league === "NCAA").sort(byDateDesc("date"))))}`;
  },

  shoes() {
    const list = filteredShoes();
    return `${crumbs("Shoes")}<h1 class="page-title">Shoes</h1>
      ${filterBar()}<p class="count">${plural(list.length, "shoe")}</p><div id="shoe-results">${shoeGrid(list)}</div>`;
  },

  players() {
    const rows = Object.values(db.players).map(p => ({
      p, shoes: db.shoes.filter(s => s.player_id === p.id).length,
      games: db.sightings.filter(g => g.player_id === p.id).length,
    })).sort((a, b) => b.shoes - a.shoes || a.p.name.localeCompare(b.p.name));
    return `${crumbs("Players")}<h1 class="page-title">Players</h1>
      <div class="table-wrap"><table><thead><tr><th>Player</th><th>Team now</th><th>College</th><th class="num">Shoes</th><th class="num">Games</th></tr></thead>
      <tbody>${rows.map(r => `<tr><td>${playerLink(r.p)}</td><td>${teamLink(r.p.current_team)}</td><td>${teamLink(r.p.school)}</td>
        <td class="num">${r.shoes}</td><td class="num">${r.games}</td></tr>`).join("")}</tbody></table></div>`;
  },

  teams() {
    const rows = Object.entries(db.teams).map(([k, t]) => ({
      k, t, shoes: db.shoes.filter(s => teamsOf(s).includes(t.name)),
      games: db.sightings.filter(g => g.team_at_time === t.name).length,
    })).filter(r => r.shoes.length || r.games)
      .sort((a, b) => (a.t.league === "NCAA" ? 0 : 1) - (b.t.league === "NCAA" ? 0 : 1) || b.shoes.length - a.shoes.length || a.t.name.localeCompare(b.t.name));
    return `${crumbs("Teams")}<h1 class="page-title">Teams</h1>
      <div class="table-wrap"><table><thead><tr><th>Team</th><th>League</th><th class="num">Shoes</th><th class="num">PEs</th><th class="num">Games</th></tr></thead>
      <tbody>${rows.map(r => `<tr><td><a href="#team-${r.k}">${esc(r.t.name)}</a></td><td>${leagueTag(r.t.league)}</td>
        <td class="num">${r.shoes.length}</td><td class="num">${r.shoes.filter(s => s.type === "pe").length}</td><td class="num">${r.games}</td></tr>`).join("")}</tbody></table></div>`;
  },

  brands() {
    return `${crumbs("Brands")}<h1 class="page-title">Brands</h1>${section("Share of college shoes", brandShare(db.shoes.filter(isCollege)))}`;
  },

  player(id) {
    const p = db.players[id];
    const shoes = db.shoes.filter(s => s.player_id === id).sort(byDateDesc("release_date"));
    const games = db.sightings.filter(g => g.player_id === id).sort(byDateDesc("date"));
    const latest = games[0] && db.shoesById[games[0].shoe_id];
    const sub = [p.current_team && `Now: ${teamLink(p.current_team)}`, p.school && `College: ${teamLink(p.school)}`].filter(Boolean).join(" · ");
    return `${crumbs(`<a href="#players">Players</a>`, esc(p.name))}
      <h1 class="page-title">${esc(p.name)}</h1><p class="lede">${sub}</p>
      ${latest ? `<p class="callout">In the latest logged game, ${esc(p.name)} wore ${shoeLink(latest)}.</p>` : ""}
      ${tiles([[shoes.length, "Shoes"], [shoes.filter(s => s.type === "pe").length, "PEs"], [shoes.filter(s => s.type === "signature").length, "Signature colorways"], [games.length, "Games logged"]])}
      ${shoes.some(isCollege) ? section("College", shoeGrid(shoes.filter(isCollege))) : ""}
      ${shoes.some(s => !isCollege(s)) ? section("Pro career", shoeGrid(shoes.filter(s => !isCollege(s)))) : ""}
      ${section("Game-by-game", gameTable(games, { showWho: false }))}
      ${db.sources[`player:${id}`] ? `<p class="src-line">Team info: ${sourceLinks("player", id)}</p>` : ""}`;
  },

  team(key) {
    const t = db.teams[key];
    const all = db.shoes.filter(s => teamsOf(s).includes(t.name)).sort(byDateDesc("release_date"));
    // A college team's page includes alumni's pro shoes made in its colors (like Sabrina's Oregon PEs).
    const shoes = all;
    const games = db.sightings.filter(g => g.team_at_time === t.name).sort(byDateDesc("date"));
    const alumni = Object.values(db.players).filter(p => p.school === t.name || p.current_team === t.name);
    return `${crumbs(`<a href="#teams">Teams</a>`, esc(t.name))}
      <h1 class="page-title">${esc(t.name)}</h1>
      <p class="lede">${t.league === "NCAA" ? "College" : esc(t.league)} · every shoe tied to this team, PEs and tribute colorways included.</p>
      ${tiles([[shoes.length, "Shoes"], [shoes.filter(s => s.type === "pe").length, "PEs"], [games.length, "Games logged"], [alumni.length, "Players"]])}
      <div class="cols">
        ${section("Shoes", shoeGrid(shoes))}
        <div class="stack">
          ${section("Brand share", shoes.length ? brandShare(shoes) : empty("No shoes yet."))}
          ${section("Players", alumni.length ? `<ul class="plain">${alumni.map(p => `<li>${playerLink(p)}<small>${esc(p.current_team === t.name ? "Current" : "Alum")}</small></li>`).join("")}</ul>` : empty("No players yet."))}
        </div>
      </div>
      ${section("Game-by-game", gameTable(games))}`;
  },

  brand(key) {
    const name = db.brands[key];
    const shoes = db.shoes.filter(s => s.brand === name && isCollege(s)).sort(byDateDesc("release_date"));
    return `${crumbs(`<a href="#brands">Brands</a>`, esc(name))}<h1 class="page-title">${esc(name)}</h1>
      ${tiles([[shoes.length, "Shoes"], [shoes.filter(s => s.type === "pe").length, "PEs"], [new Set(shoes.map(s => s.player_id).filter(Boolean)).size, "Players"]])}
      ${section("Shoes", shoeGrid(shoes))}`;
  },

  shoe(id) {
    const s = db.shoesById[id], p = db.players[s.player_id];
    const games = db.sightings.filter(g => g.shoe_id === id).sort(byDateDesc("date"));
    const facts = [
      ["Brand", brandLink(s.brand)], ["Type", typeTag(s)], ["League", leagueTag(s.league)],
      ["Player", p ? playerLink(p) : "—"], ["Teams", teamsOf(s).map(teamLink).join(", ") || "—"],
      ["Released", esc(fmtDate(s.release_date))], ["Style code", esc(s.style_code || "—")],
      ["Worn by a women's team", s.wbb_confirmed === "no" ? "Not yet confirmed" : "Yes"],
    ];
    return `${crumbs(`<a href="#shoes">Shoes</a>`, esc(shoeName(s)))}
      <div class="shoe-head">${thumb(s)}<div><h1 class="page-title">${esc(shoeName(s))}</h1>${s.colorway ? `<p class="lede">${esc(s.colorway)}</p>` : ""}</div></div>
      ${s.note ? `<p class="callout">${esc(s.note)}</p>` : ""}
      <div class="cols">
        ${section("Details", `<dl class="facts">${facts.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("")}</dl>`)}
        ${section("Sources", `<p class="src">${sourceLinks("shoe", id) || "—"}</p>`)}
      </div>
      ${section("Games worn", gameTable(games))}`;
  },
};

// ---------- routing ----------
function route() {
  const h = decodeURIComponent(location.hash.slice(1));
  const m = h.match(/^(player|team|brand|shoe)-(.+)$/);
  let html, nav = h;
  if (!h) html = pages.home();
  else if (pages[h] && !["player", "team", "brand", "shoe"].includes(h)) html = pages[h]();
  else if (m && m[1] === "player" && db.players[m[2]]) { html = pages.player(m[2]); nav = "players"; }
  else if (m && m[1] === "team" && db.teams[m[2]]) { html = pages.team(m[2]); nav = "teams"; }
  else if (m && m[1] === "brand" && db.brands[m[2]]) { html = pages.brand(m[2]); nav = "brands"; }
  else if (m && m[1] === "shoe" && db.shoesById[m[2]]) { html = pages.shoe(m[2]); nav = "shoes"; }
  else html = `${crumbs("Not found")}<h1 class="page-title">Page not found</h1><p class="lede"><a href="#">Back to home</a></p>`;
  app.innerHTML = html;
  document.querySelectorAll("[data-nav]").forEach(a => a.toggleAttribute("aria-current", a.dataset.nav === nav));
}

function refreshShoeResults() {
  const list = filteredShoes();
  document.getElementById("shoe-results").innerHTML = shoeGrid(list);
  app.querySelector(".count").textContent = plural(list.length, "shoe");
}

app.addEventListener("input", e => { if (e.target.id === "q") { ui.q = e.target.value; refreshShoeResults(); } });
app.addEventListener("click", e => {
  const b = e.target.closest(".seg button"); if (!b) return;
  ui[b.dataset.key] = b.dataset.v;
  b.parentElement.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", x === b));
  refreshShoeResults();
});
window.addEventListener("hashchange", () => { route(); window.scrollTo({ top: 0 }); });

Promise.all(["players", "shoes", "sightings", "sources"].map(f => fetch(`data/${f}.csv`).then(r => {
  if (!r.ok) throw new Error(`Couldn't load data/${f}.csv (${r.status})`);
  return r.text();
}).then(parseCSV))).then(([players, shoes, sightings, sources]) => {
  sources.forEach(x => (db.sources[`${x.entry_type}:${x.entry_id}`] ||= []).push(x));
  players.forEach(p => db.players[p.id] = p);
  db.shoes = shoes;
  shoes.forEach(s => { db.shoesById[s.id] = s; db.brands[slug(s.brand)] = s.brand; });
  db.sightings = sightings;
  // Team league: from players' current teams, else from the shoes and games that name it.
  const addTeam = (name, league) => {
    if (!name) return;
    const t = db.teams[slug(name)] ||= { name, league: "" };
    if (!t.league && league) t.league = league;
  };
  players.forEach(p => { addTeam(p.current_team, p.league); addTeam(p.school, "NCAA"); });
  sightings.forEach(g => addTeam(g.team_at_time, g.league));
  shoes.forEach(s => teamsOf(s).forEach(t => addTeam(t, t === s.team_at_release ? s.league : "")));
  route();
}).catch(err => {
  app.innerHTML = `<p class="empty">${esc(err.message)}. If you opened this file directly, run it through a local server or GitHub Pages instead.</p>`;
});
