(function () {
  const STORAGE_MODEL = "xiaoma_openclaw_model";
  const STORAGE_TOKEN = "xiaoma_openclaw_bridge_token";
  const API_PATH = "/api/openclaw";

  function readConfig() {
    return {
      model: String(localStorage.getItem(STORAGE_MODEL) || "openclaw").trim() || "openclaw",
      token: String(localStorage.getItem(STORAGE_TOKEN) || "").trim()
    };
  }

  function saveConfig(model, token) {
    localStorage.setItem(STORAGE_MODEL, model || "openclaw");
    if (token) {
      localStorage.setItem(STORAGE_TOKEN, token);
    } else {
      localStorage.removeItem(STORAGE_TOKEN);
    }
  }

  function bindWidget(widget) {
    const input = widget.querySelector(".openclaw-input");
    const sendBtn = widget.querySelector(".openclaw-send");
    const configBtn = widget.querySelector(".openclaw-config");
    const output = widget.querySelector(".openclaw-output");
    const modelHint = widget.querySelector(".openclaw-model-hint");
    const context = String(widget.dataset.context || "").trim();

    if (!input || !sendBtn || !configBtn || !output) return;

    function setOutput(text, state) {
      output.textContent = text;
      output.classList.remove("ok", "err");
      if (state) output.classList.add(state);
    }

    function refreshModelHint() {
      if (!modelHint) return;
      const config = readConfig();
      modelHint.textContent = "模型：" + config.model + (config.token ? " · 已配置鉴权" : " · 未配置鉴权");
    }

    async function callOpenClaw() {
      const prompt = String(input.value || "").trim();
      if (!prompt) {
        setOutput("请先输入问题，再点击按钮。", "err");
        return;
      }

      const config = readConfig();
      sendBtn.disabled = true;
      setOutput("OpenClaw 正在思考中...", "");

      try {
        const headers = {
          "Content-Type": "application/json"
        };
        if (config.token) {
          headers["X-OpenClaw-Bridge-Token"] = config.token;
        }

        const res = await fetch(API_PATH, {
          method: "POST",
          headers,
          body: JSON.stringify({
            prompt,
            context: context || "你是 xiaoma.cyou 的社区 AI 助手，请给出简洁、可执行的建议。",
            model: config.model
          })
        });

        const data = await res.json().catch(function () {
          return {};
        });

        if (!res.ok || !data.ok) {
          setOutput("请求失败：" + (data.error || "接口不可用"), "err");
          return;
        }

        setOutput(data.text || "OpenClaw 未返回可读文本。", "ok");
      } catch (error) {
        setOutput("请求异常：" + (error?.message || "请检查网络或接口配置"), "err");
      } finally {
        sendBtn.disabled = false;
      }
    }

    configBtn.addEventListener("click", function () {
      const current = readConfig();
      const model = window.prompt("请输入 OpenClaw 模型名", current.model) || current.model;
      const tokenInput = window.prompt(
        "请输入 Bridge Token（必填，需与服务端环境变量一致）",
        current.token
      );
      saveConfig(String(model || "openclaw").trim() || "openclaw", String(tokenInput || "").trim());
      refreshModelHint();
      setOutput("接口配置已更新。", "ok");
    });

    sendBtn.addEventListener("click", function () {
      callOpenClaw();
    });

    input.addEventListener("keydown", function (event) {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        callOpenClaw();
      }
    });

    refreshModelHint();
  }

  document.querySelectorAll(".openclaw-widget").forEach(function (widget) {
    bindWidget(widget);
  });
})();
