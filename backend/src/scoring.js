// Signal scoring system (0..100). A signal must clear a configurable threshold
// (default 70) to be eligible for a (paper or live) trade. Returns the score plus
// the human-readable factors for/against, so the UI can explain every decision.

export const SCORE_THRESHOLD = 70;

export function scoreSignal(sig, md) {
  if (!sig || sig.type === 'NO_TRADE') {
    return { score: 0, supporting: [], warning: [sig?.rejectionReason || 'No trade'], approved: false, threshold: SCORE_THRESHOLD };
  }

  const supporting = [];
  const warning = [];
  let score = 40; // neutral base

  // 1. Risk-reward
  if (sig.riskReward >= 2) {
    score += 18;
    supporting.push(`Risk-reward ${sig.riskReward}:1 (≥ 2:1)`);
  } else if (sig.riskReward >= 1.5) {
    score += 8;
    warning.push(`Risk-reward ${sig.riskReward}:1 below preferred 2:1`);
  } else {
    score -= 10;
    warning.push(`Weak risk-reward ${sig.riskReward}:1`);
  }

  // 2. Strategy confidence
  score += Math.round((sig.confidence - 50) * 0.3);
  if (sig.confidence >= 65) supporting.push(`Strategy confidence ${sig.confidence}`);
  else if (sig.confidence < 45) warning.push(`Low strategy confidence ${sig.confidence}`);

  // 3. Distance from VWAP (over-extension penalty)
  const dist = Math.abs(sig.distFromVwapPct ?? 0);
  if (dist <= 0.5) {
    score += 8;
    supporting.push(`Close to VWAP (${dist.toFixed(2)}%)`);
  } else if (dist > 1.5) {
    score -= 12;
    warning.push(`Over-extended from VWAP (${dist.toFixed(2)}%)`);
  }

  // 4. Volume confirmation
  if (sig.relVolume != null) {
    if (sig.relVolume >= 1.5) {
      score += 10;
      supporting.push(`Strong volume ${sig.relVolume}x`);
    } else if (sig.relVolume < 1.1) {
      score -= 8;
      warning.push(`Thin volume ${sig.relVolume}x`);
    }
  }

  // 5. Trend alignment with the recent series
  if (md && md.closes && md.closes.length > 5) {
    const slope = md.closes[md.closes.length - 1] - md.closes[md.closes.length - 6];
    const longBias = sig.type === 'BUY' && slope > 0;
    const shortBias = sig.type === 'SHORT' && slope < 0;
    if (longBias || shortBias) {
      score += 8;
      supporting.push('Aligned with short-term trend');
    } else {
      score -= 6;
      warning.push('Against short-term trend');
    }
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  return { score, supporting, warning, approved: score >= SCORE_THRESHOLD, threshold: SCORE_THRESHOLD };
}
