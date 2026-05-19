(function () {
  const STORE_KEY = "xiaoma.openclaw.agent.v1";
  const MAX_DOC_CHARS = 28000;
  const MAX_DOCS = 12;

  const state = {
    config: {
      endpoint: "",
      model: "openclaw-agent",
      apiKey: "",
      bridgeToken: "",
      systemPrompt: "你是一个本地 AI 智能体，代表用户阅读资料、拆解问题并给出清晰可执行的中文回答。回答时优先引用用户上传的资料；资料不足时明确说明不确定性。"
    },
    docs: [],
    threads: [],
    activeThreadId: null,
    abortController: null
  };

  const els = {
    endpoint: document.getElementById("endpointInput"),
    model: document.getElementById("modelInput"),
    apiKey: document.getElementById("apiKeyInput"),
    bridgeToken: document.getElementById("bridgeTokenInput"),
    systemPrompt: document.getElementById("systemPromptInput"),
    saveConfig: document.getElementById("saveConfigBtn"),
    docInput: document.getElementById("docInput"),
    docList: document.getElementById("docList"),
    clearDocs: document.getElementById("clearDocsBtn"),
    threadList: document.getElementById("threadList"),
    threadCount: document.getElementById("threadCount"),
    newChat: document.getElementById("newChatBtn"),
    chatFeed: document.getElementById("chatFeed"),
    form: document.getElementById("composerForm"),
    prompt: document.getElementById("promptInput"),
    send: document.getElementById("sendBtn"),
    stop: document.getElementById("stopBtn"),
    status: document.getElementById("statusText"),
    mode: document.getElementById("agentMode"),
    tip: document.getElementById("composerTip")
  };

  const welcomeTemplate = els.chatFeed.querySelector(".welcome")?.outerHTML || "";

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY) || "{}");
      if (saved.config) state.config = { ...state.config, ...saved.config };
      if (Array.isArray(saved.docs)) state.docs = saved.docs.slice(0, MAX_DOCS);
      if (Array.isArray(saved.threads)) state.threads = saved.threads;
      state.activeThreadId = saved.activeThreadId || state.threads[0]?.id || createThread().id;
    } catch (error) {
      state.activeThreadId = createThread().id;
    }
  }

  function saveState() {
    localStorage.setItem(STORE_KEY, JSON.stringify({
      config: state.config,
      docs: state.docs,
      threads: state.threads.slice(0, 20),
      activeThreadId: state.activeThreadId
    }));
  }

  function createThread() {
    const thread = {
      id: "thread-" + Date.now(),
      title: "新对话",
      createdAt: new Date().toISOString(),
      messages: []
    };
    state.threads.unshift(thread);
    state.activeThreadId = thread.id;
    return thread;
  }

  function activeThread() {
    return state.threads.find((thread) => thread.id === state.activeThreadId) || createThread();
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"]/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char];
    });
  }

  function formatTime(value) {
    return new Date(value || Date.now()).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  }

  function setBusy(isBusy) {
    els.send.disabled = isBusy;
    els.stop.disabled = !isBusy;
    els.prompt.disabled = isBusy;
    els.mode.textContent = isBusy ? "Thinking" : "Local Ready";
  }

  function setStatus(text) {
    els.status.textContent = text;
  }

  function renderConfig() {
    els.endpoint.value = state.config.endpoint || "";
    els.model.value = state.config.model || "";
    els.apiKey.value = state.config.apiKey || "";
    els.bridgeToken.value = state.config.bridgeToken || "";
    els.systemPrompt.value = state.config.systemPrompt || "";
  }

  function renderDocs() {
    if (!state.docs.length) {
      els.docList.innerHTML = '<p class="hint">还没有上传资料。</p>';
      els.tip.textContent = "当前无资料上下文；可先直接练习 Prompt。";
      return;
    }

    els.docList.innerHTML = state.docs.map(function (doc) {
      return '<article class="doc-item"><strong>' + escapeHtml(doc.name) + '</strong><span>' + Math.round(doc.content.length / 1000) + 'k chars</span></article>';
    }).join("");
    els.tip.textContent = "已加载 " + state.docs.length + " 份资料，会作为上下文发送。";
  }

  function renderThreads() {
    els.threadCount.textContent = String(state.threads.length);
    els.threadList.innerHTML = state.threads.map(function (thread) {
      const active = thread.id === state.activeThreadId ? " is-active" : "";
      const last = thread.messages[thread.messages.length - 1];
      return '<li><button type="button" class="thread-item' + active + '" data-thread-id="' + thread.id + '"><strong>' + escapeHtml(thread.title) + '</strong><span>' + escapeHtml(last?.content || "暂无消息") + '</span></button></li>';
    }).join("");
  }

  function renderChat() {
    const thread = activeThread();
    els.chatFeed.innerHTML = "";
    if (!thread.messages.length && welcomeTemplate) els.chatFeed.innerHTML = welcomeTemplate;

    thread.messages.forEach(function (message) {
      appendMessage(message.role, message.content, message.createdAt, message.error, false);
    });
    els.chatFeed.scrollTop = els.chatFeed.scrollHeight;
  }

  function appendMessage(role, content, createdAt, isError, shouldPersist) {
    const node = document.createElement("article");
    node.className = "msg panel " + (role === "user" ? "user" : "assistant") + (isError ? " error" : "");
    node.innerHTML = '<div class="msg-head"><span>' + (role === "user" ? "You" : "Agent") + '</span><time>' + formatTime(createdAt) + '</time></div><pre class="msg-body"></pre>';
    node.querySelector(".msg-body").textContent = content;
    els.chatFeed.appendChild(node);
    els.chatFeed.scrollTop = els.chatFeed.scrollHeight;

    if (shouldPersist) {
      const thread = activeThread();
      thread.messages.push({ role, content, createdAt: createdAt || new Date().toISOString(), error: Boolean(isError) });
      if (role === "user" && (thread.title === "新对话" || !thread.title)) thread.title = content.slice(0, 24);
      saveState();
      renderThreads();
    }
    return node;
  }

  function buildKnowledgeContext() {
    if (!state.docs.length) return "";
    let used = 0;
    return state.docs.map(function (doc, index) {
      const remaining = MAX_DOC_CHARS - used;
      if (remaining <= 0) return "";
      const chunk = doc.content.slice(0, remaining);
      used += chunk.length;
      return "[资料 " + (index + 1) + ": " + doc.name + "]\n" + chunk;
    }).filter(Boolean).join("\n\n---\n\n");
  }

  function buildMessages(userPrompt) {
    const knowledge = buildKnowledgeContext();
    const system = [state.config.systemPrompt, knowledge ? "以下是用户上传的 MCP/知识资料，请优先参考：\n" + knowledge : ""].filter(Boolean).join("\n\n");
    const history = activeThread().messages.filter(function (message) {
      return !message.error && (message.role === "user" || message.role === "assistant");
    }).slice(-10).map(function (message) {
      return { role: message.role, content: message.content };
    });

    return [{ role: "system", content: system }].concat(history, [{ role: "user", content: userPrompt }]);
  }

  async function callModel(messages) {
    const endpoint = state.config.endpoint.trim() || "/api/openclaw";
    const headers = { "Content-Type": "application/json" };
    if (state.config.apiKey.trim()) headers.Authorization = "Bearer " + state.config.apiKey.trim().replace(/^Bearer\s+/i, "");
    if (state.config.bridgeToken.trim()) headers["X-OpenClaw-Bridge-Token"] = state.config.bridgeToken.trim();

    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      signal: state.abortController.signal,
      body: JSON.stringify({
        model: state.config.model || "openclaw-agent",
        messages,
        temperature: 0.7,
        stream: false
      })
    });

    const text = await response.text();
    let data = null;
    try { data = JSON.parse(text); } catch (error) { data = null; }
    if (!response.ok) throw new Error(data?.error?.message || data?.message || text || "模型接口请求失败");
    return data?.choices?.[0]?.message?.content || data?.message?.content || data?.response || text || "模型没有返回内容。";
  }

  async function sendPrompt(prompt) {
    const value = prompt.trim();
    if (!value) return;

    els.prompt.value = "";
    appendMessage("user", value, new Date().toISOString(), false, true);
    setBusy(true);
    setStatus("正在请求模型接口...");
    state.abortController = new AbortController();

    try {
      const answer = await callModel(buildMessages(value));
      appendMessage("assistant", answer, new Date().toISOString(), false, true);
      setStatus("回答完成。继续输入问题或调整 Prompt。");
    } catch (error) {
      if (error.name === "AbortError") {
        appendMessage("assistant", "已停止本次请求。", new Date().toISOString(), true, true);
        setStatus("已停止请求。");
      } else {
        appendMessage("assistant", error.message || "请求失败，请检查接口地址、模型名或跨域设置。", new Date().toISOString(), true, true);
        setStatus("请求失败：请检查 API 地址、CORS 或代理环境变量。");
      }
    } finally {
      state.abortController = null;
      setBusy(false);
    }
  }

  async function addDocs(files) {
    const accepted = Array.from(files || []).slice(0, MAX_DOCS - state.docs.length);
    for (const file of accepted) {
      const content = await file.text();
      state.docs.push({ name: file.name, content: content.slice(0, MAX_DOC_CHARS), addedAt: new Date().toISOString() });
    }
    saveState();
    renderDocs();
    setStatus("已加载 " + state.docs.length + " 份资料。可以开始基于资料提问。");
  }

  function bindEvents() {
    els.saveConfig.addEventListener("click", function () {
      state.config.endpoint = els.endpoint.value.trim();
      state.config.model = els.model.value.trim() || "openclaw-agent";
      state.config.apiKey = els.apiKey.value.trim();
      state.config.bridgeToken = els.bridgeToken.value.trim();
      state.config.systemPrompt = els.systemPrompt.value.trim();
      saveState();
      setStatus("接口和系统 Prompt 已保存。");
    });

    els.systemPrompt.addEventListener("change", function () {
      state.config.systemPrompt = els.systemPrompt.value.trim();
      saveState();
    });

    els.docInput.addEventListener("change", function (event) {
      addDocs(event.target.files).finally(function () { event.target.value = ""; });
    });

    els.clearDocs.addEventListener("click", function () {
      state.docs = [];
      saveState();
      renderDocs();
      setStatus("资料已清空。");
    });

    els.newChat.addEventListener("click", function () {
      createThread();
      saveState();
      renderThreads();
      renderChat();
      setStatus("已新建对话。");
    });

    els.threadList.addEventListener("click", function (event) {
      const button = event.target.closest("[data-thread-id]");
      if (!button) return;
      state.activeThreadId = button.dataset.threadId;
      saveState();
      renderThreads();
      renderChat();
    });

    els.form.addEventListener("submit", function (event) {
      event.preventDefault();
      state.config.systemPrompt = els.systemPrompt.value.trim();
      saveState();
      sendPrompt(els.prompt.value);
    });

    els.prompt.addEventListener("keydown", function (event) {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        els.form.requestSubmit();
      }
    });

    els.stop.addEventListener("click", function () {
      if (state.abortController) state.abortController.abort();
    });

    document.addEventListener("click", function (event) {
      const button = event.target.closest("[data-prompt]");
      if (!button) return;
      els.prompt.value = button.dataset.prompt;
      els.prompt.focus();
    });
  }

  loadState();
  renderConfig();
  renderDocs();
  renderThreads();
  renderChat();
  bindEvents();
})();
