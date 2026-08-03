export default async function handler(req, res) {
  const source = 'https://raw.githubusercontent.com/StopFlow/StopFlow/fa8f348aabfa159d1d036a56baf362cda4af0419/index.html';
  try {
    const response = await fetch(source, {
      cache: 'no-store',
      headers: {
        'User-Agent': 'StopFlow-Vercel',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      }
    });
    if (!response.ok) throw new Error(`GitHub ${response.status}`);
    const html = await response.text();
    if (!html.includes('Version 0.11.2 test — architecture et checklists')) {
      throw new Error('La page source ne correspond pas à StopFlow 0.11.2');
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, no-cache, max-age=0, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('X-StopFlow-Entry', 'commit-fa8f348-0.11.2');
    return res.status(200).send(html);
  } catch (error) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).send(`StopFlow indisponible : ${error.message}`);
  }
}
