(function () {
  const core = window.XiaomaCore;
  if (!core) return;

  const TYPE_LABEL = {
    blog: "技术博客",
    tutorial: "学习教程",
    analysis: "分析文章"
  };

  const state = {
    context: null,
    user: null,
    displayName: "",
    articles: [],
    tableReady: true
  };

  const publisher = document.getElementById("lennyPublisher");
  const statusEl = document.getElementById("lennyStatus");
  const mineList = document.getElementById("lennyMineList");
  const template = document.getElementById("lennyMineArticleTemplate");
  const userHint = document.getElementById("userHint");

  function setStatus(text, kind) {
    if (!statusEl) return;
    statusEl.textContent = text;
    statusEl.className = "status";
    if (kind) statusEl.classList.add(kind);
  }

  function setUserHint(text) {
    if (userHint) userHint.textContent = text;
  }

  function formatTime(input) {
    if (!input) return "";
    return new Date(input).toLocaleString("zh-CN", { hour12: false });
  }

  function parseTags(raw) {
    const source = String(raw || "").trim();
    if (!source) return [];
    const tags = source
      .split(/[，,\s]+/)
      .map(function (item) {
        return item.trim();
      })
      .filter(function (item) {
        return item && item.length <= 24;
      });
    return [...new Set(tags)].slice(0, 10);
  }

  async function loadViewer() {
    await core.applyNavState();
    const context = await core.requireLogin("/lenny-publish.html");
    if (!context?.session?.user) return false;

    state.context = context;
    state.user = context.session.user;

    let displayName =
      state.user.user_metadata?.name ||
      state.user.user_metadata?.full_name ||
      state.user.email ||
      "已登录用户";

    try {
      const profileRes = await state.context.client
        .from("profiles")
        .select("display_name")
        .eq("id", state.user.id)
        .maybeSingle();

      if (!profileRes.error && profileRes.data?.display_name) {
        displayName = profileRes.data.display_name;
      } else {
        await state.context.client
          .from("profiles")
          .upsert({ id: state.user.id, display_name: displayName }, { onConflict: "id" });
      }
    } catch (error) {
      displayName = state.user.email || displayName;
    }

    state.displayName = displayName;
    setUserHint("当前账号：" + displayName + "（发布后将展示在 Lenny 公开社区）");
    return true;
  }

  function renderMineArticles() {
    if (!mineList || !template) return;
    mineList.innerHTML = "";

    if (!state.articles.length) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "你还没有发布文章，写下第一篇技术内容吧。";
      mineList.appendChild(empty);
      return;
    }

    state.articles.forEach(function (article) {
      const card = template.content.firstElementChild.cloneNode(true);
      card.querySelector(".title").textContent = article.title || "未命名文章";
      card.querySelector(".type").textContent = TYPE_LABEL[article.article_type] || article.article_type || "技术博客";
      card.querySelector(".meta").textContent = formatTime(article.created_at);
      card.querySelector(".summary").textContent = article.summary || "作者未填写摘要";
      card.querySelector(".content").textContent = article.content || "";

      const tagWrap = card.querySelector(".tag-list");
      tagWrap.innerHTML = "";
      (article.tags || []).forEach(function (tag) {
        const node = document.createElement("span");
        node.className = "tag";
        node.textContent = tag;
        tagWrap.appendChild(node);
      });

      const deleteBtn = card.querySelector(".delete-btn");
      deleteBtn.addEventListener("click", async function () {
        const confirmed = window.confirm("确定删除这篇文章吗？删除后不可恢复。");
        if (!confirmed) return;

        const deleteRes = await state.context.client
          .from("lenny_articles")
          .delete()
          .eq("id", article.id)
          .eq("author_id", state.user.id);

        if (deleteRes.error) {
          setStatus("删除失败：" + deleteRes.error.message, "err");
          return;
        }

        setStatus("删除成功", "ok");
        await loadMineArticles();
      });

      mineList.appendChild(card);
    });
  }

  async function loadMineArticles() {
    const result = await state.context.client
      .from("lenny_articles")
      .select("id,title,summary,content,article_type,tags,created_at")
      .eq("author_id", state.user.id)
      .order("created_at", { ascending: false })
      .limit(100);

    if (result.error) {
      state.tableReady = false;
      state.articles = [];
      const lower = String(result.error.message || "").toLowerCase();
      if (lower.includes("relation") || lower.includes("does not exist")) {
        setStatus("Lenny 模块数据表未初始化，请先执行 supabase/community_admin_setup.sql", "err");
      } else {
        setStatus("读取我的文章失败：" + result.error.message, "err");
      }
      renderMineArticles();
      return;
    }

    state.tableReady = true;
    state.articles = result.data || [];
    renderMineArticles();
    setStatus("已加载 " + state.articles.length + " 篇我的文章", "ok");
  }

  function bindPublisher() {
    if (!publisher) return;

    publisher.addEventListener("submit", async function (event) {
      event.preventDefault();

      if (!state.tableReady) {
        setStatus("Lenny 模块数据表未初始化，请先执行 SQL 迁移", "err");
        return;
      }

      const title = String(document.getElementById("lennyTitle")?.value || "").trim();
      const type = String(document.getElementById("lennyType")?.value || "blog").trim();
      const tags = parseTags(document.getElementById("lennyTagsInput")?.value || "");
      const summary = String(document.getElementById("lennySummary")?.value || "").trim();
      const content = String(document.getElementById("lennyContent")?.value || "").trim();

      if (!title) {
        setStatus("请填写文章标题", "err");
        return;
      }
      if (!content) {
        setStatus("请填写文章正文", "err");
        return;
      }
      if (!Object.prototype.hasOwnProperty.call(TYPE_LABEL, type)) {
        setStatus("文章类型不合法", "err");
        return;
      }

      const button = publisher.querySelector("button[type='submit']");
      button.disabled = true;
      button.textContent = "发布中...";

      const insertRes = await state.context.client
        .from("lenny_articles")
        .insert({
          title: title,
          article_type: type,
          tags: tags,
          summary: summary || null,
          content: content,
          author_id: state.user.id,
          author_name: state.displayName
        })
        .select("id")
        .single();

      button.disabled = false;
      button.textContent = "发布文章";

      if (insertRes.error) {
        setStatus("发布失败：" + insertRes.error.message, "err");
        return;
      }

      publisher.reset();
      setStatus("发布成功，正在返回 Lenny 公开社区", "ok");

      localStorage.setItem("xiaoma_flash_lenny", JSON.stringify({
        id: insertRes.data?.id || "",
        at: Date.now(),
        message: "Lenny 文章发布成功"
      }));

      setTimeout(function () {
        window.location.href = "/lenny.html";
      }, 650);
    });
  }

  async function init() {
    const ok = await loadViewer();
    if (!ok) return;
    bindPublisher();
    await loadMineArticles();
  }

  init();
})();
