# xiaoma-lenny

账号体系、三社区公开流与个人发布流已接入。

## OpenClaw / 中转站模型接入

当前方案使用：`站点 API 代理 (/api/openclaw) + Supabase 登录鉴权`。用户登录后可使用，模型 API Key 只保存在部署平台环境变量中，不会暴露到浏览器。

### 中转站配置

在 Vercel 项目里设置：

- `OPENCLAW_ENDPOINT`：例如 `https://jmrai.net/v1/chat/completions`
- `OPENCLAW_MODEL`：你的默认模型名
- `OPENCLAW_API_KEY`：你的中转站 API Key
- `SUPABASE_ANON_KEY`：站点 Supabase anon key，用于服务端验证登录用户
- `OPENCLAW_TIMEOUT_MS`：可选，默认 `30000`
- `OPENCLAW_ALLOWED_ORIGIN`：可选，限制浏览器来源，例如 `https://xiaoma.cyou`

网页 `/openclaw.html` 不再填写请求地址或 API Key。登录站点账号后即可使用。

### 文件资料上下文

页面支持上传 PDF、Word、Excel、txt、md、json、csv 等常用文件。当前实现是浏览器端提取文本后作为知识上下文发送给模型，并不是把文件真正训练进模型；后续如需长期知识库，可继续接向量库或 MCP Server。

## 本地 OpenClaw 接入（可选：Cloudflare Tunnel）

如需连接家里电脑上的本地模型，可继续使用：`Cloudflare Tunnel + 站点 API 代理 (/api/openclaw)`。

### 1) 在本机启动 OpenClaw

确保本机 OpenClaw 服务可本地访问（示例端口 `11434`）。

### 2) 暴露本机服务（不开放家里端口）

先登录 cloudflared：

```bash
cloudflared tunnel login
```

创建并运行命名隧道（示例把本机 `11434` 暴露到公网子域）：

```bash
cloudflared tunnel create xiaoma-openclaw
cloudflared tunnel route dns xiaoma-openclaw ai.your-domain.com
```

然后在 `~/.cloudflared/config.yml` 配置 ingress：

```yaml
tunnel: <TUNNEL_ID>
credentials-file: C:\Users\<you>\.cloudflared\<TUNNEL_ID>.json

ingress:
  - hostname: ai.your-domain.com
    service: http://127.0.0.1:11434
  - service: http_status:404
```

最后启动：

```bash
cloudflared tunnel run xiaoma-openclaw
```

如果你的 OpenClaw 是 OpenAI 兼容接口，最终 API 端点通常类似：

`https://ai.your-domain.com/v1/chat/completions`

### 3) 在站点部署平台配置环境变量

在 Vercel 项目里设置：

- `OPENCLAW_ENDPOINT`：例如 `https://ai.your-domain.com/v1/chat/completions`
- `OPENCLAW_MODEL`：例如 `openclaw`
- `OPENCLAW_API_KEY`：如你的 OpenClaw 网关需要 Bearer Token
- `OPENCLAW_BRIDGE_TOKEN`：前端调用 `/api/openclaw` 时的代理口令（必填，防止中转站密钥被刷）
- `OPENCLAW_TIMEOUT_MS`：可选，默认 `25000`
- `OPENCLAW_ALLOWED_ORIGIN`：可选，限制浏览器来源，例如 `https://xiaoma.cyou`
- `OPENCLAW_ALLOW_UNAUTHENTICATED`：可选，仅测试时设为 `1` 才允许无代理口令调用

### 4) 前端入口使用

首页已提供 `OpenClaw 新界面` 入口，点击后进入 `/openclaw.html` 独立对话页（参考 ChatGPT）。

首次使用点击 `接口设置`，填写：

- 模型名（默认 `openclaw-agent`）
- Bridge Token（与你环境变量 `OPENCLAW_BRIDGE_TOKEN` 一致）

然后输入问题并发送即可调用本地 OpenClaw。

### 5) 安全注意

- 不要把 `OPENCLAW_API_KEY` 和 `OPENCLAW_BRIDGE_TOKEN` 写进前端代码。
- 使用中转站时，推荐把中转站 API Key 放在 `OPENCLAW_API_KEY`，网页请求地址留空，只填写代理口令。
- `OPENCLAW_BRIDGE_TOKEN` 应设置成长随机字符串，不要使用常见密码；泄露后立即在部署平台更换。
- 前端不会长期保存 API Key 和代理口令，只保存在当前浏览器会话中，关闭标签页后需要重新填写。
- 仅在需要时开启本机 OpenClaw 与 cloudflared，关机/休眠时服务不可用属正常。
- 定期更新本机系统、OpenClaw 和 cloudflared 版本。

### 6) 解决“重启后接口失效”（自动拉起）

仓库内已提供自动自愈脚本：

- `scripts/openclaw-autostart.ps1`：检查并拉起本机 bridge + cloudflared
- `scripts/register-openclaw-autostart.ps1`：注册 Windows 登录自动任务

首次执行一次注册（推荐）：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\register-openclaw-autostart.ps1 -RunNow
```

如果系统策略不允许创建计划任务，脚本会自动回退到用户 `Startup` 文件夹启动器（同样可在重启后自动拉起）。

查看当前链路状态：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\openclaw-autostart.ps1 -Status
```

如果要移除自动任务：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\register-openclaw-autostart.ps1 -Unregister
```
