(function () {
  const API_PATH = "/api/openclaw";
  const STORAGE_MODEL = "xiaoma_openclaw_model";
  const STORAGE_TOKEN = "xiaoma_openclaw_bridge_token";
  const STORAGE_THREADS = "xiaoma_openclaw_threads";
  const STORAGE_ACTIVE = "xiaoma_openclaw_active_thread";
  const MAX_THREADS = 20;

  const threadListEl = document.getElementById("threadList");
  const chatFeedEl = document.getElementById("chatFeed");
  const promptInputEl = document.getElementById("promptInput");
  const sendBtnEl = document.getElementById("sendBtn");
  const modelHintEl = document.getElementById("modelHint");
  const newChatBtnEl = document.getElementById("newChatBtn");
  const configBtnEl = document.getElementById("configBtn");
  const clearChatBtnEl = document.getElementById("clearChatBtn");
  const composerFormEl = document.getElementById("composerForm");

  if (!threadListEl || !chatFeedEl || !promptInputEl || !sendBtnEl || !modelHintEl) {
    return;
  }

  const state = {
    model: String(localStorage.getItem(STORAGE_MODEL) || "openclaw-agent").trim() || "openclaw-agent",
    token: String(localStorage.getItem(STORAGE_TOKEN) || "").trim(),
    threads: [],
    activeId: "",
    sending: false
  };

  function nowText(value) {
    try {
      return new Date(value).toLocaleString();
    } catch (error) {
      return "刚刚";
    }
  }

  function uniqueId(prefix) {
    return prefix + "-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
  }

  function createThread(title) {
    return {
      id: uniqueId("thread"),
      title: String(title || "新对话").trim() || "新对话",
      updatedAt: Date.now(),
      messages: []
    };
  }

  function normalizeThreads(list) {
    if (!Array.isArray(list)) return [];

    return list
      .map(function (item) {
        if (!item || typeof item !== "object") return null;
        return {
          id: String(item.id || uniqueId("thread")),
          title: String(item.title || "新对话").trim() || "新对话",
          updatedAt: Number(item.updatedAt || Date.now()),
          messages: Array.isArray(item.messages)
            ? item.messages
                .filter(function (msg) {
                  return msg && typeof msg.content === "string" && (msg.role === "user" || msg.role === "assistant" || msg.role === "error");
                })
                .map(function (msg) {
                  return {
                    id: String(msg.id || uniqueId("msg")),
                    role: msg.role,
                    content: msg.content,
                    createdAt: Number(msg.createdAt || Date.now())
                  };
                })
            : []
        };
      })
      .filter(Boolean)
      .sort(function (first, second) {
        return Number(second.updatedAt || 0) - Number(first.updatedAt || 0);
      })
      .slice(0, MAX_THREADS);
  }

  function loadThreads() {
    const raw = localStorage.getItem(STORAGE_THREADS);
    if (!raw) {
      state.threads = [createThread("新对话")];
      state.activeId = state.threads[0].id;
      return;
    }

    try {
      state.threads = normalizeThreads(JSON.parse(raw));
    } catch (error) {
      state.threads = [];
    }

    if (!state.threads.length) {
      state.threads = [createThread("新对话")];
    }

    const active = String(localStorage.getItem(STORAGE_ACTIVE) || "").trim();
    const hasActive = state.threads.some(function (thread) {
      return thread.id === active;
    });
    state.activeId = hasActive ? active : state.threads[0].id;
  }

  function saveState() {
    localStorage.setItem(STORAGE_THREADS, JSON.stringify(state.threads.slice(0, MAX_THREADS)));
    localStorage.setItem(STORAGE_ACTIVE, state.activeId);
    localStorage.setItem(STORAGE_MODEL, state.model);
    if (state.token) {
      localStorage.setItem(STORAGE_TOKEN, state.token);
    } else {
      localStorage.removeItem(STORAGE_TOKEN);
    }
  }

  function getActiveThread() {
    return state.threads.find(function (thread) {
      return thread.id === state.activeId;
    }) || state.threads[0];
  }

  function setActiveThread(threadId) {
    state.activeId = threadId;
    saveState();
    renderAll();
  }

  function setModelHint() {
    modelHintEl.textContent = "模型：" + state.model + (state.token ? " · 已配置鉴权" : " · 未配置鉴权");
  }

  function renderThreadList() {
    threadListEl.innerHTML = "";
    state.threads.forEach(function (thread) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "thread-item" + (thread.id === state.activeId ? " active" : "");
      button.innerHTML =
        "<strong>" + escapeHtml(thread.title || "新对话") + "</strong>" +
        "<span>" + nowText(thread.updatedAt) + "</span>";
      button.addEventListener("click", function () {
        setActiveThread(thread.id);
      });
      threadListEl.appendChild(button);
    });
  }

  function escapeHtml(text) {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function scrollFeedBottom() {
    chatFeedEl.scrollTop = chatFeedEl.scrollHeight;
  }

  function renderWelcome() {
    const card = document.createElement("div");
    card.className = "welcome";
    card.innerHTML =
      "<strong>欢迎使用 OpenClaw 新界面</strong><br>" +
      "1) 先点左侧“接口设置”填模型和 Bridge Token。<br>" +
      "2) 输入问题并发送，支持多轮上下文。<br>" +
      "3) 左侧可新建/切换会话，体验接近 ChatGPT。";
    chatFeedEl.appendChild(card);
  }

  function renderFeed() {
    const thread = getActiveThread();
    chatFeedEl.innerHTML = "";

    if (!thread || !Array.isArray(thread.messages) || !thread.messages.length) {
      renderWelcome();
      return;
    }

    thread.messages.forEach(function (message) {
      const item = document.createElement("article");
      item.className = "msg " + message.role;

      const head = document.createElement("div");
      head.className = "msg-head";
      head.innerHTML =
        "<span>" + (message.role === "user" ? "你" : message.role === "assistant" ? "OpenClaw" : "系统") + "</span>" +
        "<span>" + nowText(message.createdAt) + "</span>";

      const body = document.createElement("p");
      body.className = "msg-body";
      body.textContent = message.content;

      item.appendChild(head);
      item.appendChild(body);
      chatFeedEl.appendChild(item);
    });

    scrollFeedBottom();
  }

  function renderAll() {
    setModelHint();
    renderThreadList();
    renderFeed();
  }

  function touchThread(thread) {
    thread.updatedAt = Date.now();
    state.threads = normalizeThreads(state.threads);
    const stillExists = state.threads.some(function (item) {
      return item.id === thread.id;
    });
    if (!stillExists) {
      state.threads.unshift(thread);
      state.threads = normalizeThreads(state.threads);
    }
  }

  function pushMessage(role, content) {
    const thread = getActiveThread();
    if (!thread) return;

    thread.messages.push({
      id: uniqueId("msg"),
      role: role,
      content: String(content || ""),
      createdAt: Date.now()
    });
    touchThread(thread);
    saveState();
    renderAll();
  }

  function setThreadTitleFromPrompt(prompt) {
    const thread = getActiveThread();
    if (!thread) return;
    if (thread.title !== "新对话") return;

    const title = String(prompt || "").trim().replace(/\s+/g, " ").slice(0, 24);
    if (!title) return;
    thread.title = title;
    touchThread(thread);
  }

  function buildConversationMessages(thread, prompt) {
    const history = Array.isArray(thread?.messages) ? thread.messages : [];
    const normalized = history
      .filter(function (item) {
        return item && typeof item.content === "string" && (item.role === "user" || item.role === "assistant");
      })
      .map(function (item) {
        return {
          role: item.role,
          content: String(item.content || "").trim()
        };
      })
      .filter(function (item) {
        return !!item.content;
      })
      .slice(-12);

    const nextPrompt = String(prompt || "").trim();
    const last = normalized[normalized.length - 1];
    if (nextPrompt && (!last || last.role !== "user" || last.content !== nextPrompt)) {
      normalized.push({ role: "user", content: nextPrompt });
    }

    return normalized.slice(-12);
  }

  async function sendPrompt() {
    if (state.sending) return;

    const prompt = String(promptInputEl.value || "").trim();
    if (!prompt) return;

    if (!state.token) {
      pushMessage("error", "请先点击“接口设置”填写 Bridge Token。\n服务端已启用鉴权，没有 token 无法调用。");
      return;
    }

    const threadBeforeSend = getActiveThread();
    const conversation = buildConversationMessages(threadBeforeSend, prompt);

    state.sending = true;
    sendBtnEl.disabled = true;
    promptInputEl.value = "";

    setThreadTitleFromPrompt(prompt);
    pushMessage("user", prompt);
    pushMessage("assistant", "OpenClaw 正在思考中...");

    const activeThread = getActiveThread();
    const pending = activeThread?.messages?.[activeThread.messages.length - 1];

    try {
      const response = await fetch(API_PATH, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-OpenClaw-Bridge-Token": state.token
        },
        body: JSON.stringify({
          prompt: prompt,
          model: state.model,
          context: "你是 xiaoma.cyou 的 AI 助手，请用简洁清晰、可执行的中文回复。",
          messages: conversation
        })
      });

      const data = await response.json().catch(function () {
        return {};
      });

      if (!response.ok || !data.ok) {
        throw new Error(data.error || "接口不可用");
      }

      if (pending) {
        pending.content = String(data.text || "OpenClaw 未返回可读文本。");
        pending.createdAt = Date.now();
      }
    } catch (error) {
      if (pending) {
        pending.role = "error";
        pending.content = "请求失败：" + (error?.message || "请检查网络与接口配置");
        pending.createdAt = Date.now();
      }
    } finally {
      if (activeThread) {
        touchThread(activeThread);
      }
      saveState();
      renderAll();
      state.sending = false;
      sendBtnEl.disabled = false;
      promptInputEl.focus();
    }
  }

  function createNewThread() {
    const next = createThread("新对话");
    state.threads.unshift(next);
    state.threads = normalizeThreads(state.threads);
    state.activeId = next.id;
    saveState();
    renderAll();
    promptInputEl.focus();
  }

  function clearCurrentThread() {
    const thread = getActiveThread();
    if (!thread) return;
    thread.messages = [];
    thread.title = "新对话";
    thread.updatedAt = Date.now();
    saveState();
    renderAll();
    promptInputEl.focus();
  }

  function updateConfig() {
    const nextModel = window.prompt("请输入 OpenClaw 模型名", state.model) || state.model;
    const nextToken = window.prompt("请输入 Bridge Token（必填）", state.token) || state.token;

    state.model = String(nextModel || "openclaw-agent").trim() || "openclaw-agent";
    state.token = String(nextToken || "").trim();
    saveState();
    renderAll();
  }

  if (newChatBtnEl) {
    newChatBtnEl.addEventListener("click", function () {
      createNewThread();
    });
  }

  if (clearChatBtnEl) {
    clearChatBtnEl.addEventListener("click", function () {
      clearCurrentThread();
    });
  }

  if (configBtnEl) {
    configBtnEl.addEventListener("click", function () {
      updateConfig();
    });
  }

  if (composerFormEl) {
    composerFormEl.addEventListener("submit", function (event) {
      event.preventDefault();
      sendPrompt();
    });
  }

  promptInputEl.addEventListener("keydown", function (event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendPrompt();
    }
  });

  loadThreads();
  saveState();
  renderAll();
})();
