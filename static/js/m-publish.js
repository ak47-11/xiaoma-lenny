(function () {
  const core = window.XiaomaCore;
  if (!core) return;

  const state = {
    context: null,
    user: null,
    displayName: "",
    posts: [],
    counters: new Map(),
    tableReady: true
  };

  const composer = document.getElementById("mComposer");
  const contentInput = document.getElementById("mContent");
  const mediaInput = document.getElementById("mMedia");
  const counter = document.getElementById("mCounter");
  const statusEl = document.getElementById("mStatus");
  const userHint = document.getElementById("userHint");
  const mineFeed = document.getElementById("mMineFeed");
  const template = document.getElementById("mMinePostTemplate");

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

  function isVideoUrl(url) {
    return /\.(mp4|mov|webm|m4v)(\?|$)/i.test(url);
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

  async function loadViewer() {
    await core.applyNavState();
    const context = await core.requireLogin("/m-publish.html");
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
    setUserHint("当前账号：" + displayName + "（发布内容会出现在 M 公共社区）");
    return true;
  }

  async function loadCounters(postIds) {
    state.counters = new Map();
    postIds.forEach(function (id) {
      state.counters.set(id, { likeCount: 0, repostCount: 0, commentCount: 0 });
    });

    if (!postIds.length) return;

    const client = state.context.client;
    const [reactionRes, commentRes] = await Promise.all([
      client.from("m_reactions").select("post_id,reaction_type").in("post_id", postIds),
      client.from("m_comments").select("post_id").in("post_id", postIds)
    ]);

    if (!reactionRes.error) {
      (reactionRes.data || []).forEach(function (row) {
        const counter = state.counters.get(row.post_id);
        if (!counter) return;
        if (row.reaction_type === "like") counter.likeCount += 1;
        if (row.reaction_type === "repost") counter.repostCount += 1;
      });
    }

    if (!commentRes.error) {
      (commentRes.data || []).forEach(function (row) {
        const counter = state.counters.get(row.post_id);
        if (!counter) return;
        counter.commentCount += 1;
      });
    }
  }

  function renderMinePosts() {
    if (!mineFeed || !template) return;
    mineFeed.innerHTML = "";

    if (!state.posts.length) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "你还没有发布内容，发第一条动态吧。";
      mineFeed.appendChild(empty);
      return;
    }

    state.posts.forEach(function (post) {
      const card = template.content.firstElementChild.cloneNode(true);
      const counterMap = state.counters.get(post.id) || { likeCount: 0, repostCount: 0, commentCount: 0 };

      card.querySelector(".title").textContent = state.displayName || "我";
      card.querySelector(".meta").textContent = formatTime(post.created_at);
      card.querySelector(".body-text").textContent = post.content || "";
      card.querySelector(".like-count").textContent = String(counterMap.likeCount || 0);
      card.querySelector(".repost-count").textContent = String(counterMap.repostCount || 0);
      card.querySelector(".comment-count").textContent = String(counterMap.commentCount || 0);

      renderMedia(card.querySelector(".media-preview"), post.media_url || "");

      const deleteBtn = card.querySelector(".delete-btn");
      deleteBtn.addEventListener("click", async function () {
        const confirmed = window.confirm("确定删除这条动态吗？删除后不可恢复。");
        if (!confirmed) return;

        const deleteRes = await state.context.client.from("m_posts").delete().eq("id", post.id).eq("author_id", state.user.id);
        if (deleteRes.error) {
          setStatus("删除失败：" + deleteRes.error.message, "err");
          return;
        }

        setStatus("删除成功", "ok");
        await loadMinePosts();
      });

      mineFeed.appendChild(card);
    });
  }

  async function loadMinePosts() {
    const postsRes = await state.context.client
      .from("m_posts")
      .select("id,content,media_url,created_at")
      .eq("author_id", state.user.id)
      .order("created_at", { ascending: false })
      .limit(80);

    if (postsRes.error) {
      state.tableReady = false;
      state.posts = [];
      const lower = String(postsRes.error.message || "").toLowerCase();
      if (lower.includes("relation") || lower.includes("does not exist")) {
        setStatus("M 模块数据表未初始化，请先执行 supabase/community_admin_setup.sql", "err");
      } else {
        setStatus("读取我的动态失败：" + postsRes.error.message, "err");
      }
      renderMinePosts();
      return;
    }

    state.tableReady = true;
    state.posts = postsRes.data || [];
    await loadCounters(state.posts.map(function (post) { return post.id; }));
    renderMinePosts();
    setStatus("已加载 " + state.posts.length + " 条我的动态", "ok");
  }

  function bindComposer() {
    if (!composer || !contentInput || !counter) return;

    contentInput.addEventListener("input", function () {
      counter.textContent = contentInput.value.length + " / 280";
    });

    composer.addEventListener("submit", async function (event) {
      event.preventDefault();

      if (!state.tableReady) {
        setStatus("M 模块数据表未初始化，请先执行 SQL 迁移", "err");
        return;
      }

      const submitBtn = composer.querySelector("button[type='submit']");
      const content = String(contentInput.value || "").trim();
      const mediaRaw = String(mediaInput?.value || "").trim();
      const mediaUrl = normalizeUrl(mediaRaw);

      if (!content) {
        setStatus("请输入动态内容", "err");
        return;
      }

      if (mediaRaw && !mediaUrl) {
        setStatus("媒体链接格式不正确，仅支持 http/https", "err");
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
      setStatus("发布成功，已同步到 M 公共社区", "ok");
      await loadMinePosts();
    });
  }

  async function init() {
    const ok = await loadViewer();
    if (!ok) return;
    bindComposer();
    await loadMinePosts();
  }

  init();
})();
