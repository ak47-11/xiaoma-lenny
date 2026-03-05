(function () {
  const SUPABASE_URL = "https://vtplvtwbkyydxmcxgctn.supabase.co";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ0cGx2dHdia3l5ZHhtY3hnY3RuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2MDI1NDYsImV4cCI6MjA4ODE3ODU0Nn0.JmmCCDbv9rkVSSCOfhrFwUgwzNMTvsDda_C956EjatU";

  const viewerTextEl = document.getElementById("viewerText");
  const statusEl = document.getElementById("status");
  const displayNameEl = document.getElementById("displayName");
  const contactEl = document.getElementById("contact");
  const bioEl = document.getElementById("bio");
  const saveBtn = document.getElementById("saveBtn");
  const logoutBtn = document.getElementById("logoutBtn");

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

    const result = await activeClient
      .from("profiles")
      .select("display_name,bio,contact")
      .eq("id", currentUser.id)
      .maybeSingle();

    if (!result.error && result.data) {
      displayNameEl.value = result.data.display_name || "";
      bioEl.value = result.data.bio || "";
      contactEl.value = result.data.contact || "";
    }

    setStatus("资料已加载，你可以修改后保存", "ok");
  }

  saveBtn.addEventListener("click", async function () {
    if (!currentUser) return;
    const payload = {
      id: currentUser.id,
      display_name: displayNameEl.value.trim(),
      bio: bioEl.value.trim(),
      contact: contactEl.value.trim()
    };

    saveBtn.disabled = true;
    saveBtn.textContent = "保存中...";
    const result = await activeClient.from("profiles").upsert(payload, { onConflict: "id" });
    saveBtn.disabled = false;
    saveBtn.textContent = "保存资料";

    if (result.error) {
      setStatus("保存失败：" + result.error.message, "err");
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
