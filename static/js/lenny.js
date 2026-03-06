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
    follows: new Set(),
    actionSet: new Set(),
    countsMap: new Map(),
    commentsMap: new Map(),
    currentArticleId: null,
    openedSet: new Set(),
    filterType: "all",
    keyword: "",
    menuMode: "home",
    followOnly: false,
    flashArticleId: null,
    flashExpireAt: 0,
    flashRetryCount: 0,
    tableReady: true
  };

  const publisher = document.getElementById("lennyPublisher");
  const statusEl = document.getElementById("lennyStatus");
  const listEl = document.getElementById("lennyList");
  const template = document.getElementById("lennyArticleTemplate");
  const tagsEl = document.getElementById("lennyTags");
  const userHint = document.getElementById("userHint");
  const sideMenu = document.getElementById("lennySideMenu");
  const sidePanelTitle = document.getElementById("lennySidePanelTitle");
  const sidePanelBody = document.getElementById("lennySidePanelBody");
  const retryBtn = document.getElementById("lennyRetryBtn");

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

  const LOAD_TIMEOUT_MS = 8000;
  const DEMO_ARTICLES = [
    {
      id: "demo-lenny-1",
      title: "构建 AI 社区门户的架构决策记录",
      summary: "拆解账号系统、公开流、发布流分离与回流闭环的关键方案，适合团队复盘。",
      content:
        "本文记录了从单页面演进到三社区架构的核心决策：\n\n" +
        "1) 登录与发布链路解耦，降低入口复杂度。\n" +
        "2) 公开流优先可见性，发布流强调效率。\n" +
        "3) 互动操作改为本地即时反馈，失败回滚。\n\n" +
        "这套方案在小团队场景中，能较快达到稳定的用户体验。",
      article_type: "analysis",
      tags: ["架构", "社区产品", "工程实践"],
      author_id: null,
      author_name: "Rina · 架构",
      created_at: "2026-03-05T09:00:00+08:00",
      demo_counts: { likeCount: 268, bookmarkCount: 190, readCount: 4890 },
      demo_comments: [
        { id: "demo-lenny-1-c1", text: "这篇 ADR 很适合团队同步。", author_name: "Neil", created_at: "2026-03-05T09:24:00+08:00" }
      ]
    },
    {
      id: "demo-lenny-2",
      title: "前端骨架屏设计指南：从假加载到真实占位",
      summary: "给出社区场景骨架屏的结构、节奏和失败兜底设计，避免“像没做完”的体验。",
      content:
        "骨架屏不是灰块堆砌，而是内容结构预演。\n\n" +
        "建议实践：\n" +
        "- 与真实卡片同布局\n" +
        "- 1~1.2s 轻量 shimmer\n" +
        "- 超时时立即露出重试按钮\n" +
        "- 空态给出示例内容，避免空白\n",
      article_type: "tutorial",
      tags: ["骨架屏", "UX", "前端"],
      author_id: null,
      author_name: "Seth · 前端",
      created_at: "2026-03-05T10:36:00+08:00",
      demo_counts: { likeCount: 315, bookmarkCount: 227, readCount: 6122 },
      demo_comments: []
    },
    {
      id: "demo-lenny-3",
      title: "如何定义社区信任信号（头像、时间、标签、互动）",
      summary: "从信息可信度和阅读停留角度解释内容卡片的最小信任要素。",
      content:
        "信任信号的本质是降低判断成本。\n\n" +
        "推荐字段：\n" +
        "- 作者头像 + 昵称\n" +
        "- 发布时间（可追溯）\n" +
        "- 标签（上下文）\n" +
        "- 互动计数（社会证明）\n",
      article_type: "analysis",
      tags: ["信任设计", "信息架构", "社区"],
      author_id: null,
      author_name: "Mori · 研究",
      created_at: "2026-03-05T12:12:00+08:00",
      demo_counts: { likeCount: 284, bookmarkCount: 173, readCount: 5330 },
      demo_comments: [
        { id: "demo-lenny-3-c1", text: "这个清单可以直接做设计评审标准。", author_name: "Pia", created_at: "2026-03-05T12:25:00+08:00" }
      ]
    },
    {
      id: "demo-lenny-4",
      title: "Supabase 社区表设计与 RLS 模板",
      summary: "给出动态、视频、文章和互动表的最小可用结构，并附访问策略建议。",
      content:
        "最小模型建议分四层：\n" +
        "1) 主体内容表\n" +
        "2) 互动表（点赞/收藏/评论）\n" +
        "3) 关系表（关注）\n" +
        "4) 通知表\n\n" +
        "每层都应设置最小权限原则。",
      article_type: "tutorial",
      tags: ["Supabase", "RLS", "数据库"],
      author_id: null,
      author_name: "Aven · 后端",
      created_at: "2026-03-05T14:08:00+08:00",
      demo_counts: { likeCount: 358, bookmarkCount: 241, readCount: 7014 },
      demo_comments: []
    },
    {
      id: "demo-lenny-5",
      title: "从 0 到 1 设计统一 UI Token 系统",
      summary: "颜色、圆角、阴影、字号、间距一次收敛，解决多页面“气质割裂”问题。",
      content:
        "一套可落地 token 通常包含：\n" +
        "- 色彩：主色 / 强调色 / 灰阶\n" +
        "- 空间：16/24/32 三级\n" +
        "- 字体：标题/正文/辅助三档\n" +
        "- 控件：按钮、卡片、输入框统一状态\n",
      article_type: "blog",
      tags: ["Design Token", "UI", "前端规范"],
      author_id: null,
      author_name: "Lio · 设计工程",
      created_at: "2026-03-05T16:18:00+08:00",
      demo_counts: { likeCount: 301, bookmarkCount: 205, readCount: 5682 },
      demo_comments: []
    },
    {
      id: "demo-lenny-6",
      title: "社区推荐冷启动：规则与模型混合策略",
      summary: "给出新社区冷启动期的可行推荐方案，兼顾内容质量和分发公平性。",
      content:
        "冷启动建议采用“两段式”：\n" +
        "- 第一段：规则兜底（新鲜度、质量分、基础多样性）\n" +
        "- 第二段：行为反馈驱动模型迭代\n\n" +
        "先稳定体验，再提升精准度。",
      article_type: "analysis",
      tags: ["推荐系统", "冷启动", "数据策略"],
      author_id: null,
      author_name: "Theo · 算法",
      created_at: "2026-03-05T19:05:00+08:00",
      demo_counts: { likeCount: 279, bookmarkCount: 184, readCount: 5196 },
      demo_comments: [
        { id: "demo-lenny-6-c1", text: "希望后续能补一个离线评估案例。", author_name: "Vic", created_at: "2026-03-05T19:22:00+08:00" }
      ]
    }
  ];

  function setStatus(text, kind) {
    if (!statusEl) return;
    statusEl.textContent = text;
    statusEl.className = "status";
    if (kind) statusEl.classList.add(kind);
  }

  function setUserHint(text) {
    if (userHint) userHint.textContent = text;
  }

  function setRetryVisible(visible) {
    if (!retryBtn) return;
    retryBtn.classList.toggle("hidden", !visible);
  }

  function showToast(text) {
    const node = document.createElement("div");
    node.className = "flash-toast";
    node.textContent = text;
    document.body.appendChild(node);
    setTimeout(function () {
      node.remove();
    }, 2500);
  }

  async function withTimeout(promise, timeoutMs) {
    let timer = null;
    try {
      return await Promise.race([
        promise,
        new Promise(function (_, reject) {
          timer = setTimeout(function () {
            const err = new Error("REQUEST_TIMEOUT");
            err.code = "REQUEST_TIMEOUT";
            reject(err);
          }, timeoutMs);
        })
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  function restorePublishFeedback() {
    try {
      const raw = localStorage.getItem("xiaoma_flash_lenny");
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed?.id || !parsed?.at) return;
      if (Date.now() - Number(parsed.at) > 60 * 1000) {
        localStorage.removeItem("xiaoma_flash_lenny");
        return;
      }

      state.flashArticleId = parsed.id;
      state.flashExpireAt = Date.now() + 3000;
      state.flashRetryCount = 0;
      showToast(parsed.message || "发布成功，已回到公开流");
      localStorage.removeItem("xiaoma_flash_lenny");
    } catch (error) {
      localStorage.removeItem("xiaoma_flash_lenny");
    }
  }

  function clearFlashLater() {
    if (!state.flashArticleId || !state.flashExpireAt) return;
    const wait = state.flashExpireAt - Date.now();
    if (wait <= 0) {
      state.flashArticleId = null;
      state.flashExpireAt = 0;
      state.flashRetryCount = 0;
      renderList();
      return;
    }

    setTimeout(function () {
      state.flashArticleId = null;
      state.flashExpireAt = 0;
      state.flashRetryCount = 0;
      renderList();
    }, wait);
  }

  function clearNode(node) {
    if (!node) return;
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function setSidePanel(title, renderFn) {
    if (sidePanelTitle) sidePanelTitle.textContent = title;
    if (!sidePanelBody) return;
    clearNode(sidePanelBody);
    if (typeof renderFn === "function") renderFn(sidePanelBody);
  }

  function setSideText(title, text) {
    setSidePanel(title, function (root) {
      root.textContent = text;
    });
  }

  function applyCompactMode() {
    const enabled = localStorage.getItem("xiaoma_lenny_compact") === "1";
    document.body.classList.toggle("compact-view", enabled);
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

  function isDemoArticleId(articleId) {
    return String(articleId || "").indexOf("demo-") === 0;
  }

  function getAvatarText(name) {
    const value = String(name || "").trim();
    if (!value) return "匿";
    return value.slice(0, 1).toUpperCase();
  }

  function renderListSkeleton(count) {
    if (!listEl) return;
    const total = Math.max(3, Number(count || 6));
    const cards = [];
    for (let index = 0; index < total; index += 1) {
      cards.push(
        "<article class='article-card skeleton-card'>" +
          "<div class='skeleton-head'>" +
            "<span class='skeleton-avatar'></span>" +
            "<div class='skeleton-meta'>" +
              "<div class='skeleton-line w-42'></div>" +
              "<div class='skeleton-line w-25'></div>" +
            "</div>" +
          "</div>" +
          "<div class='skeleton-line w-86'></div>" +
          "<div class='skeleton-line w-93'></div>" +
          "<div class='skeleton-line w-70'></div>" +
          "<div class='skeleton-actions'>" +
            "<span class='skeleton-chip'></span>" +
            "<span class='skeleton-chip'></span>" +
            "<span class='skeleton-chip'></span>" +
          "</div>" +
        "</article>"
      );
    }
    listEl.innerHTML = cards.join("");
  }

  function renderListFailure(message) {
    if (!listEl) return;
    listEl.innerHTML =
      "<article class='article-card empty-state-card'>" +
        "<strong>加载失败</strong>" +
        "<p class='body-text'>" + (message || "网络暂时不稳定，请点击重试加载。") + "</p>" +
        "<div class='tag-list'><span class='tag'>#可重试</span><span class='tag'>#网络波动</span></div>" +
      "</article>";
  }

  function applyDemoArticles() {
    state.articles = DEMO_ARTICLES.map(function (item) {
      return {
        id: item.id,
        title: item.title,
        summary: item.summary,
        content: item.content,
        article_type: item.article_type,
        tags: item.tags || [],
        author_id: item.author_id,
        author_name: item.author_name,
        created_at: item.created_at,
        demo: true
      };
    });

    state.actionSet = new Set();
    state.countsMap = new Map();
    state.commentsMap = new Map();
    state.openedSet = new Set();

    state.articles.forEach(function (article) {
      const source = DEMO_ARTICLES.find(function (item) {
        return item.id === article.id;
      });
      state.countsMap.set(article.id, {
        likeCount: Number(source?.demo_counts?.likeCount || 0),
        bookmarkCount: Number(source?.demo_counts?.bookmarkCount || 0),
        readCount: Number(source?.demo_counts?.readCount || 0)
      });

      const comments = (source?.demo_comments || []).map(function (comment) {
        return {
          id: comment.id,
          article_id: article.id,
          text: comment.text,
          author_name: comment.author_name,
          created_at: comment.created_at
        };
      });
      state.commentsMap.set(article.id, comments);
    });
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

  async function loadArticles(options) {
    const opts = options || {};
    const client = state.context?.client || core.localClient;

    if (!opts.silent) {
      setStatus("正在加载公开文章...", "");
      renderListSkeleton(6);
    }
    setRetryVisible(false);

    let result;
    try {
      result = await withTimeout(
        client
          .from("lenny_articles")
          .select("id,title,summary,content,article_type,tags,read_count,like_count,bookmark_count,author_id,author_name,created_at")
          .order("created_at", { ascending: false })
          .limit(120),
        LOAD_TIMEOUT_MS
      );
    } catch (error) {
      state.articles = [];
      state.actionSet = new Set();
      state.countsMap = new Map();
      state.commentsMap = new Map();
      renderTags();
      renderListFailure("网络较慢，文章流加载超时。你可以立即点击重试。");
      renderViewer();
      setStatus("加载超时，网络较慢，请重试", "err");
      setRetryVisible(true);
      return;
    }

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
      renderListFailure("服务暂时不可用，请稍后重试。");
      renderViewer();
      setRetryVisible(true);
      return;
    }

    state.tableReady = true;
    state.articles = result.data || [];

    if (!state.articles.length) {
      applyDemoArticles();
      state.currentArticleId = state.articles[0]?.id || null;
      state.flashArticleId = null;
      state.flashExpireAt = 0;
      state.flashRetryCount = 0;
      renderTags();
      renderList();
      renderViewer();
      setStatus("当前暂无真实文章，先为你展示 6 篇高质量示例内容", "");
      return;
    }

    if (!state.currentArticleId || !getArticleById(state.currentArticleId)) {
      state.currentArticleId = state.articles[0]?.id || null;
    }

    let partialDataIssue = false;
    try {
      await withTimeout(loadMetaData(client), LOAD_TIMEOUT_MS);
      await withTimeout(loadFollowMap(client), LOAD_TIMEOUT_MS);
    } catch (error) {
      partialDataIssue = true;
      setRetryVisible(true);
    }
    renderTags();
    renderList();
    renderViewer();

    if (!state.articles.length) {
      setStatus("公开技术社区还没有文章，去个人发布页写第一篇吧", "");
    } else if (partialDataIssue) {
      setStatus("已加载 " + state.articles.length + " 篇文章，互动数据加载较慢，可点击重试", "err");
    } else {
      setStatus("已加载 " + state.articles.length + " 篇文章", "ok");
    }

    if (state.flashArticleId && !state.articles.some(function (article) { return article.id === state.flashArticleId; })) {
      if (state.flashRetryCount < 3) {
        state.flashRetryCount += 1;
        setTimeout(function () {
          loadArticles({ silent: true });
        }, 900);
      } else {
        state.flashArticleId = null;
        state.flashExpireAt = 0;
      }
      return;
    }

    clearFlashLater();
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

  async function loadFollowMap(client) {
    state.follows = new Set();
    if (!state.user) return;

    const authorIds = [...new Set(state.articles.map(function (article) {
      return article.author_id;
    }).filter(Boolean))].filter(function (id) {
      return id !== state.user.id;
    });

    if (!authorIds.length) return;

    const followRes = await client
      .from("follows")
      .select("followee_id")
      .eq("follower_id", state.user.id)
      .in("followee_id", authorIds);

    if (!followRes.error) {
      (followRes.data || []).forEach(function (row) {
        if (row.followee_id) state.follows.add(row.followee_id);
      });
    }
  }

  function articleScore(article) {
    const counts = getCounts(article.id);
    const comments = state.commentsMap.get(article.id) || [];
    return Number(counts.readCount || 0) + Number(counts.likeCount || 0) * 2 + Number(counts.bookmarkCount || 0) * 3 + comments.length;
  }

  function getDisplayArticles() {
    let list = state.articles.slice();

    if (state.followOnly && state.user) {
      list = list.filter(function (article) {
        if (!article.author_id) return false;
        if (article.author_id === state.user.id) return true;
        return state.follows.has(article.author_id);
      });
    }

    if (state.menuMode === "explore") {
      list.sort(function (first, second) {
        const diff = articleScore(second) - articleScore(first);
        if (diff !== 0) return diff;
        return new Date(second.created_at).getTime() - new Date(first.created_at).getTime();
      });
    }

    return list;
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
    return getDisplayArticles().filter(function (article) {
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
      if (!state.articles.length) {
        listEl.innerHTML = "<div class='empty'>公开社区暂无文章，去个人发布页写第一篇吧。</div>";
      } else if (state.followOnly) {
        listEl.innerHTML = "<div class='empty'>关注作者暂未更新文章，或先关注更多作者。</div>";
      } else {
        listEl.innerHTML = "<div class='empty'>没有匹配的文章，试试切换筛选条件。</div>";
      }
      return;
    }

    if (!list.some(function (article) { return article.id === state.currentArticleId; })) {
      state.currentArticleId = list[0]?.id || null;
    }

    list.forEach(function (article) {
      const card = template.content.firstElementChild.cloneNode(true);
      if (state.flashArticleId && article.id === state.flashArticleId) {
        card.classList.add("highlight-new");
      }
      card.classList.toggle("active", article.id === state.currentArticleId);
      const counts = getCounts(article.id);
      const authorName = article.author_name || "匿名作者";

      const avatarEl = card.querySelector(".author-avatar");
      if (avatarEl) avatarEl.textContent = getAvatarText(authorName);
      const authorEl = card.querySelector(".author-name");
      if (authorEl) authorEl.textContent = authorName;

      card.querySelector(".title").textContent = article.title || "未命名文章";
      const typeNode = card.querySelector(".type");
      if (typeNode) typeNode.textContent = TYPE_LABEL[article.article_type] || article.article_type || "技术博客";
      card.querySelector(".summary").textContent = article.summary || "作者未填写摘要";
      card.querySelector(".meta").textContent = formatTime(article.created_at);

      const tagWrap = card.querySelector(".tag-list");
      if (tagWrap) {
        tagWrap.innerHTML = "";
        const tags = (article.tags && article.tags.length
          ? article.tags
          : [TYPE_LABEL[article.article_type] || article.article_type || "技术博客"]).slice(0, 4);
        tags.forEach(function (tag) {
          const tagNode = document.createElement("span");
          tagNode.className = "tag";
          tagNode.textContent = tag;
          tagWrap.appendChild(tagNode);
        });
      }

      const comments = state.commentsMap.get(article.id) || [];
      const statsEl = card.querySelector(".card-stats");
      if (statsEl) {
        statsEl.textContent =
          "👁 " + Number(counts.readCount || 0) +
          " · 👍 " + Number(counts.likeCount || 0) +
          " · 🔖 " + Number(counts.bookmarkCount || 0) +
          " · 💬 " + comments.length +
          (article.demo ? " · 示例" : "");
      }

      const likeBtn = card.querySelector(".like-btn");
      const bookmarkBtn = card.querySelector(".bookmark-btn");
      const commentBtn = card.querySelector(".comment-btn");
      const followBtn = card.querySelector(".follow-btn");

      likeBtn.querySelector("span").textContent = String(Number(counts.likeCount || 0));
      bookmarkBtn.querySelector("span").textContent = String(Number(counts.bookmarkCount || 0));
      const commentCountNode = commentBtn.querySelector("span");
      if (commentCountNode) commentCountNode.textContent = String(comments.length);
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

      commentBtn.addEventListener("click", async function () {
        await openArticle(article.id, false);
        commentInput?.focus();
      });

      if (followBtn) {
        if (!article.author_id) {
          followBtn.disabled = true;
          followBtn.textContent = "作者未知";
        } else if (state.user && article.author_id === state.user.id) {
          followBtn.disabled = true;
          followBtn.textContent = "我自己";
        } else {
          const followed = state.follows.has(article.author_id);
          followBtn.classList.toggle("on", followed);
          followBtn.textContent = followed ? "✓ 已关注" : "+ 关注";
          followBtn.addEventListener("click", async function () {
            await toggleFollow(article.author_id, article.author_name || "该作者");
          });
        }
      }

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

  function refreshViews() {
    renderList();
    renderViewer();
  }

  async function openArticle(articleId, increaseReadCount) {
    state.currentArticleId = articleId;
    refreshViews();

    if (increaseReadCount) {
      increaseRead(articleId)
        .then(function () {
          refreshViews();
        })
        .catch(function () {});
    }
  }

  async function increaseRead(articleId) {
    if (state.openedSet.has(articleId)) return;

    const counts = getCounts(articleId);
    if (isDemoArticleId(articleId)) {
      counts.readCount += 1;
      state.countsMap.set(articleId, counts);
      state.openedSet.add(articleId);
      return;
    }

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
    const countKey = actionType === "like" ? "likeCount" : "bookmarkCount";
    const counts = getCounts(article.id);

    if (existed) {
      state.actionSet.delete(key);
    } else {
      state.actionSet.add(key);
    }
    counts[countKey] = Math.max(0, Number(counts[countKey] || 0) + (existed ? -1 : 1));
    state.countsMap.set(article.id, counts);
    refreshViews();

    if (isDemoArticleId(article.id)) {
      setStatus(actionText + "（示例预览）", "ok");
      return;
    }

    if (existed) {
      const deleteRes = await client
        .from("lenny_article_actions")
        .delete()
        .eq("article_id", article.id)
        .eq("user_id", state.user.id)
        .eq("action_type", actionType);
      if (deleteRes.error) {
        state.actionSet.add(key);
        counts[countKey] = Math.max(0, Number(counts[countKey] || 0) + 1);
        state.countsMap.set(article.id, counts);
        refreshViews();
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
          state.actionSet.delete(key);
          counts[countKey] = Math.max(0, Number(counts[countKey] || 0) - 1);
          state.countsMap.set(article.id, counts);
          refreshViews();
          setStatus(actionText + "失败：" + insertRes.error.message, "err");
          return;
        }
      }
    }

    setStatus(actionText + "成功", "ok");
  }

  async function toggleFollow(followeeId, followeeName) {
    if (!canWrite("关注作者")) return;
    if (!followeeId || followeeId === state.user.id) return;

    const client = state.context.client;
    const followed = state.follows.has(followeeId);

    if (followed) {
      state.follows.delete(followeeId);
      setStatus("已取消关注 " + (followeeName || "该作者"), "ok");
      renderList();

      const removeRes = await client
        .from("follows")
        .delete()
        .eq("follower_id", state.user.id)
        .eq("followee_id", followeeId);

      if (removeRes.error) {
        state.follows.add(followeeId);
        renderList();
        setStatus("取消关注失败：" + removeRes.error.message, "err");
        return;
      }

      return;
    }

    state.follows.add(followeeId);
    setStatus("已关注 " + (followeeName || "该作者"), "ok");
    renderList();

    const insertRes = await client.from("follows").insert({
      follower_id: state.user.id,
      followee_id: followeeId
    });

    if (insertRes.error) {
      const msg = String(insertRes.error.message || "").toLowerCase();
      if (!(insertRes.error.code === "23505" || msg.includes("duplicate"))) {
        state.follows.delete(followeeId);
        renderList();
        setStatus("关注失败：" + insertRes.error.message, "err");
        return;
      }
    }

    await client.from("notifications").insert({
      user_id: followeeId,
      text: (state.displayName || "有用户") + " 关注了你"
    });
  }

  async function submitComment(rawText) {
    if (!canWrite("评论")) return false;
    const article = getArticleById(state.currentArticleId);
    if (!article) {
      setStatus("请先选择一篇文章", "err");
      return false;
    }

    const text = String(rawText || "").trim();
    if (!text) {
      setStatus("评论内容不能为空", "err");
      return false;
    }

    if (isDemoArticleId(article.id)) {
      const demoComments = state.commentsMap.get(article.id) || [];
      demoComments.unshift({
        id: "demo-local-" + Date.now(),
        article_id: article.id,
        text: text,
        author_name: state.displayName || "已登录用户",
        created_at: new Date().toISOString()
      });
      state.commentsMap.set(article.id, demoComments);
      commentInput.value = "";
      setStatus("评论成功（示例预览）", "ok");
      refreshViews();
      return true;
    }

    const insertRes = await state.context.client
      .from("lenny_article_comments")
      .insert({
        article_id: article.id,
        text: text,
        author_id: state.user.id,
        author_name: state.displayName
      })
      .select("id,article_id,text,author_id,author_name,created_at")
      .single();

    if (insertRes.error) {
      setStatus("评论失败：" + insertRes.error.message, "err");
      return false;
    }

    const created = insertRes.data || {
      id: "local-" + Date.now(),
      article_id: article.id,
      text: text,
      author_id: state.user.id,
      author_name: state.displayName,
      created_at: new Date().toISOString()
    };
    const comments = state.commentsMap.get(article.id) || [];
    comments.unshift(created);
    state.commentsMap.set(article.id, comments);

    commentInput.value = "";
    setStatus("评论成功", "ok");
    refreshViews();
    return true;
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

  function setActiveMenu(action) {
    if (!sideMenu) return;
    sideMenu.querySelectorAll("button[data-action]").forEach(function (button) {
      button.classList.toggle("active", button.dataset.action === action);
    });
  }

  function renderExplorePanel() {
    setSidePanel("Explore", function (root) {
      const articles = getDisplayArticles().slice(0, 5);
      if (!articles.length) {
        root.textContent = "暂无可探索文章。";
        return;
      }

      articles.forEach(function (article) {
        const row = document.createElement("div");
        row.className = "side-item";
        row.textContent = (article.title || "未命名文章") + " · 热度 " + articleScore(article);
        root.appendChild(row);
      });
    });
  }

  async function renderNotificationsPanel() {
    if (!state.user) {
      setSideText("Notifications", "请先登录后查看通知。登录后会显示关注与互动消息。");
      return;
    }

    const result = await state.context.client
      .from("notifications")
      .select("text,created_at")
      .eq("user_id", state.user.id)
      .order("created_at", { ascending: false })
      .limit(8);

    if (result.error) {
      setSideText("Notifications", "通知读取失败：" + result.error.message);
      return;
    }

    setSidePanel("Notifications", function (root) {
      const rows = result.data || [];
      if (!rows.length) {
        root.textContent = "暂无通知。";
        return;
      }

      rows.forEach(function (row) {
        const item = document.createElement("div");
        item.className = "side-item";

        const text = document.createElement("div");
        text.textContent = row.text || "";
        item.appendChild(text);

        const time = document.createElement("small");
        time.textContent = formatTime(row.created_at);
        item.appendChild(time);

        root.appendChild(item);
      });
    });
  }

  function renderFollowPanel() {
    setSidePanel("Follow", function (root) {
      if (!state.user) {
        root.textContent = "登录后可关注作者并启用“仅看关注”过滤。";
        return;
      }

      const item = document.createElement("div");
      item.className = "side-item";
      item.textContent = "已关注作者：" + state.follows.size + " 人；当前过滤：" + (state.followOnly ? "仅看关注" : "全部文章");
      root.appendChild(item);

      const tip = document.createElement("small");
      tip.textContent = "在文章卡片点击“+ 关注”可管理关注关系。";
      root.appendChild(tip);
    });
  }

  function renderChatPanel() {
    const chatKey = "xiaoma_chat_lenny_v1";
    let rows = [];
    try {
      rows = JSON.parse(localStorage.getItem(chatKey) || "[]");
      if (!Array.isArray(rows)) rows = [];
    } catch (error) {
      rows = [];
    }

    setSidePanel("Chat", function (root) {
      rows.slice(-6).forEach(function (row) {
        const item = document.createElement("div");
        item.className = "side-item";
        item.textContent = (row.name || "用户") + "：" + (row.text || "");
        root.appendChild(item);
      });

      const form = document.createElement("form");
      form.className = "side-form";

      const input = document.createElement("input");
      input.maxLength = 160;
      input.placeholder = "发送一条技术讨论消息";

      const submit = document.createElement("button");
      submit.type = "submit";
      submit.textContent = "发送";

      form.appendChild(input);
      form.appendChild(submit);

      form.addEventListener("submit", function (event) {
        event.preventDefault();
        const text = String(input.value || "").trim();
        if (!text) return;

        rows.push({ name: state.displayName || "游客", text: text, time: new Date().toISOString() });
        rows = rows.slice(-30);
        localStorage.setItem(chatKey, JSON.stringify(rows));
        renderChatPanel();
      });

      root.appendChild(form);
    });
  }

  function renderMorePanel() {
    setSidePanel("More", function (root) {
      const links = document.createElement("div");
      links.className = "side-links";

      [
        { href: "/lenny-publish.html", label: "前往 Lenny 个人发布页" },
        { href: "/community.html", label: "返回社区入口" },
        { href: "/profile.html", label: "打开个人中心" },
        { href: "/m.html", label: "切换到 M" },
        { href: "/mi.html", label: "切换到 Mi" }
      ].forEach(function (item) {
        const link = document.createElement("a");
        link.href = item.href;
        link.textContent = item.label;
        links.appendChild(link);
      });

      root.appendChild(links);
    });
  }

  function renderSettingPanel() {
    setSidePanel("Setting", function (root) {
      const compactForm = document.createElement("form");
      compactForm.className = "side-form";

      const compactSelect = document.createElement("select");
      compactSelect.innerHTML = "<option value='0'>标准布局</option><option value='1'>紧凑布局</option>";
      compactSelect.value = localStorage.getItem("xiaoma_lenny_compact") === "1" ? "1" : "0";

      const compactSave = document.createElement("button");
      compactSave.type = "submit";
      compactSave.textContent = "应用";
      compactForm.appendChild(compactSelect);
      compactForm.appendChild(compactSave);
      compactForm.addEventListener("submit", function (event) {
        event.preventDefault();
        localStorage.setItem("xiaoma_lenny_compact", compactSelect.value === "1" ? "1" : "0");
        applyCompactMode();
      });

      const exploreForm = document.createElement("form");
      exploreForm.className = "side-form";

      const exploreSelect = document.createElement("select");
      exploreSelect.innerHTML = "<option value='0'>默认 Home</option><option value='1'>默认 Explore</option>";
      exploreSelect.value = localStorage.getItem("xiaoma_lenny_default_explore") === "1" ? "1" : "0";

      const exploreSave = document.createElement("button");
      exploreSave.type = "submit";
      exploreSave.textContent = "保存";
      exploreForm.appendChild(exploreSelect);
      exploreForm.appendChild(exploreSave);
      exploreForm.addEventListener("submit", function (event) {
        event.preventDefault();
        localStorage.setItem("xiaoma_lenny_default_explore", exploreSelect.value === "1" ? "1" : "0");
      });

      root.appendChild(compactForm);
      root.appendChild(exploreForm);
    });
  }

  async function handleMenuAction(action) {
    setActiveMenu(action);

    if (action === "home") {
      state.menuMode = "home";
      state.followOnly = false;
      renderList();
      renderViewer();
      setSideText("Home", "这是公开技术内容流，可阅读所有用户发布的文章。");
      return;
    }

    if (action === "explore") {
      state.menuMode = "explore";
      state.followOnly = false;
      renderList();
      renderViewer();
      renderExplorePanel();
      return;
    }

    if (action === "notifications") {
      await renderNotificationsPanel();
      return;
    }

    if (action === "follow") {
      if (!state.user) {
        setSideText("Follow", "请先登录后管理关注关系。登录后可切换“仅看关注”。");
        return;
      }
      state.followOnly = !state.followOnly;
      state.menuMode = "home";
      renderList();
      renderViewer();
      renderFollowPanel();
      return;
    }

    if (action === "chat") {
      renderChatPanel();
      return;
    }

    if (action === "more") {
      renderMorePanel();
      return;
    }

    if (action === "setting") {
      renderSettingPanel();
    }
  }

  function bindSideMenu() {
    if (!sideMenu) return;
    sideMenu.addEventListener("click", async function (event) {
      const button = event.target.closest("button[data-action]");
      if (!button) return;
      await handleMenuAction(button.dataset.action);
    });
  }

  async function init() {
    applyCompactMode();
    restorePublishFeedback();
    if (localStorage.getItem("xiaoma_lenny_default_explore") === "1") {
      state.menuMode = "explore";
    }
    bindSideMenu();
    if (retryBtn) {
      retryBtn.addEventListener("click", function () {
        loadArticles();
      });
    }
    bindPublisher();
    bindFilters();
    bindCommentForm();
    await loadViewer();
    await loadArticles();
    if (state.menuMode === "explore") {
      setActiveMenu("explore");
      renderExplorePanel();
    }
  }

  init();
})();
