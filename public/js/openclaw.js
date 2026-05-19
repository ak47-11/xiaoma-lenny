(function () {
  const STORE_KEY = "xiaoma.openclaw.agent.v1";
  const USER_STORE_PREFIX = "xiaoma.openclaw.agent.user.";
  const CLOUD_TABLE = "openclaw_states";
  const MAX_DOC_CHARS = 28000;
  const MAX_DOCS = 12;

  const state = {
    config: {
      endpoint: "",
      apiKey: "",
      mode: "single",
      activeAgentId: "agent-default",
      activeGroupId: "group-default",
      activeThreadIds: {},
      systemPrompt: "你是一个本地 AI 智能体，代表用户阅读资料、拆解问题并给出清晰可执行的中文回答。回答时优先引用用户上传的资料；资料不足时明确说明不确定性。"
    },
    agents: [createDefaultAgent()],
    groups: [createDefaultGroup()],
    docs: [],
    threads: [],
    session: null,
    client: null,
    userStoreKey: "",
    abortController: null,
    cloudReady: false,
    cloudSaveTimer: null,
    syncWarningShown: false
  };

  let editingAgentId = "";

  const els = {
    endpoint: document.getElementById("endpointInput"),
    apiKey: document.getElementById("apiKeyInput"),
    agentList: document.getElementById("agentList"),
    groupList: document.getElementById("groupList"),
    groupMemberList: document.getElementById("groupMemberList"),
    agentForm: document.getElementById("agentForm"),
    groupForm: document.getElementById("groupForm"),
    toggleAgentForm: document.getElementById("toggleAgentFormBtn"),
    toggleGroupForm: document.getElementById("toggleGroupFormBtn"),
    closeAgentForm: document.getElementById("closeAgentFormBtn"),
    closeGroupForm: document.getElementById("closeGroupFormBtn"),
    agentName: document.getElementById("agentNameInput"),
    agentModel: document.getElementById("agentModelInput"),
    agentPrompt: document.getElementById("agentPromptInput"),
    addAgent: document.getElementById("addAgentBtn"),
    groupName: document.getElementById("groupNameInput"),
    addGroup: document.getElementById("addGroupBtn"),
    saveConfig: document.getElementById("saveConfigBtn"),
    docInput: document.getElementById("docInput"),
    docList: document.getElementById("docList"),
    clearDocs: document.getElementById("clearDocsBtn"),
    threadList: document.getElementById("threadList"),
    threadCount: document.getElementById("threadCount"),
    promptHistoryPanel: document.getElementById("promptHistoryPanel"),
    togglePromptHistory: document.getElementById("togglePromptHistoryBtn"),
    closePromptHistory: document.getElementById("closePromptHistoryBtn"),
    newChat: document.getElementById("newChatBtn"),
    chatFeed: document.getElementById("chatFeed"),
    form: document.getElementById("composerForm"),
    prompt: document.getElementById("promptInput"),
    send: document.getElementById("sendBtn"),
    stop: document.getElementById("stopBtn"),
    status: document.getElementById("statusText"),
    mode: document.getElementById("agentMode"),
    tip: document.getElementById("composerTip"),
    userHint: document.getElementById("userHint")
  };

  const welcomeTemplate = els.chatFeed.querySelector(".welcome")?.outerHTML || "";

  function createDefaultAgent() {
    return {
      id: "agent-default",
      name: "默认助手",
      model: "openclaw-agent",
      endpoint: "",
      apiKey: "",
      prompt: "你是一个可靠的中文 AI 助手，回答要清晰、直接、可执行。"
    };
  }

  function createDefaultGroup() {
    return {
      id: "group-default",
      name: "默认群聊",
      memberIds: ["agent-default"]
    };
  }

  function snapshotState() {
    return {
      config: state.config,
      agents: state.agents,
      groups: state.groups,
      docs: state.docs,
      threads: state.threads.slice(0, 20)
    };
  }

  function applySavedState(saved) {
    if (!saved || typeof saved !== "object") return;
    if (saved.config) state.config = { ...state.config, ...saved.config };
    if (Array.isArray(saved.agents)) state.agents = saved.agents.length ? saved.agents : [];
    if (Array.isArray(saved.groups) && saved.groups.length) state.groups = saved.groups;
    if (Array.isArray(saved.docs)) state.docs = saved.docs.slice(0, MAX_DOCS);
    if (Array.isArray(saved.threads)) state.threads = saved.threads;
    migrateThreads();
    ensureActiveThread();
  }

  function loadState() {
    if (!state.userStoreKey) return;
    try {
      const saved = JSON.parse(localStorage.getItem(state.userStoreKey) || "{}");
      applySavedState(saved);
      saveState();
    } catch (error) {
      ensureActiveThread();
    }
  }

  function saveState() {
    if (!state.userStoreKey) return;
    localStorage.setItem(state.userStoreKey, JSON.stringify(snapshotState()));
    queueCloudSave();
  }

  async function loadCloudState() {
    if (!state.client || !state.session?.user) return false;
    try {
      const result = await state.client.from(CLOUD_TABLE).select("state,updated_at").eq("user_id", state.session.user.id).maybeSingle();
      if (result.error) throw result.error;
      state.cloudReady = true;
      if (result.data?.state) {
        applySavedState(result.data.state);
        localStorage.setItem(state.userStoreKey, JSON.stringify(snapshotState()));
        return true;
      }
      await saveCloudState();
      return false;
    } catch (error) {
      state.cloudReady = false;
      if (!state.syncWarningShown) {
        state.syncWarningShown = true;
        setStatus("云同步未初始化：请执行 supabase/community_admin_setup.sql 后刷新。当前仅保存在本浏览器。");
      }
      return false;
    }
  }

  function queueCloudSave() {
    if (!state.cloudReady || !state.client || !state.session?.user) return;
    clearTimeout(state.cloudSaveTimer);
    state.cloudSaveTimer = setTimeout(saveCloudState, 650);
  }

  async function saveCloudState() {
    if (!state.client || !state.session?.user) return;
    try {
      const result = await state.client.from(CLOUD_TABLE).upsert({
        user_id: state.session.user.id,
        state: snapshotState(),
        updated_at: new Date().toISOString()
      }, { onConflict: "user_id" });
      if (result.error) throw result.error;
      state.cloudReady = true;
    } catch (error) {
      state.cloudReady = false;
      if (!state.syncWarningShown) {
        state.syncWarningShown = true;
        setStatus("云同步保存失败：请确认 openclaw_states 表已初始化。当前仅保存在本浏览器。");
      }
    }
  }

  function currentRoomId() {
    return state.config.mode === "group" ? "group:" + state.config.activeGroupId : "agent:" + state.config.activeAgentId;
  }

  function currentRoomTitle() {
    if (state.config.mode === "group") {
      const group = state.groups.find((entry) => entry.id === state.config.activeGroupId);
      return group?.name || "群聊";
    }
    return activeAgent().name || "模型好友";
  }

  function migrateThreads() {
    state.config.activeThreadIds = state.config.activeThreadIds || {};
    state.threads.forEach(function (thread, index) {
      if (!thread.roomId) thread.roomId = String(thread.id || "").startsWith("group:") || String(thread.id || "").startsWith("agent:") ? thread.id : currentRoomId();
      if (thread.id === thread.roomId) thread.id = "thread-" + Date.now() + "-" + index;
    });
  }

  function createThread(roomId, title) {
    const targetRoomId = roomId || currentRoomId();
    const thread = {
      id: "thread-" + Date.now() + "-" + Math.random().toString(16).slice(2),
      roomId: targetRoomId,
      title: title || currentRoomTitle(),
      createdAt: new Date().toISOString(),
      messages: []
    };
    state.threads.unshift(thread);
    state.config.activeThreadIds = state.config.activeThreadIds || {};
    state.config.activeThreadIds[targetRoomId] = thread.id;
    return thread;
  }

  function ensureActiveThread() {
    return activeThread();
  }

  function activeThread() {
    const roomId = currentRoomId();
    state.config.activeThreadIds = state.config.activeThreadIds || {};
    let thread = state.threads.find((item) => item.id === state.config.activeThreadIds[roomId] && item.roomId === roomId);
    if (!thread) thread = state.threads.find((item) => item.roomId === roomId);
    if (!thread) thread = createThread(roomId, currentRoomTitle());
    state.config.activeThreadIds[roomId] = thread.id;
    thread.title = currentRoomTitle();
    return thread;
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
    els.apiKey.value = state.config.apiKey || "";
    renderAgents();
    renderGroups();
  }

  function activeAgent() {
    return state.agents.find((agent) => agent.id === state.config.activeAgentId) || state.agents[0] || createDefaultAgent();
  }

  function renderAgents() {
    if (!state.agents.length) {
      els.agentList.innerHTML = '<p class="hint">还没有模型好友，点击右侧添加。</p>';
      renderGroupMemberList();
      return;
    }

    if (!state.agents.some((agent) => agent.id === state.config.activeAgentId)) state.config.activeAgentId = state.agents[0].id;
    const activeGroup = state.groups.find((group) => group.id === state.config.activeGroupId) || state.groups[0] || createDefaultGroup();

    els.agentList.innerHTML = state.agents.map(function (agent) {
      const active = state.config.mode === "single" && agent.id === state.config.activeAgentId ? " is-active" : "";
      const remove = state.agents.length > 1 ? '<button type="button" data-remove-agent="' + escapeHtml(agent.id) + '">删除</button>' : "";
      const inGroup = activeGroup.memberIds.includes(agent.id);
      const groupAction = state.config.mode === "group" ? '<button type="button" data-toggle-member="' + escapeHtml(agent.id) + '">' + (inGroup ? '移出群' : '拉入群') + '</button>' : "";
      const settings = '<button type="button" data-edit-agent="' + escapeHtml(agent.id) + '">设置</button>';
      return '<article class="roster-item agent-item' + active + '" data-agent-id="' + escapeHtml(agent.id) + '"><div class="avatar-dot">AI</div><div class="roster-meta"><strong>' + escapeHtml(agent.name) + '</strong><span>' + escapeHtml(agent.model) + '</span><p>' + escapeHtml(agent.prompt).slice(0, 72) + '</p></div><div class="roster-actions">' + settings + groupAction + remove + '</div></article>';
    }).join("");
    renderGroupMemberList();
  }

  function renderGroups() {
    if (!state.groups.length) state.groups = [createDefaultGroup()];
    state.groups.forEach(function (group) {
      group.memberIds = group.memberIds.filter((id) => state.agents.some((agent) => agent.id === id));
    });
    if (!state.groups.some((group) => group.id === state.config.activeGroupId)) state.config.activeGroupId = state.groups[0].id;

    els.groupList.innerHTML = state.groups.map(function (group) {
      const active = state.config.mode === "group" && group.id === state.config.activeGroupId ? " is-active" : "";
      const members = group.memberIds.map((id) => state.agents.find((agent) => agent.id === id)?.name).filter(Boolean).join("、");
      const remove = state.groups.length > 1 ? '<button type="button" data-remove-group="' + escapeHtml(group.id) + '">删除</button>' : "";
      return '<article class="roster-item group-item' + active + '" data-group-id="' + escapeHtml(group.id) + '"><div class="avatar-dot group-dot">群</div><div class="roster-meta"><strong>' + escapeHtml(group.name) + '</strong><span>' + group.memberIds.length + ' 个模型</span><p>' + escapeHtml(members || "暂无成员") + '</p></div>' + remove + '</article>';
    }).join("");
  }

  function renderGroupMemberList() {
    els.groupMemberList.innerHTML = state.agents.map(function (agent) {
      return '<label class="member-row" data-member-row="' + escapeHtml(agent.id) + '"><input type="checkbox" value="' + escapeHtml(agent.id) + '" checked /> <span>' + escapeHtml(agent.name) + ' · ' + escapeHtml(agent.model) + '</span><button type="button" data-member-up="' + escapeHtml(agent.id) + '">上移</button><button type="button" data-member-down="' + escapeHtml(agent.id) + '">下移</button></label>';
    }).join("");
  }

  async function loadSession() {
    if (!window.XiaomaCore) {
      setStatus("账号模块未加载，请刷新页面。");
      return;
    }
    await window.XiaomaCore.applyNavState();
    const context = await window.XiaomaCore.getSessionContext();
    state.session = context.session;
    state.client = context.client;
    if (!state.session?.user) {
      els.userHint.textContent = "请先登录账号，登录后可直接使用智能体。";
      setStatus("未登录：请先登录后使用。 ");
      els.mode.textContent = "Login Required";
      els.send.disabled = true;
      return;
    }
    state.userStoreKey = USER_STORE_PREFIX + state.session.user.id;
    localStorage.removeItem(STORE_KEY);
    state.config = {
      endpoint: "",
      apiKey: "",
      mode: "single",
      activeAgentId: "agent-default",
      activeGroupId: "group-default",
      activeThreadIds: {},
      systemPrompt: "你是一个本地 AI 智能体，代表用户阅读资料、拆解问题并给出清晰可执行的中文回答。回答时优先引用用户上传的资料；资料不足时明确说明不确定性。"
    };
    state.agents = [];
    state.groups = [createDefaultGroup()];
    state.docs = [];
    state.threads = [];
    loadState();
    await loadCloudState();
    renderConfig();
    renderDocs();
    renderThreads();
    renderChat();
    els.userHint.textContent = "当前账号：" + (state.session.user.email || state.session.user.id);
    setStatus(state.cloudReady ? "已登录：模型好友和聊天记录会跨浏览器同步。" : "已登录：云同步未启用，当前仍只保存在本浏览器。");
    els.mode.textContent = "Signed In";
    els.send.disabled = false;
  }

  function renderDocs() {
    if (!state.docs.length) {
      els.docList.innerHTML = '<p class="hint">后台资料库为空。</p>';
      els.tip.textContent = "当前无资料上下文；可先直接练习 Prompt。";
      return;
    }

    const totalChars = state.docs.reduce((sum, doc) => sum + doc.content.length, 0);
    els.docList.innerHTML = '<p class="hint">后台已保存 ' + state.docs.length + ' 份资料，约 ' + Math.round(totalChars / 1000) + 'k 字符。</p>';
    els.tip.textContent = "后台资料会作为上下文发送。";
  }

  function renderThreads() {
    const roomId = currentRoomId();
    const roomThreads = state.threads.filter((thread) => thread.roomId === roomId);
    els.threadCount.textContent = String(roomThreads.length);
    els.threadList.innerHTML = roomThreads.map(function (thread) {
      const active = thread.id === state.config.activeThreadIds?.[roomId] ? " is-active" : "";
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
      thread.title = currentRoomTitle();
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

  function buildMessages(userPrompt, agent) {
    const knowledge = buildKnowledgeContext();
    const system = [state.config.systemPrompt, agent?.prompt, knowledge ? "以下是用户上传的 MCP/知识资料，请优先参考：\n" + knowledge : ""].filter(Boolean).join("\n\n");
    const history = activeThread().messages.filter(function (message) {
      return !message.error && (message.role === "user" || message.role === "assistant");
    }).slice(-10).map(function (message) {
      return { role: message.role, content: message.content };
    });

    return [{ role: "system", content: system }].concat(history, [{ role: "user", content: userPrompt }]);
  }

  async function callModel(messages) {
    return callAgentModel(activeAgent(), messages);
  }

  async function callAgentModel(agent, messages) {
    if (!state.session?.access_token) throw new Error("请先登录账号后再使用智能体。");
    const endpoint = "/api/openclaw";
    const headers = { "Content-Type": "application/json" };
    headers.Authorization = "Bearer " + state.session.access_token;

    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      signal: state.abortController.signal,
      body: JSON.stringify({
        model: agent?.model || "openclaw-agent",
        provider: {
          endpoint: agent?.endpoint || "",
          apiKey: agent?.apiKey || ""
        },
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
      if (state.config.mode === "group") {
        await sendGroupPrompt(value);
      } else {
        const agent = activeAgent();
        const answer = await callAgentModel(agent, buildMessages(value, agent));
        appendMessage("assistant", "[" + agent.name + "]\n" + answer, new Date().toISOString(), false, true);
      }
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

  async function sendGroupPrompt(value) {
    const activeGroup = state.groups.find((group) => group.id === state.config.activeGroupId) || state.groups[0] || createDefaultGroup();
    const agents = activeGroup.memberIds.map((id) => state.agents.find((agent) => agent.id === id)).filter(Boolean).slice(0, 6);
    const answers = [];
    for (const agent of agents) {
      setStatus("群聊中：" + agent.name + " 正在回答...");
      const discussion = answers.length ? "\n\n目前群内已有观点：\n" + answers.map(function (item) {
        return "[" + item.agent.name + "]\n" + item.answer;
      }).join("\n\n---\n\n") : "";
      const prompt = answers.length ? value + discussion + "\n\n请你基于用户问题和前面成员观点继续讨论：补充、反驳或给出更优方案。" : value;
      const answer = await callAgentModel(agent, buildMessages(prompt, agent));
      answers.push({ agent, answer });
      appendMessage("assistant", "[" + agent.name + " / " + agent.model + "]\n" + answer, new Date().toISOString(), false, true);
    }

    if (answers.length > 1) {
      setStatus("群聊讨论完成。");
    }
  }

  async function addDocs(files) {
    const accepted = Array.from(files || []).slice(0, MAX_DOCS - state.docs.length);
    for (const file of accepted) {
      setStatus("正在解析资料：" + file.name);
      const content = await extractFileText(file);
      state.docs.push({ name: file.name, content: content.slice(0, MAX_DOC_CHARS), addedAt: new Date().toISOString() });
    }
    saveState();
    renderDocs();
    setStatus("已加载 " + state.docs.length + " 份资料。可以开始基于资料提问。");
  }

  function bindEvents() {
    els.saveConfig.addEventListener("click", function () {
      saveState();
      renderAgents();
      renderGroups();
      setStatus("设置已保存。");
    });

    els.toggleAgentForm.addEventListener("click", function () {
      editingAgentId = "";
      document.getElementById("agentFormTitle").textContent = "添加模型好友";
      els.addAgent.textContent = "保存模型好友";
      els.agentName.value = "";
      els.agentModel.value = "";
      els.endpoint.value = "";
      els.apiKey.value = "";
      els.agentPrompt.value = "";
      openModal(els.agentForm);
      els.agentName.focus();
    });

    els.toggleGroupForm.addEventListener("click", function () {
      renderGroupMemberList();
      openModal(els.groupForm);
      els.groupName.focus();
    });

    els.closeAgentForm.addEventListener("click", function () {
      closeModal(els.agentForm);
    });

    els.closeGroupForm.addEventListener("click", function () {
      closeModal(els.groupForm);
    });

    els.togglePromptHistory.addEventListener("click", function () {
      els.promptHistoryPanel.classList.toggle("hidden");
    });

    els.closePromptHistory.addEventListener("click", function () {
      els.promptHistoryPanel.classList.add("hidden");
    });

    els.agentForm.addEventListener("click", function (event) {
      if (event.target === els.agentForm) closeModal(els.agentForm);
    });

    els.groupForm.addEventListener("click", function (event) {
      if (event.target === els.groupForm) closeModal(els.groupForm);
    });

    els.groupMemberList.addEventListener("click", function (event) {
      const up = event.target.closest("[data-member-up]");
      const down = event.target.closest("[data-member-down]");
      if (!up && !down) return;
      event.preventDefault();
      const row = event.target.closest("[data-member-row]");
      if (!row) return;
      if (up && row.previousElementSibling) els.groupMemberList.insertBefore(row, row.previousElementSibling);
      if (down && row.nextElementSibling) els.groupMemberList.insertBefore(row.nextElementSibling, row);
    });

    els.agentList.addEventListener("click", function (event) {
      const toggleMember = event.target.closest("[data-toggle-member]");
      if (toggleMember) {
        const group = state.groups.find((entry) => entry.id === state.config.activeGroupId) || state.groups[0];
        if (!group) return;
        const agentId = toggleMember.dataset.toggleMember;
        if (group.memberIds.includes(agentId)) {
          if (group.memberIds.length <= 1) return setStatus("群聊至少保留一个模型好友。");
          group.memberIds = group.memberIds.filter((id) => id !== agentId);
        } else {
          group.memberIds.push(agentId);
        }
        saveState();
        renderAgents();
        renderGroups();
        setStatus("已更新群聊成员：" + group.name);
        return;
      }

      const edit = event.target.closest("[data-edit-agent]");
      if (edit) {
        const agent = state.agents.find((item) => item.id === edit.dataset.editAgent);
        if (!agent) return;
        editingAgentId = agent.id;
        document.getElementById("agentFormTitle").textContent = "设置模型好友";
        els.addAgent.textContent = "保存修改";
        els.agentName.value = agent.name || "";
        els.agentModel.value = agent.model || "";
        els.endpoint.value = agent.endpoint || "";
        els.apiKey.value = agent.apiKey || "";
        els.agentPrompt.value = agent.prompt || "";
        openModal(els.agentForm);
        els.agentName.focus();
        return;
      }

      const remove = event.target.closest("[data-remove-agent]");
      if (remove) {
        state.agents = state.agents.filter((agent) => agent.id !== remove.dataset.removeAgent);
        if (!state.agents.length) state.agents = [createDefaultAgent()];
        state.groups.forEach((group) => {
          group.memberIds = group.memberIds.filter((id) => id !== remove.dataset.removeAgent);
          if (!group.memberIds.length) group.memberIds = [state.agents[0].id];
        });
        state.config.activeAgentId = state.agents[0].id;
        saveState();
        renderAgents();
        renderGroups();
        return;
      }
      const item = event.target.closest("[data-agent-id]");
      if (!item) return;
      state.config.mode = "single";
      state.config.activeAgentId = item.dataset.agentId;
      saveState();
      renderAgents();
      renderGroups();
      renderChat();
      setStatus("已切换单聊：" + activeAgent().name);
    });

    els.addAgent.addEventListener("click", function () {
      if (!state.session?.user || !state.userStoreKey) {
        setStatus("请等待登录状态加载完成后再添加模型好友。");
        return;
      }
      const name = els.agentName.value.trim();
      const model = els.agentModel.value.trim();
      const endpoint = els.endpoint.value.trim();
      const apiKey = els.apiKey.value.trim();
      const prompt = els.agentPrompt.value.trim();
      if (!name || !model || !endpoint || !apiKey) return setStatus("请填写角色名称、模型名、API 地址和密钥。");
      const agent = editingAgentId ? state.agents.find((item) => item.id === editingAgentId) : null;
      if (agent) {
        agent.name = name;
        agent.model = model;
        agent.endpoint = endpoint;
        agent.apiKey = apiKey;
        agent.prompt = prompt || "你是" + name + "，请从你的专业角度回答。";
        state.config.activeAgentId = agent.id;
        state.config.mode = "single";
      } else {
        const newAgent = { id: "agent-" + Date.now(), name, model, endpoint, apiKey, prompt: prompt || "你是" + name + "，请从你的专业角度回答。" };
        state.agents.push(newAgent);
        state.config.activeAgentId = newAgent.id;
        state.config.mode = "single";
        if (!state.groups.length) state.groups = [createDefaultGroup()];
        state.groups.forEach(function (group) {
          if (!group.memberIds.includes(newAgent.id)) group.memberIds.push(newAgent.id);
        });
      }
      els.agentName.value = "";
      els.agentModel.value = "";
      els.endpoint.value = "";
      els.apiKey.value = "";
      els.agentPrompt.value = "";
      editingAgentId = "";
      closeModal(els.agentForm);
      saveState();
      renderAgents();
      renderGroups();
      renderGroupMemberList();
      setStatus((agent ? "已更新模型好友：" : "已添加模型好友：") + name);
    });

    els.addGroup.addEventListener("click", function () {
      const name = els.groupName.value.trim();
      const memberIds = Array.from(els.groupMemberList.querySelectorAll("[data-member-row]")).filter((row) => row.querySelector("input")?.checked).map((row) => row.dataset.memberRow);
      if (!name || !memberIds.length) return setStatus("请填写群名称并至少选择一个模型好友。");
      const group = { id: "group-" + Date.now(), name, memberIds };
      state.groups.push(group);
      state.config.mode = "group";
      state.config.activeGroupId = group.id;
      els.groupName.value = "";
      closeModal(els.groupForm);
      saveState();
      renderGroups();
      renderAgents();
      renderChat();
      setStatus("已创建群聊：" + name);
    });

    els.groupList.addEventListener("click", function (event) {
      const remove = event.target.closest("[data-remove-group]");
      if (remove) {
        state.groups = state.groups.filter((group) => group.id !== remove.dataset.removeGroup);
        if (!state.groups.length) state.groups = [createDefaultGroup()];
        state.config.activeGroupId = state.groups[0].id;
        saveState();
        renderGroups();
        return;
      }
      const item = event.target.closest("[data-group-id]");
      if (!item) return;
      state.config.mode = "group";
      state.config.activeGroupId = item.dataset.groupId;
      saveState();
      renderAgents();
      renderGroups();
      renderChat();
      const group = state.groups.find((entry) => entry.id === state.config.activeGroupId);
      setStatus("已进入群聊：" + (group?.name || "群聊"));
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
      createThread(currentRoomId(), currentRoomTitle());
      saveState();
      renderThreads();
      renderChat();
      setStatus("已新建对话，原聊天记录已保留在 Prompts 中。");
    });

    els.threadList.addEventListener("click", function (event) {
      const button = event.target.closest("[data-thread-id]");
      if (!button) return;
      const id = button.dataset.threadId;
      state.config.activeThreadIds = state.config.activeThreadIds || {};
      state.config.activeThreadIds[currentRoomId()] = id;
      saveState();
      renderAgents();
      renderGroups();
      renderThreads();
      renderChat();
    });

    els.form.addEventListener("submit", function (event) {
      event.preventDefault();
      saveState();
      sendPrompt(els.prompt.value);
    });

    els.prompt.addEventListener("keydown", function (event) {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        els.form.requestSubmit();
      }
    });

    els.prompt.addEventListener("input", resizePrompt);
    resizePrompt();

    els.stop.addEventListener("click", function () {
      if (state.abortController) state.abortController.abort();
    });

    document.addEventListener("click", function (event) {
      const button = event.target.closest("[data-prompt]");
      if (!button) return;
      els.prompt.value = button.dataset.prompt;
      els.prompt.focus();
    });

    document.addEventListener("keydown", function (event) {
      if (event.key !== "Escape") return;
      closeModal(els.agentForm);
      closeModal(els.groupForm);
      els.promptHistoryPanel.classList.add("hidden");
    });
  }

  function openModal(modal) {
    if (modal.parentElement !== document.body) document.body.appendChild(modal);
    modal.classList.remove("hidden");
  }

  function resizePrompt() {
    els.prompt.style.height = "auto";
    els.prompt.style.height = Math.min(els.prompt.scrollHeight, Math.round(window.innerHeight * 0.45)) + "px";
  }

  function closeModal(modal) {
    modal.classList.add("hidden");
  }

  async function extractFileText(file) {
    const name = file.name.toLowerCase();
    if (name.endsWith(".pdf")) return extractPdfText(file);
    if (name.endsWith(".docx")) return extractDocxText(file);
    if (name.endsWith(".xlsx") || name.endsWith(".xls")) return extractSheetText(file);
    return file.text();
  }

  async function extractPdfText(file) {
    const pdfjs = window.pdfjsLib || await import("https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs");
    pdfjs.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs";
    const bytes = await file.arrayBuffer();
    const pdf = await pdfjs.getDocument({ data: bytes }).promise;
    const pages = [];
    for (let index = 1; index <= pdf.numPages; index += 1) {
      const page = await pdf.getPage(index);
      const text = await page.getTextContent();
      pages.push(text.items.map((item) => item.str || "").join(" "));
    }
    return pages.join("\n\n");
  }

  async function extractDocxText(file) {
    if (!window.mammoth) throw new Error("Word 解析器加载失败，请刷新页面后重试。");
    const result = await window.mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return result.value || "";
  }

  async function extractSheetText(file) {
    if (!window.XLSX) throw new Error("Excel 解析器加载失败，请刷新页面后重试。");
    const workbook = window.XLSX.read(await file.arrayBuffer(), { type: "array" });
    return workbook.SheetNames.map(function (sheetName) {
      const rows = window.XLSX.utils.sheet_to_csv(workbook.Sheets[sheetName]);
      return "[Sheet: " + sheetName + "]\n" + rows;
    }).join("\n\n");
  }

  loadState();
  renderConfig();
  renderDocs();
  renderThreads();
  renderChat();
  bindEvents();
  loadSession();
})();
