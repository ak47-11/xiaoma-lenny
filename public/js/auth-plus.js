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
  const resendOtpBtn = document.getElementById("resendOtpBtn");
  const verifyOtpBtn = document.getElementById("verifyOtpBtn");


  const ADMIN_EMAILS = ["3102850054@qq.com"];
  const OTP_COOLDOWN_SECONDS = 60;
  const otpTimestampKey = "xiaoma_otp_last_sent_at";
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

  function otpFriendlyError(error) {
    const raw = String(error?.message || "");
    const text = raw.toLowerCase();
    if (text.includes("rate") || text.includes("too many")) {
      return "请求太频繁，请 60 秒后重试；也请检查垃圾邮箱";
    }
    if (text.includes("invalid") || text.includes("email")) {
      return "邮箱格式或配置异常，请确认邮箱地址与 Supabase 邮件配置";
    }
    return "发送失败：" + raw;
  }

  function getCooldownLeft() {
    const last = Number(localStorage.getItem(otpTimestampKey) || "0");
    if (!last) return 0;
    const seconds = Math.ceil((last + OTP_COOLDOWN_SECONDS * 1000 - Date.now()) / 1000);
    return Math.max(seconds, 0);
  }

  function renderOtpButtonState() {
    if (!resendOtpBtn) return;
    const left = getCooldownLeft();
    const disabled = left > 0;
    sendOtpBtn.disabled = disabled;
    resendOtpBtn.disabled = disabled;
    sendOtpBtn.textContent = disabled ? "稍后重发(" + left + "s)" : "发送验证码";
    resendOtpBtn.textContent = disabled ? "重新发送(" + left + "s)" : "重新发送";
  }

  function decodeAuthHashError() {
    const hash = window.location.hash || "";
    if (!hash.includes("error=")) return;

    const params = new URLSearchParams(hash.replace(/^#/, ""));
    const code = params.get("error_code") || "";
    const desc = decodeURIComponent((params.get("error_description") || "").replace(/\+/g, " "));

    if (code === "otp_expired") {
      setStatus("邮件登录链接已失效或已被使用，请重新发送最新邮件后只点击一次 Log In", "err");
    } else {
      setStatus("登录链接异常：" + (desc || code || "未知错误"), "err");
    }

    history.replaceState({}, document.title, window.location.pathname + window.location.search);
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
  setInterval(renderOtpButtonState, 1000);

  function bindAuthStateWatch(client) {
    client.auth.onAuthStateChange(function (event, session) {
      if (!session?.user) return;
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        setStatus("已通过邮件链接完成登录，正在跳转", "ok");
        setTimeout(function () {
          window.location.href = getNextPath();
        }, 700);
      }
    });
  }

  bindAuthStateWatch(sbLocal);
  bindAuthStateWatch(sbSession);

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

  document.querySelectorAll(".tab").forEach((button) => {
    button.addEventListener("click", function () {
      document.querySelectorAll(".tab").forEach((tab) => tab.classList.remove("active"));
      button.classList.add("active");
      const activeTab = button.dataset.tab;
      document.querySelectorAll(".form-panel").forEach((panel) => panel.classList.remove("active"));
      document.getElementById("panel-" + activeTab).classList.add("active");
      setStatus(activeTab === "password" ? "请输入邮箱和密码" : "请输入邮箱并获取验证码");
    });
  });

  showPasswordEl.addEventListener("change", function () {
    passwordEl.type = showPasswordEl.checked ? "text" : "password";
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
    if (!identity) return setStatus("请输入邮箱", "err");
    if (!isEmail(identity)) return setStatus("验证码登录仅支持邮箱，请输入正确邮箱", "err");
    if (getCooldownLeft() > 0) return setStatus("验证码发送过于频繁，请稍候再试", "err");

    const client = getActiveClient();
    setLoading(sendOtpBtn, true, "发送验证码", "发送中...");
    const result = await client.auth.signInWithOtp({
      email: identity,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: window.location.origin + "/auth.html?next=" + encodeURIComponent(getNextPath())
      }
    });
    setLoading(sendOtpBtn, false, "发送验证码", "发送中...");
    if (result.error) return setStatus(otpFriendlyError(result.error), "err");

    localStorage.setItem(otpTimestampKey, String(Date.now()));
    renderOtpButtonState();
    setStatus("邮件已发送。若收到 Magic Link，请直接点击邮件里的 Log In；若有验证码/Token 也可在此输入验证。", "ok");
    otpCodeEl.focus();
  });

  if (resendOtpBtn) {
    resendOtpBtn.addEventListener("click", function () {
      sendOtpBtn.click();
    });
  }

  verifyOtpBtn.addEventListener("click", async function () {
    const identity = (otpIdentityEl.value || "").trim();
    const token = (otpCodeEl.value || "").trim();
    if (!identity) return setStatus("请先输入邮箱", "err");
    if (!isEmail(identity)) return setStatus("验证码登录仅支持邮箱，请输入正确邮箱", "err");

    if (!token) {
      const context = await getAuthContext();
      if (context.session?.user) {
        setStatus("已识别到 Magic Link 登录状态，正在跳转", "ok");
        setTimeout(function () {
          window.location.href = getNextPath();
        }, 600);
        return;
      }
      return setStatus("如果邮件里没有验证码，请直接点击邮件中的 Log In 按钮完成登录", "err");
    }

    const client = getActiveClient();
    setLoading(verifyOtpBtn, true, "验证并登录", "验证中...");
    const result = await client.auth.verifyOtp({ email: identity, token, type: "email" });
    setLoading(verifyOtpBtn, false, "验证并登录", "验证中...");
    if (result.error) return setStatus("验证失败：" + result.error.message, "err");

    setStatus("登录成功，正在跳转", "ok");
    setTimeout(function () {
      window.location.href = getNextPath();
    }, 700);
  });

  otpCodeEl.addEventListener("input", function (event) {
    event.target.value = event.target.value.trim().slice(0, 64);
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

  renderOtpButtonState();
  decodeAuthHashError();
  renderSessionBar();
})();
