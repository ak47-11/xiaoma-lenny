module.exports = async function handler(req, res) {
  const allowedOrigin = String(process.env.OPENCLAW_ALLOWED_ORIGIN || "*").trim();
  res.setHeader("Access-Control-Allow-Origin", allowedOrigin || "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-OpenClaw-Bridge-Token");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(405).json({ error: { message: "Method not allowed" } });
  }

  const endpoint = process.env.OPENCLAW_ENDPOINT;
  if (!endpoint) {
    return res.status(500).json({ error: { message: "Missing OPENCLAW_ENDPOINT. Set it in Vercel or fill a direct API URL in the page." } });
  }

  const bridgeToken = String(process.env.OPENCLAW_BRIDGE_TOKEN || "").trim();
  const allowUnauthenticated = String(process.env.OPENCLAW_ALLOW_UNAUTHENTICATED || "").trim() === "1";
  if (!bridgeToken && !allowUnauthenticated) {
    return res.status(500).json({ error: { message: "Missing OPENCLAW_BRIDGE_TOKEN. Set a proxy password to protect your model API key." } });
  }

  const incomingToken = String(req.headers["x-openclaw-bridge-token"] || "").trim();
  if (bridgeToken && incomingToken !== bridgeToken) {
    return res.status(401).json({ error: { message: "Bridge token invalid" } });
  }

  const timeout = Number(process.env.OPENCLAW_TIMEOUT_MS || 30000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const payload = {
      ...req.body,
      model: req.body?.model || process.env.OPENCLAW_MODEL || "openclaw-agent",
      stream: false
    };

    const headers = { "Content-Type": "application/json" };
    if (process.env.OPENCLAW_API_KEY) headers.Authorization = "Bearer " + process.env.OPENCLAW_API_KEY;

    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    const text = await response.text();
    res.status(response.status);
    res.setHeader("Content-Type", response.headers.get("content-type") || "application/json; charset=utf-8");
    return res.send(text);
  } catch (error) {
    const message = error.name === "AbortError" ? "OpenClaw request timed out" : error.message;
    return res.status(502).json({ error: { message } });
  } finally {
    clearTimeout(timer);
  }
};
