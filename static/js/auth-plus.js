(function () {
  const script = document.currentScript;
  const supabaseUrl = script?.dataset?.supabaseUrl || "";
  const supabaseAnonKey = script?.dataset?.supabaseAnonKey || "";

  const statusEl = document.getElementById("status");
  const statusActionEl = document.getElementById("statusAction");
  const sessionBarEl = document.getElementById("sessionBar");
  const tabsEl = document.querySelector(".tabs");
  const panelsEl = document.querySelectorAll(".form-panel");
  const dividerEl = document.querySelector(".divider");

  const emailEl = document.getElementById("email");
  const passwordEl = document.getElementById("password");
  const passwordConfirmEl = document.getElementById("passwordConfirm");
  const registerOnlyFieldEl = document.getElementById("registerOnlyField");
  const rememberMeEl = document.getElementById("rememberMe");

  const otpIdentityEl = document.getElementById("otpIdentity");
  const otpIdentityLabelEl = document.getElementById("otpIdentityLabel");
  const otpCodeEl = document.getElementById("otpCode");
  const resetPasswordFieldEl = document.getElementById("resetPasswordField");
  const resetPasswordConfirmFieldEl = document.getElementById("resetPasswordConfirmField");
  const resetNewPasswordEl = document.getElementById("resetNewPassword");
  const resetNewPasswordConfirmEl = document.getElementById("resetNewPasswordConfirm");

  const loginBtn = document.getElementById("loginBtn");
  const registerBtn = document.getElementById("registerLink");
  const forgotBtn = document.getElementById("forgotLink");
  const showPasswordEl = document.getElementById("showPassword");

  const sendOtpBtn = document.getElementById("sendOtpBtn");
  const resendOtpBtn = document.getElementById("resendOtpBtn");
  const verifyOtpBtn = document.getElementById("verifyOtpBtn");


  const ADMIN_EMAILS = ["3102850054@qq.com"];
  const SUPPORT_EMAIL = "3102850054@qq.com";
  const OTP_COOLDOWN_SECONDS = 60;
  const otpTimestampKey = "xiaoma_otp_last_sent_at";
  const otpIdentityKey = "xiaoma_otp_last_identity";
  const rememberCache = localStorage.getItem("xiaoma_remember_auth");
  if (rememberMeEl && rememberCache !== null) {
    rememberMeEl.checked = rememberCache === "1";
  }

  function setStatus(text, kind) {
    statusEl.textContent = text;
    statusEl.className = "status";
    if (kind) statusEl.classList.add(kind);
    setStatusAction("");
  }

  function setStatusAction(action) {
    if (!statusActionEl) return;
    if (action === "contact_admin") {
      const subject = encodeURIComponent("用户名找回邮箱支持");
      const body = encodeURIComponent("你好，我忘记了注册邮箱，用户名是：\n\n请帮我协助找回，谢谢。");
      statusActionEl.innerHTML = "<a class='status-link' href='mailto:" + SUPPORT_EMAIL + "?subject=" + subject + "&body=" + body + "'>联系管理员协助找回邮箱</a>";
      statusActionEl.style.display = "flex";
      return;
    }

    statusActionEl.innerHTML = "";
    statusActionEl.style.display = "none";
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
    if (text.includes("user") && text.includes("not") && text.includes("found")) {
      return "该邮箱尚未注册，请先在账号密码页点击“创建账号”";
    }
    if (text.includes("signups") && text.includes("disabled")) {
      return "当前注册功能已关闭，请联系管理员";
    }
    if (text.includes("rate") || text.includes("too many")) {
      return "请求太频繁，请 60 秒后重试；也请检查垃圾邮箱";
    }
    if (text.includes("invalid") || text.includes("email")) {
      return "邮箱格式或配置异常，请确认邮箱地址与 Supabase 邮件配置";
    }
    return "发送失败：" + raw;
  }

  function authFriendlyError(action, error) {
    const raw = String(error?.message || "");
    const text = raw.toLowerCase();

    if (text.includes("invalid login credentials")) {
      return "邮箱或密码错误；如果你是验证码注册，请先点击“忘记密码”设置密码";
    }
    if (text.includes("email not confirmed")) {
      return "邮箱尚未验证，请先完成邮箱验证后再登录";
    }
    if (text.includes("too many") || text.includes("rate")) {
      return "请求过于频繁，请稍后再试";
    }
    if (text.includes("user") && text.includes("not") && text.includes("found")) {
      return "该邮箱未注册，请先创建账号";
    }
    if (text.includes("password should be at least")) {
      return "密码强度不足，请设置至少 6 位密码";
    }

    if (action === "login") return "登录失败：" + raw;
    if (action === "register") return "注册失败：" + raw;
    if (action === "reset") return "重置密码失败：" + raw;
    if (action === "verify") return "验证码校验失败：" + raw;
    return raw;
  }

  function getCurrentOtpIdentity() {
    return String((otpIdentityEl?.value || "").trim().toLowerCase());
  }

  function getCooldownLeft(identity) {
    const current = String(identity || "").toLowerCase();
    const cachedIdentity = String(localStorage.getItem(otpIdentityKey) || "").toLowerCase();
    if (!current || !cachedIdentity || current !== cachedIdentity) return 0;

    const last = Number(localStorage.getItem(otpTimestampKey) || "0");
    if (!last) return 0;
    const seconds = Math.ceil((last + OTP_COOLDOWN_SECONDS * 1000 - Date.now()) / 1000);
    return Math.max(seconds, 0);
  }

  function renderOtpButtonState() {
    if (!resendOtpBtn) return;
    const left = getCooldownLeft(getCurrentOtpIdentity());
    const disabled = left > 0;
    sendOtpBtn.disabled = disabled;
    resendOtpBtn.disabled = disabled;
    sendOtpBtn.textContent = disabled ? "稍后重发(" + left + "s)" : "发送验证码";
    resendOtpBtn.textContent = disabled ? "重新发送(" + left + "s)" : "重新发送";
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

  let otpPurpose = "login";
  let pendingRegisterEmail = "";
  let pendingRegisterPassword = "";
  let pendingResetEmail = "";
  let registerMode = false;
  let resetMode = false;

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
      setAuthFormVisible(true);
      return;
    }

    const isAdmin = await checkAdmin(context.client, user);
    const nextPath = getNextPath();

    sessionBarEl.innerHTML =
      "<div class='session-text'>当前已登录：" + (user.email || "未命名用户") + "</div>" +
      "<div class='session-actions'>" +
      "<button type='button' class='mini-btn' id='goNextBtn'>继续访问</button>" +
      "<button type='button' class='mini-btn' id='goProfileBtn'>个人中心</button>" +
      "<button type='button' class='mini-btn' id='goCommunityBtn'>社区首页</button>" +
      (isAdmin ? "<button type='button' class='mini-btn' id='goAdminBtn'>管理台</button>" : "") +
      "<button type='button' class='mini-btn' id='logoutBtn'>退出登录</button>" +
      "</div>";

    sessionBarEl.style.display = "block";

    document.getElementById("goNextBtn").addEventListener("click", function () {
      window.location.href = nextPath;
    });
    document.getElementById("goProfileBtn").addEventListener("click", function () {
      window.location.href = "/profile.html";
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
      setAuthFormVisible(true);
    });

    setStatus("检测到登录状态，可直接继续访问", "ok");
    setAuthFormVisible(false);
  }

  function getActiveClient() {
    const remember = !!rememberMeEl.checked;
    localStorage.setItem("xiaoma_remember_auth", remember ? "1" : "0");
    return remember ? sbLocal : sbSession;
  }

  function setAuthFormVisible(visible) {
    if (tabsEl) tabsEl.style.display = visible ? "grid" : "none";
    if (dividerEl) dividerEl.style.display = visible ? "flex" : "none";
    panelsEl.forEach(function (panel) {
      panel.style.display = visible ? "" : "none";
    });
  }

  function setRegisterMode(enabled) {
    registerMode = enabled;
    if (registerOnlyFieldEl) registerOnlyFieldEl.style.display = enabled ? "block" : "none";
    if (registerBtn) registerBtn.textContent = enabled ? "发送注册验证码" : "创建账号";
  }

  function setResetMode(enabled) {
    resetMode = enabled;
    if (resetPasswordFieldEl) resetPasswordFieldEl.style.display = enabled ? "block" : "none";
    if (resetPasswordConfirmFieldEl) resetPasswordConfirmFieldEl.style.display = enabled ? "block" : "none";
    if (otpIdentityLabelEl) otpIdentityLabelEl.textContent = enabled ? "邮箱 / 用户名" : "邮箱";
    if (verifyOtpBtn) verifyOtpBtn.textContent = enabled ? "校验并重置密码" : "验证并登录";
    if (forgotBtn) forgotBtn.textContent = enabled ? "取消找回" : "忘记密码？";
  }

  function switchToOtpTab() {
    document.querySelectorAll(".tab").forEach((tab) => tab.classList.remove("active"));
    const otpTab = document.querySelector('.tab[data-tab="otp"]');
    if (otpTab) otpTab.classList.add("active");

    document.querySelectorAll(".form-panel").forEach((panel) => panel.classList.remove("active"));
    const otpPanel = document.getElementById("panel-otp");
    if (otpPanel) otpPanel.classList.add("active");
  }

  async function resolveIdentity(input) {
    const value = String(input || "").trim();
    if (!value) return { email: "", error: "请输入邮箱或用户名" };
    if (isEmail(value)) return { email: value.toLowerCase(), error: "" };

    if (!resetMode) {
      return { email: "", error: "请直接输入注册邮箱" };
    }

    const client = getActiveClient();
    const profile = await client
      .from("profiles")
      .select("contact")
      .eq("display_name", value)
      .maybeSingle();

    const contact = profile.data?.contact || "";
    if (!profile.error && isEmail(contact)) {
      return { email: contact.toLowerCase(), error: "" };
    }

    return { email: "", error: "用户名找不到对应邮箱，请直接输入邮箱或联系管理员", action: "contact_admin" };
  }

  async function sendEmailOtp(identity) {
    const resolved = await resolveIdentity(identity);
    if (resolved.error) {
      setStatus(resolved.error, "err");
      if (resolved.action) setStatusAction(resolved.action);
      return;
    }
    const email = resolved.email;

    const left = getCooldownLeft(email);
    if (left > 0) return setStatus("该邮箱发送过于频繁，请 " + left + " 秒后重试", "err");

    const client = getActiveClient();
    setLoading(sendOtpBtn, true, "发送验证码", "发送中...");
    if (resendOtpBtn) resendOtpBtn.disabled = true;

    const result = await client.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: otpPurpose === "register"
      }
    });

    setLoading(sendOtpBtn, false, "发送验证码", "发送中...");

    if (result.error) {
      const msg = otpFriendlyError(result.error);
      if (msg.includes("请求太频繁")) {
        localStorage.setItem(otpTimestampKey, String(Date.now()));
        localStorage.setItem(otpIdentityKey, email);
      }
      renderOtpButtonState();
      return setStatus(msg, "err");
    }

    localStorage.setItem(otpTimestampKey, String(Date.now()));
    localStorage.setItem(otpIdentityKey, email);
    pendingResetEmail = otpPurpose === "reset" ? email : pendingResetEmail;
    renderOtpButtonState();
    setStatus(
      otpPurpose === "register"
        ? "注册验证码已发送，请输入验证码完成注册"
        : otpPurpose === "reset"
          ? "找回验证码已发送，请输入验证码并设置新密码"
          : "登录验证码已发送，请查收邮箱并输入验证码",
      "ok"
    );
    otpCodeEl.focus();
  }

  document.querySelectorAll(".tab").forEach((button) => {
    button.addEventListener("click", function () {
      document.querySelectorAll(".tab").forEach((tab) => tab.classList.remove("active"));
      button.classList.add("active");
      const activeTab = button.dataset.tab;
      document.querySelectorAll(".form-panel").forEach((panel) => panel.classList.remove("active"));
      document.getElementById("panel-" + activeTab).classList.add("active");
      if (activeTab !== "password") setRegisterMode(false);
      if (activeTab !== "otp") setResetMode(false);
      setStatus(activeTab === "password" ? "请输入邮箱和密码" : "请输入邮箱并获取验证码");
    });
  });

  showPasswordEl.addEventListener("change", function () {
    passwordEl.type = showPasswordEl.checked ? "text" : "password";
  });

  otpIdentityEl.addEventListener("input", renderOtpButtonState);

  loginBtn.addEventListener("click", async function () {
    if (registerMode) setRegisterMode(false);
    if (resetMode) setResetMode(false);
    const email = (emailEl.value || "").trim();
    const password = passwordEl.value || "";
    if (!email || !password) return setStatus("请输入邮箱和密码", "err");
    if (!isEmail(email)) return setStatus("请输入正确的邮箱格式", "err");

    const client = getActiveClient();
    setLoading(loginBtn, true, "登录", "登录中...");
    const { error } = await client.auth.signInWithPassword({ email, password });
    setLoading(loginBtn, false, "登录", "登录中...");
    if (error) return setStatus(authFriendlyError("login", error), "err");

    setStatus("登录成功，正在跳转", "ok");
    setTimeout(function () {
      window.location.href = getNextPath();
    }, 700);
  });

  registerBtn.addEventListener("click", async function () {
    if (!registerMode) {
      setRegisterMode(true);
      setStatus("请先填写确认密码，再次点击“发送注册验证码”继续", "");
      if (passwordConfirmEl) passwordConfirmEl.focus();
      return;
    }

    const email = (emailEl.value || "").trim();
    const password = passwordEl.value || "";
    const passwordConfirm = passwordConfirmEl ? passwordConfirmEl.value || "" : "";
    if (!email || !password) return setStatus("请先填写邮箱和密码", "err");
    if (!isEmail(email)) return setStatus("请输入正确的邮箱格式", "err");
    if (password.length < 6) return setStatus("密码至少 6 位", "err");
    if (!passwordConfirm) return setStatus("请填写确认密码", "err");
    if (password !== passwordConfirm) return setStatus("两次输入的密码不一致", "err");

    otpPurpose = "register";
    pendingRegisterEmail = email.toLowerCase();
    pendingRegisterPassword = password;
    otpIdentityEl.value = email;

    switchToOtpTab();
    setLoading(registerBtn, true, "创建账号", "发送验证码...");
    await sendEmailOtp(email);
    setLoading(registerBtn, false, "创建账号", "发送验证码...");
  });

  forgotBtn.addEventListener("click", async function () {
    if (resetMode) {
      setResetMode(false);
      setStatus("已取消找回密码", "");
      return;
    }

    otpPurpose = "reset";
    setRegisterMode(false);
    setResetMode(true);
    switchToOtpTab();
    otpIdentityEl.value = (emailEl.value || "").trim();
    setStatus("请输入邮箱或用户名，发送验证码后输入新密码完成重置", "");
  });

  sendOtpBtn.addEventListener("click", async function () {
    const identity = (otpIdentityEl.value || "").trim();
    if (otpPurpose !== "register" && otpPurpose !== "reset") otpPurpose = "login";
    await sendEmailOtp(identity);
  });

  if (resendOtpBtn) {
    resendOtpBtn.addEventListener("click", async function () {
      const identity = (otpIdentityEl.value || "").trim();
      await sendEmailOtp(identity);
    });
  }

  verifyOtpBtn.addEventListener("click", async function () {
    const identityInput = (otpIdentityEl.value || "").trim();
    const resolved = await resolveIdentity(identityInput);
    if (resolved.error) {
      setStatus(resolved.error, "err");
      if (resolved.action) setStatusAction(resolved.action);
      return;
    }
    const identity = resolved.email;
    const token = (otpCodeEl.value || "").trim();
    if (!identity) return setStatus("请先输入邮箱", "err");
    if (!isEmail(identity)) return setStatus("验证码登录仅支持邮箱，请输入正确邮箱", "err");

    if (!token) return setStatus("请输入邮箱验证码", "err");

    const client = getActiveClient();
    const verifyDefaultText = otpPurpose === "reset" ? "校验并重置密码" : "验证并登录";
    setLoading(verifyOtpBtn, true, verifyDefaultText, "验证中...");
    const result = await client.auth.verifyOtp({ email: identity, token, type: "email" });
    setLoading(verifyOtpBtn, false, verifyDefaultText, "验证中...");
    if (result.error) return setStatus(authFriendlyError("verify", result.error), "err");

    if (otpPurpose === "register") {
      if (identity.toLowerCase() !== pendingRegisterEmail || !pendingRegisterPassword) {
        return setStatus("注册验证码与待注册账号不匹配，请重新点击创建账号", "err");
      }

      const updateResult = await client.auth.updateUser({ password: pendingRegisterPassword });
      if (updateResult.error) {
        return setStatus("验证码通过，但设置密码失败：" + authFriendlyError("register", updateResult.error), "err");
      }

      pendingRegisterEmail = "";
      pendingRegisterPassword = "";
      otpPurpose = "login";
      setStatus("注册成功，正在跳转", "ok");
      setTimeout(function () {
        window.location.href = getNextPath();
      }, 700);
      return;
    }

    if (otpPurpose === "reset") {
      const nextPassword = (resetNewPasswordEl?.value || "").trim();
      const nextPasswordConfirm = (resetNewPasswordConfirmEl?.value || "").trim();
      if (!nextPassword || !nextPasswordConfirm) return setStatus("请填写新密码和确认密码", "err");
      if (nextPassword.length < 6) return setStatus("新密码至少 6 位", "err");
      if (nextPassword !== nextPasswordConfirm) return setStatus("两次新密码不一致", "err");
      if (pendingResetEmail && pendingResetEmail !== identity) return setStatus("验证码邮箱与重置账号不匹配，请重新发送验证码", "err");

      const updateResult = await client.auth.updateUser({ password: nextPassword });
      if (updateResult.error) return setStatus("重置密码失败：" + authFriendlyError("reset", updateResult.error), "err");

      pendingResetEmail = "";
      otpPurpose = "login";
      setResetMode(false);
      setStatus("密码重置成功，请使用新密码登录", "ok");
      switchToOtpTab();
      setTimeout(function () {
        document.querySelector('.tab[data-tab="password"]')?.click();
      }, 600);
      return;
    }

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
  setRegisterMode(false);
  setResetMode(false);
  renderSessionBar();
})();
