// Schedule from nflverse rather than ESPN. Two reasons: it covers future
// seasons, and its team codes are identical to the stats file's. ESPN uses
// LAR/WSH where nflverse uses LA/WAS, so an ESPN schedule silently drops
// every Rams and Commanders player from the board.
const KEEP = {
  season: ['season'],
  week:   ['week'],
  away:   ['away_team', 'away'],
  home:   ['home_team', 'home'],
  type:   ['game_type', 'season_type'],
};

function splitLine(l) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < l.length; i++) {
    const ch = l[i];
    if (ch === '"') { q = !q; continue; }
    if (ch === ',' && !q) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur); return out;
}

export default async function handler(req, res) {
  const season = String(req.query.season || '').replace(/\D/g, '');
  const week = String(req.query.week || '').replace(/\D/g, '');
  if (!season || !week) return res.status(400).json({ error: 'season and week required' });

  const urls = [
    'https://github.com/nflverse/nflverse-data/releases/download/schedules/games.csv',
    'https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv',
  ];

  let text = null, used = null;
  for (const u of urls) {
    try {
      const r = await fetch(u, { redirect: 'follow' });
      if (r.ok) { const t = await r.text(); if (t.length > 500) { text = t; used = u; break; } }
    } catch { /* next */ }
  }
  if (!text) return res.status(502).json({ error: 'could not fetch schedule' });

  const lines = text.split(/\r?\n/);
  const head = splitLine(lines[0]);
  const idx = {};
  for (const k in KEEP) {
    const hit = KEEP[k].find(a => head.includes(a));
    if (hit) idx[k] = head.indexOf(hit);
  }
  for (const need of ['season', 'week', 'away', 'home']) {
    if (idx[need] == null)
      return res.status(500).json({ error: 'schema changed', missing: need, sawColumns: head.slice(0, 30) });
  }

  const games = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]) continue;
    const c = splitLine(lines[i]);
    if (c[idx.season] !== season) continue;
    if (String(parseInt(c[idx.week])) !== String(parseInt(week))) continue;
    if (idx.type != null && c[idx.type] && !['REG', 'reg'].includes(c[idx.type])) continue;
    const a = c[idx.away], h = c[idx.home];
    if (a && h) games.push([a, h]);
  }

  if (!games.length)
    return res.status(404).json({ error: `no games for ${season} week ${week}`, source: used });

  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
  res.setHeader('X-Source', used);
  return res.status(200).json({ season, week, source: used, games });
}
