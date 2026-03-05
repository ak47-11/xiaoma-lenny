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
    displayName: "游客",
    articles: [],
    actionSet: new Set(),
    countsMap: new Map(),
    commentsMap: new Map(),
    currentArticleId: null,
    openedSet: new Set(),
    filterType: "all",
    keyword: "",
    tableReady: true
  };

  const publisher = document.getElementById("lennyPublisher");
  const statusEl = document.getElementById("lennyStatus");
  const listEl = document.getElementById("lennyList");
  const template = document.getElementById("lennyArticleTemplate");
  const tagsEl = document.getElementById("lennyTags");
  const userHint = document.getElementById("userHint");

  const viewerTitle = document.getElementById("lennyViewerTitle");
  const viewerMeta = document.getElementById("lennyViewerMeta");
  const viewerStats = document.getElementById("lennyViewerStats");
  const viewerTags = document.getElementById("lennyViewerTags");
  const viewerContent = document.getElementById("lennyViewerContent");

  const commentForm = document.getElementById("lennyCommentForm");
  const commentInput = document.getElementById("lennyCommentInput");
  const commentList = document.getElementById("lennyCommentList");

  const filterTypeEl = document.getElementById("lennyFilterType");
  const searchEl = document.getElementById("lennySearch");

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
    const list = source
      .split(/[，,\s]+/)
      .map(function (item) {
        return item.trim();
      })
      .filter(function (item) {
        return item && item.length <= 24;
      });

    return [...new Set(list)].slice(0, 10);
  }

  function requireLogin(actionText) {
    if (state.user) return true;
    setStatus("请先登录后再" + actionText, "err");
    const next = window.location.pathname + window.location.search;
    setTimeout(function () {
      window.location.href = "/auth.html?next=" + encodeURIComponent(next);
    }, 600);
    return false;
  }

  function canWrite(actionText) {
    if (!requireLogin(actionText)) return false;
    if (!state.tableReady) {
      setStatus("Lenny 模块数据表未初始化，请先执行 SQL 迁移", "err");
      return false;
    }
    return true;
  }

  function getArticleById(articleId) {
    return state.articles.find(function (article) {
      return article.id === articleId;
    });
  }

  function getCounts(articleId) {
    return state.countsMap.get(articleId) || { likeCount: 0, bookmarkCount: 0, readCount: 0 };
  }

  async function loadViewer() {
    await core.applyNavState();
    state.context = await core.getSessionContext();
    state.user = state.context.session?.user || null;

    if (!state.user) {
      state.displayName = "游客";
      setUserHint("游客模式：可阅读公开文章；点赞/收藏/评论需登录，发布请先登录后前往个人发布页");
      return;
    }

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
    setUserHint("当前账号：" + displayName + "（可互动；发布请前往个人发布页）");
  }

  async function loadArticles() {
    const client = state.context?.client || core.localClient;
    const result = await client
      .from("lenny_articles")
      .select("id,title,summary,content,article_type,tags,read_count,like_count,bookmark_count,author_id,author_name,created_at")
      .order("created_at", { ascending: false })
      .limit(120);

    if (result.error) {
      state.tableReady = false;
      state.articles = [];
      state.actionSet = new Set();
      state.countsMap = new Map();
      state.commentsMap = new Map();
      const lower = String(result.error.message || "").toLowerCase();
      if (lower.includes("relation") || lower.includes("does not exist")) {
        setStatus("Lenny 模块数据表未初始化，请先执行 supabase/community_admin_setup.sql", "err");
      } else {
        setStatus("加载文章失败：" + result.error.message, "err");
      }
      renderTags();
      renderList();
      renderViewer();
      return;
    }

    state.tableReady = true;
    state.articles = result.data || [];

    if (!state.currentArticleId || !getArticleById(state.currentArticleId)) {
      state.currentArticleId = state.articles[0]?.id || null;
    }

    await loadMetaData(client);
    renderTags();
    renderList();
    renderViewer();

    if (!state.articles.length) {
      setStatus("公开技术社区还没有文章，去个人发布页写第一篇吧", "");
    } else {
      setStatus("已加载 " + state.articles.length + " 篇文章", "ok");
    }
  }

  async function loadMetaData(client) {
    state.actionSet = new Set();
    state.countsMap = new Map();
    state.commentsMap = new Map();

    const ids = state.articles.map(function (article) {
      return article.id;
    });
    if (!ids.length) return;

    ids.forEach(function (id) {
      state.countsMap.set(id, { likeCount: 0, bookmarkCount: 0, readCount: 0 });
      state.commentsMap.set(id, []);
    });

    const [actionsRes, commentsRes, readsRes] = await Promise.all([
      client.from("lenny_article_actions").select("article_id,user_id,action_type").in("article_id", ids),
      client
        .from("lenny_article_comments")
        .select("id,article_id,text,author_id,author_name,created_at")
        .in("article_id", ids)
        .order("created_at", { ascending: false })
        .limit(800),
      client.from("lenny_article_reads").select("article_id,reader_id").in("article_id", ids)
    ]);

    if (!actionsRes.error) {
      (actionsRes.data || []).forEach(function (row) {
        const counter = state.countsMap.get(row.article_id);
        if (!counter) return;

        if (row.action_type === "like") counter.likeCount += 1;
        if (row.action_type === "bookmark") counter.bookmarkCount += 1;

        if (state.user && row.user_id === state.user.id) {
          state.actionSet.add(row.article_id + ":" + row.action_type);
        }
      });
    }

    if (!readsRes.error) {
      (readsRes.data || []).forEach(function (row) {
        const counter = state.countsMap.get(row.article_id);
        if (!counter) return;
        counter.readCount += 1;
      });
    }

    if (!commentsRes.error) {
      (commentsRes.data || []).forEach(function (row) {
        if (!state.commentsMap.has(row.article_id)) return;
        state.commentsMap.get(row.article_id).push(row);
      });
    }

    if (actionsRes.error || commentsRes.error || readsRes.error) {
      const err = actionsRes.error || commentsRes.error || readsRes.error;
      setStatus("互动数据加载不完整：" + err.message, "err");
    }
  }

  function renderTags() {
    if (!tagsEl) return;
    const map = {};
    state.articles.forEach(function (article) {
      (article.tags || []).forEach(function (tag) {
        map[tag] = (map[tag] || 0) + 1;
      });
    });

    const top = Object.entries(map)
      .sort(function (first, second) {
        return second[1] - first[1];
      })
      .slice(0, 12);

    tagsEl.innerHTML = "";
    if (!top.length) {
      const empty = document.createElement("span");
      empty.className = "tag";
      empty.textContent = "暂无标签";
      tagsEl.appendChild(empty);
      return;
    }

    top.forEach(function (item) {
      const node = document.createElement("span");
      node.className = "tag";
      node.textContent = "#" + item[0] + " · " + item[1];
      tagsEl.appendChild(node);
    });
  }

  function filteredArticles() {
    const keyword = state.keyword.toLowerCase();
    return state.articles.filter(function (article) {
      const passType = state.filterType === "all" || article.article_type === state.filterType;
      if (!passType) return false;
      if (!keyword) return true;

      const haystack = [
        article.title || "",
        article.summary || "",
        (article.tags || []).join(" "),
        article.author_name || ""
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(keyword);
    });
  }

  function renderList() {
    if (!listEl || !template) return;
    listEl.innerHTML = "";

    const list = filteredArticles();
    if (!list.length) {
      listEl.innerHTML = "<div class='empty'>没有匹配的文章，试试切换筛选条件。</div>";
      return;
    }

    list.forEach(function (article) {
      const card = template.content.firstElementChild.cloneNode(true);
      card.classList.toggle("active", article.id === state.currentArticleId);
      const counts = getCounts(article.id);

      card.querySelector(".title").textContent = article.title || "未命名文章";
      card.querySelector(".type").textContent = TYPE_LABEL[article.article_type] || article.article_type || "技术博客";
      card.querySelector(".summary").textContent = article.summary || "作者未填写摘要";
      card.querySelector(".meta").textContent =
        (article.author_name || "匿名作者") +
        " · " +
        formatTime(article.created_at) +
        " · 阅读 " +
        Number(counts.readCount || 0);

      const tagWrap = card.querySelector(".tag-list");
      tagWrap.innerHTML = "";
      (article.tags || []).forEach(function (tag) {
        const tagNode = document.createElement("span");
        tagNode.className = "tag";
        tagNode.textContent = tag;
        tagWrap.appendChild(tagNode);
      });

      const comments = state.commentsMap.get(article.id) || [];
      const likeBtn = card.querySelector(".like-btn");
      const bookmarkBtn = card.querySelector(".bookmark-btn");

      likeBtn.querySelector("span").textContent = String(Number(counts.likeCount || 0));
      bookmarkBtn.querySelector("span").textContent = String(Number(counts.bookmarkCount || 0));
      likeBtn.classList.toggle("on", state.actionSet.has(article.id + ":like"));
      bookmarkBtn.classList.toggle("on", state.actionSet.has(article.id + ":bookmark"));

      card.querySelector(".read-btn").addEventListener("click", async function () {
        await openArticle(article.id, true);
      });

      likeBtn.addEventListener("click", async function () {
        await toggleAction(article, "like");
      });

      bookmarkBtn.addEventListener("click", async function () {
        await toggleAction(article, "bookmark");
      });

      card.querySelector(".comment-btn").addEventListener("click", async function () {
        await openArticle(article.id, false);
        commentInput?.focus();
      });

      const commentHint = document.createElement("div");
      commentHint.className = "meta";
      commentHint.textContent = "评论 " + comments.length;
      card.appendChild(commentHint);

      listEl.appendChild(card);
    });
  }

  function renderViewer() {
    const article = getArticleById(state.currentArticleId);
    if (!article) {
      viewerTitle.textContent = "请选择一篇文章";
      viewerMeta.textContent = "";
      viewerStats.innerHTML = "";
      viewerTags.innerHTML = "";
      viewerContent.textContent = "暂无文章内容";
      commentList.innerHTML = "<div class='comment'>暂无评论</div>";
      return;
    }

    viewerTitle.textContent = article.title || "未命名文章";
    viewerMeta.textContent =
      (article.author_name || "匿名作者") + " · " + formatTime(article.created_at) + " · " + (TYPE_LABEL[article.article_type] || article.article_type);

    const counts = getCounts(article.id);

    viewerStats.innerHTML = "";
    [
      "阅读 " + Number(counts.readCount || 0),
      "点赞 " + Number(counts.likeCount || 0),
      "收藏 " + Number(counts.bookmarkCount || 0),
      "评论 " + (state.commentsMap.get(article.id)?.length || 0)
    ].forEach(function (text) {
      const chip = document.createElement("span");
      chip.className = "chip";
      chip.textContent = text;
      viewerStats.appendChild(chip);
    });

    viewerTags.innerHTML = "";
    (article.tags || []).forEach(function (tag) {
      const tagNode = document.createElement("span");
      tagNode.className = "tag";
      tagNode.textContent = tag;
      viewerTags.appendChild(tagNode);
    });

    viewerContent.textContent = article.content || "";

    const comments = state.commentsMap.get(article.id) || [];
    commentList.innerHTML = "";
    if (!comments.length) {
      commentList.innerHTML = "<div class='comment'>暂无评论，欢迎讨论。</div>";
      return;
    }

    comments.slice(0, 20).forEach(function (row) {
      const item = document.createElement("div");
      item.className = "comment";

      const author = document.createElement("b");
      author.textContent = row.author_name || "匿名用户";
      item.appendChild(author);
      item.appendChild(document.createTextNode("：" + (row.text || "")));
      item.appendChild(document.createElement("br"));

      const time = document.createElement("small");
      time.textContent = formatTime(row.created_at);
      item.appendChild(time);

      commentList.appendChild(item);
    });
  }

  async function openArticle(articleId, increaseReadCount) {
    state.currentArticleId = articleId;
    if (increaseReadCount) {
      await increaseRead(articleId);
    }
    renderList();
    renderViewer();
  }

  async function increaseRead(articleId) {
    if (state.openedSet.has(articleId)) return;

    const counts = getCounts(articleId);
    if (state.user) {
      const insertRes = await (state.context?.client || core.localClient)
        .from("lenny_article_reads")
        .insert({ article_id: articleId, reader_id: state.user.id });

      if (insertRes.error) {
        const msg = String(insertRes.error.message || "").toLowerCase();
        if (!(insertRes.error.code === "23505" || msg.includes("duplicate"))) {
          setStatus("阅读记录写入失败：" + insertRes.error.message, "err");
        }
      } else {
        counts.readCount += 1;
      }
    } else {
      counts.readCount += 1;
    }

    state.countsMap.set(articleId, counts);
    state.openedSet.add(articleId);
  }

  async function toggleAction(article, actionType) {
    const actionText = actionType === "like" ? "点赞" : "收藏";
    if (!canWrite(actionText)) return;

    const key = article.id + ":" + actionType;
    const existed = state.actionSet.has(key);
    const client = state.context.client;

    if (existed) {
      const deleteRes = await client
        .from("lenny_article_actions")
        .delete()
        .eq("article_id", article.id)
        .eq("user_id", state.user.id)
        .eq("action_type", actionType);
      if (deleteRes.error) {
        setStatus(actionText + "失败：" + deleteRes.error.message, "err");
        return;
      }
    } else {
      const insertRes = await client.from("lenny_article_actions").insert({
        article_id: article.id,
        user_id: state.user.id,
        action_type: actionType
      });
      if (insertRes.error) {
        const msg = String(insertRes.error.message || "").toLowerCase();
        if (!(insertRes.error.code === "23505" || msg.includes("duplicate"))) {
          setStatus(actionText + "失败：" + insertRes.error.message, "err");
          return;
        }
      }
    }

    await loadMetaData(client);
    setStatus(actionText + "成功", "ok");
    renderList();
    renderViewer();
  }

  async function submitComment(rawText) {
    if (!canWrite("评论")) return;
    const article = getArticleById(state.currentArticleId);
    if (!article) {
      setStatus("请先选择一篇文章", "err");
      return;
    }

    const text = String(rawText || "").trim();
    if (!text) {
      setStatus("评论内容不能为空", "err");
      return;
    }

    const insertRes = await state.context.client.from("lenny_article_comments").insert({
      article_id: article.id,
      text: text,
      author_id: state.user.id,
      author_name: state.displayName
    });

    if (insertRes.error) {
      setStatus("评论失败：" + insertRes.error.message, "err");
      return;
    }

    commentInput.value = "";
    setStatus("评论成功", "ok");
    await loadArticles();
  }

  function bindPublisher() {
    if (!publisher) return;

    publisher.addEventListener("submit", async function (event) {
      event.preventDefault();
      if (!canWrite("发布文章")) return;

      const title = String(document.getElementById("lennyTitle")?.value || "").trim();
      const type = String(document.getElementById("lennyType")?.value || "blog");
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
      state.currentArticleId = insertRes.data?.id || state.currentArticleId;
      setStatus("发布成功", "ok");
      await loadArticles();
    });
  }

  function bindFilters() {
    if (filterTypeEl) {
      filterTypeEl.addEventListener("change", function () {
        state.filterType = filterTypeEl.value || "all";
        renderList();
      });
    }

    if (searchEl) {
      searchEl.addEventListener("input", function () {
        state.keyword = String(searchEl.value || "").trim();
        renderList();
      });
    }
  }

  function bindCommentForm() {
    if (!commentForm) return;
    commentForm.addEventListener("submit", async function (event) {
      event.preventDefault();
      await submitComment(commentInput?.value || "");
    });
  }

  async function init() {
    bindPublisher();
    bindFilters();
    bindCommentForm();
    await loadViewer();
    await loadArticles();
  }

  init();
})();
