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

  const bridgeToken = String(process.env.OPENCLAW_BRIDGE_TOKEN || "").trim();
  const allowUnauthenticated = String(process.env.OPENCLAW_ALLOW_UNAUTHENTICATED || "").trim() === "1";
  const authHeader = String(req.headers.authorization || "").trim();
  const incomingToken = String(req.headers["x-openclaw-bridge-token"] || "").trim();
  if (!allowUnauthenticated) {
    if (authHeader.toLowerCase().startsWith("bearer ")) {
      const user = await verifySupabaseUser(authHeader.slice(7).trim());
      if (!user) return res.status(401).json({ error: { message: "Please sign in before using the agent." } });
    } else if (bridgeToken && incomingToken === bridgeToken) {
      // Optional machine-to-machine fallback for private testing.
    } else {
      return res.status(401).json({ error: { message: "Please sign in before using the agent." } });
    }
  }

  const provider = req.body?.provider && typeof req.body.provider === "object" ? req.body.provider : {};
  const endpoint = String(provider.endpoint || "").trim();
  const apiKey = String(provider.apiKey || "").trim();
  if (!endpoint) {
    return res.status(400).json({ error: { message: "Missing model API endpoint. Set it in your account settings." } });
  }
  if (!apiKey) {
    return res.status(400).json({ error: { message: "Missing model API key. Set it in your account settings." } });
  }
  if (!/^https?:\/\//i.test(endpoint)) {
    return res.status(400).json({ error: { message: "Model API endpoint must start with http:// or https://" } });
  }

  const timeout = Number(process.env.OPENCLAW_TIMEOUT_MS || 30000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const payload = {
      ...req.body,
      provider: undefined,
      model: req.body?.model || process.env.OPENCLAW_MODEL || "openclaw-agent",
      stream: false
    };

    const headers = { "Content-Type": "application/json" };
    headers.Authorization = "Bearer " + apiKey.replace(/^Bearer\s+/i, "");

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

async function verifySupabaseUser(accessToken) {
  const supabaseUrl = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "https://vtplvtwbkyydxmcxgctn.supabase.co").trim();
  const supabaseAnonKey = String(process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ0cGx2dHdia3l5ZHhtY3hnY3RuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2MDI1NDYsImV4cCI6MjA4ODE3ODU0Nn0.JmmCCDbv9rkVSSCOfhrFwUgwzNMTvsDda_C956EjatU").trim();
  if (!accessToken || !supabaseUrl || !supabaseAnonKey) return null;

  try {
    const response = await fetch(supabaseUrl.replace(/\/$/, "") + "/auth/v1/user", {
      headers: {
        apikey: supabaseAnonKey,
        Authorization: "Bearer " + accessToken
      }
    });
    if (!response.ok) return null;
    const user = await response.json();
    return user?.id ? user : null;
  } catch (error) {
    return null;
  }
}
