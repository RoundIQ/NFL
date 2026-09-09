// Fetches the nflverse weekly player stats CSV, throws away the ~135 columns
// this tool never touches, and returns compact JSON. Turns a ~25MB download
// and a few seconds of browser parsing into a small, instant one.
const KEEP = {
  player: ['player_display_name', 'player_name', 'full_name'],
  pos:    ['position_group', 'position'],
  team:   ['team', 'recent_team'],
  opp:    ['opponent_team', 'opponent'],
  season: ['season'],
  week:   ['week'],
  stype:  ['season_type'],
  targets:['targets'],
  recyd:  ['receiving_yards'],
  rec:    ['receptions'],
  carries:['carries', 'rushing_attempts'],
  rushyd: ['rushing_yards'],
  atts:   ['attempts', 'passing_attempts'],
  passyd: ['passing_yards'],
};
const POS = new Set(['WR', 'TE', 'RB', 'QB']);

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
    `https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_${season}.csv`,
    `https://github.com/nflverse/nflverse-data/releases/download/player_stats/player_stats_${season}.csv`,
  ];

  let text = null, used = null;
  for (const u of urls) {
    try {
      const r = await fetch(u, { redirect: 'follow' });
      if (r.ok) { const t = await r.text(); if (t.length > 500) { text = t; used = u; break; } }
    } catch { /* try the next candidate */ }
  }
  if (!text) return res.status(502).json({ error: 'could not fetch stats for ' + season });

  const lines = text.split(/\r?\n/);
  const head = splitLine(lines[0]);
  const idx = {}, missing = [];
  for (const k in KEEP) {
    const hit = KEEP[k].find(a => head.includes(a));
    if (hit) idx[k] = head.indexOf(hit); else missing.push(k);
  }
  const required = ['player', 'pos', 'team', 'opp', 'week'];
  const hard = missing.filter(m => required.includes(m));
  if (hard.length)
    return res.status(500).json({ error: 'schema changed', missing: hard, sawColumns: head.slice(0, 40) });

  const cols = Object.keys(idx);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]) continue;
    const c = splitLine(lines[i]);
    const pos = (c[idx.pos] || '').toUpperCase();
    if (!POS.has(pos)) continue;
    if (idx.stype != null && c[idx.stype] && c[idx.stype].toUpperCase() !== 'REG') continue;
    rows.push(cols.map(k => c[idx[k]] ?? ''));
  }

  // Emit trimmed CSV rather than JSON: roughly half the bytes for the same
  // data, and the client already parses CSV for the manual-upload path.
  const esc = v => /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  const body = [cols.join(',')].concat(rows.map(r => r.map(esc).join(','))).join('\n');

  res.setHeader('Cache-Control', 's-maxage=21600, stale-while-revalidate=604800');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('X-Source', used);
  res.setHeader('X-Rows', String(rows.length));
  res.setHeader('X-Dropped-Columns', String(head.length - cols.length));
  return res.status(200).send(body);
}
