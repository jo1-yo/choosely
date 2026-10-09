# Choosely

A structured decision-making tool that helps you compare options through multi-dimensional scoring, customizable weighting, and transparent ranking.

纠结、犹豫，做不出选择？用Choosely,一个通过多维度评分和加权的决策工具，帮助你理性对比各个选择。

**Live Demo / 在线体验** → [imjane.top/choosely](http://imjane.top/choosely/)

---

## What It Does / 项目简介

Choosely turns vague "which should I pick?" dilemmas into a clear, explainable ranking. The user walks through four steps:

Choosely 把模糊的"我该选哪个"变成清晰、可解释的排序。用户只需四步：

| Step | EN | 中文 |
|------|-----|------|
| 1 | **Options** — List 2+ mutually exclusive choices | **选项** — 列出 2 个以上互斥的选择 |
| 2 | **Rate** — Score each option 1–5 on 8 dimensions | **打分** — 在 8 个维度上给每个选项打 1–5 分 |
| 3 | **Weight** — Drag sliders to set dimension importance | **权重** — 拖动滑块调整各维度的重要性 |
| 4 | **Results** — View ranked outcomes with contribution breakdowns | **结果** — 查看排序结果与各维度贡献分析 |

## Evaluation Dimensions / 评估维度

The scoring model uses 8 built-in dimensions — 6 positive and 2 inverse:

评分模型内置 8 个维度——6 个正向、2 个逆向：

| Dimension | 维度 | Direction | Description |
|-----------|------|-----------|-------------|
| Long-term Impact | 长期收益 | Positive ↑ | Compounding value over 3–5 years |
| Urgency | 时间窗口 | Positive ↑ | How time-sensitive the opportunity is |
| Effort Cost | 投入成本 | **Inverse ↓** | Time, energy, resources required (higher = worse) |
| Success Probability | 成功概率 | Positive ↑ | Likelihood of success given current resources |
| Personal Interest | 内在热情 | Positive ↑ | Intrinsic motivation and genuine curiosity |
| Optionality | 可逆性 | Positive ↑ | Ability to reverse course if it doesn't work out |
| Strategic Leverage | 战略杠杆 | Positive ↑ | Whether it unlocks further opportunities |
| Risk Level | 风险程度 | **Inverse ↓** | Severity of worst-case scenario (higher = worse) |

Inverse dimensions subtract from the total score — they penalize options with high cost or high risk.

逆向维度会从总分中扣除——高成本或高风险的选项会被惩罚。

## Scoring Algorithm / 评分算法

```
For each option:
  total = Σ ( normalized_weight[d] × effective_score[d] )

Where:
  raw_score        ∈ {1, 2, 3, 4, 5}       — user input
  normalized_score = raw_score × 20          — mapped to 0–100 scale
  effective_score  = negative ? -normalized : +normalized
  normalized_weight = weight[d] / Σ(weights) — sums to 1.0
```

The default weight for each dimension is **12.5** (equal distribution across 8 dimensions). Users can drag any weight from 0 to 50. Weights are **relative**: the score uses each weight divided by the sum, and the UI shows that share (always adding up to 100%), so there is no "total must equal 100" to satisfy.

每个维度默认权重 **12.5**（8 个维度平分）。用户可将权重在 0–50 之间任意调整。权重是**相对**的：算分时用的是每项除以总和后的占比，界面也直接显示这个占比（始终合计 100%），所以不需要用户凑满 100。

Results are sorted by total score descending. Each result card shows:
- Overall rank and score
- Top 2 positive contributors and top 1 negative contributor (as pills)
- Expandable breakdown: per-dimension contribution bar chart, detail grid, and auto-generated summary

## Tech Stack / 技术栈

| Layer | Technology |
|-------|------------|
| Framework | [React 19](https://react.dev/) |
| Build tool | [Vite 8](https://vite.dev/) |
| Language | JavaScript (JSX) |
| Styling | CSS-in-JS (inline styles + injected `<style>` tag) |
| Fonts | [Inter](https://rsms.me/inter/) + [Noto Sans SC](https://fonts.google.com/noto/specimen/Noto+Sans+SC) (Google Fonts) |
| Deployment | [GitHub Pages](https://pages.github.com/) via GitHub Actions |
| i18n | Built-in bilingual support (EN / 中文), toggle at runtime |

No external UI libraries, state management libraries, or CSS frameworks — the entire app is a single self-contained React component.

无需外部 UI 库、状态管理库或 CSS 框架——整个应用是一个自包含的单文件 React 组件。

## Project Structure / 项目结构

```
choosely/
├── index.html                  # Entry HTML
├── vite.config.js              # Vite config (base: '/choosely/')
├── package.json                # Dependencies & scripts
├── .github/
│   └── workflows/
│       └── deploy.yml          # GitHub Actions → GitHub Pages
├── public/
│   ├── favicon.svg             # App icon
│   └── icons.svg               # Icon sprites
└── src/
    ├── main.jsx                # React root mount
    ├── App.jsx                 # App shell (imports Choosely)
    ├── choosely.jsx            # Core component: all UI and styles
    ├── scoring.js              # Dimensions + scoring engine (pure functions)
    ├── scoring.test.js         # Unit tests for the scoring engine (npm test)
    ├── analytics.js            # Optional PostHog wrapper (off unless a key is set)
    ├── index.css               # Global base styles
    └── App.css                 # Layout styles
```

### Architecture Highlights / 架构亮点

- **Single-component UI** — All UI and styles live in `src/choosely.jsx`; the scoring maths lives in `src/scoring.js` so it can be unit-tested.
- **Minimal runtime dependencies** — React and ReactDOM; `posthog-js` is only downloaded when an analytics key is configured.
- **Fully client-side** — No server, no database. All computation happens in the browser; progress is saved in `localStorage`, so a refresh doesn't lose your ratings.
- **Responsive layout** — Fluid typography and spacing via `clamp()` / media queries; card hover effects on desktop, touch-friendly on mobile.
- **CSS custom properties** — All colors, spacing, and shadows are defined as CSS variables for easy theming.
- **Memoized computation** — `useMemo` for scores and rankings; `useCallback` for option CRUD — avoids unnecessary re-renders.

## Getting Started / 本地开发

### Prerequisites / 前置要求

- Node.js ≥ 18
- npm ≥ 9

### Install & Run / 安装与运行

```bash
# Clone the repository
git clone https://github.com/jo1-yo/choosely.git
cd choosely

# Install dependencies
npm install

# Start dev server (with HMR)
npm run dev
```

Open [http://localhost:5173/choosely/](http://localhost:5173/choosely/) in your browser.

### Build / 构建

```bash
npm run build
```

Output goes to `dist/`. To preview the production build locally:

```bash
npm run preview
```

### Lint & Test / 代码检查与测试

```bash
npm run lint
npm test        # scoring engine unit tests; also run in CI before every deploy
```

## Analytics (PostHog) / 数据分析

Optional and **off by default**. Set a PostHog project key and the app reports which step people reach and where they get stuck.

可选，默认关闭。配置 PostHog 项目 key 后，可以看到用户走到了哪一步、卡在哪里。

1. Create a project at [posthog.com](https://posthog.com) and copy the **Project API key** (`phc_…`).
2. GitHub repo → Settings → Secrets and variables → Actions → **Variables** → add `POSTHOG_KEY` (and `POSTHOG_HOST` for EU cloud: `https://eu.i.posthog.com`). The key is public by design, so a variable (not a secret) is fine.
3. In PostHog → Project settings, turn on **Session replay** (recordings) if you want to watch sessions.
4. Push to `main`; the workflow bakes the key into the build.

Locally, copy `.env.example` to `.env.local` to test. In `npm run dev` every event is also printed to the console as `[analytics]`.

**Privacy.** Autocapture is off. Only hand-written events with counts and step names are sent — never option names or descriptions. Session replay masks all inputs and anything with the `ph-mask` class. Respects Do Not Track. To exclude yourself, open `/choosely/?notrack` once in that browser (`?track` re-enables).

| Event | Meaning |
|-------|---------|
| `step_viewed` | Funnel: `options → rate → weight → results` |
| `continue_blocked` | Clicked Continue but couldn't proceed (`reason`: `unnamed` / `unrated` / `no_weight`, plus `missing`) — the clearest "stuck" signal |
| `rating_started`, `option_rated`, `ratings_completed` | Progress through the 8×N rating grid |
| `option_added/removed`, `lang_switched`, `step_jump` | Setup and navigation behaviour |
| `weights_adjusted`, `weights_reset`, `tip_opened` | Weight step engagement |
| `results_viewed`, `result_expanded`, `restart` | Outcome (`results_viewed` includes the gap between #1 and #2, and whether it was a tie) |
| `$pageleave` | Carries the `step` the visitor was on when they left |

## Deployment / 部署

The project auto-deploys to GitHub Pages on every push to `main` via the workflow at `.github/workflows/deploy.yml`:

每次推送到 `main` 分支时，GitHub Actions 会自动构建并部署到 GitHub Pages：

1. **Checkout** → **Setup Node 20** → **`npm ci`** → **`npm run build`**
2. Upload `dist/` as a Pages artifact
3. Deploy to the GitHub Pages environment

The `base` path in `vite.config.js` is set to `'/choosely/'` to match the repository name on GitHub Pages.

## License / 许可

MIT
