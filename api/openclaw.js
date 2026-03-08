const DEFAULT_TIMEOUT_MS = 25000;

function getConfig() {
  const endpoint = String(process.env.OPENCLAW_ENDPOINT || "").trim();
  const apiKey = String(process.env.OPENCLAW_API_KEY || "").trim();
  const bridgeToken = String(process.env.OPENCLAW_BRIDGE_TOKEN || "").trim();
  const model = String(process.env.OPENCLAW_MODEL || "openclaw").trim();
  const timeoutMs = Number(process.env.OPENCLAW_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);

  if (!endpoint) {
    throw new Error("OPENCLAW_ENDPOINT 未配置");
  }

  if (!bridgeToken) {
    throw new Error("OPENCLAW_BRIDGE_TOKEN 未配置");
  }

  return {
    endpoint,
    apiKey,
    bridgeToken,
    model,
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT_MS
  };
}

function withCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-OpenClaw-Bridge-Token");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
}

function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === "object") return req.body;

  try {
    return JSON.parse(req.body);
  } catch (error) {
    return {};
  }
}

function normalizeContent(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map(function (item) {
        if (typeof item === "string") return item;
        if (item && typeof item.text === "string") return item.text;
        return "";
      })
      .join("\n")
      .trim();
  }
  return "";
}

const MAX_HISTORY_MESSAGES = 12;
const MAX_MESSAGE_CHARS = 3200;

function sanitizeMessages(input) {
  if (!Array.isArray(input)) return [];

  return input
    .map(function (item) {
      if (!item || typeof item !== "object") return null;
      const role = String(item.role || "").trim().toLowerCase();
      if (role !== "user" && role !== "assistant" && role !== "system") return null;

      const content = normalizeContent(item.content).trim().slice(0, MAX_MESSAGE_CHARS);
      if (!content) return null;

      return { role, content };
    })
    .filter(Boolean)
    .slice(-MAX_HISTORY_MESSAGES);
}

function pickAnswer(payload) {
  if (!payload || typeof payload !== "object") return "";

  const messageContent = normalizeContent(payload?.choices?.[0]?.message?.content);
  if (messageContent) return messageContent;

  const textContent = normalizeContent(payload?.choices?.[0]?.text);
  if (textContent) return textContent;

  const outputText = normalizeContent(payload?.output_text);
  if (outputText) return outputText;

  const messageText = normalizeContent(payload?.message);
  if (messageText) return messageText;

  return "";
}

function looksLikeHtml(input) {
  const text = String(input || "").trim().toLowerCase();
  return text.startsWith("<!doctype html") || text.startsWith("<html");
}

function pickPlainTextAnswer(upstreamText) {
  if (looksLikeHtml(upstreamText)) return "";
  const plain = String(upstreamText || "").trim();
  return plain ? plain.slice(0, 12000) : "";
}

function pickUpstreamError(upstreamRes, upstreamData, upstreamText) {
  const dataError =
    upstreamData?.error?.message ||
    upstreamData?.message ||
    "";
  if (dataError) return String(dataError);

  if (looksLikeHtml(upstreamText)) {
    if (Number(upstreamRes?.status) === 530) {
      return "OpenClaw 隧道不可用，请检查本机 bridge 与 cloudflared 是否运行";
    }
    return "OpenClaw 上游返回异常页面，请检查隧道与本机服务";
  }

  const plain = String(upstreamText || "").trim();
  return plain ? plain.slice(0, 320) : "upstream request failed";
}

module.exports = async function handler(req, res) {
  withCors(res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    res.status(405).json({ ok: false, error: "Method not allowed" });
    return;
  }

  let config;
  try {
    config = getConfig();
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
    return;
  }

  const token = String(req.headers["x-openclaw-bridge-token"] || "").trim();
  if (!token || token !== config.bridgeToken) {
    res.status(401).json({ ok: false, error: "Bridge token invalid" });
    return;
  }

  const body = parseBody(req);
  const prompt = String(body.prompt || "").trim();
  const context = String(body.context || "").trim();
  const model = String(body.model || config.model || "openclaw").trim();
  const incomingMessages = sanitizeMessages(body.messages);

  if (!prompt && !incomingMessages.length) {
    res.status(400).json({ ok: false, error: "prompt or messages is required" });
    return;
  }

  const messages = [];
  const hasSystemRole = incomingMessages.some(function (item) {
    return item.role === "system";
  });
  if (context && !hasSystemRole) {
    messages.push({
      role: "system",
      content: context.slice(0, 2000)
    });
  }

  if (incomingMessages.length) {
    messages.push.apply(messages, incomingMessages);
  }

  if (prompt) {
    const normalizedPrompt = prompt.slice(0, 6000);
    const last = messages[messages.length - 1];
    if (!last || last.role !== "user" || last.content !== normalizedPrompt) {
      messages.push({
        role: "user",
        content: normalizedPrompt
      });
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(function () {
    controller.abort();
  }, config.timeoutMs);

  try {
    const headers = {
      "Content-Type": "application/json"
    };
    if (config.apiKey) {
      headers.Authorization = "Bearer " + config.apiKey;
    }

    const upstreamRes = await fetch(config.endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        temperature: 0.6
      }),
      signal: controller.signal
    });

    const upstreamText = await upstreamRes.text();
    let upstreamData = null;
    try {
      upstreamData = JSON.parse(upstreamText);
    } catch (error) {
      upstreamData = null;
    }

    if (!upstreamRes.ok) {
      const reason = pickUpstreamError(upstreamRes, upstreamData, upstreamText);
      res.status(upstreamRes.status).json({ ok: false, error: reason });
      return;
    }

    const answer = pickAnswer(upstreamData) || pickPlainTextAnswer(upstreamText);
    if (!answer) {
      res.status(502).json({ ok: false, error: "upstream response has no text" });
      return;
    }

    res.status(200).json({ ok: true, text: answer });
  } catch (error) {
    const isAbort = error && (error.name === "AbortError" || error.code === "ABORT_ERR");
    res.status(isAbort ? 504 : 502).json({
      ok: false,
      error: isAbort ? "openclaw request timeout" : "openclaw request failed"
    });
  } finally {
    clearTimeout(timer);
  }
};
