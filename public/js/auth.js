(function () {
  const script = document.currentScript;
  const supabaseUrl = script?.dataset?.supabaseUrl || "";
  const supabaseAnonKey = script?.dataset?.supabaseAnonKey || "";

  const statusEl = document.getElementById("status");
  const identityEl = document.getElementById("identity");
  const otpCodeEl = document.getElementById("otpCode");
  const mfaCodeEl = document.getElementById("mfaCode");

  const sendOtpBtn = document.getElementById("sendOtpBtn");
  const verifyOtpBtn = document.getElementById("verifyOtpBtn");
  const signOutBtn = document.getElementById("signOutBtn");
  const enrollMfaBtn = document.getElementById("enrollMfaBtn");
  const challengeMfaBtn = document.getElementById("challengeMfaBtn");
  const verifyMfaBtn = document.getElementById("verifyMfaBtn");

  const qrWrap = document.getElementById("qrWrap");
  const qrImg = document.getElementById("qrImg");

  let factorId = null;
  let challengeId = null;

  function setStatus(text, kind = "") {
    const iconEl = statusEl.querySelector(".icon");
    const textEl = statusEl.querySelector(".text");
    if (textEl) textEl.textContent = text;
    statusEl.className = "status";
    if (kind === "ok") {
      statusEl.classList.add("ok");
      if (iconEl) iconEl.textContent = "✓";
    } else if (kind === "err") {
      statusEl.classList.add("err");
      if (iconEl) iconEl.textContent = "✕";
    } else {
      if (iconEl) iconEl.textContent = "ℹ️";
    }
  }

  function setLoading(btn, loading, text) {
    const btnText = btn.querySelector(".btn-text");
    if (loading) {
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span>';
    } else {
      btn.disabled = false;
      btn.innerHTML = `<span class="btn-text">${text}</span>`;
    }
  }

  function isEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  function isPhone(value) {
    return /^\+\d{8,15}$/.test(value);
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
      document.querySelectorAll(".tab").forEach((n) => n.classList.remove("active"));
      btn.classList.add("active");
      const tab = btn.dataset.tab;
      document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
      document.getElementById(`panel-${tab}`).classList.add("active");
    });
  });

  sendOtpBtn.addEventListener("click", async () => {
    const value = (identityEl.value || "").trim();
    if (!isEmail(value) && !isPhone(value)) {
      setStatus("请输入合法邮箱或手机号（格式：+8613800000000）", "err");
      shake(identityEl);
      return;
    }

    setLoading(sendOtpBtn, true, "发送中...");
    let result;
    if (isEmail(value)) {
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

    setLoading(sendOtpBtn, false, "发送验证码");
    if (result.error) {
      setStatus("发送失败：" + result.error.message, "err");
      shake(sendOtpBtn);
      return;
    }
    setStatus("验证码已发送，请查收（有效期30分钟）", "ok");
    otpCodeEl.focus();
  });

  verifyOtpBtn.addEventListener("click", async () => {
    const value = (identityEl.value || "").trim();
    const token = (otpCodeEl.value || "").trim();
    if (!token) {
      setStatus("请输入验证码", "err");
      shake(otpCodeEl);
      return;
    }

    setLoading(verifyOtpBtn, true, "验证中...");
    let result;
    if (isEmail(value)) {
      result = await sb.auth.verifyOtp({ email: value, token, type: "email" });
    } else if (isPhone(value)) {
      result = await sb.auth.verifyOtp({ phone: value, token, type: "sms" });
    } else {
      setLoading(verifyOtpBtn, false, "验证并登录");
      setStatus("身份格式不正确", "err");
      return;
    }

    setLoading(verifyOtpBtn, false, "验证并登录");
    if (result.error) {
      setStatus("验证失败：" + result.error.message, "err");
      shake(otpCodeEl);
      return;
    }
    setStatus("登录成功！建议进入「二步验证」绑定 TOTP 增强安全", "ok");
    identityEl.value = "";
    otpCodeEl.value = "";
  });

  signOutBtn.addEventListener("click", async () => {
    setLoading(signOutBtn, true, "退出中...");
    const { error } = await sb.auth.signOut();
    setLoading(signOutBtn, false, "退出登录");
    if (error) {
      setStatus("退出失败：" + error.message, "err");
      return;
    }
    setStatus("已退出登录", "ok");
  });

  enrollMfaBtn.addEventListener("click", async () => {
    setLoading(enrollMfaBtn, true, "生成中...");
    const { data: sessionData } = await sb.auth.getSession();
    if (!sessionData?.session) {
      setLoading(enrollMfaBtn, false, "生成二维码");
      setStatus("请先登录后再绑定二步验证", "err");
      return;
    }

    const { data, error } = await sb.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "xiaoma-auth"
    });

    setLoading(enrollMfaBtn, false, "生成二维码");
    if (error) {
      setStatus("绑定失败：" + error.message, "err");
      return;
    }

    factorId = data.id;
    if (data?.totp?.qr_code) {
      qrImg.src = data.totp.qr_code;
      qrWrap.style.display = "block";
    }
    setStatus("二维码已生成，请扫码后点击「发送挑战」", "ok");
  });

  challengeMfaBtn.addEventListener("click", async () => {
    if (!factorId) {
      setStatus("请先生成二维码并完成扫码绑定", "err");
      return;
    }
    setLoading(challengeMfaBtn, true, "发送中...");
    const { data, error } = await sb.auth.mfa.challenge({ factorId });
    setLoading(challengeMfaBtn, false, "发送挑战");
    if (error) {
      setStatus("挑战失败：" + error.message, "err");
      return;
    }
    challengeId = data.id;
    setStatus("挑战已创建，请输入 TOTP 验证码", "ok");
    mfaCodeEl.focus();
  });

  verifyMfaBtn.addEventListener("click", async () => {
    const code = (mfaCodeEl.value || "").trim();
    if (!factorId || !challengeId) {
      setStatus("请先生成并发送挑战", "err");
      return;
    }
    if (!/^\d{6}$/.test(code)) {
      setStatus("请输入6位数字验证码", "err");
      shake(mfaCodeEl);
      return;
    }

    setLoading(verifyMfaBtn, true, "验证中...");
    const { error } = await sb.auth.mfa.verify({ factorId, challengeId, code });
    setLoading(verifyMfaBtn, false, "验证二步验证码");
    if (error) {
      setStatus("二步验证失败：" + error.message, "err");
      shake(mfaCodeEl);
      return;
    }
    setStatus("二步验证已启用！账户安全等级提升", "ok");
    mfaCodeEl.value = "";
  });

  identityEl.addEventListener("keypress", (e) => {
    if (e.key === "Enter") sendOtpBtn.click();
  });
  otpCodeEl.addEventListener("keypress", (e) => {
    if (e.key === "Enter") verifyOtpBtn.click();
  });
  mfaCodeEl.addEventListener("keypress", (e) => {
    if (e.key === "Enter") verifyMfaBtn.click();
  });

  otpCodeEl.addEventListener("input", (e) => {
    e.target.value = e.target.value.replace(/\D/g, "").slice(0, 6);
  });
  mfaCodeEl.addEventListener("input", (e) => {
    e.target.value = e.target.value.replace(/\D/g, "").slice(0, 6);
  });
})();

const style = document.createElement("style");
style.textContent = `
  @keyframes shake {
    0%, 100% { transform: translateX(0); }
    20%, 60% { transform: translateX(-8px); }
    40%, 80% { transform: translateX(8px); }
  }
`;
document.head.appendChild(style);
