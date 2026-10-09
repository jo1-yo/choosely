import { test } from "node:test";
import assert from "node:assert/strict";
import { DIMENSIONS, DEFAULT_WEIGHTS, normWeights, weightShares, calcScore, rankOpts } from "./scoring.js";

const rate = (fill, overrides = {}) => ({ ratings: { ...Object.fromEntries(DIMENSIONS.map(d => [d.id, fill])), ...overrides } });
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≠ ${b}`);

test("equal weights: hand-computed totals", () => {
  // 6 positive dims at 5 (=100 each), 2 inverse dims at 1 (=-20 each): (600 - 40) / 8 = 70
  assert.equal(calcScore(rate(5, { effortCost: 1, risk: 1 }), DEFAULT_WEIGHTS).total, 70);
  // everything 3 (=60): (6·60 − 2·60) / 8 = 30
  assert.equal(calcScore(rate(3), DEFAULT_WEIGHTS).total, 30);
  // worst case: positives at 1, inverses at 5: (6·20 − 2·100) / 8 = −10
  assert.equal(calcScore(rate(1, { effortCost: 5, risk: 5 }), DEFAULT_WEIGHTS).total, -10);
});

test("weights that don't add up to 100 give exactly the same scores (they are relative)", () => {
  const opt = rate(4, { urgency: 2, risk: 5, personalInterest: 1 });
  const a = { ...DEFAULT_WEIGHTS, urgency: 10 };                                   // raw sum 97.5
  const b = Object.fromEntries(Object.entries(a).map(([k, v]) => [k, v * 3.2]));  // raw sum 312
  assert.equal(calcScore(opt, a).total, calcScore(opt, b).total);
  const nw = normWeights(a);
  close(Object.values(nw).reduce((s, v) => s + v, 0), 1);
  close(nw.urgency, 10 / 97.5);
});

test("inverse dimensions lower the score: +1 effort point costs weight × 20", () => {
  const w = DEFAULT_WEIGHTS;
  const lo = calcScore(rate(3, { effortCost: 2 }), w).total;
  const hi = calcScore(rate(3, { effortCost: 3 }), w).total;
  close(lo - hi, (12.5 / 100) * 20); // 2.5 points
});

test("a single non-zero weight makes the score that dimension alone", () => {
  const w = Object.fromEntries(DIMENSIONS.map(d => [d.id, 0]));
  w.urgency = 7;
  assert.equal(calcScore(rate(1, { urgency: 4 }), w).total, 80);
  w.urgency = 0; w.risk = 7;
  assert.equal(calcScore(rate(1, { risk: 4 }), w).total, -80);
});

test("contributions add up to the total; top contributors are picked correctly", () => {
  const w = { ...DEFAULT_WEIGHTS, longTermImpact: 30, risk: 20 };
  const s = calcScore(rate(3, { longTermImpact: 5, personalInterest: 5, risk: 4, effortCost: 2 }), w);
  close(+s.breakdown.reduce((a, b) => a + b.contribution, 0).toFixed(1), +s.total.toFixed(1));
  assert.deepEqual(s.top2Pos.map(b => b.id), ["longTermImpact", "personalInterest"]);
  assert.deepEqual(s.top1Neg.map(b => b.id), ["risk"]); // the biggest drag, not the first negative
});

test("ranking: higher score first, ties share a rank", () => {
  const opts = [
    { id: "a", ...rate(3) },                      // 30
    { id: "b", ...rate(4) },                      // 40
    { id: "c", ...rate(3) },                      // 30 (ties a)
    { id: "d", ...rate(2) },                      // 20
  ];
  const r = rankOpts(opts, DEFAULT_WEIGHTS);
  assert.deepEqual(r.map(o => [o.id, o.rank]), [["b", 1], ["a", 2], ["c", 2], ["d", 4]]);
  const tieTop = rankOpts([{ id: "x", ...rate(3) }, { id: "y", ...rate(3) }], DEFAULT_WEIGHTS);
  assert.deepEqual(tieTop.map(o => o.rank), [1, 1]);
});

test("displayed weight shares are the weights actually used, rounded to 0.1%", () => {
  const cases = [
    DEFAULT_WEIGHTS,
    { ...DEFAULT_WEIGHTS, urgency: 10 },
    { ...DEFAULT_WEIGHTS, longTermImpact: 50 },
    { ...DEFAULT_WEIGHTS, urgency: 0, risk: 33.5, optionality: 7 },
  ];
  for (const w of cases) {
    const s = weightShares(w);
    const nw = normWeights(w);
    for (const k in s) assert.ok(Math.abs(s[k] - nw[k] * 100) <= 0.05 + 1e-9, `${k}: ${s[k]} vs ${nw[k] * 100}`);
    const sum = Object.values(s).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - 100) <= 0.4 + 1e-9, `sum ${sum}`);
  }
  assert.deepEqual(Object.values(weightShares(DEFAULT_WEIGHTS)), Array(8).fill(12.5));
  // the screenshot case: Urgency dragged to 10, everything else 12.5
  const s = weightShares({ ...DEFAULT_WEIGHTS, urgency: 10 });
  assert.equal(s.urgency, 10.3);
  assert.ok(Object.entries(s).filter(([k]) => k !== "urgency").every(([, v]) => v === 12.8)); // equal sliders → equal numbers
});

test("all-zero weights score everything 0 (the UI blocks this case)", () => {
  const zero = Object.fromEntries(DIMENSIONS.map(d => [d.id, 0]));
  assert.equal(calcScore(rate(5), zero).total, 0);
  assert.ok(Object.values(weightShares(zero)).every(v => v === 0));
});
