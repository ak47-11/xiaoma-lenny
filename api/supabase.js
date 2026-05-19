const SUPABASE_URL = "https://vtplvtwbkyydxmcxgctn.supabase.co";

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "authorization, apikey, content-type, x-client-info, x-supabase-api-version, prefer, range");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  const upstreamUrl = SUPABASE_URL + buildUpstreamPath(req);

  try {
    const response = await fetch(upstreamUrl, {
      method: req.method,
      headers: buildHeaders(req.headers),
      body: shouldSendBody(req.method) ? serializeBody(req) : undefined
    });

    const text = await response.text();
    res.status(response.status);
    res.setHeader("Content-Type", response.headers.get("content-type") || "application/json; charset=utf-8");
    if (response.headers.get("content-range")) res.setHeader("Content-Range", response.headers.get("content-range"));
    return res.send(text);
  } catch (error) {
    return res.status(502).json({ error: "Supabase proxy request failed", message: error.message });
  }
};

function buildUpstreamPath(req) {
  const query = new URLSearchParams();
  const rawPath = Array.isArray(req.query?.path) ? req.query.path.join("/") : String(req.query?.path || "");
  for (const [key, value] of Object.entries(req.query || {})) {
    if (key === "path") continue;
    if (Array.isArray(value)) {
      value.forEach((item) => query.append(key, item));
    } else if (value !== undefined) {
      query.set(key, String(value));
    }
  }

  const path = "/" + rawPath.replace(/^\/+/, "");
  const suffix = query.toString();
  return suffix ? path + "?" + suffix : path;
}

function buildHeaders(input) {
  const headers = {};
  const pass = ["authorization", "apikey", "content-type", "x-client-info", "x-supabase-api-version", "prefer", "range", "accept"];
  for (const key of pass) {
    if (input[key]) headers[key] = input[key];
  }
  return headers;
}

function shouldSendBody(method) {
  return !["GET", "HEAD"].includes(String(method || "").toUpperCase());
}

function serializeBody(req) {
  if (req.body === undefined || req.body === null) return undefined;
  if (Buffer.isBuffer(req.body) || typeof req.body === "string") return req.body;
  return JSON.stringify(req.body);
}
