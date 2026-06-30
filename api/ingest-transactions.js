import { kv } from '../lib/kv.js';

const VALID_TYPES = new Set([
  'IR_PLACED', 'IR_RETURNED', 'LTIR_PLACED', 'LTIR_RETURNED',
]);

function isValidTransaction(t) {
  return typeof t.date === 'string' && VALID_TYPES.has(t.type);
}

function isValidPayload(body) {
  return (
    typeof body.playerId === 'string' &&
    Array.isArray(body.transactions) &&
    body.transactions.every(isValidTransaction)
  );
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const records = Array.isArray(req.body) ? req.body : [req.body];
  const invalid = records.filter((r) => !isValidPayload(r));
  if (invalid.length > 0) {
    return res.status(400).json({ error: 'Invalid transaction record(s)', invalid });
  }

  await Promise.all(
    records.map((record) =>
      kv.set(`transactions:${record.playerId}`, record.transactions)
    )
  );

  return res.status(200).json({ ingested: records.length });
}
