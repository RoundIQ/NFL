// Allowlisted read-only proxy. Server-side fetches are not subject to CORS,
// which is what makes the browser calls in the app work reliably.
const ALLOWED = [
  'github.com',
  'objects.githubusercontent.com',      // GitHub release downloads redirect here
  'release-assets.githubusercontent.com',
  'raw.githubusercontent.com',
  'site.api.espn.com',
];

export default async function handler(req, res) {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'missing url' });

  let target;
  try { target = new URL(url); }
  catch { return res.status(400).json({ error: 'malformed url' }); }

  if (target.protocol !== 'https:')
    return res.status(400).json({ error: 'https only' });

  // Match the host exactly or as a subdomain. A bare `endsWith` would let
  // evil-github.com through, which is how open proxies get abused.
  const ok = ALLOWED.some(d => target.hostname === d || target.hostname.endsWith('.' + d));
  if (!ok) return res.status(403).json({ error: 'host not allowed', host: target.hostname });

  try {
    const r = await fetch(target.toString(), { redirect: 'follow' });
    const body = await r.text();
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    res.setHeader('Content-Type', r.headers.get('content-type') || 'text/plain');
    return res.status(r.status).send(body);
  } catch (e) {
    return res.status(502).json({ error: 'upstream failed', detail: String(e) });
  }
}
