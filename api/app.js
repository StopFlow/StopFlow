export default async function handler(req, res) {
  const source = 'https://raw.githubusercontent.com/StopFlow/StopFlow/stopflow-dev/index.html';
  try {
    const response = await fetch(source, { cache: 'no-store', headers: { 'User-Agent': 'StopFlow-Vercel' } });
    if (!response.ok) throw new Error(`GitHub ${response.status}`);
    const html = await response.text();
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, no-cache, max-age=0, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('X-StopFlow-Entry', 'github-stopflow-dev');
    return res.status(200).send(html);
  } catch (error) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).send(`StopFlow indisponible : ${error.message}`);
  }
}
