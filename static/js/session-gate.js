(function () {
  if (!window.supabase) return;

  const SUPABASE_URL = "https://vtplvtwbkyydxmcxgctn.supabase.co";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ0cGx2dHdia3l5ZHhtY3hnY3RuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2MDI1NDYsImV4cCI6MjA4ODE3ODU0Nn0.JmmCCDbv9rkVSSCOfhrFwUgwzNMTvsDda_C956EjatU";

  function createClient(storage) {
    return window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, storage }
    });
  }

  const sbLocal = createClient(window.localStorage);
  const sbSession = createClient(window.sessionStorage);

  async function getSessionContext() {
    const local = (await sbLocal.auth.getSession()).data.session;
    if (local?.user) return { client: sbLocal, session: local };
    const sessionOnly = (await sbSession.auth.getSession()).data.session;
    if (sessionOnly?.user) return { client: sbSession, session: sessionOnly };
    return { client: sbLocal, session: null };
  }

  async function checkAdmin(client, userId) {
    try {
      const res = await client.from("profiles").select("role").eq("id", userId).maybeSingle();
      return !res.error && res.data?.role === "admin";
    } catch (error) {
      return false;
    }
  }

  async function applyNavState() {
    const loginNav = document.getElementById("loginNav");
    const logoutNav = document.getElementById("logoutNav");
    const profileNav = document.getElementById("profileNav");
    const adminNav = document.getElementById("adminNav");
    if (!loginNav && !logoutNav && !profileNav && !adminNav) return;

    const context = await getSessionContext();
    const user = context.session?.user;

    if (!user) {
      if (loginNav) loginNav.style.display = "inline-block";
      if (logoutNav) logoutNav.style.display = "none";
      if (profileNav) profileNav.style.display = "none";
      if (adminNav) adminNav.style.display = "none";
      return;
    }

    if (loginNav) loginNav.style.display = "none";
    if (logoutNav) logoutNav.style.display = "inline-block";
    if (profileNav) profileNav.style.display = "inline-block";

    const isAdmin = await checkAdmin(context.client, user.id);
    if (adminNav) adminNav.style.display = isAdmin ? "inline-block" : "none";

    if (logoutNav) {
      logoutNav.addEventListener("click", async function (event) {
        event.preventDefault();
        await sbLocal.auth.signOut();
        await sbSession.auth.signOut();
        window.location.href = "/auth.html";
      });
    }
  }

  applyNavState();
})();
