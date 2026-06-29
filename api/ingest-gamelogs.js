import { kv } from '../lib/kv.js';

function isValidGameLog(record) {
  return (
    typeof record.playerId === 'string' &&
    typeof record.gameDate === 'string' &&
    typeof record.season === 'string' &&
    typeof record.gameId !== 'undefined' &&
    typeof record.toiSeconds === 'number' &&
    typeof record.ppPoints === 'number' &&
    typeof record.shots === 'number'
  );
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const incoming = Array.isArray(req.body) ? req.body : [req.body];
  const invalid = incoming.filter((r) => !isValidGameLog(r));
  if (invalid.length > 0) {
    return res.status(400).json({ error: 'Invalid game log record(s)', invalid });
  }

  const byPlayer = new Map();
  for (const log of incoming) {
    if (!byPlayer.has(log.playerId)) byPlayer.set(log.playerId, []);
    byPlayer.get(log.playerId).push(log);
  }

  let totalStored = 0;

  for (const [playerId, newLogs] of byPlayer) {
    const key = `gamelogs:${playerId}`;
    const existing = (await kv.get(key)) || [];

    const merged = new Map(existing.map((g) => [g.gameId, g]));
    for (const log of newLogs) merged.set(log.gameId, log);

    const deduped = [...merged.values()].sort(
      (a, b) => new Date(b.gameDate) - new Date(a.gameDate)
    );

    await kv.set(key, deduped);
    totalStored += newLogs.length;
  }

  return res.status(200).json({ ingested: totalStored, players: byPlayer.size });
}
