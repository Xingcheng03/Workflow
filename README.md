# FinAgent Dashboard 组员操作步骤

这份文档给组员使用，说明如何在本地运行我们的 React + Gemini 金融 Agent 仪表板。

## 1. 准备环境

电脑需要先安装 Node.js。

推荐版本：

```text
Node.js 18 或以上
```

检查是否已经安装：

```bash
node --version
npm --version
```

如果能看到版本号，例如 `v22.x.x` 和 `10.x.x`，说明环境正常。

如果没有安装 Node.js，请去官网下载并安装：

```text
https://nodejs.org/
```

## 2. 进入项目目录

在终端里进入项目文件夹。

Windows 示例：

```bash
cd D:\OneDrive\Desktop\Workflow
```

如果你的项目在别的位置，请把路径换成自己的项目路径。

## 3. 安装 npm 依赖

第一次运行项目之前，需要安装依赖：

```bash
npm install
```

这个命令会根据 `package.json` 安装 React、Vite、lucide-react 等依赖。

安装完成后，项目目录里会出现：

```text
node_modules/
package-lock.json
```

## 4. 创建 env 文件

项目需要 Gemini API key。

在项目根目录创建一个文件：

```text
.env.local
```

注意：

- 文件名必须是 `.env.local`
- 不要写成 `env.local`
- 不要写成 `.env.local.txt`
- 这个文件要和 `package.json` 在同一级目录

`.env.local` 内容写成：

```env
VITE_GEMINI_API_KEY=把你的Gemini_API_Key粘贴到这里
VITE_GEMINI_MODEL=gemini-2.5-flash
VITE_GEMINI_USE_GOOGLE_SEARCH=true
```

例如：

```env
VITE_GEMINI_API_KEY=AIzaSyxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
VITE_GEMINI_MODEL=gemini-2.5-flash
VITE_GEMINI_USE_GOOGLE_SEARCH=true
```

注意：

- `=` 左右不要加空格
- API key 不要加引号
- API key 前后不要有多余空格
- 修改 `.env.local` 后必须重启网页服务

## 5. 启动 Web App

运行：

```bash
npm run dev
```

如果启动成功，会看到类似：

```text
VITE ready
Local: http://127.0.0.1:5173/
```

然后在浏览器打开终端里显示的网址。

常见地址：

```text
http://127.0.0.1:5173/
```

如果 5173 被占用，Vite 可能会自动换成：

```text
http://127.0.0.1:5174/
http://127.0.0.1:5175/
```

以终端显示的地址为准。

## 6. 使用方法

打开网页后：

1. 在 Ticker 输入框输入股票代码，例如：

```text
NVDA
TSLA
AAPL
MSFT
```

2. 点击 `Run Full Analysis`

3. 系统会依次运行：

```text
Data Agent
News Agent
Analysis Agent
Risk Agent
Report Agent
```

4. 页面会显示：

- 股票价格
- 涨跌幅
- 价格趋势图
- 新闻总结
- 风险分析
- 最终投资报告
- Agent 执行日志

## 7. 每个 Agent 的作用

Data Agent：

```text
调用真实行情接口，获取股票价格和 intraday chart。
```

News Agent：

```text
调用 Gemini 和 Google Search，搜索并总结近期新闻。
```

Analysis Agent：

```text
分析估值、成长性、利润率和趋势。
```

Risk Agent：

```text
分析主要风险和机会。
```

Report Agent：

```text
综合所有结果，生成最终投资简报。
```

## 8. 常见问题

### 问题 1：Gemini API key not valid

可能原因：

- `.env.local` 里的 key 复制错了
- key 前后有空格
- key 被 Google 删除或禁用了
- 不是 Google AI Studio 创建的 Gemini API key
- 修改 `.env.local` 后没有重启 `npm run dev`

解决方法：

1. 检查 `.env.local`
2. 确认 key 没有引号和空格
3. 重启服务：

```bash
Ctrl + C
npm run dev
```

### 问题 2：页面没有更新

解决方法：

```text
按 Ctrl + F5 硬刷新浏览器
```

或者重启 dev server：

```bash
Ctrl + C
npm run dev
```

### 问题 3：npm install 报错

可以尝试：

```bash
npm install
```

如果还是失败，检查：

- Node.js 是否安装
- 当前目录是不是项目根目录
- 网络是否正常

### 问题 4：端口不是 5173

这是正常的。

如果 5173 被占用，Vite 会自动使用别的端口。浏览器打开终端里显示的 `Local` 地址即可。

## 9. 项目主要文件

```text
src/App.jsx
```

React 页面和 dashboard 逻辑。

```text
src/services/agentApi.js
```

Agent workflow 和 Gemini API 调用逻辑。

```text
src/services/marketData.js
```

真实股票价格和曲线数据处理逻辑。

```text
vite.config.js
```

本地市场数据代理接口，解决浏览器直接请求行情接口可能遇到的 CORS 问题。

```text
.env.local
```

本地 Gemini API key 配置文件。

## 10. 简单运行流程总结

如果已经有 Node.js，最短步骤是：

```bash
cd 项目路径
npm install
```

创建 `.env.local`：

```env
VITE_GEMINI_API_KEY=你的Gemini_API_Key
VITE_GEMINI_MODEL=gemini-2.5-flash
VITE_GEMINI_USE_GOOGLE_SEARCH=true
```

启动：

```bash
npm run dev
```

打开终端显示的网址，例如：

```text
http://127.0.0.1:5173/
```
