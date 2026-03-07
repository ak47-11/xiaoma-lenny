# xiaoma-lenny

账号体系、三社区公开流与个人发布流已接入。

## 本地 OpenClaw 接入（推荐：Cloudflare Tunnel）

当前方案使用：`Cloudflare Tunnel + 站点 API 代理 (/api/openclaw)`。

### 1) 在本机启动 OpenClaw

确保本机 OpenClaw 服务可本地访问（示例端口 `11434`）。

### 2) 暴露本机服务（不开放家里端口）

先登录 cloudflared：

```bash
cloudflared tunnel login
```

创建并运行隧道（示例把本机 `11434` 暴露到公网子域）：

```bash
cloudflared tunnel create xiaoma-openclaw
cloudflared tunnel route dns xiaoma-openclaw ai.your-domain.com
cloudflared tunnel run xiaoma-openclaw --url http://127.0.0.1:11434
```

如果你的 OpenClaw 是 OpenAI 兼容接口，最终 API 端点通常类似：

`https://ai.your-domain.com/v1/chat/completions`

### 3) 在站点部署平台配置环境变量

在 Vercel 项目里设置：

- `OPENCLAW_ENDPOINT`：例如 `https://ai.your-domain.com/v1/chat/completions`
- `OPENCLAW_MODEL`：例如 `openclaw`
- `OPENCLAW_API_KEY`：如你的 OpenClaw 网关需要 Bearer Token
- `OPENCLAW_BRIDGE_TOKEN`：前端按钮调用时的二次鉴权口令（必填）
- `OPENCLAW_TIMEOUT_MS`：可选，默认 `25000`

### 4) 前端按钮使用

`M / Mi / Lenny` 页面已内置 `OpenClaw 接口按钮`。

首次使用点击 `接口设置`，填写：

- 模型名（默认 `openclaw`）
- Bridge Token（与你环境变量 `OPENCLAW_BRIDGE_TOKEN` 一致）

然后输入问题并点击按钮即可调用本地 OpenClaw。

### 5) 安全注意

- 不要把 `OPENCLAW_API_KEY` 和 `OPENCLAW_BRIDGE_TOKEN` 写进前端代码。
- 仅在需要时开启本机 OpenClaw 与 cloudflared，关机/休眠时服务不可用属正常。
- 定期更新本机系统、OpenClaw 和 cloudflared 版本。
