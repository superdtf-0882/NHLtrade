// Composite "showcase signal": the original hypothesis (powerplay-TOI bump
// before a trade) can't be measured from the public NHL API, which doesn't
// expose per-game PP TOI for skaters. Instead this blends three metrics that
// the API does expose and that, validated against real 2023-24 trades, move
// meaningfully in the weeks before a trade:
//   - powerPlayPoints trend (50%): direct evidence of an increased PP role
//   - shots trend (25%): increased offensive deployment/confidence
//   - total TOI trend (25%): overall ice-time bump
// See docs/celigo-flows.md for the data-availability writeup.
const WINDOW_SIZE = 15;
const BASELINE_SIZE = 20;
const MIN_WINDOW_GAMES = 5;
const MIN_BASELINE_GAMES = 5;
const FLAG_THRESHOLD = 30;
const PCT_CLAMP_MIN = -100;
const PCT_CLAMP_MAX = 200;

const WEIGHTS = {
  ppPointsPct: 0.5,
  shotsPct: 0.25,
  toiPct: 0.25,
};

function average(games, key) {
  return games.reduce((sum, g) => sum + g[key], 0) / games.length;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function metricTrend(windowGames, baselineGames, key) {
  const windowAvg = average(windowGames, key);
  const baselineAvg = average(baselineGames, key);
  const pct = baselineAvg > 0
    ? ((windowAvg - baselineAvg) / baselineAvg) * 100
    : (windowAvg > 0 ? PCT_CLAMP_MAX : 0);

  return {
    windowAvg: Math.round(windowAvg * 10) / 10,
    baselineAvg: Math.round(baselineAvg * 10) / 10,
    pct: Math.round(clamp(pct, PCT_CLAMP_MIN, PCT_CLAMP_MAX) * 10) / 10,
  };
}

function buildResult(windowGames, baselineGames) {
  if (windowGames.length < MIN_WINDOW_GAMES || baselineGames.length < MIN_BASELINE_GAMES) {
    return { valid: false, reason: 'Insufficient game data' };
  }

  const toi = metricTrend(windowGames, baselineGames, 'toiSeconds');
  const ppPoints = metricTrend(windowGames, baselineGames, 'ppPoints');
  const shots = metricTrend(windowGames, baselineGames, 'shots');

  const composite = Math.round(
    (ppPoints.pct * WEIGHTS.ppPointsPct + shots.pct * WEIGHTS.shotsPct + toi.pct * WEIGHTS.toiPct) * 10
  ) / 10;

  return {
    valid: true,
    composite,
    flagged: composite > FLAG_THRESHOLD,
    metrics: { toi, ppPoints, shots },
    windowGames: windowGames.length,
    baselineGames: baselineGames.length,
  };
}

// Historical validation: compares the window of games immediately before a
// known trade date against the baseline period before that window.
export function evaluateTradeBump(gameLogs, tradeDate) {
  const sorted = [...gameLogs].sort((a, b) => new Date(a.gameDate) - new Date(b.gameDate));
  const preTrade = sorted.filter((g) => g.gameDate < tradeDate);
  const recent = [...preTrade].reverse();

  const windowGames = recent.slice(0, WINDOW_SIZE);
  const baselineGames = recent.slice(WINDOW_SIZE, WINDOW_SIZE + BASELINE_SIZE);

  return buildResult(windowGames, baselineGames);
}

// Live watchlist: no trade date exists yet, so the window is simply the most
// recent games of the current season compared against the games before that.
export function evaluateCurrentTrend(gameLogs) {
  const sorted = [...gameLogs].sort((a, b) => new Date(a.gameDate) - new Date(b.gameDate));
  const recent = [...sorted].reverse();

  const windowGames = recent.slice(0, WINDOW_SIZE);
  const baselineGames = recent.slice(WINDOW_SIZE, WINDOW_SIZE + BASELINE_SIZE);

  return buildResult(windowGames, baselineGames);
}
