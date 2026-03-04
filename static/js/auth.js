(function () {
  const script = document.currentScript;
  const supabaseUrl = script?.dataset?.supabaseUrl || "";
  const supabaseAnonKey = script?.dataset?.supabaseAnonKey || "";

  const statusEl = document.getElementById("status");
  const emailEl = document.getElementById("email");
  const passwordEl = document.getElementById("password");
  const otpIdentityEl = document.getElementById("otpIdentity");
  const otpCodeEl = document.getElementById("otpCode");

  const loginBtn = document.getElementById("loginBtn");
  const sendOtpBtn = document.getElementById("sendOtpBtn");
  const verifyOtpBtn = document.getElementById("verifyOtpBtn");

  function setStatus(text, kind = "") {
    statusEl.textContent = text;
    statusEl.className = "status";
    if (kind) statusEl.classList.add(kind);
  }

  function setLoading(btn, loading) {
    const text = btn.id === "loginBtn" ? "登录" : btn.id === "sendOtpBtn" ? "发送验证码" : "验证登录";
    btn.disabled = loading;
    btn.innerHTML = loading ? '<span class="spinner"></span>' : text;
  }

  function shake(el) {
    el.style.animation = "none";
    el.offsetHeight;
    el.style.animation = "shake 0.5s ease";
  }

  if (!supabaseUrl || !supabaseAnonKey) {
    setStatus("请先在 hugo.toml 中配置 supabaseUrl 与 supabaseAnonKey", "err");
    return;
  }

  const sb = window.supabase.createClient(supabaseUrl, supabaseAnonKey);

  document.querySelectorAll(".tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach(n => n.classList.remove("active"));
      btn.classList.add("active");
      const tab = btn.dataset.tab;
      document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
      document.getElementById(`panel-${tab}`).classList.add("active");
      setStatus(tab === "password" ? "请输入账号密码登录" : "请输入邮箱或手机号获取验证码");
    });
  });

  loginBtn.addEventListener("click", async () => {
    const email = (emailEl.value || "").trim();
    const password = passwordEl.value;

    if (!email || !password) {
      setStatus("请输入邮箱和密码", "err");
      if (!email) shake(emailEl);
      else shake(passwordEl);
      return;
    }

    setLoading(loginBtn, true);
    const { data, error } = await sb.auth.signInWithPassword({
      email: email,
      password: password
    });

    setLoading(loginBtn, false);

    if (error) {
      setStatus("登录失败：" + error.message, "err");
      return;
    }

    setStatus("登录成功！欢迎回来", "ok");
    setTimeout(() => {
      window.location.href = "/";
    }, 1500);
  });

  sendOtpBtn.addEventListener("click", async () => {
    const value = (otpIdentityEl.value || "").trim();
    if (!value) {
      setStatus("请输入邮箱或手机号", "err");
      shake(otpIdentityEl);
      return;
    }

    setLoading(sendOtpBtn, true);
    const isEmail = value.includes("@");
    let result;

    if (isEmail) {
      result = await sb.auth.signInWithOtp({
        email: value,
        options: { shouldCreateUser: true }
      });
    } else {
      result = await sb.auth.signInWithOtp({
        phone: value,
        options: { shouldCreateUser: true }
      });
    }

    setLoading(sendOtpBtn, false);

    if (result.error) {
      setStatus("发送失败：" + result.error.message, "err");
      return;
    }
    setStatus("验证码已发送，请查收", "ok");
    otpCodeEl.focus();
  });

  verifyOtpBtn.addEventListener("click", async () => {
    const value = (otpIdentityEl.value || "").trim();
    const token = (otpCodeEl.value || "").trim();

    if (!value || !token) {
      setStatus("请输入完整信息", "err");
      return;
    }

    setLoading(verifyOtpBtn, true);
    const isEmail = value.includes("@");
    const result = isEmail 
      ? await sb.auth.verifyOtp({ email: value, token, type: "email" })
      : await sb.auth.verifyOtp({ phone: value, token, type: "sms" });

    setLoading(verifyOtpBtn, false);

    if (result.error) {
      setStatus("验证失败：" + result.error.message, "err");
      return;
    }
    setStatus("登录成功！", "ok");
    setTimeout(() => {
      window.location.href = "/";
    }, 1500);
  });

  emailEl.addEventListener("keypress", (e) => {
    if (e.key === "Enter") passwordEl.focus();
  });
  passwordEl.addEventListener("keypress", (e) => {
    if (e.key === "Enter") loginBtn.click();
  });
  otpCodeEl.addEventListener("keypress", (e) => {
    if (e.key === "Enter") verifyOtpBtn.click();
  });

  otpCodeEl.addEventListener("input", (e) => {
    e.target.value = e.target.value.replace(/\D/g, "").slice(0, 6);
  });

  document.getElementById("registerLink").addEventListener("click", (e) => {
    e.preventDefault();
    const email = emailEl.value.trim();
    const password = passwordEl.value;
    if (email && password) {
      signup(email, password);
    } else {
      setStatus("请先填写邮箱和密码进行注册", "err");
    }
  });

  async function signup(email, password) {
    setLoading(loginBtn, true);
    const { data, error } = await sb.auth.signUp({
      email: email,
      password: password
    });
    setLoading(loginBtn, false);

    if (error) {
      setStatus("注册失败：" + error.message, "err");
      return;
    }
    setStatus("注册成功！请查收邮箱验证链接", "ok");
  }

  document.getElementById("forgotLink").addEventListener("click", async (e) => {
    e.preventDefault();
    const email = emailEl.value.trim();
    if (!email) {
      setStatus("请先输入邮箱", "err");
      shake(emailEl);
      return;
    }
    
    const { error } = await sb.auth.resetPasswordForEmail(email);
    if (error) {
      setStatus("重置失败：" + error.message, "err");
    } else {
      setStatus("重置链接已发送到邮箱", "ok");
    }
  });
})();

const style = document.createElement("style");
style.textContent = `
  @keyframes shake {
    0%, 100% { transform: translateX(0); }
    20%, 60% { transform: translateX(-6px); }
    40%, 80% { transform: translateX(6px); }
  }
`;
document.head.appendChild(style);
