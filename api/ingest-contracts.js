import { kv } from '../lib/kv.js';

function isValidContract(record) {
  return (
    typeof record.playerId === 'string' &&
    typeof record.playerName === 'string' &&
    typeof record.contractExpiryYear === 'number' &&
    typeof record.contractType === 'string'
  );
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const records = Array.isArray(req.body) ? req.body : [req.body];
  const invalid = records.filter((r) => !isValidContract(r));
  if (invalid.length > 0) {
    return res.status(400).json({ error: 'Invalid contract record(s)', invalid });
  }

  await Promise.all(
    records.map((record) =>
      kv.set(`contract:${record.playerId}`, record)
    )
  );

  return res.status(200).json({ ingested: records.length });
}
