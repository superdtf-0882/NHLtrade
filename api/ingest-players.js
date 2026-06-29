import { kv } from '../lib/kv.js';

const REQUIRED_FIELDS = ['playerId', 'playerName', 'tradeDate', 'fromTeam', 'toTeam', 'season'];

function isValidPlayer(record) {
  return REQUIRED_FIELDS.every((field) => typeof record[field] === 'string' && record[field].length > 0);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const records = Array.isArray(req.body) ? req.body : [req.body];
  const invalid = records.filter((r) => !isValidPlayer(r));
  if (invalid.length > 0) {
    return res.status(400).json({ error: 'Invalid player record(s)', invalid });
  }

  await Promise.all(
    records.map((record) => kv.set(`player:${record.playerId}`, record))
  );

  return res.status(200).json({ ingested: records.length });
}
