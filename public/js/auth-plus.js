(function () {
  const script = document.currentScript;
  const supabaseUrl = script?.dataset?.supabaseUrl || "";
  const supabaseAnonKey = script?.dataset?.supabaseAnonKey || "";

  const statusEl = document.getElementById("status");
  const sessionBarEl = document.getElementById("sessionBar");

  const emailEl = document.getElementById("email");
  const passwordEl = document.getElementById("password");
  const rememberMeEl = document.getElementById("rememberMe");

  const otpIdentityEl = document.getElementById("otpIdentity");
  const otpCodeEl = document.getElementById("otpCode");

  const loginBtn = document.getElementById("loginBtn");
  const registerBtn = document.getElementById("registerLink");
  const forgotBtn = document.getElementById("forgotLink");
  const showPasswordEl = document.getElementById("showPassword");

  const sendOtpBtn = document.getElementById("sendOtpBtn");
  const verifyOtpBtn = document.getElementById("verifyOtpBtn");

  const oauthGoogleBtn = document.getElementById("oauthGoogleBtn");
  const oauthTwitterBtn = document.getElementById("oauthTwitterBtn");

  const ADMIN_EMAILS = ["3102850054@qq.com"];
  const rememberCache = localStorage.getItem("xiaoma_remember_auth");
  if (rememberMeEl && rememberCache !== null) {
    rememberMeEl.checked = rememberCache === "1";
  }

  function setStatus(text, kind) {
    statusEl.textContent = text;
    statusEl.className = "status";
    if (kind) statusEl.classList.add(kind);
  }

  function setLoading(button, loading, defaultText, loadingText) {
    button.disabled = loading;
    button.textContent = loading ? loadingText : defaultText;
  }

  function isEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  function getNextPath() {
    const url = new URL(window.location.href);
    const next = url.searchParams.get("next");
    if (!next || !next.startsWith("/")) return "/";
    return next;
  }

  function createClient(storage) {
    return window.supabase.createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        storage
      }
    });
  }

  if (!supabaseUrl || !supabaseAnonKey) {
    setStatus("请先配置 Supabase 参数", "err");
    return;
  }

  const sbLocal = createClient(window.localStorage);
  const sbSession = createClient(window.sessionStorage);

  async function getAuthContext() {
    const localSession = (await sbLocal.auth.getSession()).data.session;
    if (localSession) return { client: sbLocal, session: localSession, mode: "local" };

    const sessionOnly = (await sbSession.auth.getSession()).data.session;
    if (sessionOnly) return { client: sbSession, session: sessionOnly, mode: "session" };

    return { client: sbLocal, session: null, mode: "local" };
  }

  async function checkAdmin(client, user) {
    if (!user) return false;
    if (ADMIN_EMAILS.includes((user.email || "").toLowerCase())) return true;

    try {
      const result = await client
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();
      return !result.error && result.data?.role === "admin";
    } catch (error) {
      return false;
    }
  }

  async function renderSessionBar() {
    const context = await getAuthContext();
    const user = context.session?.user;

    if (!user) {
      sessionBarEl.style.display = "none";
      return;
    }

    const isAdmin = await checkAdmin(context.client, user);
    const nextPath = getNextPath();

    sessionBarEl.innerHTML =
      "<div class='session-text'>当前已登录：" + (user.email || "未命名用户") + "</div>" +
      "<div class='session-actions'>" +
      "<button type='button' class='mini-btn' id='goNextBtn'>继续访问</button>" +
      "<button type='button' class='mini-btn' id='goCommunityBtn'>社区首页</button>" +
      (isAdmin ? "<button type='button' class='mini-btn' id='goAdminBtn'>管理台</button>" : "") +
      "<button type='button' class='mini-btn' id='logoutBtn'>退出登录</button>" +
      "</div>";

    sessionBarEl.style.display = "block";

    document.getElementById("goNextBtn").addEventListener("click", function () {
      window.location.href = nextPath;
    });
    document.getElementById("goCommunityBtn").addEventListener("click", function () {
      window.location.href = "/community.html";
    });
    if (isAdmin) {
      document.getElementById("goAdminBtn").addEventListener("click", function () {
        window.location.href = "/admin.html";
      });
    }
    document.getElementById("logoutBtn").addEventListener("click", async function () {
      await sbLocal.auth.signOut();
      await sbSession.auth.signOut();
      setStatus("已退出登录", "ok");
      sessionBarEl.style.display = "none";
    });

    setStatus("检测到登录状态，可直接继续访问", "ok");
  }

  function getActiveClient() {
    const remember = !!rememberMeEl.checked;
    localStorage.setItem("xiaoma_remember_auth", remember ? "1" : "0");
    return remember ? sbLocal : sbSession;
  }

  async function oauthLogin(provider, label) {
    const client = getActiveClient();
    setStatus("正在跳转 " + label + " 授权...", "");
    const result = await client.auth.signInWithOAuth({
      provider,
      options: { redirectTo: window.location.origin + getNextPath() }
    });
    if (result.error) setStatus(label + " 登录失败：" + result.error.message, "err");
  }

  document.querySelectorAll(".tab").forEach((button) => {
    button.addEventListener("click", function () {
      document.querySelectorAll(".tab").forEach((tab) => tab.classList.remove("active"));
      button.classList.add("active");
      const activeTab = button.dataset.tab;
      document.querySelectorAll(".form-panel").forEach((panel) => panel.classList.remove("active"));
      document.getElementById("panel-" + activeTab).classList.add("active");
      setStatus(activeTab === "password" ? "请输入邮箱和密码" : "请输入邮箱或手机号并获取验证码");
    });
  });

  showPasswordEl.addEventListener("change", function () {
    passwordEl.type = showPasswordEl.checked ? "text" : "password";
  });

  oauthGoogleBtn.addEventListener("click", function () {
    oauthLogin("google", "Google");
  });
  oauthTwitterBtn.addEventListener("click", function () {
    oauthLogin("twitter", "Twitter");
  });

  loginBtn.addEventListener("click", async function () {
    const email = (emailEl.value || "").trim();
    const password = passwordEl.value || "";
    if (!email || !password) return setStatus("请输入邮箱和密码", "err");
    if (!isEmail(email)) return setStatus("请输入正确的邮箱格式", "err");

    const client = getActiveClient();
    setLoading(loginBtn, true, "登录", "登录中...");
    const { error } = await client.auth.signInWithPassword({ email, password });
    setLoading(loginBtn, false, "登录", "登录中...");
    if (error) return setStatus("登录失败：" + error.message, "err");

    setStatus("登录成功，正在跳转", "ok");
    setTimeout(function () {
      window.location.href = getNextPath();
    }, 700);
  });

  registerBtn.addEventListener("click", async function () {
    const email = (emailEl.value || "").trim();
    const password = passwordEl.value || "";
    if (!email || !password) return setStatus("请先填写邮箱和密码", "err");
    if (!isEmail(email)) return setStatus("请输入正确的邮箱格式", "err");

    const client = getActiveClient();
    setLoading(registerBtn, true, "创建账号", "创建中...");
    const { error } = await client.auth.signUp({ email, password });
    setLoading(registerBtn, false, "创建账号", "创建中...");
    if (error) return setStatus("注册失败：" + error.message, "err");
    setStatus("注册成功，请到邮箱查收验证链接", "ok");
  });

  forgotBtn.addEventListener("click", async function () {
    const email = (emailEl.value || "").trim();
    if (!email) return setStatus("请输入邮箱后再找回密码", "err");
    if (!isEmail(email)) return setStatus("请输入正确的邮箱格式", "err");

    const client = getActiveClient();
    setLoading(forgotBtn, true, "忘记密码？", "发送中...");
    const { error } = await client.auth.resetPasswordForEmail(email);
    setLoading(forgotBtn, false, "忘记密码？", "发送中...");
    if (error) return setStatus("发送失败：" + error.message, "err");
    setStatus("重置链接已发送到邮箱", "ok");
  });

  sendOtpBtn.addEventListener("click", async function () {
    const identity = (otpIdentityEl.value || "").trim();
    if (!identity) return setStatus("请输入邮箱或手机号", "err");

    const client = getActiveClient();
    setLoading(sendOtpBtn, true, "发送验证码", "发送中...");
    const result = isEmail(identity)
      ? await client.auth.signInWithOtp({ email: identity, options: { shouldCreateUser: true } })
      : await client.auth.signInWithOtp({ phone: identity, options: { shouldCreateUser: true } });
    setLoading(sendOtpBtn, false, "发送验证码", "发送中...");
    if (result.error) return setStatus("发送失败：" + result.error.message, "err");

    setStatus("验证码已发送，请查收", "ok");
    otpCodeEl.focus();
  });

  verifyOtpBtn.addEventListener("click", async function () {
    const identity = (otpIdentityEl.value || "").trim();
    const token = (otpCodeEl.value || "").trim();
    if (!identity || !token) return setStatus("请填写完整验证码信息", "err");

    const client = getActiveClient();
    setLoading(verifyOtpBtn, true, "验证并登录", "验证中...");
    const result = isEmail(identity)
      ? await client.auth.verifyOtp({ email: identity, token, type: "email" })
      : await client.auth.verifyOtp({ phone: identity, token, type: "sms" });
    setLoading(verifyOtpBtn, false, "验证并登录", "验证中...");
    if (result.error) return setStatus("验证失败：" + result.error.message, "err");

    setStatus("登录成功，正在跳转", "ok");
    setTimeout(function () {
      window.location.href = getNextPath();
    }, 700);
  });

  otpCodeEl.addEventListener("input", function (event) {
    event.target.value = event.target.value.replace(/\D/g, "").slice(0, 6);
  });
  emailEl.addEventListener("keypress", function (event) {
    if (event.key === "Enter") passwordEl.focus();
  });
  passwordEl.addEventListener("keypress", function (event) {
    if (event.key === "Enter") loginBtn.click();
  });
  otpCodeEl.addEventListener("keypress", function (event) {
    if (event.key === "Enter") verifyOtpBtn.click();
  });

  renderSessionBar();
})();
