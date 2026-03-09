(function () {
  const core = window.XiaomaCore;
  if (!core) return;

  const state = {
    context: null,
    user: null,
    displayName: "游客",
    posts: [],
    follows: new Set(),
    reactions: new Map(),
    comments: new Map(),
    menuMode: "home",
    followOnly: false,
    activeDetailPostId: null,
    flashPostId: null,
    flashExpireAt: 0,
    flashRetryCount: 0,
    tableReady: true
  };

  const composer = document.getElementById("mComposer");
  const contentInput = document.getElementById("mContent");
  const mediaInput = document.getElementById("mMedia");
  const counter = document.getElementById("mCounter");
  const statusEl = document.getElementById("mStatus");
  const feedEl = document.getElementById("mFeed");
  const topicsEl = document.getElementById("mTopics");
  const sideMenu = document.getElementById("mSideMenu");
  const sidePanelTitle = document.getElementById("mSidePanelTitle");
  const sidePanelBody = document.getElementById("mSidePanelBody");
  const template = document.getElementById("mPostTemplate");
  const userHint = document.getElementById("userHint");
  const detailModal = document.getElementById("mDetailModal");
  const detailClose = document.getElementById("mDetailClose");
  const detailAuthor = document.getElementById("mDetailAuthor");
  const detailMeta = document.getElementById("mDetailMeta");
  const detailContent = document.getElementById("mDetailContent");
  const detailMedia = document.getElementById("mDetailMedia");
  const detailStats = document.getElementById("mDetailStats");
  const detailComments = document.getElementById("mDetailComments");
  const detailCommentForm = document.getElementById("mDetailCommentForm");
  const detailCommentInput = document.getElementById("mDetailCommentInput");
  const retryBtn = document.getElementById("mRetryBtn");

  const LOAD_TIMEOUT_MS = 8000;
  const DEMO_POSTS = [
    {
      id: "demo-m-1",
      content: "刚把客服知识库接入 RAG，平均响应时间从 14s 降到 4.8s。今天准备优化意图识别。#AI产品 #RAG",
      media_url: "",
      author_id: null,
      author_name: "Lena · 产品经理",
      created_at: "2026-03-05T09:18:00+08:00",
      tags: ["#AI产品", "#RAG", "#效率优化"],
      demo_reaction: { likeCount: 236, repostCount: 41 },
      demo_comments: [
        { id: "demo-m-1-c1", text: "这个提升很实在，能分享下评估指标吗？", author_name: "Jason", created_at: "2026-03-05T09:42:00+08:00" },
        { id: "demo-m-1-c2", text: "建议加上失败兜底策略，线上会更稳。", author_name: "Sora", created_at: "2026-03-05T10:03:00+08:00" }
      ]
    },
    {
      id: "demo-m-2",
      content: "今天把新用户引导改成 1 屏 1 动作后，注册转化提升 19%。下一步做 A/B 看留存。#增长实验 #转化",
      media_url: "",
      author_id: null,
      author_name: "Yuki · 增长",
      created_at: "2026-03-05T11:08:00+08:00",
      tags: ["#增长实验", "#转化", "#A/B测试"],
      demo_reaction: { likeCount: 182, repostCount: 27 },
      demo_comments: [
        { id: "demo-m-2-c1", text: "有对照组细节吗？我也在做类似改版。", author_name: "Mina", created_at: "2026-03-05T11:18:00+08:00" }
      ]
    },
    {
      id: "demo-m-3",
      content: "开源组件库发布 v2.1：首屏加载减少 32%，暗色模式对比度问题修复完毕。#前端工程 #开源",
      media_url: "",
      author_id: null,
      author_name: "Kai · 前端",
      created_at: "2026-03-05T13:32:00+08:00",
      tags: ["#前端工程", "#开源", "#性能"],
      demo_reaction: { likeCount: 320, repostCount: 65 },
      demo_comments: [
        { id: "demo-m-3-c1", text: "v2 动效很克制，视觉节奏舒服。", author_name: "Nora", created_at: "2026-03-05T13:45:00+08:00" }
      ]
    },
    {
      id: "demo-m-4",
      content: "把 CI 改成并行流水线后，主分支发布从 22 分钟降到 9 分钟，团队幸福感+1。#DevOps #工程效率",
      media_url: "",
      author_id: null,
      author_name: "Ethan · 工程效能",
      created_at: "2026-03-05T15:11:00+08:00",
      tags: ["#DevOps", "#工程效率", "#持续交付"],
      demo_reaction: { likeCount: 147, repostCount: 18 },
      demo_comments: []
    },
    {
      id: "demo-m-5",
      content: "把社区内容审核改成“风险分级 + 人工复核”，误杀率从 6.2% 降到 1.4%。#社区治理 #内容安全",
      media_url: "",
      author_id: null,
      author_name: "Iris · 运营",
      created_at: "2026-03-05T17:26:00+08:00",
      tags: ["#社区治理", "#内容安全", "#运营"],
      demo_reaction: { likeCount: 205, repostCount: 32 },
      demo_comments: [
        { id: "demo-m-5-c1", text: "这个策略很适合早期社区。", author_name: "Leo", created_at: "2026-03-05T17:38:00+08:00" }
      ]
    },
    {
      id: "demo-m-6",
      content: "周报：本周新增 1.2k 注册，内容消费时长提升 24%，下一周重点做推荐模型冷启动。#数据周报 #推荐系统",
      media_url: "",
      author_id: null,
      author_name: "Mo · 数据分析",
      created_at: "2026-03-05T20:10:00+08:00",
      tags: ["#数据周报", "#推荐系统", "#产品迭代"],
      demo_reaction: { likeCount: 173, repostCount: 21 },
      demo_comments: []
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

  function setRetryBusy(loading) {
    if (!retryBtn) return;
    retryBtn.disabled = !!loading;
    retryBtn.classList.toggle("is-loading", !!loading);
    if (loading) {
      retryBtn.setAttribute("aria-busy", "true");
    } else {
      retryBtn.removeAttribute("aria-busy");
    }
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
      const raw = localStorage.getItem("xiaoma_flash_m");
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed?.id || !parsed?.at) return;
      if (Date.now() - Number(parsed.at) > 60 * 1000) {
        localStorage.removeItem("xiaoma_flash_m");
        return;
      }

      state.flashPostId = parsed.id;
      state.flashExpireAt = Date.now() + 3000;
      state.flashRetryCount = 0;
      showToast(parsed.message || "发布成功，已回到公开流");
      localStorage.removeItem("xiaoma_flash_m");
    } catch (error) {
      localStorage.removeItem("xiaoma_flash_m");
    }
  }

  function clearFlashLater() {
    if (!state.flashPostId || !state.flashExpireAt) return;
    const wait = state.flashExpireAt - Date.now();
    if (wait <= 0) {
      state.flashPostId = null;
      state.flashExpireAt = 0;
      state.flashRetryCount = 0;
      renderFeed();
      return;
    }

    setTimeout(function () {
      state.flashPostId = null;
      state.flashExpireAt = 0;
      state.flashRetryCount = 0;
      renderFeed();
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
    const enabled = localStorage.getItem("xiaoma_m_compact") === "1";
    document.body.classList.toggle("compact-view", enabled);
  }

  function formatTime(input) {
    if (!input) return "";
    const date = new Date(input);
    return date.toLocaleString("zh-CN", { hour12: false });
  }

  function authorLabel(post) {
    if (post.author_name) return post.author_name;
    if (!post.author_id) return "匿名用户";
    return "用户 " + post.author_id.slice(0, 8);
  }

  function isDemoPostId(postId) {
    return String(postId || "").indexOf("demo-") === 0;
  }

  function getAvatarText(name) {
    const value = String(name || "").trim();
    if (!value) return "匿";
    return value.slice(0, 1).toUpperCase();
  }

  function getPostTags(post) {
    if (Array.isArray(post.tags) && post.tags.length) {
      return post.tags.slice(0, 4);
    }
    const topics = extractTopics(post.content || "");
    if (topics.length) {
      return topics.slice(0, 4).map(function (topic) {
        return "#" + topic;
      });
    }
    return ["#社区动态"];
  }

  function renderFeedSkeleton(count) {
    if (!feedEl) return;
    const total = Math.max(3, Number(count || 6));
    const cards = [];
    for (let index = 0; index < total; index += 1) {
      cards.push(
        "<article class='post skeleton-card'>" +
          "<div class='skeleton-head'>" +
            "<span class='skeleton-avatar'></span>" +
            "<div class='skeleton-meta'>" +
              "<div class='skeleton-line w-40'></div>" +
              "<div class='skeleton-line w-25'></div>" +
            "</div>" +
          "</div>" +
          "<div class='skeleton-line w-95'></div>" +
          "<div class='skeleton-line w-88'></div>" +
          "<div class='skeleton-line w-72'></div>" +
          "<div class='skeleton-actions'>" +
            "<span class='skeleton-chip'></span>" +
            "<span class='skeleton-chip'></span>" +
            "<span class='skeleton-chip'></span>" +
          "</div>" +
        "</article>"
      );
    }
    feedEl.innerHTML = cards.join("");
  }

  function renderFeedFailure(message) {
    if (!feedEl) return;
    feedEl.innerHTML =
      "<article class='post empty-state-card'>" +
        "<strong>加载失败</strong>" +
        "<p class='body-text'>" + (message || "网络暂时不稳定，请点击重试加载。") + "</p>" +
        "<div class='tag-list'><span class='tag'>#可重试</span><span class='tag'>#网络波动</span></div>" +
        "<div class='failure-actions'><button type='button' class='retry-btn inline-retry'>立即重试</button><a class='button button--secondary' href='/'>返回门户</a></div>" +
      "</article>";

    const inlineRetry = feedEl.querySelector(".inline-retry");
    if (inlineRetry) {
      inlineRetry.addEventListener("click", function () {
        loadPosts();
      });
    }
  }

  function applyDemoPosts() {
    state.posts = DEMO_POSTS.map(function (item) {
      return {
        id: item.id,
        content: item.content,
        media_url: item.media_url,
        author_id: item.author_id,
        author_name: item.author_name,
        created_at: item.created_at,
        tags: item.tags || [],
        demo: true
      };
    });

    state.reactions = new Map();
    state.comments = new Map();
    state.posts.forEach(function (post) {
      const source = DEMO_POSTS.find(function (item) {
        return item.id === post.id;
      });
      state.reactions.set(post.id, {
        likeCount: Number(source?.demo_reaction?.likeCount || 0),
        repostCount: Number(source?.demo_reaction?.repostCount || 0),
        userLiked: false,
        userReposted: false
      });
      const comments = (source?.demo_comments || []).map(function (comment) {
        return {
          id: comment.id,
          post_id: post.id,
          text: comment.text,
          author_name: comment.author_name,
          created_at: comment.created_at
        };
      });
      state.comments.set(post.id, comments);
    });
  }

  function getPostById(postId) {
    return state.posts.find(function (post) {
      return post.id === postId;
    });
  }

  function renderCommentRows(container, comments, emptyText, limit) {
    container.innerHTML = "";

    const list = (comments || []).slice(0, typeof limit === "number" ? limit : comments.length);
    if (!list.length) {
      const empty = document.createElement("div");
      empty.className = "comment";
      empty.textContent = emptyText;
      container.appendChild(empty);
      return;
    }

    list.forEach(function (comment) {
      const row = document.createElement("div");
      row.className = "comment";

      const authorEl = document.createElement("b");
      authorEl.textContent = comment.author_name || "匿名用户";
      row.appendChild(authorEl);

      row.appendChild(document.createTextNode("：" + (comment.text || "")));
      row.appendChild(document.createElement("br"));

      const timeEl = document.createElement("small");
      timeEl.textContent = formatTime(comment.created_at);
      row.appendChild(timeEl);

      container.appendChild(row);
    });
  }

  function normalizeUrl(raw) {
    const value = String(raw || "").trim();
    if (!value) return "";
    try {
      const parsed = new URL(value);
      if (!["http:", "https:"].includes(parsed.protocol)) return "";
      return parsed.href;
    } catch (error) {
      return "";
    }
  }

  function isVideoUrl(url) {
    return /\.(mp4|mov|webm|m4v)(\?|$)/i.test(url);
  }

  function extractTopics(text) {
    const source = String(text || "");
    const matched = source.match(/#([a-zA-Z0-9_\u4e00-\u9fa5]{2,24})/g) || [];
    return matched.map((item) => item.slice(1));
  }

  function redirectToLogin(actionText) {
    setStatus("请先登录后再" + actionText, "err");
    const next = window.location.pathname + window.location.search;
    setTimeout(function () {
      window.location.href = "/auth.html?next=" + encodeURIComponent(next);
    }, 600);
  }

  function canWrite(actionText) {
    if (!state.user) {
      redirectToLogin(actionText);
      return false;
    }
    if (!state.tableReady) {
      setStatus("M 模块数据表未初始化，请先执行 SQL 迁移", "err");
      return false;
    }
    return true;
  }

  async function loadViewer() {
    await core.applyNavState();
    state.context = await core.getSessionContext();
    state.user = state.context.session?.user || null;
    if (!state.user) {
      state.displayName = "游客";
      setUserHint("游客模式：可浏览公开动态；发布请先登录并进入个人发布页");
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

  async function loadPosts(options) {
    const opts = options || {};
    const client = state.context?.client || core.localClient;
    setRetryBusy(true);

    if (!opts.silent) {
      setStatus("正在加载公开动态内容与互动信息...", "info");
      renderFeedSkeleton(6);
    }
    setRetryVisible(false);

    let postsRes;
    try {
      postsRes = await withTimeout(
        client
          .from("m_posts")
          .select("id,content,media_url,author_id,author_name,created_at")
          .order("created_at", { ascending: false })
          .limit(80),
        LOAD_TIMEOUT_MS
      );
    } catch (error) {
      state.posts = [];
      state.reactions = new Map();
      state.comments = new Map();
      renderFeedFailure("网络较慢，内容加载超时。你可以立即点击重试。");
      setStatus("加载超时：请点击“重试加载”，或先返回门户稍后再试", "err");
      setRetryVisible(true);
      setRetryBusy(false);
      return;
    }

    if (postsRes.error) {
      state.tableReady = false;
      state.posts = [];
      state.reactions = new Map();
      state.comments = new Map();
      const lower = String(postsRes.error.message || "").toLowerCase();
      if (lower.includes("relation") || lower.includes("does not exist")) {
        setStatus("M 模块数据表未初始化，请先执行 supabase/community_admin_setup.sql", "err");
      } else {
        setStatus("加载动态失败：" + postsRes.error.message, "err");
      }
      renderTopics();
      renderFeedFailure("服务暂时不可用，请稍后重试。");
      if (state.activeDetailPostId) renderDetail();
      setRetryVisible(true);
      setRetryBusy(false);
      return;
    }

    state.tableReady = true;
    state.posts = postsRes.data || [];

    if (!state.posts.length) {
      applyDemoPosts();
      state.flashPostId = null;
      state.flashExpireAt = 0;
      state.flashRetryCount = 0;
      renderTopics();
      renderFeed();
      if (state.activeDetailPostId) renderDetail();
      setStatus("当前暂无真实动态，先为你展示 6 条高质量示例内容", "");
      setRetryBusy(false);
      return;
    }

    let partialDataIssue = false;
    try {
      await withTimeout(loadMetaData(client), LOAD_TIMEOUT_MS);
      await withTimeout(loadFollowMap(client), LOAD_TIMEOUT_MS);
    } catch (error) {
      partialDataIssue = true;
      setRetryVisible(true);
    }

    renderTopics();
    renderFeed();
    if (state.activeDetailPostId) renderDetail();

    if (!state.posts.length) {
      setStatus("公开广场还没有动态，去个人发布页发第一条吧", "");
    } else if (partialDataIssue) {
      setStatus("已加载 " + state.posts.length + " 条动态，部分互动数据较慢，可点击重试补全", "warn");
    } else {
      setStatus("已加载 " + state.posts.length + " 条动态", "ok");
    }

    setRetryBusy(false);

    if (state.flashPostId && !state.posts.some(function (post) { return post.id === state.flashPostId; })) {
      if (state.flashRetryCount < 3) {
        state.flashRetryCount += 1;
        setTimeout(function () {
          loadPosts({ silent: true });
        }, 900);
      } else {
        state.flashPostId = null;
        state.flashExpireAt = 0;
      }
      return;
    }

    clearFlashLater();
  }

  async function loadMetaData(client) {
    state.reactions = new Map();
    state.comments = new Map();

    const ids = state.posts.map((post) => post.id);
    if (!ids.length) return;

    ids.forEach((id) => {
      state.reactions.set(id, { likeCount: 0, repostCount: 0, userLiked: false, userReposted: false });
      state.comments.set(id, []);
    });

    const [reactionRes, commentRes] = await Promise.all([
      client.from("m_reactions").select("post_id,user_id,reaction_type").in("post_id", ids),
      client
        .from("m_comments")
        .select("id,post_id,text,author_id,author_name,created_at")
        .in("post_id", ids)
        .order("created_at", { ascending: false })
        .limit(500)
    ]);

    if (!reactionRes.error) {
      (reactionRes.data || []).forEach((item) => {
        const target = state.reactions.get(item.post_id);
        if (!target) return;
        if (item.reaction_type === "like") target.likeCount += 1;
        if (item.reaction_type === "repost") target.repostCount += 1;
        if (state.user && item.user_id === state.user.id && item.reaction_type === "like") target.userLiked = true;
        if (state.user && item.user_id === state.user.id && item.reaction_type === "repost") target.userReposted = true;
      });
    }

    if (!commentRes.error) {
      (commentRes.data || []).forEach((comment) => {
        if (!state.comments.has(comment.post_id)) return;
        state.comments.get(comment.post_id).push(comment);
      });
    }

    if (reactionRes.error || commentRes.error) {
      const err = reactionRes.error || commentRes.error;
      const lower = String(err.message || "").toLowerCase();
      if (lower.includes("relation") || lower.includes("does not exist")) {
        setStatus("评论或互动表未初始化，当前仅展示动态主体", "err");
      } else {
        setStatus("互动数据加载不完整：" + err.message, "err");
      }
    }
  }

  async function loadFollowMap(client) {
    state.follows = new Set();
    if (!state.user) return;

    const authorIds = [...new Set(state.posts.map(function (post) {
      return post.author_id;
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

  function postScore(post) {
    const reaction = state.reactions.get(post.id) || { likeCount: 0, repostCount: 0 };
    const comments = state.comments.get(post.id) || [];
    return reaction.likeCount * 2 + reaction.repostCount * 3 + comments.length;
  }

  function getDisplayPosts() {
    let list = state.posts.slice();

    if (state.followOnly && state.user) {
      list = list.filter(function (post) {
        if (!post.author_id) return false;
        if (post.author_id === state.user.id) return true;
        return state.follows.has(post.author_id);
      });
    }

    if (state.menuMode === "explore") {
      list.sort(function (first, second) {
        const diff = postScore(second) - postScore(first);
        if (diff !== 0) return diff;
        return new Date(second.created_at).getTime() - new Date(first.created_at).getTime();
      });
    }

    return list;
  }

  function renderTopics() {
    if (!topicsEl) return;
    const countMap = {};
    state.posts.forEach((post) => {
      extractTopics(post.content).forEach((topic) => {
        countMap[topic] = (countMap[topic] || 0) + 1;
      });
    });

    const top = Object.entries(countMap)
      .sort(function (first, second) {
        return second[1] - first[1];
      })
      .slice(0, 10);

    topicsEl.innerHTML = "";

    if (!top.length) {
      const empty = document.createElement("span");
      empty.className = "tag";
      empty.textContent = "#暂无话题";
      topicsEl.appendChild(empty);
      return;
    }

    top.forEach(function (item) {
      const tag = document.createElement("span");
      tag.className = "tag";
      tag.textContent = "#" + item[0] + " · " + item[1];
      topicsEl.appendChild(tag);
    });
  }

  function renderMedia(node, mediaUrl) {
    node.innerHTML = "";
    if (!mediaUrl) {
      node.classList.add("hidden");
      return;
    }

    node.classList.remove("hidden");
    if (isVideoUrl(mediaUrl)) {
      const video = document.createElement("video");
      video.src = mediaUrl;
      video.controls = true;
      video.preload = "metadata";
      node.appendChild(video);
      return;
    }

    const image = document.createElement("img");
    image.src = mediaUrl;
    image.alt = "动态配图";
    node.appendChild(image);
  }

  function closeDetail() {
    if (!detailModal) return;
    state.activeDetailPostId = null;
    detailModal.classList.add("hidden");
    document.body.classList.remove("lock-scroll");
  }

  function renderDetail() {
    if (!detailModal || !state.activeDetailPostId) return;

    const post = getPostById(state.activeDetailPostId);
    if (!post) {
      closeDetail();
      return;
    }

    const reaction = state.reactions.get(post.id) || {
      likeCount: 0,
      repostCount: 0
    };
    const comments = state.comments.get(post.id) || [];

    if (detailAuthor) detailAuthor.textContent = authorLabel(post);

    if (detailMeta) {
      const authorId = post.demo
        ? "示例内容"
        : post.author_id
          ? ("作者ID: " + post.author_id.slice(0, 8) + "...")
          : "作者ID: 未知";
      detailMeta.textContent = formatTime(post.created_at) + " · " + authorId;
    }

    if (detailContent) detailContent.textContent = post.content || "";
    if (detailMedia) renderMedia(detailMedia, post.media_url || "");

    if (detailStats) {
      detailStats.innerHTML = "";
      [
        "点赞 " + Number(reaction.likeCount || 0),
        "转发 " + Number(reaction.repostCount || 0),
        "评论 " + comments.length
      ].forEach(function (text) {
        const chip = document.createElement("span");
        chip.className = "chip";
        chip.textContent = text;
        detailStats.appendChild(chip);
      });
    }

    if (detailComments) {
      renderCommentRows(detailComments, comments, "暂无评论，欢迎来抢沙发。", 200);
    }

    if (detailCommentInput) {
      detailCommentInput.disabled = !state.user;
      detailCommentInput.placeholder = state.user ? "写下你的评论..." : "登录后可参与评论";
    }

    if (detailCommentForm) {
      const submitBtn = detailCommentForm.querySelector("button[type='submit']");
      if (submitBtn) submitBtn.disabled = !state.user;
    }
  }

  function openDetail(postId) {
    if (!detailModal) return;
    state.activeDetailPostId = postId;
    renderDetail();
    detailModal.classList.remove("hidden");
    document.body.classList.add("lock-scroll");
  }

  function refreshViews() {
    renderFeed();
    if (state.activeDetailPostId) renderDetail();
  }

  function renderFeed() {
    if (!feedEl || !template) return;
    feedEl.innerHTML = "";

    const displayPosts = getDisplayPosts();

    if (!displayPosts.length) {
      if (!state.posts.length) {
        feedEl.innerHTML = "<div class='empty'>暂无动态，等你来发布第一条。</div>";
      } else if (state.followOnly) {
        feedEl.innerHTML = "<div class='empty'>你关注的作者暂时没有动态，或先关注更多作者。</div>";
      } else {
        feedEl.innerHTML = "<div class='empty'>当前筛选下暂无动态。</div>";
      }
      return;
    }

    displayPosts.forEach((post) => {
      const card = template.content.firstElementChild.cloneNode(true);
      if (state.flashPostId && post.id === state.flashPostId) {
        card.classList.add("highlight-new");
      }
      const reaction = state.reactions.get(post.id) || {
        likeCount: 0,
        repostCount: 0,
        userLiked: false,
        userReposted: false
      };
      const comments = state.comments.get(post.id) || [];
      const fullText = post.content || "";
      const previewText = fullText.length > 180 ? fullText.slice(0, 180).trim() + "..." : fullText;
      const authorName = authorLabel(post);

      const avatarEl = card.querySelector(".author-avatar");
      if (avatarEl) avatarEl.textContent = getAvatarText(authorName);
      const authorEl = card.querySelector(".author-name");
      if (authorEl) authorEl.textContent = authorName;
      card.querySelector(".meta").textContent = formatTime(post.created_at);
      card.querySelector(".body-text").textContent = previewText;
      renderMedia(card.querySelector(".media-preview"), post.media_url || "");

      const tagWrap = card.querySelector(".post-tags");
      if (tagWrap) {
        tagWrap.innerHTML = "";
        getPostTags(post).forEach(function (tagText) {
          const tagNode = document.createElement("span");
          tagNode.className = "tag";
          tagNode.textContent = tagText;
          tagWrap.appendChild(tagNode);
        });
      }

      const statsEl = card.querySelector(".card-stats");
      if (statsEl) {
        statsEl.textContent =
          "👍 " + Number(reaction.likeCount || 0) +
          " · 🔁 " + Number(reaction.repostCount || 0) +
          " · 💬 " + comments.length +
          (post.demo ? " · 示例" : "");
      }

      const likeBtn = card.querySelector(".like-btn");
      const repostBtn = card.querySelector(".repost-btn");
      const commentBtn = card.querySelector(".comment-btn");
      const viewBtn = card.querySelector(".view-btn");
      const actionMore = card.querySelector(".action-more");
      const followBtn = card.querySelector(".follow-btn");
      const commentWrap = card.querySelector(".comment-wrap");
      const commentList = card.querySelector(".comment-list");
      const commentForm = card.querySelector(".comment-form");
      const commentInput = commentForm.querySelector("input");

      function closeActionMore() {
        if (actionMore) actionMore.removeAttribute("open");
      }

      likeBtn.querySelector("span").textContent = String(reaction.likeCount);
      repostBtn.querySelector("span").textContent = String(reaction.repostCount);
      commentBtn.querySelector("span").textContent = String(comments.length);
      likeBtn.classList.toggle("on", !!reaction.userLiked);
      repostBtn.classList.toggle("on", !!reaction.userReposted);

      if (followBtn) {
        if (!post.author_id) {
          followBtn.disabled = true;
          followBtn.textContent = "作者未知";
        } else if (state.user && post.author_id === state.user.id) {
          followBtn.disabled = true;
          followBtn.textContent = "我自己";
        } else {
          const followed = state.follows.has(post.author_id);
          followBtn.classList.toggle("on", followed);
          followBtn.textContent = followed ? "✓ 已关注" : "+ 关注";
          followBtn.addEventListener("click", async function () {
            await toggleFollow(post.author_id, authorLabel(post));
          });
        }
      }

      renderCommentRows(commentList, comments, "还没有评论，来抢沙发吧。", 8);

      if (viewBtn) {
        viewBtn.textContent = fullText.length > 180 ? "查看全部" : "查看详情";
        viewBtn.addEventListener("click", function () {
          closeActionMore();
          openDetail(post.id);
        });
      }

      likeBtn.addEventListener("click", async function () {
        closeActionMore();
        await toggleReaction(post.id, "like");
      });

      repostBtn.addEventListener("click", async function () {
        closeActionMore();
        await toggleReaction(post.id, "repost");
      });

      commentBtn.addEventListener("click", function () {
        closeActionMore();
        commentWrap.classList.toggle("hidden");
        if (!commentWrap.classList.contains("hidden")) commentInput.focus();
      });

      commentForm.addEventListener("submit", async function (event) {
        event.preventDefault();
        const ok = await submitComment(post.id, commentInput.value);
        if (ok) commentInput.value = "";
      });

      feedEl.appendChild(card);
    });
  }

  async function toggleReaction(postId, reactionType) {
    if (!canWrite(reactionType === "like" ? "点赞" : "转发")) return;
    if (isDemoPostId(postId)) {
      setStatus("示例内容仅供浏览，登录后发布真实内容即可参与互动", "");
      return;
    }

    const client = state.context.client;
    const reaction = state.reactions.get(postId) || {
      likeCount: 0,
      repostCount: 0,
      userLiked: false,
      userReposted: false
    };

    const countKey = reactionType === "like" ? "likeCount" : "repostCount";
    const flagKey = reactionType === "like" ? "userLiked" : "userReposted";
    const existed = !!reaction[flagKey];

    reaction[flagKey] = !existed;
    reaction[countKey] = Math.max(0, Number(reaction[countKey] || 0) + (existed ? -1 : 1));
    state.reactions.set(postId, reaction);
    refreshViews();

    if (existed) {
      const removeRes = await client
        .from("m_reactions")
        .delete()
        .eq("post_id", postId)
        .eq("user_id", state.user.id)
        .eq("reaction_type", reactionType);

      if (removeRes.error) {
        reaction[flagKey] = true;
        reaction[countKey] = Math.max(0, Number(reaction[countKey] || 0) + 1);
        state.reactions.set(postId, reaction);
        refreshViews();
        setStatus("取消互动失败：" + removeRes.error.message, "err");
        return;
      }
    } else {
      const addRes = await client.from("m_reactions").insert({
        post_id: postId,
        user_id: state.user.id,
        reaction_type: reactionType
      });

      if (addRes.error) {
        const msg = String(addRes.error.message || "").toLowerCase();
        if (!(addRes.error.code === "23505" || msg.includes("duplicate"))) {
          reaction[flagKey] = false;
          reaction[countKey] = Math.max(0, Number(reaction[countKey] || 0) - 1);
          state.reactions.set(postId, reaction);
          refreshViews();
          setStatus("互动失败：" + addRes.error.message, "err");
          return;
        }
      }
    }
  }

  async function toggleFollow(followeeId, followeeName) {
    if (!canWrite("关注作者")) return;
    if (!followeeId || followeeId === state.user.id) return;

    const client = state.context.client;
    const followed = state.follows.has(followeeId);

    if (followed) {
      state.follows.delete(followeeId);
      setStatus("已取消关注 " + (followeeName || "该作者"), "ok");
      refreshViews();

      const removeRes = await client
        .from("follows")
        .delete()
        .eq("follower_id", state.user.id)
        .eq("followee_id", followeeId);

      if (removeRes.error) {
        state.follows.add(followeeId);
        refreshViews();
        setStatus("取消关注失败：" + removeRes.error.message, "err");
        return;
      }

      return;
    }

    state.follows.add(followeeId);
    setStatus("已关注 " + (followeeName || "该作者"), "ok");
    refreshViews();

    const insertRes = await client.from("follows").insert({
      follower_id: state.user.id,
      followee_id: followeeId
    });

    if (insertRes.error) {
      const msg = String(insertRes.error.message || "").toLowerCase();
      if (!(insertRes.error.code === "23505" || msg.includes("duplicate"))) {
        state.follows.delete(followeeId);
        refreshViews();
        setStatus("关注失败：" + insertRes.error.message, "err");
        return;
      }
    }

    await client.from("notifications").insert({
      user_id: followeeId,
      text: (state.displayName || "有用户") + " 关注了你"
    });
  }

  async function submitComment(postId, rawText) {
    if (!canWrite("评论")) return false;
    if (isDemoPostId(postId)) {
      setStatus("示例内容仅供浏览，发布真实动态后可评论互动", "");
      return false;
    }
    const text = String(rawText || "").trim();
    if (!text) {
      setStatus("评论内容不能为空", "err");
      return false;
    }

    const insertRes = await state.context.client
      .from("m_comments")
      .insert({
        post_id: postId,
        text: text,
        author_id: state.user.id,
        author_name: state.displayName
      })
      .select("id,post_id,text,author_id,author_name,created_at")
      .single();

    if (insertRes.error) {
      setStatus("评论失败：" + insertRes.error.message, "err");
      return false;
    }

    const created = insertRes.data || {
      id: "local-" + Date.now(),
      post_id: postId,
      text: text,
      author_id: state.user.id,
      author_name: state.displayName,
      created_at: new Date().toISOString()
    };
    const list = state.comments.get(postId) || [];
    list.unshift(created);
    state.comments.set(postId, list);

    setStatus("评论成功", "ok");
    refreshViews();
    return true;
  }

  function bindComposer() {
    if (!composer || !contentInput || !counter) return;

    contentInput.addEventListener("input", function () {
      counter.textContent = contentInput.value.length + " / 280";
    });

    composer.addEventListener("submit", async function (event) {
      event.preventDefault();
      if (!canWrite("发布动态")) return;

      const submitBtn = composer.querySelector("button[type='submit']");
      const content = String(contentInput.value || "").trim();
      const mediaUrl = normalizeUrl(mediaInput?.value);

      if (!content) {
        setStatus("请输入动态内容", "err");
        return;
      }
      if (mediaInput && mediaInput.value.trim() && !mediaUrl) {
        setStatus("图片链接格式不正确，请填写完整 URL", "err");
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = "发布中...";

      const insertRes = await state.context.client.from("m_posts").insert({
        content: content,
        media_url: mediaUrl || null,
        author_id: state.user.id,
        author_name: state.displayName
      });

      submitBtn.disabled = false;
      submitBtn.textContent = "发布动态";

      if (insertRes.error) {
        setStatus("发布失败：" + insertRes.error.message, "err");
        return;
      }

      contentInput.value = "";
      if (mediaInput) mediaInput.value = "";
      counter.textContent = "0 / 280";
      setStatus("发布成功", "ok");
      await loadPosts();
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
      const posts = getDisplayPosts().slice(0, 5);
      if (!posts.length) {
        root.textContent = "暂无可探索内容。";
        return;
      }

      posts.forEach(function (post) {
        const row = document.createElement("div");
        row.className = "side-item";
        row.textContent = authorLabel(post) + " · 热度 " + postScore(post);
        root.appendChild(row);
      });
    });
  }

  async function renderNotificationsPanel() {
    if (!state.user) {
      setSideText("Notifications", "请先登录后查看通知。登录后这里会显示被关注、互动等消息。");
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
        root.textContent = "登录后可关注作者并开启“仅看关注”过滤。";
        return;
      }

      const status = document.createElement("div");
      status.className = "side-item";
      status.textContent =
        "已关注作者：" + state.follows.size + " 人；当前过滤：" + (state.followOnly ? "仅看关注" : "全部内容");
      root.appendChild(status);

      const tip = document.createElement("small");
      tip.textContent = "在动态卡片点击“+ 关注”可管理关注关系。";
      root.appendChild(tip);
    });
  }

  function renderChatPanel() {
    const chatKey = "xiaoma_chat_m_v1";
    let rows = [];
    try {
      rows = JSON.parse(localStorage.getItem(chatKey) || "[]");
      if (!Array.isArray(rows)) rows = [];
    } catch (error) {
      rows = [];
    }

    setSidePanel("Chat", function (root) {
      const list = document.createElement("div");
      list.className = "side-panel-body";

      rows.slice(-6).forEach(function (row) {
        const item = document.createElement("div");
        item.className = "side-item";
        item.textContent = (row.name || "用户") + "：" + (row.text || "");
        list.appendChild(item);
      });

      root.appendChild(list);

      const form = document.createElement("form");
      form.className = "side-form";

      const input = document.createElement("input");
      input.maxLength = 120;
      input.placeholder = "发送一条社区留言";

      const submit = document.createElement("button");
      submit.type = "submit";
      submit.textContent = "发送";

      form.appendChild(input);
      form.appendChild(submit);

      form.addEventListener("submit", function (event) {
        event.preventDefault();
        const text = String(input.value || "").trim();
        if (!text) return;

        rows.push({
          name: state.displayName || "游客",
          text: text,
          time: new Date().toISOString()
        });
        rows = rows.slice(-30);
        localStorage.setItem(chatKey, JSON.stringify(rows));
        renderChatPanel();
      });

      root.appendChild(form);
    });
  }

  function renderMorePanel() {
    setSidePanel("More", function (root) {
      const linkWrap = document.createElement("div");
      linkWrap.className = "side-links";

      [
        { href: "/m-publish.html", label: "前往 M 个人发布页" },
        { href: "/", label: "返回社区入口" },
        { href: "/profile.html", label: "打开个人中心" },
        { href: "/mi.html", label: "切换到 Mi" },
        { href: "/lenny.html", label: "切换到 Lenny" }
      ].forEach(function (item) {
        const link = document.createElement("a");
        link.href = item.href;
        link.textContent = item.label;
        linkWrap.appendChild(link);
      });

      root.appendChild(linkWrap);
    });
  }

  function renderSettingPanel() {
    setSidePanel("Setting", function (root) {
      const compactForm = document.createElement("form");
      compactForm.className = "side-form";

      const compactSelect = document.createElement("select");
      const compactEnabled = localStorage.getItem("xiaoma_m_compact") === "1";
      compactSelect.innerHTML = "<option value='0'>标准布局</option><option value='1'>紧凑布局</option>";
      compactSelect.value = compactEnabled ? "1" : "0";

      const compactSave = document.createElement("button");
      compactSave.type = "submit";
      compactSave.textContent = "应用";

      compactForm.appendChild(compactSelect);
      compactForm.appendChild(compactSave);
      compactForm.addEventListener("submit", function (event) {
        event.preventDefault();
        localStorage.setItem("xiaoma_m_compact", compactSelect.value === "1" ? "1" : "0");
        applyCompactMode();
      });

      const exploreForm = document.createElement("form");
      exploreForm.className = "side-form";

      const exploreSelect = document.createElement("select");
      const defaultExplore = localStorage.getItem("xiaoma_m_default_explore") === "1";
      exploreSelect.innerHTML = "<option value='0'>默认 Home</option><option value='1'>默认 Explore</option>";
      exploreSelect.value = defaultExplore ? "1" : "0";

      const exploreSave = document.createElement("button");
      exploreSave.type = "submit";
      exploreSave.textContent = "保存";

      exploreForm.appendChild(exploreSelect);
      exploreForm.appendChild(exploreSave);
      exploreForm.addEventListener("submit", function (event) {
        event.preventDefault();
        localStorage.setItem("xiaoma_m_default_explore", exploreSelect.value === "1" ? "1" : "0");
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
      renderFeed();
      setSideText("Home", "这是公开时间线，向下滚动可查看所有用户动态。");
      return;
    }

    if (action === "explore") {
      state.menuMode = "explore";
      state.followOnly = false;
      renderFeed();
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
      renderFeed();
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

  function bindDetailModal() {
    if (!detailModal) return;

    if (detailClose) {
      detailClose.addEventListener("click", function () {
        closeDetail();
      });
    }

    detailModal.addEventListener("click", function (event) {
      if (event.target?.dataset?.close === "1") {
        closeDetail();
      }
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && !detailModal.classList.contains("hidden")) {
        closeDetail();
      }
    });

    if (detailCommentForm && detailCommentInput) {
      detailCommentForm.addEventListener("submit", async function (event) {
        event.preventDefault();
        if (!state.activeDetailPostId) return;

        const text = detailCommentInput.value;
        const ok = await submitComment(state.activeDetailPostId, text);
        if (ok) detailCommentInput.value = "";
      });
    }
  }

  async function init() {
    applyCompactMode();
    restorePublishFeedback();
    if (localStorage.getItem("xiaoma_m_default_explore") === "1") {
      state.menuMode = "explore";
    }
    bindSideMenu();
    bindDetailModal();
    if (retryBtn) {
      retryBtn.addEventListener("click", function () {
        setRetryBusy(true);
        loadPosts();
      });
    }
    const quickTopBtn = document.querySelector(".quick-top-btn");
    if (quickTopBtn) {
      quickTopBtn.addEventListener("click", function (event) {
        event.preventDefault();
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    }
    bindComposer();
    await loadViewer();
    await loadPosts();
    if (state.menuMode === "explore") {
      setActiveMenu("explore");
      renderExplorePanel();
    }
  }

  init();
})();
