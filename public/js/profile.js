(function () {
  const SUPABASE_URL = "https://vtplvtwbkyydxmcxgctn.supabase.co";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ0cGx2dHdia3l5ZHhtY3hnY3RuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2MDI1NDYsImV4cCI6MjA4ODE3ODU0Nn0.JmmCCDbv9rkVSSCOfhrFwUgwzNMTvsDda_C956EjatU";

  const viewerTextEl = document.getElementById("viewerText");
  const statusEl = document.getElementById("status");
  const displayNameEl = document.getElementById("displayName");
  const usernameEl = document.getElementById("username");
  const contactEl = document.getElementById("contact");
  const bioEl = document.getElementById("bio");
  const saveBtn = document.getElementById("saveBtn");
  const logoutBtn = document.getElementById("logoutBtn");

  const schemaSupport = {
    username: true,
    bio: true,
    contact: true
  };

  function setStatus(text, kind) {
    statusEl.textContent = text;
    statusEl.className = "status" + (kind ? " " + kind : "");
  }

  function createClient(storage) {
    return window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, storage }
    });
  }

  const sbLocal = createClient(window.localStorage);
  const sbSession = createClient(window.sessionStorage);
  let activeClient = sbLocal;
  let currentUser = null;

  function getMissingColumn(errorMessage) {
    const message = String(errorMessage || "");
    const match = message.match(/'([^']+)' column/);
    return match ? match[1] : "";
  }

  function markUnsupportedColumn(column) {
    if (!column || !(column in schemaSupport)) return;
    schemaSupport[column] = false;
  }

  function applySchemaSupportToUI() {
    if (usernameEl && !schemaSupport.username) {
      usernameEl.disabled = true;
      usernameEl.placeholder = "数据库未启用 username 字段";
    }
    if (bioEl && !schemaSupport.bio) {
      bioEl.disabled = true;
      bioEl.placeholder = "数据库未启用 bio 字段";
    }
    if (contactEl && !schemaSupport.contact) {
      contactEl.disabled = true;
      contactEl.placeholder = "数据库未启用 contact 字段";
    }
  }

  async function probeSchemaColumns() {
    const probes = ["username", "bio", "contact"];
    for (const column of probes) {
      const result = await activeClient.from("profiles").select(column).limit(1);
      if (result.error && String(result.error.message || "").includes("column")) {
        markUnsupportedColumn(column);
      }
    }
    applySchemaSupportToUI();
  }

  async function upsertProfileWithFallback(payload) {
    let currentPayload = { ...payload };
    let lastError = null;

    for (let count = 0; count < 4; count += 1) {
      const result = await activeClient.from("profiles").upsert(currentPayload, { onConflict: "id" });
      if (!result.error) return { ok: true };

      lastError = result.error;
      const missing = getMissingColumn(result.error.message);
      if (!missing || !(missing in currentPayload)) break;

      delete currentPayload[missing];
      markUnsupportedColumn(missing);
      applySchemaSupportToUI();
    }

    return { ok: false, error: lastError };
  }

  async function getContext() {
    const local = (await sbLocal.auth.getSession()).data.session;
    if (local?.user) return { client: sbLocal, session: local };
    const sessionOnly = (await sbSession.auth.getSession()).data.session;
    if (sessionOnly?.user) return { client: sbSession, session: sessionOnly };
    return { client: sbLocal, session: null };
  }

  async function loadProfile() {
    const ctx = await getContext();
    activeClient = ctx.client;
    currentUser = ctx.session?.user || null;

    if (!currentUser) {
      window.location.href = "/auth.html?next=/profile.html";
      return;
    }

    viewerTextEl.textContent = "当前账号：" + (currentUser.email || currentUser.id);

    await probeSchemaColumns();

    const result = await activeClient
      .from("profiles")
      .select("*")
      .eq("id", currentUser.id)
      .maybeSingle();

    if (result.error) {
      const missing = getMissingColumn(result.error.message);
      markUnsupportedColumn(missing);
      applySchemaSupportToUI();
      setStatus("资料读取部分字段失败，请执行最新 SQL 迁移", "err");
      return;
    }

    if (result.data) {
      displayNameEl.value = result.data.display_name || "";
      if (usernameEl && schemaSupport.username) usernameEl.value = result.data.username || "";
      if (bioEl && schemaSupport.bio) bioEl.value = result.data.bio || "";
      if (contactEl && schemaSupport.contact) contactEl.value = result.data.contact || "";
    } else {
      displayNameEl.value = currentUser.user_metadata?.full_name || currentUser.email || "";
    }

    setStatus("资料已加载，你可以修改后保存", "ok");
  }

  saveBtn.addEventListener("click", async function () {
    if (!currentUser) return;
    const username = (usernameEl?.value || "").trim().toLowerCase();
    if (username && !/^[a-z0-9_]{3,24}$/.test(username)) {
      setStatus("用户名仅支持小写字母、数字、下划线，长度 3-24", "err");
      return;
    }

    const payload = {
      id: currentUser.id,
      display_name: displayNameEl.value.trim()
    };
    if (schemaSupport.username) payload.username = username;
    if (schemaSupport.bio) payload.bio = bioEl.value.trim();
    if (schemaSupport.contact) payload.contact = contactEl.value.trim();

    saveBtn.disabled = true;
    saveBtn.textContent = "保存中...";
    const result = await upsertProfileWithFallback(payload);
    saveBtn.disabled = false;
    saveBtn.textContent = "保存资料";

    if (!result.ok) {
      const text = String(result.error?.message || "").toLowerCase();
      if (text.includes("duplicate") && text.includes("username")) {
        setStatus("保存失败：该用户名已被占用，请更换", "err");
        return;
      }
      setStatus("保存失败：" + (result.error?.message || "未知错误") + "。请执行最新 SQL 迁移", "err");
      return;
    }

    setStatus("保存成功", "ok");
  });

  logoutBtn.addEventListener("click", async function () {
    await sbLocal.auth.signOut();
    await sbSession.auth.signOut();
    window.location.href = "/auth.html";
  });

  loadProfile();
})();
