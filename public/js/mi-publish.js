(function () {
  const core = window.XiaomaCore;
  if (!core) return;

  const state = {
    context: null,
    user: null,
    displayName: "",
    videos: [],
    tableReady: true
  };

  const uploader = document.getElementById("miUploader");
  const statusEl = document.getElementById("miStatus");
  const mineGrid = document.getElementById("miMineGrid");
  const template = document.getElementById("miMineVideoTemplate");
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
    const tags = source
      .split(/[，,\s]+/)
      .map(function (item) {
        return item.trim();
      })
      .filter(function (item) {
        return item && item.length <= 24;
      });
    return [...new Set(tags)].slice(0, 8);
  }

  function renderCover(container, coverUrl, title) {
    container.innerHTML = "";
    const safeUrl = normalizeUrl(coverUrl);
    if (!safeUrl) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "暂无封面";
      container.appendChild(empty);
      return;
    }

    const image = document.createElement("img");
    image.src = safeUrl;
    image.alt = title || "视频封面";
    container.appendChild(image);
  }

  async function loadViewer() {
    await core.applyNavState();
    const context = await core.requireLogin("/mi-publish.html");
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
    setUserHint("当前账号：" + displayName + "（发布后将展示在 Mi 公开社区）");
    return true;
  }

  function renderMineVideos() {
    if (!mineGrid || !template) return;
    mineGrid.innerHTML = "";

    if (!state.videos.length) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "你还没有发布视频，上传第一条内容吧。";
      mineGrid.appendChild(empty);
      return;
    }

    state.videos.forEach(function (video) {
      const card = template.content.firstElementChild.cloneNode(true);
      card.querySelector(".title").textContent = video.title || "未命名视频";
      card.querySelector(".category").textContent = video.category || "综合推荐";
      card.querySelector(".summary").textContent = video.summary || "作者暂未填写简介";
      card.querySelector(".meta").textContent =
        formatTime(video.created_at) + (video.duration_text ? " · 时长 " + video.duration_text : "");

      renderCover(card.querySelector(".video-cover"), video.cover_url, video.title);

      const tagWrap = card.querySelector(".tag-list");
      tagWrap.innerHTML = "";
      (video.tags || []).forEach(function (tag) {
        const node = document.createElement("span");
        node.className = "tag";
        node.textContent = tag;
        tagWrap.appendChild(node);
      });

      const openLink = card.querySelector(".open-link");
      const safeVideoUrl = normalizeUrl(video.video_url);
      if (safeVideoUrl) {
        openLink.href = safeVideoUrl;
      } else {
        openLink.removeAttribute("href");
        openLink.classList.add("disabled");
        openLink.textContent = "链接不可用";
      }

      const deleteBtn = card.querySelector(".delete-btn");
      deleteBtn.addEventListener("click", async function () {
        const confirmed = window.confirm("确定删除这个视频条目吗？");
        if (!confirmed) return;

        const deleteRes = await state.context.client
          .from("mi_videos")
          .delete()
          .eq("id", video.id)
          .eq("author_id", state.user.id);

        if (deleteRes.error) {
          setStatus("删除失败：" + deleteRes.error.message, "err");
          return;
        }

        setStatus("删除成功", "ok");
        await loadMineVideos();
      });

      mineGrid.appendChild(card);
    });
  }

  async function loadMineVideos() {
    const result = await state.context.client
      .from("mi_videos")
      .select("id,title,summary,video_url,cover_url,category,duration_text,tags,created_at")
      .eq("author_id", state.user.id)
      .order("created_at", { ascending: false })
      .limit(100);

    if (result.error) {
      state.tableReady = false;
      state.videos = [];
      const lower = String(result.error.message || "").toLowerCase();
      if (lower.includes("relation") || lower.includes("does not exist")) {
        setStatus("Mi 模块数据表未初始化，请先执行 supabase/community_admin_setup.sql", "err");
      } else {
        setStatus("读取我的视频失败：" + result.error.message, "err");
      }
      renderMineVideos();
      return;
    }

    state.tableReady = true;
    state.videos = result.data || [];
    renderMineVideos();
    setStatus("已加载 " + state.videos.length + " 条我的视频", "ok");
  }

  function bindUploader() {
    if (!uploader) return;

    uploader.addEventListener("submit", async function (event) {
      event.preventDefault();

      if (!state.tableReady) {
        setStatus("Mi 模块数据表未初始化，请先执行 SQL 迁移", "err");
        return;
      }

      const title = String(document.getElementById("miTitle")?.value || "").trim();
      const summary = String(document.getElementById("miSummary")?.value || "").trim();
      const videoUrl = normalizeUrl(document.getElementById("miVideoUrl")?.value || "");
      const coverUrlRaw = String(document.getElementById("miCoverUrl")?.value || "").trim();
      const coverUrl = coverUrlRaw ? normalizeUrl(coverUrlRaw) : "";
      const category = String(document.getElementById("miCategory")?.value || "综合推荐").trim();
      const duration = String(document.getElementById("miDuration")?.value || "").trim();
      const tags = parseTags(document.getElementById("miTagsInput")?.value || "");

      if (!title) {
        setStatus("请填写视频标题", "err");
        return;
      }
      if (!videoUrl) {
        setStatus("请填写有效视频链接（仅支持 http/https）", "err");
        return;
      }
      if (coverUrlRaw && !coverUrl) {
        setStatus("封面链接格式不正确", "err");
        return;
      }

      const button = uploader.querySelector("button[type='submit']");
      button.disabled = true;
      button.textContent = "发布中...";

      const insertRes = await state.context.client.from("mi_videos").insert({
        title: title,
        summary: summary || null,
        video_url: videoUrl,
        cover_url: coverUrl || null,
        category: category || "综合推荐",
        duration_text: duration || null,
        tags: tags,
        author_id: state.user.id,
        author_name: state.displayName
      });

      button.disabled = false;
      button.textContent = "发布视频";

      if (insertRes.error) {
        setStatus("发布失败：" + insertRes.error.message, "err");
        return;
      }

      uploader.reset();
      setStatus("发布成功，已同步到 Mi 公开社区", "ok");
      await loadMineVideos();
    });
  }

  async function init() {
    const ok = await loadViewer();
    if (!ok) return;
    bindUploader();
    await loadMineVideos();
  }

  init();
})();
