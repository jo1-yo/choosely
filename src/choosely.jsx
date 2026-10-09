import { useState, useMemo, useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { DIMENSIONS, DEFAULT_WEIGHTS, EMPTY_RATINGS, weightShares, rankOpts } from "./scoring";
import { track, setContext } from "./analytics";

const STORAGE_KEY = "choosely:v1";
const STEP_KEYS = ["options", "rate", "weight", "results"];

/* ═══════════════════════════════════════════════════════════════════════════
   I18N
   ═══════════════════════════════════════════════════════════════════════════ */

const i18n = {
  en: {
    brand: "Choosely",
    tagline: [
      "List the options you're deciding between",
      "Rate each option across key dimensions",
      "Adjust how much each dimension matters to you",
      "Your structured, explainable ranking",
    ],
    stepLabels: ["Options", "Rate", "Weight", "Results"],
    optionsTitle: "What are you choosing between?",
    optionsSubtitle: "Add at least 2 mutually exclusive options",
    addOption: "+ Add option",
    optionPlaceholder: "Option name",
    descPlaceholder: "Brief description...",
    rateTitle: "Rate each option",
    rateSubtitle: "Score 1–5 on each dimension",
    unrated: "—",
    prev: "Previous",
    next: "Next",
    prevStep: "Back",
    nextStep: "Continue",
    restart: "Start over",
    weightsTitle: "Dimension weights",
    weightsSubtitle: "Drag to adjust how important each dimension is to this particular decision",
    weightTotal: "total",
    resetWeights: "Reset to equal",
    resultsTitle: "Results",
    resultsSubtitle: "Structured ranking based on your ratings and weight preferences",
    overview: "Score overview",
    recommended: "Top pick",
    contribution: "Dimension contribution",
    details: "Dimension details",
    optionProgress: "Option",
    totalProgress: "Overall progress",
    allDone: "All rated",
    of: "of",
    langSwitch: "中文",
    nameMore: (n) => `Name ${n} more option${n > 1 ? "s" : ""} to continue`,
    rateMore: (n) => `Rate ${n} more to continue`,
    weightNone: () => "Give at least one dimension a weight above 0",
    privacy: "Your options and notes stay on your device. We only record anonymous usage (like which step you reach) to improve Choosely.",
  },
  zh: {
    brand: "Choosely",
    tagline: [
      "列出你正在纠结的选项",
      "在每个维度上为选项打分",
      "调整各维度对于你这个决定的重要性",
      "基于你的偏好，得出结构化排序",
    ],
    stepLabels: ["选项", "打分", "权重", "结果"],
    optionsTitle: "你在纠结哪些选项？",
    optionsSubtitle: "至少添加 2 个互斥的选项",
    addOption: "+ 添加选项",
    optionPlaceholder: "选项名称",
    descPlaceholder: "简短描述...",
    rateTitle: "为每个选项打分",
    rateSubtitle: "在 8 个维度上评分（1–5）",
    unrated: "未评",
    prev: "上一个",
    next: "下一个",
    prevStep: "上一步",
    nextStep: "下一步",
    restart: "重新开始",
    weightsTitle: "维度权重",
    weightsSubtitle: "拖动调整各维度对于你这个决定的重要性",
    weightTotal: "总权重",
    resetWeights: "重置为平均",
    resultsTitle: "分析结果",
    resultsSubtitle: "基于你的评分和权重偏好，以下是结构化排序",
    overview: "综合得分概览",
    recommended: "推荐",
    contribution: "维度贡献",
    details: "维度详情",
    optionProgress: "选项",
    totalProgress: "总进度",
    allDone: "全部完成",
    of: "/",
    langSwitch: "EN",
    nameMore: (n) => `还有 ${n} 个选项没填名称`,
    rateMore: (n) => `还差 ${n} 项评分才能继续`,
    weightNone: () => "至少给一个维度分配权重",
    privacy: "你填写的选项和备注只保存在本机，不会上传。我们只记录匿名的使用情况（比如走到了哪一步）用来改进产品。",
  },
};

const DEMO = [
  { id: "1", title: "Join an early-stage startup", titleZh: "加入早期创业公司", desc: "AI startup as technical co-founder", descZh: "朋友的 AI 初创，担任技术合伙人", ratings: { ...EMPTY_RATINGS } },
  { id: "2", title: "Stay and get promoted", titleZh: "留在大厂晋升", desc: "Push for Staff Engineer within 1 year", descZh: "冲刺 Staff Engineer，预计 1 年内", ratings: { ...EMPTY_RATINGS } },
  { id: "3", title: "Full-time MBA", titleZh: "全职读 MBA", desc: "Top 10 MBA, pivot to management", descZh: "Top 10 MBA，转型管理方向", ratings: { ...EMPTY_RATINGS } },
  { id: "4", title: "Gap year travel", titleZh: "Gap Year 旅行", desc: "Take a year off to reset", descZh: "休息一年，重新思考方向", ratings: { ...EMPTY_RATINGS } },
];

/* ═══════════════════════════════════════════════════════════════════════════
   STATE HELPERS (persistence + step gating)
   ═══════════════════════════════════════════════════════════════════════════ */

const isComplete = (o) => DIMENSIONS.every(d => o.ratings[d.id] > 0);
const num = (v, lo, hi, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
};

// Furthest step the user may be on given their answers (used for Back/Forward and restore).
function reachableStep(options, weights) {
  if (options.length < 2 || options.some(o => !o.title.trim())) return 0;
  if (!options.every(isComplete)) return 1;
  if (!(Object.values(weights).reduce((a, b) => a + b, 0) > 0)) return 2;
  return 3;
}

// Progress is kept in localStorage so a refresh or an in-app-browser reload doesn't wipe 30+ ratings.
function loadInitial() {
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (s && Array.isArray(s.options) && s.options.length >= 2) {
      const str = (v) => (typeof v === "string" ? v : "");
      const options = s.options.map((o, i) => ({
        id: str(o.id) || `saved-${i}`,
        title: str(o.title), titleZh: str(o.titleZh), desc: str(o.desc), descZh: str(o.descZh),
        ratings: Object.fromEntries(DIMENSIONS.map(d => [d.id, Math.round(num(o.ratings?.[d.id], 0, 5, 0))])),
      }));
      const weights = Object.fromEntries(DIMENSIONS.map(d => [d.id, num(s.weights?.[d.id], 0, 50, 12.5)]));
      return {
        lang: s.lang === "zh" ? "zh" : "en",
        options,
        weights,
        step: Math.min(Math.round(num(s.step, 0, 3, 0)), reachableStep(options, weights)),
        ratingTab: Math.min(Math.round(num(s.ratingTab, 0, 99, 0)), options.length - 1),
      };
    }
  } catch { /* storage unavailable or corrupt — start fresh */ }
  return { lang: "en", options: DEMO, weights: DEFAULT_WEIGHTS, step: 0, ratingTab: 0 };
}

function genSummary(opt, s, lang) {
  const name = (d) => lang === "zh" ? d.zh : d.en;
  const pos = s.top2Pos.map(p => name(p)).join(lang === "zh" ? "与" : " and ");
  const neg = s.top1Neg.length ? name(s.top1Neg[0]) : null;
  if (lang === "zh") {
    if (s.total > 20) return `综合表现优秀，${pos}是主要驱动力。${neg ? `留意${neg}的影响。` : ""}`;
    if (s.total > 0) return `整体中等偏上，${pos}贡献较大${neg ? `，${neg}需要关注` : ""}。`;
    return `综合评分偏低${neg ? `，${neg}是主要拖累` : ""}。建议审慎考量。`;
  }
  if (s.total > 20) return `Strong overall performance driven by ${pos}.${neg ? ` Watch out for ${neg}.` : ""}`;
  if (s.total > 0) return `Moderate performance. ${pos} contribute positively${neg ? `, but ${neg} needs attention` : ""}.`;
  return `Overall score is low${neg ? ` — ${neg} is the main drag` : ""}. Consider carefully.`;
}

/* ═══════════════════════════════════════════════════════════════════════════
   STYLES
   ═══════════════════════════════════════════════════════════════════════════ */

// Fonts are loaded from index.html (non-blocking) instead of an @import here.
const GLOBAL_CSS = `
*{box-sizing:border-box;margin:0;padding:0}
:root {
  --bg: #FFFFFF;
  --surface: #FFFFFF;
  --fill-secondary: #F3F4F6;
  --border: #E5E7EB;
  --border-hover: #2563EB;
  --text-primary: #111827;
  --text-heading: #020617;
  --text-secondary: #4B5563;
  --text-tertiary: #6B7280;
  --text-quaternary: #9CA3AF;
  --accent: #2563EB;
  --accent-light: rgba(37,99,235,.14);
  --accent-lighter: rgba(37,99,235,.08);
  --positive: #16A34A;
  --positive-bg: rgba(22,163,74,.1);
  --caution: #CA8A04;
  --caution-bg: rgba(202,138,4,.1);
  --caution-border: rgba(202,138,4,.28);
  --shadow-md: 0 1px 3px rgba(0,0,0,.06), 0 1px 2px rgba(0,0,0,.04);
  --shadow-lg: 0 12px 40px rgba(0,0,0,.08), 0 4px 12px rgba(0,0,0,.05);
  --radius: 16px; --radius-sm: 10px; --radius-xs: 8px;
  --font: 'Inter', 'Noto Sans SC', -apple-system, sans-serif;
  --ease: cubic-bezier(.4,0,.2,1);
}
html { font-size: 17px; color-scheme: light; }
@media (min-width: 900px) {
  html { font-size: 18px; }
}
body { font-family: var(--font); background: var(--bg); color: var(--text-primary); -webkit-font-smoothing: antialiased; line-height: 1.55; font-size: 1rem; }
input:focus, textarea:focus { outline: none; }
input[type=range] { -webkit-appearance: none; appearance: none; height: 4px; background: var(--border); border-radius: 2px; outline: none; }
input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 22px; height: 22px; border-radius: 50%; background: #FFFFFF; cursor: pointer; border: 1px solid var(--border); box-shadow: 0 1px 4px rgba(0,0,0,.12); transition: transform .15s var(--ease), border-color .15s var(--ease); }
input[type=range]::-webkit-slider-thumb:hover { border-color: var(--border-hover); transform: scale(1.15); }
input[type=range]::-webkit-slider-thumb:active { transform: scale(.95); }
@keyframes fadeUp { from { opacity:0; transform:translateY(12px) } to { opacity:1; transform:translateY(0) } }
@keyframes scaleIn { from { opacity:0; transform:scale(.97) } to { opacity:1; transform:scale(1) } }
@keyframes nudge { 0%,60% { background: rgba(202,138,4,.16) } 100% { background: transparent } }
.anim-fade { animation: fadeUp .5s var(--ease) both; }
.anim-scale { animation: scaleIn .4s var(--ease) both; }
.row-nudge { padding: 6px 8px; margin: -6px -8px; border-radius: var(--radius-xs); animation: nudge 1.6s var(--ease) 1; }
::selection { background: var(--accent-light); }
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: .01ms !important; transition-duration: .01ms !important; }
}
.app-shell {
  width: 100%;
  max-width: min(100%, 1200px);
  margin: 0 auto;
  box-sizing: border-box;
  padding-top: max(clamp(40px, 7vw, 64px), env(safe-area-inset-top, 0px));
  padding-bottom: max(clamp(40px, 6vw, 64px), env(safe-area-inset-bottom, 0px));
  padding-left: max(clamp(20px, 4vw, 28px), env(safe-area-inset-left, 0px));
  padding-right: max(clamp(20px, 4vw, 28px), env(safe-area-inset-right, 0px));
}
@media (min-width: 768px) {
  .app-shell {
    padding-left: max(clamp(24px, 5vw, 36px), env(safe-area-inset-left, 0px));
    padding-right: max(clamp(24px, 5vw, 36px), env(safe-area-inset-right, 0px));
  }
}
@media (min-width: 1200px) {
  .app-shell {
    padding-left: max(48px, env(safe-area-inset-left, 0px));
    padding-right: max(48px, env(safe-area-inset-right, 0px));
  }
}
@media (min-width: 1440px) {
  .app-shell { max-width: min(100%, 1320px); }
}
.options-list {
  display: flex;
  flex-direction: column;
  gap: clamp(14px, 2vw, 22px);
}
.option-card {
  position: relative;
  border-radius: var(--radius);
  isolation: isolate;
  transition:
    transform 0.45s cubic-bezier(0.22, 1, 0.36, 1),
    box-shadow 0.45s cubic-bezier(0.22, 1, 0.36, 1),
    border-color 0.35s ease,
    background 0.35s ease;
  background:
    linear-gradient(165deg, #FFFFFF 0%, #FAFBFC 55%, #F8FAFC 100%) !important;
  border: 1px solid var(--border) !important;
  box-shadow:
    0 1px 0 rgba(255,255,255,.9) inset,
    0 4px 14px rgba(15,23,42,.06),
    0 1px 2px rgba(15,23,42,.04) !important;
}
.option-card::before {
  content: "";
  position: absolute;
  left: 1px;
  right: 1px;
  top: 1px;
  height: 42%;
  border-radius: calc(var(--radius) - 1px) calc(var(--radius) - 1px) 0 0;
  background: linear-gradient(180deg, rgba(255,255,255,.95), transparent);
  pointer-events: none;
  z-index: 0;
}
.option-card > * {
  position: relative;
  z-index: 1;
}
.option-card:hover {
  transform: translateY(-3px);
  border-color: rgba(37,99,235,.35) !important;
  background:
    linear-gradient(165deg, #FFFFFF 0%, rgba(37,99,235,.04) 48%, #F8FAFC 100%) !important;
  box-shadow:
    0 1px 0 rgba(255,255,255,.95) inset,
    0 16px 36px rgba(15,23,42,.1),
    0 0 0 1px rgba(37,99,235,.12),
    0 0 28px rgba(37,99,235,.1) !important;
}
.option-card:hover::before {
  background: linear-gradient(180deg, rgba(255,255,255,.98), transparent);
}
.option-card:active {
  transform: translateY(-1px);
  transition-duration: 0.12s;
}
.option-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 14px;
  scroll-margin-top: 12px;
}
@media (min-width: 900px) {
  .option-tabs {
    flex-wrap: nowrap;
    gap: 8px;
    overflow-x: auto;
    padding-bottom: 4px;
    -webkit-overflow-scrolling: touch;
  }
  .option-tabs::-webkit-scrollbar { height: 6px; }
  .option-tabs::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
  .option-tabs::-webkit-scrollbar-thumb:hover { background: var(--text-tertiary); }
}
.rating-dimensions {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
@media (min-width: 900px) {
  .rating-dimensions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 18px 28px;
    align-items: start;
  }
}
.weights-list {
  display: flex;
  flex-direction: column;
  gap: 18px;
}
@media (min-width: 1000px) {
  .weights-list {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px 36px;
    align-items: start;
  }
}
.results-detail-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
@media (min-width: 900px) {
  .results-detail-grid { grid-template-columns: repeat(3, 1fr); gap: 10px; }
}
`;

/* ═══════════════════════════════════════════════════════════════════════════
   COMPONENTS
   ═══════════════════════════════════════════════════════════════════════════ */

function Card({ children, style, className = "", surface, ...props }) {
  const base =
    surface === "option"
      ? { borderRadius: "var(--radius)" }
      : { background: "var(--surface)", borderRadius: "var(--radius)", boxShadow: "var(--shadow-md)", border: "1px solid var(--border)" };
  return <div className={className} style={{ ...base, ...style }} {...props}>{children}</div>;
}

function Pill({ children, caution }) {
  const c = caution
    ? { background: "var(--caution-bg)", color: "var(--caution)", borderColor: "var(--caution-border)" }
    : { background: "var(--positive-bg)", color: "var(--positive)", borderColor: "rgba(22,163,74,.22)" };
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "6px 14px", borderRadius: 20, fontSize: 14, fontWeight: 500, fontFamily: "var(--font)", border: "1px solid", ...c }}>{children}</span>;
}

/* ── Step bar: permanent line, fills as steps complete. Finished steps can be tapped to jump back. ── */
function StepBar({ current, labels, maxStep, onSelect }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 0, margin: "0 auto 36px", position: "relative" }}>
      {labels.map((l, i) => {
        const canJump = i !== current && i <= maxStep;
        return (
          <div key={i} style={{ display: "flex", alignItems: "center", flex: i < labels.length - 1 ? 1 : "none" }}>
            <div onClick={canJump ? () => onSelect(i) : undefined} role={canJump ? "button" : undefined} aria-current={i === current ? "step" : undefined}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, zIndex: 1, cursor: canJump ? "pointer" : "default" }}>
              <div style={{
                width: 32, height: 32, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 14, fontWeight: 600, transition: "all .35s var(--ease)",
                background: i <= current ? "var(--accent)" : "var(--surface)",
                color: i <= current ? "#fff" : "var(--text-quaternary)",
                border: i <= current ? "none" : "1.5px solid var(--border)",
              }}>
                {i < current ? "✓" : i + 1}
              </div>
              <span style={{ fontSize: 14, fontWeight: i === current ? 600 : 400, color: i <= current ? "var(--text-primary)" : "var(--text-quaternary)", whiteSpace: "nowrap", transition: "all .3s" }}>{l}</span>
            </div>
            {i < labels.length - 1 && (
              <div style={{ flex: 1, height: 2, background: "var(--border)", margin: "15px 8px 0", borderRadius: 1, position: "relative", overflow: "hidden" }}>
                <div style={{ position: "absolute", left: 0, top: 0, height: "100%", borderRadius: 1, background: "var(--accent)", transition: "width .5s var(--ease)", width: i < current ? "100%" : "0%" }} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── Rating control ── */
function RatingControl({ value, onChange, negative, label }) {
  return (
    <div role="group" aria-label={label} style={{ display: "flex", gap: 6, alignItems: "center" }}>
      {[1, 2, 3, 4, 5].map(v => {
        const active = v === value;
        const filled = value > 0 && v <= value;
        return (
          <button key={v} aria-pressed={active} aria-label={`${label}: ${v}`} onClick={() => onChange(active ? 0 : v)} style={{
            width: 48, height: 36, borderRadius: 8, border: "1.5px solid",
            borderColor: active ? (negative ? "var(--caution)" : "var(--accent)") : filled ? (negative ? "var(--caution-border)" : "rgba(37,99,235,.35)") : "var(--border)",
            background: active ? (negative ? "var(--caution-bg)" : "var(--accent-light)") : filled ? (negative ? "rgba(175,138,78,.03)" : "var(--accent-lighter)") : "transparent",
            color: active ? (negative ? "var(--caution)" : "var(--accent)") : filled ? (negative ? "var(--caution)" : "var(--accent)") : "var(--text-tertiary)",
            fontSize: 15, fontWeight: active ? 600 : 500, cursor: "pointer",
            transition: "all .2s var(--ease)", fontFamily: "var(--font)",
            transform: active ? "scale(1.05)" : "scale(1)",
          }}
          onMouseEnter={e => { if (!active) e.currentTarget.style.borderColor = negative ? "var(--caution-border)" : "var(--border-hover)"; e.currentTarget.style.transform = "scale(1.04)"; }}
          onMouseLeave={e => { if (!active && !filled) e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.transform = active ? "scale(1.05)" : "scale(1)"; }}
          >{v}</button>
        );
      })}
    </div>
  );
}

/* ── Info tooltip ──
   Same look as before. Fixes: tapping now opens it on phones (hover + click used to cancel each
   other out), it is centred on the "i" as intended, and it is nudged to stay inside the screen. */
function InfoTip({ text, onOpen }) {
  const [show, setShow] = useState(false);
  const [dx, setDx] = useState(0);
  const wrapRef = useRef(null);
  const boxRef = useRef(null);
  const pointer = useRef("mouse");

  const open = () => { if (!show) onOpen?.(); setShow(true); };
  const hide = () => { setShow(false); setDx(0); };

  useLayoutEffect(() => {
    if (!show || !boxRef.current) return;
    const r = boxRef.current.getBoundingClientRect();
    const vw = document.documentElement.clientWidth; // not innerWidth: on phones it grows when content overflows
    const pad = 12;
    if (r.left < pad) setDx(pad - r.left);
    else if (r.right > vw - pad) setDx(vw - pad - r.right);
  }, [show]);

  useEffect(() => {
    if (!show) return;
    const onDown = (e) => { if (!wrapRef.current?.contains(e.target)) { setShow(false); setDx(0); } };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [show]);

  return (
    <span ref={wrapRef} style={{ position: "relative", display: "inline-flex" }}>
      <span
        onPointerDown={e => { pointer.current = e.pointerType; }}
        onPointerEnter={e => { if (e.pointerType === "mouse") open(); }}
        onPointerLeave={e => { if (e.pointerType === "mouse") hide(); }}
        onClick={() => { if (pointer.current === "mouse") open(); else if (show) hide(); else open(); }}
        style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 18, height: 18, borderRadius: "50%", fontSize: 12, fontWeight: 600, color: "var(--text-tertiary)", border: "1px solid var(--border)", cursor: "help", userSelect: "none", marginLeft: 5, background: show ? "var(--fill-secondary)" : "transparent", transition: "all .15s" }}>i</span>
      {show && (
        <div ref={boxRef} style={{ position: "absolute", bottom: "calc(100% + 10px)", left: "50%", transform: `translateX(calc(-50% + ${dx}px))`, width: "min(300px, calc(100vw - 24px))", zIndex: 200 }}>
          <div className="anim-scale" style={{ background: "var(--surface)", padding: "14px 18px", borderRadius: "var(--radius-xs)", boxShadow: "var(--shadow-lg)", border: "1px solid var(--border)", fontSize: 14, lineHeight: 1.65, color: "var(--text-secondary)" }}>
            {text}
          </div>
          <div style={{ position: "absolute", bottom: -5, left: `calc(50% - ${dx}px)`, transform: "translateX(-50%) rotate(45deg)", width: 10, height: 10, background: "var(--surface)", border: "1px solid var(--border)", borderTop: "none", borderLeft: "none" }} />
        </div>
      )}
    </span>
  );
}

/* ── Contribution bar ── */
function ContribBar({ item, maxAbs, lang }) {
  const pct = maxAbs ? (Math.abs(item.contribution) / maxAbs) * 100 : 0;
  const neg = item.contribution < 0;
  const label = lang === "zh" ? item.zh : item.en;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, height: 34 }}>
      <span style={{ width: 104, fontSize: 14, color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, height: 4, background: "var(--border)", borderRadius: 2, position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: 0, height: "100%", borderRadius: 2, transition: "width .6s var(--ease)", ...(neg ? { right: "50%", width: `${pct / 2}%`, background: "var(--caution)" } : { left: "50%", width: `${pct / 2}%`, background: "var(--positive)" }) }} />
        <div style={{ position: "absolute", left: "50%", top: -2, bottom: -2, width: 1, background: "var(--border)" }} />
      </div>
      <span style={{ width: 48, textAlign: "right", fontSize: 14, fontWeight: 600, fontVariantNumeric: "tabular-nums", color: neg ? "var(--caution)" : "var(--positive)" }}>
        {item.contribution > 0 ? "+" : ""}{item.contribution.toFixed(1)}
      </span>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN APP
   ═══════════════════════════════════════════════════════════════════════════ */

export default function Choosely() {
  const [init] = useState(loadInitial);
  const [lang, setLang] = useState(init.lang);
  const t = i18n[lang];
  const dn = (d) => lang === "zh" ? d.zh : d.en;
  const dd = (d) => lang === "zh" ? d.descZh : d.descEn;
  const optTitle = (o) => lang === "zh" ? (o.titleZh || o.title) : o.title;
  const optDesc = (o) => lang === "zh" ? (o.descZh || o.desc) : o.desc;

  const [step, setStep] = useState(init.step);
  const [options, setOptions] = useState(init.options);
  const [weights, setWeights] = useState(init.weights);
  const [expanded, setExpanded] = useState(null);
  const [ratingTab, setRatingTab] = useState(init.ratingTab);
  const [blocked, setBlocked] = useState(null); // shown briefly after Continue is tapped while not allowed
  const [nudge, setNudge] = useState(null);     // highlights the unrated rows of one option
  const [focusId, setFocusId] = useState(null);

  const tabsRef = useRef(null);
  const optionsRef = useRef(options);
  const maxStepRef = useRef(0);
  const trackedStep = useRef(null);
  const weightsTouched = useRef(false);
  const ratedAny = useRef(init.options.some(o => Object.values(o.ratings).some(v => v > 0)));
  const firstScroll = useRef(true);

  const wTotal = useMemo(() => Object.values(weights).reduce((a, b) => a + b, 0), [weights]);
  const shares = useMemo(() => weightShares(weights), [weights]);
  const results = useMemo(() => rankOpts(options, weights), [options, weights]);

  const allRated = useMemo(() => options.every(o => Object.values(o.ratings).every(r => r > 0)), [options]);
  const ratedCount = useMemo(() => {
    let total = 0, done = 0;
    options.forEach(o => { DIMENSIONS.forEach(() => { total++; }); Object.values(o.ratings).forEach(r => { if (r > 0) done++; }); });
    return { total, done };
  }, [options]);

  const missingTitles = options.filter(o => !o.title.trim()).length;
  // Why Continue is disabled right now (null = allowed).
  const block = step === 0 && missingTitles ? { key: "nameMore", reason: "unnamed", missing: missingTitles }
    : step === 1 && !allRated ? { key: "rateMore", reason: "unrated", missing: ratedCount.total - ratedCount.done }
    : step === 2 && !(wTotal > 0) ? { key: "weightNone", reason: "no_weight", missing: 0 }
    : null;
  const canNext = !block;
  const maxStep = reachableStep(options, weights);
  const tie = results.length > 1 && results[1].rank === 1;

  // Editing a name/description writes both language fields, so what you typed survives a language
  // switch (and a name typed in Chinese mode counts as named). Untouched demo options still translate.
  const updOpt = useCallback((id, f, v) => setOptions(p => p.map(o => o.id === id ? { ...o, ...(f === "title" ? { title: v, titleZh: v } : { desc: v, descZh: v }) } : o)), []);
  const addOpt = () => {
    const id = Date.now().toString();
    setOptions(p => [...p, { id, title: "", titleZh: "", desc: "", descZh: "", ratings: { ...EMPTY_RATINGS } }]);
    setFocusId(id);
    track("option_added", { options_count: options.length + 1 });
  };
  const rmOpt = (id) => {
    setOptions(p => p.filter(o => o.id !== id));
    track("option_removed", { options_count: options.length - 1 });
  };
  const updRate = (oid, did, v) => {
    const cur = optionsRef.current;
    const idx = cur.findIndex(o => o.id === oid);
    if (idx === -1) return;
    const before = cur[idx];
    const after = { ...before, ratings: { ...before.ratings, [did]: v } };
    const next = cur.map(o => o.id === oid ? after : o);
    optionsRef.current = next;
    setOptions(next);
    if (!ratedAny.current && v > 0) {
      ratedAny.current = true;
      track("rating_started", { options_count: next.length });
    }
    if (!isComplete(before) && isComplete(after)) {
      const done = next.filter(isComplete).length;
      track("option_rated", { option_index: idx, completed_options: done, total_options: next.length });
      if (done === next.length) track("ratings_completed", { options_count: next.length });
    }
  };
  const setWeight = (id, v) => {
    setWeights(p => ({ ...p, [id]: v }));
    if (!weightsTouched.current) {
      weightsTouched.current = true;
      track("weights_adjusted", { dimension: id });
    }
  };

  /* ── navigation: every step change is a browser-history entry, so the phone's Back button works ── */
  const applyStep = useCallback((n) => {
    setStep(n);
    setBlocked(null);
    setFocusId(null);
  }, []);
  const goStep = useCallback((n) => {
    window.history.pushState({ step: n }, "");
    applyStep(n);
  }, [applyStep]);

  useEffect(() => { optionsRef.current = options; maxStepRef.current = maxStep; });

  useEffect(() => {
    window.history.replaceState({ step: init.step }, "");
    const onPop = (e) => {
      if (typeof e.state?.step === "number") applyStep(Math.min(e.state.step, maxStepRef.current));
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [init.step, applyStep]);

  // A new step starts at the top of the page instead of wherever the last one was scrolled to.
  useEffect(() => {
    if (firstScroll.current) { firstScroll.current = false; return; }
    window.scrollTo(0, 0);
  }, [step]);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ options, weights, step, ratingTab, lang })); } catch { /* storage unavailable */ }
  }, [options, weights, step, ratingTab, lang]);

  useEffect(() => {
    document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
    setContext({ lang });
  }, [lang]);

  useEffect(() => { if (ratingTab >= options.length) setRatingTab(Math.max(0, options.length - 1)); }, [options.length, ratingTab]);

  useEffect(() => {
    if (!blocked) return;
    const id = setTimeout(() => setBlocked(null), 3500);
    return () => clearTimeout(id);
  }, [blocked]);

  useEffect(() => {
    if (!nudge) return;
    document.querySelector(".row-nudge")?.scrollIntoView({ behavior: "smooth", block: "center" });
    const id = setTimeout(() => setNudge(null), 1600);
    return () => clearTimeout(id);
  }, [nudge]);

  /* ── analytics: funnel (which step people reach) ── */
  useEffect(() => {
    if (trackedStep.current === step) return;
    const restored = trackedStep.current === null && init.step > 0;
    trackedStep.current = step;
    weightsTouched.current = false;
    setContext({ step: STEP_KEYS[step] });
    track("step_viewed", { step: STEP_KEYS[step], step_index: step, options_count: options.length, restored });
    if (step === 3) {
      track("results_viewed", {
        options_count: options.length,
        margin: results.length > 1 ? +(results[0].score.total - results[1].score.total).toFixed(2) : null,
        tie,
        weights_customized: !Object.values(weights).every(w => w === 12.5),
      });
    }
  }, [step, init.step, options.length, results, tie, weights]);

  const selectTab = (i) => {
    setRatingTab(i);
    const el = tabsRef.current;
    if (el && el.getBoundingClientRect().top < 0) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const onContinue = () => {
    if (canNext) { if (step < 3) goStep(step + 1); return; }
    track("continue_blocked", { step: STEP_KEYS[step], reason: block.reason, missing: block.missing });
    setBlocked({ ...block, at: Date.now() });
    if (step === 0) {
      document.querySelector("[data-blank-title]")?.focus();
    } else if (step === 1) {
      const idx = isComplete(options[ratingTab]) ? options.findIndex(o => !isComplete(o)) : ratingTab;
      if (idx !== -1) { setRatingTab(idx); setNudge({ optId: options[idx].id, at: Date.now() }); }
    }
  };

  // For options step: use both title fields based on lang
  const titleField = lang === "zh" ? "titleZh" : "title";
  const descField = lang === "zh" ? "descZh" : "desc";

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <style>{GLOBAL_CSS}</style>
      <div className="app-shell">

        {/* ── Header + Language Toggle ── */}
        <header style={{ textAlign: "center", marginBottom: 36, position: "relative" }}>
          {/* Language switch */}
          <button onClick={() => { const to = lang === "en" ? "zh" : "en"; setLang(to); track("lang_switched", { to }); }} style={{
            position: "absolute", top: 0, right: 0,
            padding: "6px 16px", borderRadius: 20, fontSize: 14, fontWeight: 600,
            border: "1.5px solid var(--border)", background: "var(--surface)",
            color: "var(--text-secondary)", cursor: "pointer", fontFamily: "var(--font)",
            transition: "all .2s var(--ease)",
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--border-hover)"; e.currentTarget.style.color = "var(--accent)"; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--text-secondary)"; }}
          >{t.langSwitch}</button>

          <div style={{ display: "inline-flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <svg width="32" height="32" viewBox="0 0 28 28" fill="none">
              <rect width="28" height="28" rx="7" fill="var(--accent)" />
              <path d="M8 14.5 L12 18.5 L20 10" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </svg>
            <span style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-.03em" }}>{t.brand}</span>
          </div>
          <p style={{ fontSize: 16, color: "var(--text-tertiary)", fontWeight: 400 }}>{t.tagline[step]}</p>
        </header>

        <StepBar current={step} labels={t.stepLabels} maxStep={maxStep}
          onSelect={(i) => { track("step_jump", { from: STEP_KEYS[step], to: STEP_KEYS[i] }); goStep(i); }} />

        {/* ═══════════════════════════════════════════════════════════════
            STEP 0 — OPTIONS
           ═══════════════════════════════════════════════════════════════ */}
        {step === 0 && (
          <div className="anim-fade">
            <div style={{ marginBottom: 14 }}>
              <h2 style={{ fontSize: 18, fontWeight: 800, color: "var(--text-heading)", letterSpacing: "-.02em" }}>{t.optionsTitle}</h2>
              <p style={{ fontSize: 14, color: "var(--text-tertiary)", marginTop: 4 }}>{t.optionsSubtitle}</p>
            </div>
            <div className="options-list">
              {options.map((opt, i) => (
                <Card key={opt.id} surface="option" className="option-card anim-fade" style={{ padding: "16px 20px", animationDelay: `${i * 40}ms` }}>
                  <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
                    <span style={{ fontSize: 21, fontWeight: 300, color: "var(--text-quaternary)", paddingTop: 1, fontVariantNumeric: "tabular-nums", minWidth: 20, textAlign: "center" }}>{i + 1}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <input value={opt[titleField]} onChange={e => updOpt(opt.id, "title", e.target.value)} placeholder={t.optionPlaceholder}
                        aria-label={`${t.optionPlaceholder} ${i + 1}`} autoFocus={opt.id === focusId}
                        data-blank-title={opt.title.trim() ? undefined : ""}
                        style={{ width: "100%", border: "none", fontSize: 18, fontWeight: 600, background: "transparent", fontFamily: "var(--font)", color: "var(--text-primary)", marginBottom: 6, letterSpacing: "-.01em" }} />
                      <input value={opt[descField]} onChange={e => updOpt(opt.id, "desc", e.target.value)} placeholder={t.descPlaceholder}
                        aria-label={`${t.descPlaceholder} ${i + 1}`}
                        style={{ width: "100%", border: "none", fontSize: 15, background: "transparent", fontFamily: "var(--font)", color: "var(--text-tertiary)" }} />
                    </div>
                    <div style={{ display: "flex", alignItems: "center", flexShrink: 0, paddingTop: 4 }}>
                      {options.length > 2 && (
                        <button onClick={() => rmOpt(opt.id)} aria-label={`Remove option ${i + 1}`} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-quaternary)", fontSize: 22, lineHeight: 1, padding: 0, transition: "color .15s" }}
                          onMouseEnter={e => e.currentTarget.style.color = "var(--text-secondary)"}
                          onMouseLeave={e => e.currentTarget.style.color = "var(--text-quaternary)"}
                        >×</button>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
            <button onClick={addOpt} style={{
              width: "100%", marginTop: "clamp(14px, 2vw, 22px)", padding: "14px", borderRadius: "var(--radius)",
              border: "1.5px dashed var(--border)", background: "transparent",
              color: "var(--text-tertiary)", fontSize: 16, fontWeight: 500, cursor: "pointer", fontFamily: "var(--font)", transition: "all .2s",
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--border-hover)"; e.currentTarget.style.color = "var(--accent)"; e.currentTarget.style.background = "var(--accent-lighter)"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--text-tertiary)"; e.currentTarget.style.background = "transparent"; }}
            >{t.addOption}</button>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════
            STEP 1 — RATINGS
           ═══════════════════════════════════════════════════════════════ */}
        {step === 1 && (
          <div className="anim-fade">
            <div style={{ marginBottom: 14 }}>
              <h2 style={{ fontSize: 18, fontWeight: 800, color: "var(--text-heading)", letterSpacing: "-.02em" }}>{t.rateTitle}</h2>
              <p style={{ fontSize: 14, color: "var(--text-tertiary)", marginTop: 4 }}>{t.rateSubtitle}</p>
            </div>

            {/* Option tabs */}
            <div className="option-tabs" ref={tabsRef}>
              {options.map((opt, i) => {
                const done = Object.values(opt.ratings).filter(r => r > 0).length;
                const total = DIMENSIONS.length;
                const complete = done === total;
                return (
                  <button key={opt.id} onClick={() => setRatingTab(i)} aria-current={ratingTab === i} style={{
                    padding: "8px 18px", borderRadius: 20, fontSize: 15, fontWeight: ratingTab === i ? 600 : 400,
                    border: "1.5px solid", cursor: "pointer", fontFamily: "var(--font)", transition: "all .2s var(--ease)",
                    borderColor: ratingTab === i ? "var(--accent)" : complete ? "rgba(22,163,74,.22)" : "var(--border)",
                    background: ratingTab === i ? "var(--accent-light)" : complete ? "var(--positive-bg)" : "var(--surface)",
                    color: ratingTab === i ? "var(--accent)" : complete ? "var(--positive)" : "var(--text-secondary)",
                    display: "flex", alignItems: "center", gap: 6,
                  }}>
                    <span className="ph-mask">{optTitle(opt) || `${t.optionProgress} ${i + 1}`}</span>
                    {complete && <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2.5 6.5L5 9L9.5 3.5" stroke="var(--positive)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                    {!complete && done > 0 && <span style={{ fontSize: 14, color: "var(--text-quaternary)" }}>{done}/{total}</span>}
                  </button>
                );
              })}
            </div>

            {/* Rating card */}
            {options[ratingTab] && (
              <Card key={options[ratingTab].id} className="anim-scale" style={{ padding: 0, overflow: "hidden" }}>
                <div style={{ padding: "16px 22px 14px", borderBottom: "1px solid var(--border)" }}>
                  <div className="ph-mask" style={{ fontSize: 21, fontWeight: 600, letterSpacing: "-.01em" }}>{optTitle(options[ratingTab]) || (lang === "zh" ? "未命名选项" : "Untitled option")}</div>
                  <div className="ph-mask" style={{ fontSize: 15, color: "var(--text-tertiary)", marginTop: 4 }}>{optDesc(options[ratingTab])}</div>
                </div>
                <div style={{ padding: "16px 22px 22px" }}>
                  <div className="rating-dimensions">
                    {DIMENSIONS.map(dim => (
                      <div key={dim.id} className={nudge?.optId === options[ratingTab].id && options[ratingTab].ratings[dim.id] === 0 ? "row-nudge" : undefined}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                          <div style={{ display: "flex", alignItems: "center" }}>
                            <span style={{ fontSize: 15, fontWeight: 500, color: dim.negative ? "var(--caution)" : "var(--text-primary)" }}>{dn(dim)}</span>
                            {dim.negative && <span style={{ fontSize: 14, fontWeight: 500, color: "var(--caution)", marginLeft: 6, padding: "1px 6px", borderRadius: 4, background: "var(--caution-bg)" }}>{lang === "zh" ? "逆向" : "Inverse"}</span>}
                          </div>
                          <span style={{ fontSize: 13, color: "var(--text-quaternary)" }}>{lang === "zh" ? dim.en : ""}</span>
                        </div>
                        {/* Scoring direction hint */}
                        <div style={{ fontSize: 14, color: "var(--text-tertiary)", marginBottom: 8, lineHeight: 1.55 }}>
                          {dd(dim)}
                        </div>
                        <RatingControl value={options[ratingTab].ratings[dim.id]} onChange={v => updRate(options[ratingTab].id, dim.id, v)} negative={dim.negative} label={dn(dim)} />
                      </div>
                    ))}
                  </div>
                </div>
                {/* Footer */}
                <div style={{ padding: "10px 22px", borderTop: "1px solid var(--border)", background: "var(--fill-secondary)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 14, color: "var(--text-tertiary)" }}>{t.optionProgress} {ratingTab + 1} {t.of} {options.length}</span>
                    <span style={{ fontSize: 13, color: allRated ? "var(--positive)" : "var(--text-quaternary)" }}>
                      {allRated ? `✓ ${t.allDone}` : `${t.totalProgress} ${ratedCount.done}${t.of}${ratedCount.total}`}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 4 }}>
                    {ratingTab > 0 && <button onClick={() => selectTab(ratingTab - 1)} style={{ padding: "5px 14px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text-secondary)", fontSize: 14, cursor: "pointer", fontFamily: "var(--font)", fontWeight: 500 }}>{t.prev}</button>}
                    {ratingTab < options.length - 1 && <button onClick={() => selectTab(ratingTab + 1)} style={{ padding: "5px 14px", borderRadius: 6, border: "none", background: "var(--accent)", color: "#fff", fontSize: 14, cursor: "pointer", fontFamily: "var(--font)", fontWeight: 500 }}>{t.next}</button>}
                  </div>
                </div>
              </Card>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════
            STEP 2 — WEIGHTS
           ═══════════════════════════════════════════════════════════════ */}
        {step === 2 && (
          <div className="anim-fade">
            <Card style={{ padding: "22px 22px 18px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 4 }}>{t.weightsTitle}</div>
                  <div style={{ fontSize: 15, color: "var(--text-secondary)" }}>{t.weightsSubtitle}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  {/* Weights are relative, so the shares below always make up 100% */}
                  <div style={{ fontSize: 34, fontWeight: 300, fontVariantNumeric: "tabular-nums", color: wTotal > 0 ? "var(--text-primary)" : "var(--caution)", letterSpacing: "-.02em" }}>{wTotal > 0 ? "100%" : "0%"}</div>
                  <div style={{ fontSize: 13, color: "var(--text-tertiary)" }}>{t.weightTotal}</div>
                </div>
              </div>
              <div className="weights-list">
                {DIMENSIONS.map(dim => (
                  <div key={dim.id}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <div style={{ display: "flex", alignItems: "center" }}>
                        <span style={{ fontSize: 15, fontWeight: 500 }}>{dn(dim)}</span>
                        <span style={{ fontSize: 13, color: "var(--text-quaternary)", marginLeft: 6 }}>{lang === "zh" ? dim.en : dim.zh}</span>
                        <InfoTip text={dd(dim)} onOpen={() => track("tip_opened", { dimension: dim.id })} />
                      </div>
                      <span style={{ fontSize: 16, fontWeight: 600, fontVariantNumeric: "tabular-nums", color: weights[dim.id] > 0 ? "var(--text-primary)" : "var(--text-quaternary)", minWidth: 42, textAlign: "right" }}>{shares[dim.id].toFixed(1)}%</span>
                    </div>
                    <input type="range" min={0} max={50} step={0.5} value={weights[dim.id]} aria-label={dn(dim)} onChange={e => setWeight(dim.id, +e.target.value)} style={{ width: "100%" }} />
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
                <button onClick={() => { setWeights(DEFAULT_WEIGHTS); track("weights_reset"); }} style={{ padding: "8px 16px", borderRadius: "var(--radius-xs)", border: "none", background: "var(--fill-secondary)", color: "var(--text-tertiary)", fontSize: 14, fontWeight: 500, cursor: "pointer", fontFamily: "var(--font)", transition: "all .15s" }}
                  onMouseEnter={e => e.currentTarget.style.color = "var(--text-secondary)"}
                  onMouseLeave={e => e.currentTarget.style.color = "var(--text-tertiary)"}
                >{t.resetWeights}</button>
              </div>
            </Card>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════
            STEP 3 — RESULTS
           ═══════════════════════════════════════════════════════════════ */}
        {step === 3 && (
          <div className="anim-fade">
            <div style={{ marginBottom: 16 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700 }}>{t.resultsTitle}</h2>
              <p style={{ fontSize: 14, color: "var(--text-tertiary)", marginTop: 4 }}>{t.resultsSubtitle}</p>
            </div>

            {/* Overview */}
            <Card style={{ padding: "18px 22px", marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 12 }}>{t.overview}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {results.map(opt => {
                  const maxS = Math.max(...results.map(o => Math.abs(o.score.total)), 1);
                  const pct = Math.max(0, (opt.score.total / maxS) * 100);
                  const isFirst = opt.rank === 1;
                  return (
                    <div key={opt.id} style={{ display: "flex", alignItems: "center", gap: 14 }}>
                      <span style={{ width: 20, fontSize: 16, fontWeight: isFirst ? 600 : 400, color: isFirst ? "var(--accent)" : "var(--text-quaternary)", textAlign: "center" }}>{opt.rank}</span>
                      <span className="ph-mask" style={{ width: 128, fontSize: 15, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text-primary)" }}>{optTitle(opt)}</span>
                      <div style={{ flex: 1, height: 6, background: "var(--border)", borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ height: "100%", borderRadius: 3, transition: "width .8s var(--ease)", width: `${Math.max(pct, 3)}%`, background: isFirst ? "var(--accent)" : "var(--text-quaternary)" }} />
                      </div>
                      <span style={{ width: 50, textAlign: "right", fontSize: 16, fontWeight: 600, fontVariantNumeric: "tabular-nums", color: "var(--text-primary)" }}>{opt.score.total.toFixed(1)}</span>
                    </div>
                  );
                })}
              </div>
            </Card>

            {/* Detail cards */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {results.map((opt, ri) => {
                const maxAbs = Math.max(...opt.score.breakdown.map(b => Math.abs(b.contribution)), 0.1);
                const isTop = ri === 0 && !tie; // a tie for first has no single "Top pick"
                const isOpen = expanded === opt.id;
                return (
                  <Card key={opt.id} className="anim-fade" style={{
                    animationDelay: `${ri * 60}ms`, overflow: "hidden",
                    ...(isTop ? { border: "1.5px solid var(--accent)", boxShadow: "0 0 0 1px rgba(37,99,235,.2), var(--shadow-lg)" } : {}),
                  }}>
                    <div onClick={() => { setExpanded(isOpen ? null : opt.id); if (!isOpen) track("result_expanded", { rank: opt.rank }); }} style={{ padding: "16px 20px", cursor: "pointer", userSelect: "none", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 16, minWidth: 0 }}>
                        <div style={{ width: 40, height: 40, borderRadius: "var(--radius-xs)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 600, flexShrink: 0, background: isTop ? "var(--accent)" : "var(--fill-secondary)", color: isTop ? "#fff" : "var(--text-tertiary)" }}>#{opt.rank}</div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 17, fontWeight: 600, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            <span className="ph-mask">{optTitle(opt)}</span>
                            {isTop && <span style={{ fontSize: 14, fontWeight: 600, color: "var(--accent)", background: "var(--accent-light)", padding: "2px 10px", borderRadius: 10 }}>{t.recommended}</span>}
                          </div>
                          <div className="ph-mask" style={{ fontSize: 14, color: "var(--text-tertiary)", marginTop: 3 }}>{optDesc(opt)}</div>
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 16, flexShrink: 0 }}>
                        <span style={{ fontSize: 28, fontWeight: 300, fontVariantNumeric: "tabular-nums", color: opt.score.total > 0 ? "var(--text-primary)" : "var(--caution)" }}>{opt.score.total.toFixed(1)}</span>
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ transition: "transform .25s var(--ease)", transform: isOpen ? "rotate(180deg)" : "none" }}><path d="M2.5 4.5L6 8L9.5 4.5" stroke="var(--text-tertiary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      </div>
                    </div>

                    <div style={{ padding: "0 20px 14px", display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {opt.score.top2Pos.map(p => <Pill key={p.id}>↑ {dn(p)}</Pill>)}
                      {opt.score.top1Neg.map(n => <Pill key={n.id} caution>↓ {dn(n)}</Pill>)}
                    </div>

                    {isOpen && (
                      <div className="anim-fade" style={{ borderTop: "1px solid var(--border)", padding: 20 }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 12 }}>{t.contribution}</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 2, marginBottom: 18 }}>
                          {opt.score.breakdown.map(b => <ContribBar key={b.id} item={b} maxAbs={maxAbs} lang={lang} />)}
                        </div>

                        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 12 }}>{t.details}</div>
                        <div className="results-detail-grid">
                          {opt.score.breakdown.map(b => (
                            <div key={b.id} style={{ padding: "12px 14px", background: "var(--fill-secondary)", borderRadius: "var(--radius-xs)" }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                                <span style={{ fontSize: 14, fontWeight: 600, color: b.negative ? "var(--caution)" : "var(--text-primary)" }}>{dn(b)}</span>
                                <div style={{ display: "flex", gap: 3 }}>
                                  {[1, 2, 3, 4, 5].map(v => <div key={v} style={{ width: 5, height: 5, borderRadius: "50%", background: v <= b.raw ? (b.negative ? "var(--caution)" : "var(--accent)") : "var(--border)" }} />)}
                                </div>
                              </div>
                              <div style={{ fontSize: 14, color: "var(--text-tertiary)", lineHeight: 1.6 }}>{dd(b)}</div>
                            </div>
                          ))}
                        </div>

                        <div style={{ marginTop: 16, padding: "12px 16px", background: isTop ? "var(--accent-lighter)" : "var(--fill-secondary)", borderRadius: "var(--radius-xs)", fontSize: 15, lineHeight: 1.7, color: "var(--text-secondary)" }}>
                          {genSummary(opt, opt.score, lang)}
                        </div>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Navigation ── */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 36, position: "relative" }}>
          {blocked && block && (
            <div key={blocked.at} role="status" className="anim-fade" style={{ position: "absolute", right: 0, bottom: "calc(100% + 10px)", fontSize: 14, fontWeight: 500, color: "var(--caution)", whiteSpace: "nowrap" }}>
              {t[block.key](block.missing)}
            </div>
          )}
          <button onClick={() => goStep(step - 1)} disabled={step === 0} style={{
            padding: "12px 28px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)",
            background: "var(--surface)", color: step === 0 ? "var(--text-quaternary)" : "var(--text-secondary)",
            fontSize: 16, fontWeight: 500, cursor: step === 0 ? "default" : "pointer",
            fontFamily: "var(--font)", transition: "all .15s", opacity: step === 0 ? 0.4 : 1,
          }}>{t.prevStep}</button>

          {step < 3 ? (
            <button onClick={onContinue} aria-disabled={!canNext} style={{
              padding: "12px 32px", borderRadius: "var(--radius-sm)", border: "none",
              background: canNext ? "var(--accent)" : "var(--text-quaternary)",
              color: "#fff", fontSize: 16, fontWeight: 600, cursor: canNext ? "pointer" : "default",
              fontFamily: "var(--font)", transition: "all .2s var(--ease)",
              boxShadow: canNext ? "0 2px 12px rgba(37,99,235,.35)" : "none",
            }}
            onMouseEnter={e => { if (canNext) e.currentTarget.style.transform = "translateY(-1px)"; }}
            onMouseLeave={e => { e.currentTarget.style.transform = "none"; }}
            >{t.nextStep}</button>
          ) : (
            <button onClick={() => { track("restart", { options_count: options.length }); goStep(0); setExpanded(null); }} style={{
              padding: "12px 28px", borderRadius: "var(--radius-sm)", border: "none",
              background: "var(--accent)", color: "#fff", fontSize: 16, fontWeight: 600,
              cursor: "pointer", fontFamily: "var(--font)", boxShadow: "0 2px 12px rgba(37,99,235,.35)",
            }}>{t.restart}</button>
          )}
        </div>

        {step === 0 && (
          <p style={{ marginTop: 28, textAlign: "center", fontSize: 13, lineHeight: 1.6, color: "var(--text-quaternary)" }}>{t.privacy}</p>
        )}
      </div>
    </div>
  );
}
