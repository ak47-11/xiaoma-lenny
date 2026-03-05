(function () {
  if (!window.supabase) return;

  const SUPABASE_URL = "https://vtplvtwbkyydxmcxgctn.supabase.co";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ0cGx2dHdia3l5ZHhtY3hnY3RuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2MDI1NDYsImV4cCI6MjA4ODE3ODU0Nn0.JmmCCDbv9rkVSSCOfhrFwUgwzNMTvsDda_C956EjatU";

  function createClient(storage) {
    return window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, storage }
    });
  }

  const localClient = createClient(window.localStorage);
  const sessionClient = createClient(window.sessionStorage);

  async function getSessionContext() {
    const local = (await localClient.auth.getSession()).data.session;
    if (local?.user) return { client: localClient, session: local };

    const sess = (await sessionClient.auth.getSession()).data.session;
    if (sess?.user) return { client: sessionClient, session: sess };

    return { client: localClient, session: null };
  }

  async function isAdmin(client, userId) {
    try {
      const result = await client.from("profiles").select("role").eq("id", userId).maybeSingle();
      return !result.error && result.data?.role === "admin";
    } catch (error) {
      return false;
    }
  }

  async function applyNavState() {
    const loginNav = document.getElementById("loginNav");
    const logoutNav = document.getElementById("logoutNav");
    const profileNav = document.getElementById("profileNav");
    const adminNav = document.getElementById("adminNav");
    const userHint = document.getElementById("userHint");

    if (!loginNav && !logoutNav && !profileNav && !adminNav && !userHint) return;

    const context = await getSessionContext();
    const user = context.session?.user;

    if (!user) {
      if (loginNav) loginNav.style.display = "inline-flex";
      if (logoutNav) logoutNav.style.display = "none";
      if (profileNav) profileNav.style.display = "none";
      if (adminNav) adminNav.style.display = "none";
      if (userHint) userHint.textContent = "游客模式：可浏览，发布需登录";
      return;
    }

    if (loginNav) loginNav.style.display = "none";
    if (logoutNav) logoutNav.style.display = "inline-flex";
    if (profileNav) profileNav.style.display = "inline-flex";
    if (userHint) userHint.textContent = "当前账号：" + (user.email || user.id);

    const admin = await isAdmin(context.client, user.id);
    if (adminNav) adminNav.style.display = admin ? "inline-flex" : "none";

    if (logoutNav) {
      logoutNav.addEventListener("click", async function (event) {
        event.preventDefault();
        await localClient.auth.signOut();
        await sessionClient.auth.signOut();
        window.location.href = "/auth.html";
      });
    }
  }

  async function requireLogin(nextPath) {
    const context = await getSessionContext();
    if (context.session?.user) return context;
    window.location.href = "/auth.html?next=" + encodeURIComponent(nextPath || (window.location.pathname + window.location.search));
    return null;
  }

  window.XiaomaCore = {
    supabaseUrl: SUPABASE_URL,
    supabaseAnonKey: SUPABASE_ANON_KEY,
    localClient,
    sessionClient,
    getSessionContext,
    isAdmin,
    applyNavState,
    requireLogin
  };
})();
