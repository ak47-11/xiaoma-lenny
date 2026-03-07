(function () {
  const core = window.XiaomaCore;
  if (!core) return;

  const state = {
    context: null,
    user: null,
    displayName: "游客",
    videos: [],
    follows: new Set(),
    actionSet: new Set(),
    countsMap: new Map(),
    commentsMap: new Map(),
    currentVideoId: null,
    playedSet: new Set(),
    menuMode: "home",
    followOnly: false,
    flashVideoId: null,
    flashExpireAt: 0,
    flashRetryCount: 0,
    tableReady: true
  };

  const uploader = document.getElementById("miUploader");
  const statusEl = document.getElementById("miStatus");
  const gridEl = document.getElementById("miGrid");
  const template = document.getElementById("miVideoTemplate");
  const tagsEl = document.getElementById("miTags");
  const userHint = document.getElementById("userHint");
  const sideMenu = document.getElementById("miSideMenu");
  const sidePanelTitle = document.getElementById("miSidePanelTitle");
  const sidePanelBody = document.getElementById("miSidePanelBody");
  const retryBtn = document.getElementById("miRetryBtn");

  const playerTitle = document.getElementById("miPlayerTitle");
  const playerShell = document.getElementById("miPlayerShell");
  const playerMeta = document.getElementById("miPlayerMeta");
  const playerStats = document.getElementById("miPlayerStats");

  const commentForm = document.getElementById("miCommentForm");
  const commentInput = document.getElementById("miCommentInput");
  const commentList = document.getElementById("miCommentList");

  const LOAD_TIMEOUT_MS = 8000;
  const DEMO_VIDEOS = [
    {
      id: "demo-mi-1",
      title: "3 分钟看懂 RAG 工作流",
      summary: "从检索、重排到生成结果的全流程演示，适合产品和工程同学快速建立共同语言。",
      video_url: "https://www.youtube.com/watch?v=aircAruvnKk",
      cover_url: "",
      category: "技术教程",
      duration_text: "03:28",
      tags: ["RAG", "LLM", "检索增强"],
      author_id: null,
      author_name: "Mira · AI 教学",
      created_at: "2026-03-05T09:10:00+08:00",
      demo_counts: { likeCount: 326, favoriteCount: 188, playCount: 4120 },
      demo_comments: [
        { id: "demo-mi-1-c1", text: "这个讲解很清楚，收藏了。", author_name: "Rex", created_at: "2026-03-05T09:32:00+08:00" }
      ]
    },
    {
      id: "demo-mi-2",
      title: "从 0 到 1 搭建社区运营看板",
      summary: "实战演示指标定义、事件埋点和看板拆分，适合运营和增长团队。",
      video_url: "https://www.youtube.com/watch?v=2ePf9rue1Ao",
      cover_url: "",
      category: "实战复盘",
      duration_text: "08:14",
      tags: ["运营", "数据看板", "增长"],
      author_id: null,
      author_name: "Noah · 增长",
      created_at: "2026-03-05T10:25:00+08:00",
      demo_counts: { likeCount: 244, favoriteCount: 121, playCount: 2986 },
      demo_comments: []
    },
    {
      id: "demo-mi-3",
      title: "前端性能优化 Checklist（2026）",
      summary: "覆盖首屏渲染、资源加载、交互响应和监控告警，附落地优先级建议。",
      video_url: "https://www.youtube.com/watch?v=3QhU9jd03a0",
      cover_url: "",
      category: "技术教程",
      duration_text: "06:42",
      tags: ["前端性能", "Web Vitals", "工程化"],
      author_id: null,
      author_name: "Ivy · 前端",
      created_at: "2026-03-05T12:02:00+08:00",
      demo_counts: { likeCount: 418, favoriteCount: 236, playCount: 5520 },
      demo_comments: [
        { id: "demo-mi-3-c1", text: "请问这套清单有公开模板吗？", author_name: "Aiden", created_at: "2026-03-05T12:20:00+08:00" }
      ]
    },
    {
      id: "demo-mi-4",
      title: "设计系统改版复盘：少颜色策略",
      summary: "展示如何用主色 + 强调色 + 灰阶完成多模块统一，并保持可读性。",
      video_url: "https://www.youtube.com/watch?v=9No-FiEInLA",
      cover_url: "",
      category: "综合推荐",
      duration_text: "05:17",
      tags: ["设计系统", "视觉统一", "UI"],
      author_id: null,
      author_name: "Luna · 设计",
      created_at: "2026-03-05T14:40:00+08:00",
      demo_counts: { likeCount: 271, favoriteCount: 164, playCount: 3368 },
      demo_comments: []
    },
    {
      id: "demo-mi-5",
      title: "一小时搭建 Supabase 社区后端",
      summary: "从表结构、RLS 到前端接入的最短路径，适合中小团队快速验证想法。",
      video_url: "https://www.youtube.com/watch?v=3sQJrY6y4kY",
      cover_url: "",
      category: "开源项目",
      duration_text: "11:09",
      tags: ["Supabase", "后端", "快速验证"],
      author_id: null,
      author_name: "Kite · 全栈",
      created_at: "2026-03-05T16:08:00+08:00",
      demo_counts: { likeCount: 389, favoriteCount: 221, playCount: 6021 },
      demo_comments: [
        { id: "demo-mi-5-c1", text: "这个对独立开发者太友好了。", author_name: "Ryan", created_at: "2026-03-05T16:31:00+08:00" }
      ]
    },
    {
      id: "demo-mi-6",
      title: "产品发布会：社区 2026 路线图",
      summary: "公开分享互动体系、推荐策略和创作者激励计划。",
      video_url: "https://www.youtube.com/watch?v=5MgBikgcWnY",
      cover_url: "",
      category: "综合推荐",
      duration_text: "09:36",
      tags: ["路线图", "社区产品", "创作者"],
      author_id: null,
      author_name: "Ari · 社区团队",
      created_at: "2026-03-05T19:22:00+08:00",
      demo_counts: { likeCount: 452, favoriteCount: 274, playCount: 6890 },
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
      const raw = localStorage.getItem("xiaoma_flash_mi");
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed?.id || !parsed?.at) return;
      if (Date.now() - Number(parsed.at) > 60 * 1000) {
        localStorage.removeItem("xiaoma_flash_mi");
        return;
      }

      state.flashVideoId = parsed.id;
      state.flashExpireAt = Date.now() + 3000;
      state.flashRetryCount = 0;
      showToast(parsed.message || "发布成功，已回到公开流");
      localStorage.removeItem("xiaoma_flash_mi");
    } catch (error) {
      localStorage.removeItem("xiaoma_flash_mi");
    }
  }

  function clearFlashLater() {
    if (!state.flashVideoId || !state.flashExpireAt) return;
    const wait = state.flashExpireAt - Date.now();
    if (wait <= 0) {
      state.flashVideoId = null;
      state.flashExpireAt = 0;
      state.flashRetryCount = 0;
      renderGrid();
      return;
    }

    setTimeout(function () {
      state.flashVideoId = null;
      state.flashExpireAt = 0;
      state.flashRetryCount = 0;
      renderGrid();
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
    const enabled = localStorage.getItem("xiaoma_mi_compact") === "1";
    document.body.classList.toggle("compact-view", enabled);
  }

  function formatTime(input) {
    if (!input) return "";
    return new Date(input).toLocaleString("zh-CN", { hour12: false });
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

  function parseTags(raw) {
    const source = String(raw || "").trim();
    if (!source) return [];
    const picked = source
      .split(/[，,\s]+/)
      .map(function (item) {
        return item.trim();
      })
      .filter(function (item) {
        return item && item.length <= 24;
      });

    return [...new Set(picked)].slice(0, 8);
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
      setStatus("Mi 模块数据表未初始化，请先执行 SQL 迁移", "err");
      return false;
    }
    return true;
  }

  function getVideoById(videoId) {
    return state.videos.find(function (video) {
      return video.id === videoId;
    });
  }

  function getCounts(videoId) {
    return state.countsMap.get(videoId) || { likeCount: 0, favoriteCount: 0, playCount: 0 };
  }

  function isDemoVideoId(videoId) {
    return String(videoId || "").indexOf("demo-") === 0;
  }

  function getAvatarText(name) {
    const value = String(name || "").trim();
    if (!value) return "匿";
    return value.slice(0, 1).toUpperCase();
  }

  function renderGridSkeleton(count) {
    if (!gridEl) return;
    const total = Math.max(3, Number(count || 6));
    const cards = [];
    for (let index = 0; index < total; index += 1) {
      cards.push(
        "<article class='video-card skeleton-card'>" +
          "<div class='skeleton-media'></div>" +
          "<div class='skeleton-head'>" +
            "<span class='skeleton-avatar'></span>" +
            "<div class='skeleton-meta'>" +
              "<div class='skeleton-line w-42'></div>" +
              "<div class='skeleton-line w-25'></div>" +
            "</div>" +
          "</div>" +
          "<div class='skeleton-line w-90'></div>" +
          "<div class='skeleton-line w-68'></div>" +
          "<div class='skeleton-actions'>" +
            "<span class='skeleton-chip'></span>" +
            "<span class='skeleton-chip'></span>" +
            "<span class='skeleton-chip'></span>" +
          "</div>" +
        "</article>"
      );
    }
    gridEl.innerHTML = cards.join("");
  }

  function renderGridFailure(message) {
    if (!gridEl) return;
    gridEl.innerHTML =
      "<article class='video-card empty-state-card'>" +
        "<strong>加载失败</strong>" +
        "<p class='body-text'>" + (message || "网络暂时不稳定，请点击重试加载。") + "</p>" +
        "<div class='tag-list'><span class='tag'>#可重试</span><span class='tag'>#稍后再试</span></div>" +
        "<div class='failure-actions'><button type='button' class='retry-btn inline-retry'>立即重试</button><a class='button button--secondary' href='/'>返回门户</a></div>" +
      "</article>";

    const inlineRetry = gridEl.querySelector(".inline-retry");
    if (inlineRetry) {
      inlineRetry.addEventListener("click", function () {
        loadVideos();
      });
    }
  }

  function applyDemoVideos() {
    state.videos = DEMO_VIDEOS.map(function (item) {
      return {
        id: item.id,
        title: item.title,
        summary: item.summary,
        video_url: item.video_url,
        cover_url: item.cover_url,
        category: item.category,
        duration_text: item.duration_text,
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
    state.playedSet = new Set();

    state.videos.forEach(function (video) {
      const source = DEMO_VIDEOS.find(function (item) {
        return item.id === video.id;
      });
      state.countsMap.set(video.id, {
        likeCount: Number(source?.demo_counts?.likeCount || 0),
        favoriteCount: Number(source?.demo_counts?.favoriteCount || 0),
        playCount: Number(source?.demo_counts?.playCount || 0)
      });

      const comments = (source?.demo_comments || []).map(function (comment) {
        return {
          id: comment.id,
          video_id: video.id,
          text: comment.text,
          author_name: comment.author_name,
          created_at: comment.created_at
        };
      });
      state.commentsMap.set(video.id, comments);
    });
  }

  async function loadViewer() {
    await core.applyNavState();
    state.context = await core.getSessionContext();
    state.user = state.context.session?.user || null;

    if (!state.user) {
      state.displayName = "游客";
      setUserHint("游客模式：可看视频；点赞/收藏/评论需登录，发布请先登录后前往个人发布页");
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

  async function loadVideos(options) {
    const opts = options || {};
    const client = state.context?.client || core.localClient;
    setRetryBusy(true);

    if (!opts.silent) {
      setStatus("正在加载公开视频与互动信息...", "info");
      renderGridSkeleton(6);
    }
    setRetryVisible(false);

    let result;
    try {
      result = await withTimeout(
        client
          .from("mi_videos")
          .select("id,title,summary,video_url,cover_url,category,duration_text,tags,play_count,like_count,favorite_count,author_id,author_name,created_at")
          .order("created_at", { ascending: false })
          .limit(100),
        LOAD_TIMEOUT_MS
      );
    } catch (error) {
      state.videos = [];
      state.actionSet = new Set();
      state.countsMap = new Map();
      state.commentsMap = new Map();
      renderTags();
      renderGridFailure("网络较慢，视频流加载超时。你可以立即点击重试。");
      renderPlayer();
      setStatus("加载超时：请点击“重试加载”，或先返回门户稍后再试", "err");
      setRetryVisible(true);
      setRetryBusy(false);
      return;
    }

    if (result.error) {
      state.tableReady = false;
      state.videos = [];
      state.actionSet = new Set();
      state.countsMap = new Map();
      state.commentsMap = new Map();
      const lower = String(result.error.message || "").toLowerCase();
      if (lower.includes("relation") || lower.includes("does not exist")) {
        setStatus("Mi 模块数据表未初始化，请先执行 supabase/community_admin_setup.sql", "err");
      } else {
        setStatus("加载视频失败：" + result.error.message, "err");
      }
      renderTags();
      renderGridFailure("服务暂时不可用，请稍后重试。");
      renderPlayer();
      setRetryVisible(true);
      setRetryBusy(false);
      return;
    }

    state.tableReady = true;
    state.videos = result.data || [];

    if (!state.videos.length) {
      applyDemoVideos();
      state.currentVideoId = state.videos[0]?.id || null;
      state.flashVideoId = null;
      state.flashExpireAt = 0;
      state.flashRetryCount = 0;
      renderTags();
      renderGrid();
      renderPlayer();
      setStatus("当前暂无真实视频，先为你展示 6 条高质量示例内容", "");
      setRetryBusy(false);
      return;
    }

    if (!state.currentVideoId || !getVideoById(state.currentVideoId)) {
      state.currentVideoId = state.videos[0]?.id || null;
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
    renderGrid();
    renderPlayer();

    if (!state.videos.length) {
      setStatus("公开社区还没有视频，去个人发布页上传第一条吧", "");
    } else if (partialDataIssue) {
      setStatus("已加载 " + state.videos.length + " 条视频，部分互动数据较慢，可点击重试补全", "warn");
    } else {
      setStatus("已加载 " + state.videos.length + " 条视频", "ok");
    }

    setRetryBusy(false);

    if (state.flashVideoId && !state.videos.some(function (video) { return video.id === state.flashVideoId; })) {
      if (state.flashRetryCount < 3) {
        state.flashRetryCount += 1;
        setTimeout(function () {
          loadVideos({ silent: true });
        }, 900);
      } else {
        state.flashVideoId = null;
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

    const ids = state.videos.map(function (video) {
      return video.id;
    });
    if (!ids.length) return;

    ids.forEach(function (id) {
      state.countsMap.set(id, { likeCount: 0, favoriteCount: 0, playCount: 0 });
      state.commentsMap.set(id, []);
    });

    const [actionsRes, commentsRes, viewsRes] = await Promise.all([
      client.from("mi_video_actions").select("video_id,user_id,action_type").in("video_id", ids),
      client
        .from("mi_video_comments")
        .select("id,video_id,text,author_id,author_name,created_at")
        .in("video_id", ids)
        .order("created_at", { ascending: false })
        .limit(600),
      client.from("mi_video_views").select("video_id,viewer_id").in("video_id", ids)
    ]);

    if (!actionsRes.error) {
      (actionsRes.data || []).forEach(function (row) {
        const counter = state.countsMap.get(row.video_id);
        if (!counter) return;

        if (row.action_type === "like") counter.likeCount += 1;
        if (row.action_type === "favorite") counter.favoriteCount += 1;

        if (state.user && row.user_id === state.user.id) {
          state.actionSet.add(row.video_id + ":" + row.action_type);
        }
      });
    }

    if (!viewsRes.error) {
      (viewsRes.data || []).forEach(function (row) {
        const counter = state.countsMap.get(row.video_id);
        if (!counter) return;
        counter.playCount += 1;
      });
    }

    if (!commentsRes.error) {
      (commentsRes.data || []).forEach(function (row) {
        if (!state.commentsMap.has(row.video_id)) return;
        state.commentsMap.get(row.video_id).push(row);
      });
    }

    if (actionsRes.error || commentsRes.error || viewsRes.error) {
      const err = actionsRes.error || commentsRes.error || viewsRes.error;
      setStatus("互动数据加载不完整：" + err.message, "err");
    }
  }

  async function loadFollowMap(client) {
    state.follows = new Set();
    if (!state.user) return;

    const authorIds = [...new Set(state.videos.map(function (video) {
      return video.author_id;
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

  function videoScore(video) {
    const counts = getCounts(video.id);
    const comments = state.commentsMap.get(video.id) || [];
    return Number(counts.likeCount || 0) * 2 + Number(counts.favoriteCount || 0) * 3 + Number(counts.playCount || 0) + comments.length;
  }

  function getDisplayVideos() {
    let list = state.videos.slice();

    if (state.followOnly && state.user) {
      list = list.filter(function (video) {
        if (!video.author_id) return false;
        if (video.author_id === state.user.id) return true;
        return state.follows.has(video.author_id);
      });
    }

    if (state.menuMode === "explore") {
      list.sort(function (first, second) {
        const diff = videoScore(second) - videoScore(first);
        if (diff !== 0) return diff;
        return new Date(second.created_at).getTime() - new Date(first.created_at).getTime();
      });
    }

    return list;
  }

  function renderTags() {
    if (!tagsEl) return;
    const map = {};
    state.videos.forEach(function (video) {
      (video.tags || []).forEach(function (tag) {
        map[tag] = (map[tag] || 0) + 1;
      });
    });

    const top = Object.entries(map)
      .sort(function (first, second) {
        return second[1] - first[1];
      })
      .slice(0, 10);

    tagsEl.innerHTML = "";
    if (!top.length) {
      const placeholder = document.createElement("span");
      placeholder.className = "tag";
      placeholder.textContent = "暂无标签";
      tagsEl.appendChild(placeholder);
      return;
    }

    top.forEach(function (item) {
      const row = document.createElement("span");
      row.className = "tag";
      row.textContent = "#" + item[0] + " · " + item[1];
      tagsEl.appendChild(row);
    });
  }

  function renderCover(container, video) {
    container.innerHTML = "";
    const coverUrl = normalizeUrl(video.cover_url);
    if (!coverUrl) {
      const fallback = document.createElement("div");
      fallback.className = "empty";
      fallback.textContent = "暂无封面";
      container.appendChild(fallback);
      return;
    }

    const image = document.createElement("img");
    image.src = coverUrl;
    image.alt = video.title || "视频封面";
    container.appendChild(image);
  }

  function renderGrid() {
    if (!gridEl || !template) return;
    gridEl.innerHTML = "";

    const displayVideos = getDisplayVideos();
    if (!displayVideos.length) {
      if (!state.videos.length) {
        gridEl.innerHTML = "<div class='empty'>暂无视频，快来发布第一条。</div>";
      } else if (state.followOnly) {
        gridEl.innerHTML = "<div class='empty'>关注作者暂未更新视频，或先关注更多创作者。</div>";
      } else {
        gridEl.innerHTML = "<div class='empty'>当前筛选下暂无视频。</div>";
      }
      return;
    }

    if (!displayVideos.some(function (video) { return video.id === state.currentVideoId; })) {
      state.currentVideoId = displayVideos[0]?.id || null;
    }

    displayVideos.forEach(function (video) {
      const card = template.content.firstElementChild.cloneNode(true);
      if (state.flashVideoId && video.id === state.flashVideoId) {
        card.classList.add("highlight-new");
      }
      card.classList.toggle("active", state.currentVideoId === video.id);
      const counts = getCounts(video.id);
      const comments = state.commentsMap.get(video.id) || [];
      const authorName = video.author_name || "匿名创作者";

      const coverNode = card.querySelector(".video-cover");
      if (coverNode) renderCover(coverNode, video);

      const avatarEl = card.querySelector(".author-avatar");
      if (avatarEl) avatarEl.textContent = getAvatarText(authorName);
      const authorEl = card.querySelector(".author-name");
      if (authorEl) authorEl.textContent = authorName;

      card.querySelector(".title").textContent = video.title || "未命名视频";
      const categoryNode = card.querySelector(".category");
      if (categoryNode) categoryNode.textContent = video.category || "综合推荐";
      card.querySelector(".summary").textContent = video.summary || "作者暂未填写简介";
      card.querySelector(".meta").textContent = formatTime(video.created_at);

      const tagWrap = card.querySelector(".tag-list");
      if (tagWrap) {
        tagWrap.innerHTML = "";
        const tags = (video.tags && video.tags.length ? video.tags : [video.category || "综合推荐"]).slice(0, 4);
        tags.forEach(function (tag) {
          const tagNode = document.createElement("span");
          tagNode.className = "tag";
          tagNode.textContent = tag;
          tagWrap.appendChild(tagNode);
        });
      }

      const statsEl = card.querySelector(".card-stats");
      if (statsEl) {
        statsEl.textContent =
          "▶ " + Number(counts.playCount || 0) +
          " · 👍 " + Number(counts.likeCount || 0) +
          " · ⭐ " + Number(counts.favoriteCount || 0) +
          " · 💬 " + comments.length +
          (video.demo ? " · 示例" : "");
      }

      const likeBtn = card.querySelector(".like-btn");
      const favBtn = card.querySelector(".fav-btn");
      const playBtn = card.querySelector(".play-btn");
      const commentBtn = card.querySelector(".comment-btn");
      const followBtn = card.querySelector(".follow-btn");

      likeBtn.querySelector("span").textContent = String(Number(counts.likeCount || 0));
      favBtn.querySelector("span").textContent = String(Number(counts.favoriteCount || 0));
      const commentCountNode = commentBtn.querySelector("span");
      if (commentCountNode) commentCountNode.textContent = String(comments.length);
      likeBtn.classList.toggle("on", state.actionSet.has(video.id + ":like"));
      favBtn.classList.toggle("on", state.actionSet.has(video.id + ":favorite"));

      playBtn.addEventListener("click", async function () {
        await openVideo(video.id, true);
      });

      likeBtn.addEventListener("click", async function () {
        await toggleAction(video, "like");
      });

      favBtn.addEventListener("click", async function () {
        await toggleAction(video, "favorite");
      });

      commentBtn.addEventListener("click", async function () {
        await openVideo(video.id, false);
        commentInput?.focus();
      });

      if (followBtn) {
        if (!video.author_id) {
          followBtn.disabled = true;
          followBtn.textContent = "作者未知";
        } else if (state.user && video.author_id === state.user.id) {
          followBtn.disabled = true;
          followBtn.textContent = "我自己";
        } else {
          const followed = state.follows.has(video.author_id);
          followBtn.classList.toggle("on", followed);
          followBtn.textContent = followed ? "✓ 已关注" : "+ 关注";
          followBtn.addEventListener("click", async function () {
            await toggleFollow(video.author_id, video.author_name || "该作者");
          });
        }
      }

      gridEl.appendChild(card);
    });
  }

  function parseEmbedUrl(rawUrl) {
    const text = String(rawUrl || "").trim();
    if (!text) return "";

    try {
      const url = new URL(text);
      const host = url.hostname.toLowerCase();

      if (host.includes("youtube.com")) {
        const id = url.searchParams.get("v");
        if (id) return "https://www.youtube.com/embed/" + id;
      }

      if (host.includes("youtu.be")) {
        const id = url.pathname.replace(/^\//, "").split("/")[0];
        if (id) return "https://www.youtube.com/embed/" + id;
      }

      if (host.includes("bilibili.com")) {
        const matched = url.pathname.match(/\/video\/(BV[0-9A-Za-z]+)/);
        if (matched?.[1]) {
          return "https://player.bilibili.com/player.html?bvid=" + matched[1] + "&page=1";
        }
      }
    } catch (error) {
      return "";
    }

    return "";
  }

  function renderPlayerNode(videoUrl) {
    playerShell.innerHTML = "";
    const normalized = normalizeUrl(videoUrl);
    if (!normalized) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "视频链接不可用";
      playerShell.appendChild(empty);
      return;
    }

    if (/\.(mp4|webm|mov|m4v)(\?|$)/i.test(normalized)) {
      const video = document.createElement("video");
      video.src = normalized;
      video.controls = true;
      video.preload = "metadata";
      playerShell.appendChild(video);
      return;
    }

    const embed = parseEmbedUrl(normalized);
    if (embed) {
      const iframe = document.createElement("iframe");
      iframe.src = embed;
      iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
      iframe.referrerPolicy = "strict-origin-when-cross-origin";
      iframe.allowFullscreen = true;
      playerShell.appendChild(iframe);
      return;
    }

    const linkWrap = document.createElement("div");
    linkWrap.className = "empty";
    const link = document.createElement("a");
    link.href = normalized;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "该链接暂不支持内嵌播放，点击新窗口打开";
    linkWrap.appendChild(link);
    playerShell.appendChild(linkWrap);
  }

  function renderPlayer() {
    const video = getVideoById(state.currentVideoId);
    if (!video) {
      playerTitle.textContent = "请选择一个视频";
      playerShell.innerHTML = "<div class='empty'>暂无可播放视频</div>";
      playerMeta.textContent = "";
      playerStats.innerHTML = "";
      commentList.innerHTML = "<div class='comment'>暂无评论</div>";
      return;
    }

    playerTitle.textContent = video.title || "未命名视频";
    playerMeta.textContent =
      (video.author_name || "匿名创作者") +
      " · " +
      formatTime(video.created_at) +
      (video.duration_text ? " · 时长 " + video.duration_text : "");
    renderPlayerNode(video.video_url);

    const counts = getCounts(video.id);

    playerStats.innerHTML = "";
    [
      "播放 " + Number(counts.playCount || 0),
      "点赞 " + Number(counts.likeCount || 0),
      "收藏 " + Number(counts.favoriteCount || 0),
      "分类 " + (video.category || "综合推荐")
    ].forEach(function (text) {
      const chip = document.createElement("span");
      chip.className = "chip";
      chip.textContent = text;
      playerStats.appendChild(chip);
    });

    const comments = state.commentsMap.get(video.id) || [];
    commentList.innerHTML = "";
    if (!comments.length) {
      commentList.innerHTML = "<div class='comment'>暂无评论，来发第一条吧。</div>";
      return;
    }

    comments.slice(0, 12).forEach(function (row) {
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
    renderGrid();
    renderPlayer();
  }

  async function openVideo(videoId, countPlay) {
    state.currentVideoId = videoId;
    refreshViews();

    if (countPlay) {
      increasePlay(videoId)
        .then(function () {
          refreshViews();
        })
        .catch(function () {});
    }
  }

  async function increasePlay(videoId) {
    if (state.playedSet.has(videoId)) return;

    const counts = getCounts(videoId);
    if (isDemoVideoId(videoId)) {
      counts.playCount += 1;
      state.countsMap.set(videoId, counts);
      state.playedSet.add(videoId);
      return;
    }

    if (state.user) {
      const insertRes = await (state.context?.client || core.localClient)
        .from("mi_video_views")
        .insert({ video_id: videoId, viewer_id: state.user.id });

      if (insertRes.error) {
        const msg = String(insertRes.error.message || "").toLowerCase();
        if (!(insertRes.error.code === "23505" || msg.includes("duplicate"))) {
          setStatus("播放记录写入失败：" + insertRes.error.message, "err");
        }
      } else {
        counts.playCount += 1;
      }
    } else {
      counts.playCount += 1;
    }

    state.countsMap.set(videoId, counts);
    state.playedSet.add(videoId);
  }

  async function toggleAction(video, actionType) {
    const actionText = actionType === "like" ? "点赞" : "收藏";
    if (!canWrite(actionText)) return;

    const key = video.id + ":" + actionType;
    const existed = state.actionSet.has(key);
    const client = state.context.client;
    const countKey = actionType === "like" ? "likeCount" : "favoriteCount";
    const counts = getCounts(video.id);

    if (existed) {
      state.actionSet.delete(key);
    } else {
      state.actionSet.add(key);
    }
    counts[countKey] = Math.max(0, Number(counts[countKey] || 0) + (existed ? -1 : 1));
    state.countsMap.set(video.id, counts);
    refreshViews();

    if (isDemoVideoId(video.id)) {
      setStatus(actionText + "（示例预览）", "ok");
      return;
    }

    if (existed) {
      const deleteRes = await client
        .from("mi_video_actions")
        .delete()
        .eq("video_id", video.id)
        .eq("user_id", state.user.id)
        .eq("action_type", actionType);
      if (deleteRes.error) {
        state.actionSet.add(key);
        counts[countKey] = Math.max(0, Number(counts[countKey] || 0) + 1);
        state.countsMap.set(video.id, counts);
        refreshViews();
        setStatus(actionText + "失败：" + deleteRes.error.message, "err");
        return;
      }
    } else {
      const insertRes = await client.from("mi_video_actions").insert({
        video_id: video.id,
        user_id: state.user.id,
        action_type: actionType
      });
      if (insertRes.error) {
        const msg = String(insertRes.error.message || "").toLowerCase();
        if (!(insertRes.error.code === "23505" || msg.includes("duplicate"))) {
          state.actionSet.delete(key);
          counts[countKey] = Math.max(0, Number(counts[countKey] || 0) - 1);
          state.countsMap.set(video.id, counts);
          refreshViews();
          setStatus(actionText + "失败：" + insertRes.error.message, "err");
          return;
        }
      }
    }

    setStatus(actionText + "成功", "ok");
  }

  async function toggleFollow(followeeId, followeeName) {
    if (!canWrite("关注创作者")) return;
    if (!followeeId || followeeId === state.user.id) return;

    const client = state.context.client;
    const followed = state.follows.has(followeeId);

    if (followed) {
      state.follows.delete(followeeId);
      setStatus("已取消关注 " + (followeeName || "该作者"), "ok");
      renderGrid();

      const removeRes = await client
        .from("follows")
        .delete()
        .eq("follower_id", state.user.id)
        .eq("followee_id", followeeId);

      if (removeRes.error) {
        state.follows.add(followeeId);
        renderGrid();
        setStatus("取消关注失败：" + removeRes.error.message, "err");
        return;
      }

      return;
    }

    state.follows.add(followeeId);
    setStatus("已关注 " + (followeeName || "该作者"), "ok");
    renderGrid();

    const insertRes = await client.from("follows").insert({
      follower_id: state.user.id,
      followee_id: followeeId
    });

    if (insertRes.error) {
      const msg = String(insertRes.error.message || "").toLowerCase();
      if (!(insertRes.error.code === "23505" || msg.includes("duplicate"))) {
        state.follows.delete(followeeId);
        renderGrid();
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
    const video = getVideoById(state.currentVideoId);
    if (!video) {
      setStatus("请先选择一个视频", "err");
      return false;
    }

    const text = String(rawText || "").trim();
    if (!text) {
      setStatus("评论内容不能为空", "err");
      return false;
    }

    if (isDemoVideoId(video.id)) {
      const demoComments = state.commentsMap.get(video.id) || [];
      demoComments.unshift({
        id: "demo-local-" + Date.now(),
        video_id: video.id,
        text: text,
        author_name: state.displayName || "已登录用户",
        created_at: new Date().toISOString()
      });
      state.commentsMap.set(video.id, demoComments);
      commentInput.value = "";
      setStatus("评论成功（示例预览）", "ok");
      refreshViews();
      return true;
    }

    const insertRes = await state.context.client
      .from("mi_video_comments")
      .insert({
        video_id: video.id,
        text: text,
        author_id: state.user.id,
        author_name: state.displayName
      })
      .select("id,video_id,text,author_id,author_name,created_at")
      .single();

    if (insertRes.error) {
      setStatus("评论失败：" + insertRes.error.message, "err");
      return false;
    }

    const created = insertRes.data || {
      id: "local-" + Date.now(),
      video_id: video.id,
      text: text,
      author_id: state.user.id,
      author_name: state.displayName,
      created_at: new Date().toISOString()
    };
    const comments = state.commentsMap.get(video.id) || [];
    comments.unshift(created);
    state.commentsMap.set(video.id, comments);

    commentInput.value = "";
    setStatus("评论成功", "ok");
    refreshViews();
    return true;
  }

  function bindUploader() {
    if (!uploader) return;

    uploader.addEventListener("submit", async function (event) {
      event.preventDefault();
      if (!canWrite("发布视频")) return;

      const title = String(document.getElementById("miTitle")?.value || "").trim();
      const summary = String(document.getElementById("miSummary")?.value || "").trim();
      const videoUrl = normalizeUrl(document.getElementById("miVideoUrl")?.value || "");
      const coverUrlRaw = String(document.getElementById("miCoverUrl")?.value || "").trim();
      const coverUrl = coverUrlRaw ? normalizeUrl(coverUrlRaw) : "";
      const category = String(document.getElementById("miCategory")?.value || "综合推荐");
      const duration = String(document.getElementById("miDuration")?.value || "").trim();
      const tags = parseTags(document.getElementById("miTagsInput")?.value || "");

      if (!title) {
        setStatus("请填写视频标题", "err");
        return;
      }
      if (!videoUrl) {
        setStatus("请填写有效视频链接", "err");
        return;
      }
      if (coverUrlRaw && !coverUrl) {
        setStatus("封面链接格式不正确", "err");
        return;
      }

      const button = uploader.querySelector("button[type='submit']");
      button.disabled = true;
      button.textContent = "发布中...";

      const insertRes = await state.context.client
        .from("mi_videos")
        .insert({
          title: title,
          summary: summary || null,
          video_url: videoUrl,
          cover_url: coverUrl || null,
          category: category,
          duration_text: duration || null,
          tags: tags,
          author_id: state.user.id,
          author_name: state.displayName
        })
        .select("id")
        .single();

      button.disabled = false;
      button.textContent = "发布视频";

      if (insertRes.error) {
        setStatus("发布失败：" + insertRes.error.message, "err");
        return;
      }

      uploader.reset();
      state.currentVideoId = insertRes.data?.id || state.currentVideoId;
      setStatus("发布成功", "ok");
      await loadVideos();
    });
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
      const videos = getDisplayVideos().slice(0, 5);
      if (!videos.length) {
        root.textContent = "暂无可探索视频。";
        return;
      }

      videos.forEach(function (video) {
        const row = document.createElement("div");
        row.className = "side-item";
        row.textContent = (video.title || "未命名视频") + " · 热度 " + videoScore(video);
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
        root.textContent = "登录后可关注创作者并启用“仅看关注”过滤。";
        return;
      }

      const item = document.createElement("div");
      item.className = "side-item";
      item.textContent = "已关注创作者：" + state.follows.size + " 人；当前过滤：" + (state.followOnly ? "仅看关注" : "全部视频");
      root.appendChild(item);

      const tip = document.createElement("small");
      tip.textContent = "在视频卡片点击“+ 关注”可管理关注关系。";
      root.appendChild(tip);
    });
  }

  function renderChatPanel() {
    const chatKey = "xiaoma_chat_mi_v1";
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
      input.maxLength = 120;
      input.placeholder = "发送一条讨论消息";

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
        { href: "/mi-publish.html", label: "前往 Mi 个人发布页" },
        { href: "/community.html", label: "返回社区入口" },
        { href: "/profile.html", label: "打开个人中心" },
        { href: "/m.html", label: "切换到 M" },
        { href: "/lenny.html", label: "切换到 Lenny" }
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
      compactSelect.value = localStorage.getItem("xiaoma_mi_compact") === "1" ? "1" : "0";

      const compactSave = document.createElement("button");
      compactSave.type = "submit";
      compactSave.textContent = "应用";
      compactForm.appendChild(compactSelect);
      compactForm.appendChild(compactSave);
      compactForm.addEventListener("submit", function (event) {
        event.preventDefault();
        localStorage.setItem("xiaoma_mi_compact", compactSelect.value === "1" ? "1" : "0");
        applyCompactMode();
      });

      const exploreForm = document.createElement("form");
      exploreForm.className = "side-form";

      const exploreSelect = document.createElement("select");
      exploreSelect.innerHTML = "<option value='0'>默认 Home</option><option value='1'>默认 Explore</option>";
      exploreSelect.value = localStorage.getItem("xiaoma_mi_default_explore") === "1" ? "1" : "0";

      const exploreSave = document.createElement("button");
      exploreSave.type = "submit";
      exploreSave.textContent = "保存";
      exploreForm.appendChild(exploreSelect);
      exploreForm.appendChild(exploreSave);
      exploreForm.addEventListener("submit", function (event) {
        event.preventDefault();
        localStorage.setItem("xiaoma_mi_default_explore", exploreSelect.value === "1" ? "1" : "0");
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
      renderGrid();
      renderPlayer();
      setSideText("Home", "这是公开视频广场，浏览全部用户上传作品。");
      return;
    }

    if (action === "explore") {
      state.menuMode = "explore";
      state.followOnly = false;
      renderGrid();
      renderPlayer();
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
      renderGrid();
      renderPlayer();
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
    if (localStorage.getItem("xiaoma_mi_default_explore") === "1") {
      state.menuMode = "explore";
    }
    bindSideMenu();
    if (retryBtn) {
      retryBtn.addEventListener("click", function () {
        setRetryBusy(true);
        loadVideos();
      });
    }
    bindUploader();
    bindCommentForm();
    await loadViewer();
    await loadVideos();
    if (state.menuMode === "explore") {
      setActiveMenu("explore");
      renderExplorePanel();
    }
  }

  init();
})();
