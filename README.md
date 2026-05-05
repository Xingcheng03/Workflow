# FinAgent Dashboard

> 六个 agent 五个阶段的金融分析工作流。Yahoo 提供事实，Gemini 负责推理，
> 最后由 Verifier 交叉核对。完整架构见 [`docs/architecture.md`](docs/architecture.md)。

## 快速上手

需要 **Node.js 18+**（推荐 20）。

```bash
git clone <this-repo>
cd Workflow
npm install
```

在项目根目录创建 `.env.local`：

```env
VITE_GEMINI_API_KEY=AIzaSy...你的key
VITE_GEMINI_MODEL=gemini-2.5-flash
VITE_GEMINI_USE_GOOGLE_SEARCH=true
```

注意：

- 文件名是 `.env.local`，不是 `env.local` 或 `.env.local.txt`
- key 不要加引号、不要有空格
- 改完 `.env.local` 必须重启 dev server

启动：

```bash
npm run dev
```

打开终端显示的 `Local:` 网址（通常是 `http://127.0.0.1:5173/`）。

## npm 脚本

| 命令 | 作用 |
|---|---|
| `npm run dev` | 开发服务器（Yahoo 代理也在这里跑） |
| `npm run build` | 生产构建到 `dist/` |
| `npm run preview` | 预览生产构建（Yahoo 代理也跑，**不是真静态部署**） |
| `npm run lint` | ESLint flat config |
| `npm test` | 跑全部 161 个测试 |
| `npm run test:watch` | 测试 watch 模式 |

## 怎么用

1. 在 Ticker 框输股票代码（`NVDA` / `TSLA` / `AAPL` / ...）
2. 点 `Run Full Analysis`，或在输入框按 `Enter`
3. 五个阶段依次跑：

   ```
   Phase 1  Data           （Yahoo Finance，不调 Gemini）
   Phase 2  News           （Gemini + Google Search）
   Phase 3  Analysis + Risk  并发
   Phase 4  Report v1
   Phase 5  Verifier  → 必要时 Report v2 → 再 Verifier
   ```

4. 运行中按 `Esc` 或点 X 按钮可以随时取消整个 workflow
5. 同一个 ticker 12 分钟内重跑会命中 Gemini 缓存，行情则在 90 秒内复用 Yahoo 响应。日志里命中缓存的行末标 `(cached)`

## ⚠️ 部署说明

**这个项目目前只能在 `npm run dev` 或 `npm run preview` 下跑。**

页面通过 `/api/market-chart/...` 和 `/api/market-summary/...` 拿行情数据，
这两个路由由 [`server/yahooProxy.js`](server/yahooProxy.js) 注册到 Vite 的
dev/preview server。**生产构建 `dist/` 是纯静态的，没有 `/api/*` 路由**，
直接传到 Netlify / Vercel / GitHub Pages 上跑会全部 404。

如果要真正部署，需要把 `server/yahooProxy.js` 的代理逻辑迁到一个真后端
（Express / Fastify / Cloudflare Worker 都行 —— 它已经被独立成一个文件）。

## 常见问题

**Gemini API key not valid**
- 检查 `.env.local` 里 key 是否复制完整，前后无空格无引号
- 改完文件后必须重启 dev server (`Ctrl+C` 再 `npm run dev`)

**页面没更新**
- `Ctrl + F5` 硬刷新，或重启 dev server

**端口不是 5173**
- 5173 被占用时 Vite 会自动换。以终端显示的 `Local:` 网址为准

**`npm install` 失败**
- 确认在项目根目录，确认网络正常
- Node 18+ 必需（`node --version`）

## 项目结构

```
src/
  App.jsx                 React 布局壳，~140 行，业务逻辑全在 hook 里
  hooks/useAgentWorkflow.js   工作流编排（state、五阶段流水线、abort）
  services/
    agentApi/             prompts、Gemini 客户端、agent 调度
    marketData/           Yahoo 响应解析 + formatter
    cache.js              sessionStorage 缓存（Gemini 12min / 行情 90s）
  components/             各面板，全部 React.memo 化
server/
  yahooProxy.js           Yahoo 代理（带 in-flight dedup + crumb mutex + 超时）
tests/                    161 个测试，目录结构镜像 src/
```

更深的内容看 [`docs/architecture.md`](docs/architecture.md)。
