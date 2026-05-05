# FinAgent Dashboard 优化方案

按优先级整理。每条都标注了**问题**、**位置**、**建议方案**、**预估工作量**。

## 进度

- **P0**:未做 — 需要 serverless 配置
  - `#1` API key 暴露 — 待办
  - `#2` 行情代理只在 dev 起效 — 待办
- **P1**:全部完成
  - `#3` 趋势点数对齐 ✅
  - `#4` 并发工作流 ✅
  - `#5` 缓存层 ✅
  - `#6` 容错降级 + 重试 ✅
  - `#7` 空 ticker 校验 ✅
- **P2**:全部完成
  - `#8` Abort 取消 ✅
  - `#9` JSON 解析失败重试 ✅
  - `#10` Context 结构化裁剪 ✅
  - `#11` 测试基础设施 + 35 个用例 ✅
  - `#12` aria-live / aria-busy ✅

---

## P0 — 阻塞上线的问题

### 1. Gemini API key 直接暴露给浏览器

**问题**
`VITE_GEMINI_API_KEY` 走 Vite 的 `VITE_` 前缀注入,会被打进 bundle。任何用户打开 DevTools → Network 都能看到 `x-goog-api-key` 头里的明文 key,可被无限复用导致账单失控。

**位置**
- `src/services/agentApi.js:43-53,91-97`
- `.env.example:4`

**建议方案**
A. **最小改动(推荐)**:在 `vite.config.js` 里再加一个中间件 `/api/gemini`,前端 fetch 改成调用本地代理,key 只在 server 端读。配合方案 #2 的 serverless 一起改。
B. 上线时把代理改成 Vercel/Netlify Function 或 Cloudflare Worker,前端永远不持有 key。

**工作量** S(半天)

---

### 2. 行情代理只在 dev/preview 起效,部署即 404

**问题**
`vite.config.js` 的 `marketChartHandler` 挂在 `configureServer` / `configurePreviewServer`,`vite build` 出来的静态资源里没有这层。任何静态托管(GitHub Pages、Netlify static、Vercel static)直接 404。

**位置** `vite.config.js:4-50`

**建议方案**
按目标平台二选一,把 `/api/market-chart/[symbol]` 写成同名 serverless function:
- `api/market-chart/[symbol].js`(Vercel)
- `netlify/functions/market-chart.js`(Netlify)
- `functions/market-chart.js`(Cloudflare Pages)

把 Yahoo 转发逻辑(`vite.config.js:21-31`)整段挪过去即可,前端 `fetch('/api/market-chart/...')` 完全不用改。

**工作量** S(半天)

---

## P1 — 影响体验/正确性的问题

### 3. 趋势图数据长度与 UI 不匹配

**问题**
- `marketData.js:72` 的 `compactTrend(..., 28)` 最多返回 28 个点
- `agentApi.js` 的 prompt 要求 `trend: [number]*7` 只 7 个点
- `styles.css:451` 强制 `grid-template-columns: repeat(7, ...)`

结果:Data Agent 跑完后,28 个点会**溢出成 4 行栅格**(每行 156px,实测会撑破 `min-height: 188px` 的容器);Analysis Agent 覆盖后又缩回 7 列。表现不一致。

**位置**
- `src/services/marketData.js:20-29,72`
- `src/styles.css:449-456`
- `src/App.jsx:247-263`

**建议方案**
统一用 7 点(`compactTrend(values, 7)`),或 UI 改成自适应(`grid-template-columns: repeat(auto-fit, minmax(24px, 1fr))`)。推荐前者——课堂演示场景 7 点足够,且和 Gemini 输出对齐。

**工作量** XS(10 分钟)

---

### 4. 工作流串行,没必要的等待

**问题**
`executeWorkflow` 在 `App.jsx:88-99` 顺序跑 5 个 agent。但实际依赖关系是:

```
Data ─┬─→ News ─────┐
      ├─→ Analysis ─┼─→ Report
      └─→ Risk ─────┘
```

News / Analysis / Risk 都只参考 Data 的输出(看 prompt),三者之间没有真实依赖。当前实现把 contextBlock 注入下一个 agent,但 prompt 里并没有真用前一个的字段。

**位置** `src/App.jsx:79-108`、`src/services/agentApi.js:200-203`

**建议方案**
拆成两阶段:
1. Data → 同步阻塞
2. `Promise.all([News, Analysis, Risk])` 并发
3. Report → 等三者完成

总耗时从 ~5×单次 降到 ~3×单次(Data + max(News/Analysis/Risk) + Report)。

UI 里 `activeAgent` 改成 `activeAgents: Set`,workflow track 同时高亮多个。

**工作量** M(2-3 小时,UI 状态机要小改)

---

### 5. 无缓存,每次跑都打全套 API

**问题**
同一个 ticker 5 分钟内重复"Run Full Analysis":4 次 Gemini + 1 次 Yahoo 重打。Yahoo 限速宽,Gemini 按 token 计费**真烧钱**。

**位置** `src/services/agentApi.js:91`、`src/services/marketData.js:31`

**建议方案**
- 行情:`sessionStorage` 存 1-2 分钟,key=`symbol`
- Gemini:`sessionStorage` 存 10-15 分钟,key=`agentId:symbol:contextHash`(contextHash 是 results 的简单哈希,变了就重跑)

故意不用 localStorage——避免跨 session 持久化"已过期"的金融数据。

**工作量** S(半天)

---

### 6. Workflow 任意一步失败,后续全断

**问题**
`App.jsx:101-104` 的 `try/catch` 包在 `for` 循环外面,News Agent 报错就直接 `throw`,Analysis/Risk/Report **都不会跑**。Gemini 偶发 5xx / 限速时整个 workflow 报废。

**建议方案**
两种粒度:
- **降级**:每个 agent 自己 try/catch,失败时 emit log + 用 `plainTextPayload` 兜底,继续下一个
- **重试**:对 Gemini 调用加 1 次指数退避重试(429 / 5xx)

推荐两个都做。

**位置** `src/App.jsx:79-108`、`src/services/agentApi.js:91-134`

**工作量** S(半天)

---

### 7. 空 ticker 静默回退到 'AAPL'

**问题**
`agentApi.js:5-8` 的 `normalizeSymbol`:输入空 → 返回 `'AAPL'`。用户清空输入框点 Run,屏幕上突然显示 Apple 的数据,**不知道发生了什么**。

**建议方案**
- `normalizeSymbol` 空值返回 `null`
- `executeAgent` / `executeWorkflow` 入口校验,空就 setError + emitLog 并 return
- 顺便加个简单 ticker 格式校验(`/^[A-Z.\-]{1,8}$/`)

**位置** `src/services/agentApi.js:5-8`、`src/App.jsx:61-108`

**工作量** XS

---

## P2 — 工程质量

### 8. 无 abort,跑起来没法停

**问题**
点了 "Run Full Analysis" 后想换 ticker?只能等。

**建议方案** 加 `AbortController`,reset 按钮在 `isRunning` 时变成 cancel,把 signal 传给 `fetch`。

**工作量** S

---

### 9. JSON 解析容易被极端响应骗到

**问题**
`agentApi.js:68-79` 的 `parseJson` 用 `indexOf('{')` + `lastIndexOf('}')`。如果 Gemini 输出里有 markdown 代码块嵌套或多个 JSON 段,会把整段当成一个对象解析失败。

**建议方案**
- 加一次重试:第一次失败时再调一次 Gemini,prompt 后面追加 `Your previous response was not valid JSON. Return only one JSON object.`
- 或者用更可靠的提取(找平衡的花括号对)

**位置** `src/services/agentApi.js:55-79`

**工作量** S

---

### 10. Context 注入没有 token 预算控制

**问题**
`contextBlock` 把 results 序列化后**直接截到 6000 字符**。Report Agent 收到的 prompt 包含前 4 个 agent 的全部输出,容易很长。截断点可能切在 JSON 中间,Gemini 读到坏 JSON。

**建议方案**
- 改成结构化裁剪:每个 agent 输出只保留几个关键字段进 context(symbol、recommendation、riskLevel、关键数字),而不是整个 JSON
- 或者用 `JSON.stringify` + 字段白名单

**位置** `src/services/agentApi.js:200-203`

**工作量** S

---

### 11. 无测试

**问题** 零测试基础设施。

**建议方案**
最小可行的一套:
- `vitest` + `@testing-library/react`
- 测试 `parseJson` / `cleanJsonText` / `compactTrend` / `formatChange` 这几个纯函数(投入产出比最高)
- mock fetch 测 `runAgent` 五种分支

**工作量** M

---

### 12. 可访问性小问题

**问题**
- Logs 面板没 `aria-live`,屏幕阅读器收不到新日志
- 跑动状态只有 `.pulse-dot.running` 的视觉变化,无 `aria-busy`
- "Run Full Analysis" 进行中没有可被读到的进度

**建议方案** 在 `.log-list` 加 `aria-live="polite"`、`.app-shell` 上根据 `isRunning` 切换 `aria-busy`。

**位置** `src/App.jsx:266-283,118`

**工作量** XS

---

## 不建议做的事

- **拆组件** — App.jsx 343 行,看似大,但状态高度耦合,拆出去只会增加 prop drilling。课堂 demo 规模下扁平更易读。
- **引入状态管理库(Redux/Zustand)** — 同上,useState 够用,引入只是包袱。
- **换 chart 库** — 现在的 CSS 柱状图够课堂用,Recharts/Chart.js 会显著增加 bundle。
- **i18n** — 课堂演示项目,先聚焦核心功能。

---

## 推荐执行顺序

如果只能做 3 件事:**#3(趋势 bug)→ #7(空 ticker)→ #6(workflow 容错)** —— 都是 XS/S 工作量,直接改善课堂演示稳定性。

如果要准备上线:**#1 + #2 一起做** —— Serverless function 同时解决 key 暴露和代理失效两个问题。
