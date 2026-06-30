import { kv } from '../lib/kv.js';
import { evaluateCurrentTrend } from '../lib/trendEngine.js';

const CURRENT_SEASON_YEAR = 2026;

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const watchlist = (await kv.get('watchlist')) || [];

  const results = await Promise.all(
    watchlist.map(async (playerId) => {
      const [player, gameLogs, transactions, contract] = await Promise.all([
        kv.get(`player:${playerId}`),
        kv.get(`gamelogs:${playerId}`).then((v) => v || []),
        kv.get(`transactions:${playerId}`).then((v) => v || []),
        kv.get(`contract:${playerId}`),
      ]);

      const trend = evaluateCurrentTrend(gameLogs, transactions);

      const finalYear = contract
        ? contract.contractExpiryYear <= CURRENT_SEASON_YEAR
        : false;

      return {
        playerId,
        playerName: player?.playerName ?? playerId,
        team: player?.fromTeam ?? player?.toTeam ?? null,
        finalYear,
        contractExpiryYear: contract?.contractExpiryYear ?? null,
        contractType: contract?.contractType ?? null,
        ...trend,
      };
    })
  );

  return res.status(200).json({
    updatedAt: new Date().toISOString(),
    players: results,
  });
}
