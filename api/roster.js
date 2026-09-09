// Current-season rosters, keyed by the same player id the stats file uses.
// This is what lets 2025 usage be matched against a 2026 team: A.J. Brown's
// target history is still his, but the team column has to come from here.
const KEEP = {
  pid:    ['gsis_id', 'player_id'],
  name:   ['full_name', 'player_name', 'player_display_name', 'football_name'],
  team:   ['team', 'recent_team', 'club_code'],
  pos:    ['position', 'position_group', 'depth_chart_position'],
  status: ['status'],
  week:   ['week'],
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
  if (!season) return res.status(400).json({ error: 'season required' });

  const urls = [
    `https://github.com/nflverse/nflverse-data/releases/download/weekly_rosters/roster_weekly_${season}.csv`,
    `https://github.com/nflverse/nflverse-data/releases/download/rosters/roster_${season}.csv`,
  ];

  let text = null, used = null;
  for (const u of urls) {
    try {
      const r = await fetch(u, { redirect: 'follow' });
      if (r.ok) { const t = await r.text(); if (t.length > 500) { text = t; used = u; break; } }
    } catch { /* next */ }
  }
  if (!text) return res.status(502).json({ error: 'no roster found for ' + season });

  const lines = text.split(/\r?\n/);
  const head = splitLine(lines[0]);
  const idx = {}, missing = [];
  for (const k in KEEP) {
    const hit = KEEP[k].find(a => head.includes(a));
    if (hit) idx[k] = head.indexOf(hit); else missing.push(k);
  }
  for (const need of ['pid', 'team']) {
    if (idx[need] == null)
      return res.status(500).json({ error: 'schema changed', missing: need, sawColumns: head.slice(0, 40) });
  }

  // Weekly rosters carry one row per player per week. Keep the latest week only,
  // so an in-season trade resolves to the player's current team.
  const latest = {};
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]) continue;
    const c = splitLine(lines[i]);
    const pid = c[idx.pid]; if (!pid) continue;
    const wk = idx.week != null ? parseInt(c[idx.week]) || 0 : 0;
    if (latest[pid] && latest[pid].wk >= wk) continue;
    latest[pid] = {
      wk,
      pid,
      name: idx.name != null ? c[idx.name] : '',
      team: c[idx.team],
      pos: idx.pos != null ? (c[idx.pos] || '').toUpperCase() : '',
      status: idx.status != null ? c[idx.status] : '',
    };
  }

  const rows = Object.values(latest).map(r => [r.pid, r.name, r.team, r.pos, r.status]);
  const esc = v => /[",\n]/.test(v || '') ? '"' + String(v).replace(/"/g, '""') + '"' : (v || '');
  const body = ['pid,name,team,pos,status']
    .concat(rows.map(r => r.map(esc).join(','))).join('\n');

  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('X-Source', used);
  res.setHeader('X-Players', String(rows.length));
  return res.status(200).send(body);
}
