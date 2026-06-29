import { kv } from '../lib/kv.js';
import { evaluateTradeBump } from '../lib/trendEngine.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { playerId } = req.query;
  if (!playerId) {
    return res.status(400).json({ error: 'playerId query param is required' });
  }

  const player = await kv.get(`player:${playerId}`);
  if (!player) {
    return res.status(404).json({ error: `No player found for id ${playerId}` });
  }

  const gameLogs = (await kv.get(`gamelogs:${playerId}`)) || [];
  const trend = evaluateTradeBump(gameLogs, player.tradeDate);

  const analysis = {
    playerId,
    player,
    ...trend,
    gameLogs,
    computedAt: new Date().toISOString(),
  };

  await kv.set(`analysis:${playerId}`, analysis);

  return res.status(200).json(analysis);
}
