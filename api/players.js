import { kv } from '../lib/kv.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const keys = await kv.keys('player:*');
  const players = await Promise.all(keys.map((key) => kv.get(key)));

  const traded = players
    .filter((p) => p && p.tradeDate)
    .sort((a, b) => new Date(b.tradeDate) - new Date(a.tradeDate));

  return res.status(200).json({ players: traded });
}
