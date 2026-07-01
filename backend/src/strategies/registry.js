// Strategy registry — the catalogue the API exposes and the engine iterates.
//
// To add a strategy: create a module under strategies/ exporting the contract
// (see base.js) and register it here.

import momentum from './momentum.js';
import orb from './orb.js';
import vwap from './vwap.js';
import breakout from './breakout.js';
import maCrossover from './ma_crossover.js';
import meanReversion from './mean_reversion.js';
import gapAndGo from './gap_and_go.js';
import ohl from './ohl.js';
import pullback from './pullback.js';
import pivot from './pivot.js';

const STRATEGIES = new Map();
const ENABLED = new Set();

function register(strat) {
  STRATEGIES.set(strat.name, strat);
  ENABLED.add(strat.name); // enabled by default; signals are still paper-gated
}

register(momentum);
register(orb);
register(vwap);
register(breakout);
register(maCrossover);
register(meanReversion);
register(gapAndGo);
register(ohl);
register(pullback);
register(pivot);

export function getStrategy(name) {
  return STRATEGIES.get(name) || null;
}

export function listStrategies() {
  return [...STRATEGIES.values()].map((s) => ({
    name: s.name,
    timeframe: s.timeframe,
    indicators: s.indicators,
    enabled: ENABLED.has(s.name),
  }));
}

export function setEnabled(name, enabled) {
  if (!STRATEGIES.has(name)) return false;
  if (enabled) ENABLED.add(name);
  else ENABLED.delete(name);
  return true;
}

export function isEnabled(name) {
  return ENABLED.has(name);
}
