/* ═══════════════════════════════════════════════════════════════════════════
   DIMENSIONS + SCORING ENGINE (pure functions, covered by scoring.test.js)
   ═══════════════════════════════════════════════════════════════════════════ */

export const DIMENSIONS = [
  {
    id: "longTermImpact",
    en: "Long-term Impact", zh: "长期收益", negative: false,
    descEn: "How much compounding value will this create in 3–5 years? Higher score = greater long-term payoff.",
    descZh: "这个选择在 3–5 年后能带来多大的复利回报？分数越高 = 长期收益越大。",
  },
  {
    id: "urgency",
    en: "Urgency", zh: "时间窗口", negative: false,
    descEn: "How time-sensitive is this opportunity? Higher score = narrower window, must act soon.",
    descZh: "这个机会窗口有多紧迫？分数越高 = 时间越紧迫，越需要尽快行动。",
  },
  {
    id: "effortCost",
    en: "Effort Cost", zh: "投入成本", negative: true,
    descEn: "How much time, energy, and resources does it require? Higher score = more costly. This is an inverse metric — higher scores reduce the total.",
    descZh: "需要投入多少时间、精力和资源？分数越高 = 成本越大。此为逆向指标，评分越高总分越低。",
  },
  {
    id: "successProbability",
    en: "Success Probability", zh: "成功概率", negative: false,
    descEn: "Given your current skills and resources, how likely is success? Higher score = better odds.",
    descZh: "以你现有的能力和资源，成功的可能性有多大？分数越高 = 成功概率越大。",
  },
  {
    id: "personalInterest",
    en: "Personal Interest", zh: "内在热情", negative: false,
    descEn: "How much genuine passion and curiosity do you feel? Higher score = stronger intrinsic motivation.",
    descZh: "你对这件事有多大的热情和好奇心？分数越高 = 内在动力越强。",
  },
  {
    id: "optionality",
    en: "Optionality", zh: "可逆性", negative: false,
    descEn: "Can you reverse course if it doesn't work out? Higher score = more flexibility preserved.",
    descZh: "如果走错了还能回头吗？分数越高 = 保留的灵活性越大。",
  },
  {
    id: "strategicLeverage",
    en: "Strategic Leverage", zh: "战略杠杆", negative: false,
    descEn: "Does this unlock more opportunities — new networks, skills, or domains? Higher score = greater leverage.",
    descZh: "是否能撬动更多机会？比如打开新人脉、解锁新能力、进入新领域。分数越高 = 杠杆越大。",
  },
  {
    id: "risk",
    en: "Risk Level", zh: "风险程度", negative: true,
    descEn: "How bad is the worst-case scenario? Can you absorb failure? Higher score = greater risk. This is an inverse metric — higher scores reduce the total.",
    descZh: "最坏情况有多糟？你能承受失败的代价吗？分数越高 = 风险越大。此为逆向指标，评分越高总分越低。",
  },
];

export const DEFAULT_WEIGHTS = Object.fromEntries(DIMENSIONS.map(d => [d.id, 12.5]));
export const EMPTY_RATINGS = Object.fromEntries(DIMENSIONS.map(d => [d.id, 0]));

// Weights are relative: only each weight's share of the sum matters.
export function normWeights(w) {
  const t = Object.values(w).reduce((a, b) => a + b, 0);
  if (!t) return w;
  const r = {};
  for (const k in w) r[k] = w[k] / t;
  return r;
}

// Each dimension's share of the total, in percent, rounded to 0.1. Rounded independently so
// equal sliders always show equal numbers (the displayed values may add up to 99.9–100.1).
export function weightShares(w) {
  const t = Object.values(w).reduce((a, b) => a + b, 0);
  return Object.fromEntries(Object.entries(w).map(([k, v]) => [k, t ? Math.round((v / t) * 1000) / 10 : 0]));
}

// total = Σ normalizedWeight[d] × (±rating[d] × 20); inverse dimensions subtract.
export function calcScore(opt, weights) {
  const nw = normWeights(weights);
  const bd = [];
  let total = 0;
  for (const d of DIMENSIONS) {
    const raw = opt.ratings[d.id] || 0;
    const norm = raw * 20;
    const eff = d.negative ? -norm : norm;
    const w = nw[d.id] || 0;
    const c = w * eff;
    total += c;
    bd.push({ ...d, raw, norm, weight: w * 100, contribution: +c.toFixed(2) });
  }
  bd.sort((a, b) => b.contribution - a.contribution);
  return { total: +total.toFixed(2), breakdown: bd, top2Pos: bd.filter(b => b.contribution > 0).slice(0, 2), top1Neg: bd.filter(b => b.contribution < 0).slice(-1) };
}

// Highest score first. Equal scores share a rank (1, 1, 3), so a tie is never shown as #1 vs #2.
export function rankOpts(options, weights) {
  const sc = options.map(o => ({ ...o, score: calcScore(o, weights) }));
  sc.sort((a, b) => b.score.total - a.score.total);
  let rank = 0;
  return sc.map((o, i) => {
    if (i === 0 || o.score.total !== sc[i - 1].score.total) rank = i + 1;
    return { ...o, rank };
  });
}
