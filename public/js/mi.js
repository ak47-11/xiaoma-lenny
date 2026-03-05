(function () {
  const core = window.XiaomaCore;
  if (!core) return;

  const state = {
    context: null,
    user: null,
    displayName: "游客",
    videos: [],
    actionSet: new Set(),
    countsMap: new Map(),
    commentsMap: new Map(),
    currentVideoId: null,
    playedSet: new Set(),
    tableReady: true
  };

  const uploader = document.getElementById("miUploader");
  const statusEl = document.getElementById("miStatus");
  const gridEl = document.getElementById("miGrid");
  const template = document.getElementById("miVideoTemplate");
  const tagsEl = document.getElementById("miTags");
  const userHint = document.getElementById("userHint");

  const playerTitle = document.getElementById("miPlayerTitle");
  const playerShell = document.getElementById("miPlayerShell");
  const playerMeta = document.getElementById("miPlayerMeta");
  const playerStats = document.getElementById("miPlayerStats");

  const commentForm = document.getElementById("miCommentForm");
  const commentInput = document.getElementById("miCommentInput");
  const commentList = document.getElementById("miCommentList");

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

  async function loadViewer() {
    await core.applyNavState();
    state.context = await core.getSessionContext();
    state.user = state.context.session?.user || null;

    if (!state.user) {
      state.displayName = "游客";
      setUserHint("游客模式：可看视频，点赞/收藏/评论/发布需登录");
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
    setUserHint("当前账号：" + displayName + "（可发布、点赞、收藏、评论）");
  }

  async function loadVideos() {
    const client = state.context?.client || core.localClient;
    const result = await client
      .from("mi_videos")
      .select("id,title,summary,video_url,cover_url,category,duration_text,tags,play_count,like_count,favorite_count,author_id,author_name,created_at")
      .order("created_at", { ascending: false })
      .limit(100);

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
      renderGrid();
      renderPlayer();
      return;
    }

    state.tableReady = true;
    state.videos = result.data || [];
    if (!state.currentVideoId || !getVideoById(state.currentVideoId)) {
      state.currentVideoId = state.videos[0]?.id || null;
    }

    await loadMetaData(client);
    renderTags();
    renderGrid();
    renderPlayer();

    if (!state.videos.length) {
      setStatus("还没有视频，发布第一条内容吧", "");
    } else {
      setStatus("已加载 " + state.videos.length + " 条视频", "ok");
    }
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
    if (!state.videos.length) {
      gridEl.innerHTML = "<div class='empty'>暂无视频，快来发布第一条。</div>";
      return;
    }

    state.videos.forEach(function (video) {
      const card = template.content.firstElementChild.cloneNode(true);
      card.classList.toggle("active", state.currentVideoId === video.id);
      const counts = getCounts(video.id);

      renderCover(card.querySelector(".video-cover"), video);
      card.querySelector(".title").textContent = video.title || "未命名视频";
      card.querySelector(".category").textContent = video.category || "综合推荐";
      card.querySelector(".summary").textContent = video.summary || "作者暂未填写简介";
      card.querySelector(".meta").textContent =
        (video.author_name || "匿名创作者") +
        " · " +
        formatTime(video.created_at) +
        " · 播放 " +
        Number(counts.playCount || 0) +
        (video.duration_text ? " · 时长 " + video.duration_text : "");

      const tagWrap = card.querySelector(".tag-list");
      tagWrap.innerHTML = "";
      (video.tags || []).forEach(function (tag) {
        const tagNode = document.createElement("span");
        tagNode.className = "tag";
        tagNode.textContent = tag;
        tagWrap.appendChild(tagNode);
      });

      const likeBtn = card.querySelector(".like-btn");
      const favBtn = card.querySelector(".fav-btn");
      const playBtn = card.querySelector(".play-btn");
      const commentBtn = card.querySelector(".comment-btn");

      likeBtn.querySelector("span").textContent = String(Number(counts.likeCount || 0));
      favBtn.querySelector("span").textContent = String(Number(counts.favoriteCount || 0));
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

  async function openVideo(videoId, countPlay) {
    state.currentVideoId = videoId;
    if (countPlay) {
      await increasePlay(videoId);
    }
    renderGrid();
    renderPlayer();
  }

  async function increasePlay(videoId) {
    if (state.playedSet.has(videoId)) return;

    const counts = getCounts(videoId);
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

    if (existed) {
      const deleteRes = await client
        .from("mi_video_actions")
        .delete()
        .eq("video_id", video.id)
        .eq("user_id", state.user.id)
        .eq("action_type", actionType);
      if (deleteRes.error) {
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
          setStatus(actionText + "失败：" + insertRes.error.message, "err");
          return;
        }
      }
    }

    await loadMetaData(client);
    setStatus(actionText + "成功", "ok");
    renderGrid();
    renderPlayer();
  }

  async function submitComment(rawText) {
    if (!canWrite("评论")) return;
    const video = getVideoById(state.currentVideoId);
    if (!video) {
      setStatus("请先选择一个视频", "err");
      return;
    }

    const text = String(rawText || "").trim();
    if (!text) {
      setStatus("评论内容不能为空", "err");
      return;
    }

    const insertRes = await state.context.client.from("mi_video_comments").insert({
      video_id: video.id,
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
    await loadVideos();
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

  async function init() {
    bindUploader();
    bindCommentForm();
    await loadViewer();
    await loadVideos();
  }

  init();
})();
