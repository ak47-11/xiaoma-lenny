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

  function setStatus(text, kind) {
    if (!statusEl) return;
    statusEl.textContent = text;
    statusEl.className = "status";
    if (kind) statusEl.classList.add(kind);
  }

  function setUserHint(text) {
    if (userHint) userHint.textContent = text;
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

  async function loadPosts() {
    const client = state.context?.client || core.localClient;
    const postsRes = await client
      .from("m_posts")
      .select("id,content,media_url,author_id,author_name,created_at")
      .order("created_at", { ascending: false })
      .limit(80);

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
      renderFeed();
      return;
    }

    state.tableReady = true;
    state.posts = postsRes.data || [];
    await loadMetaData(client);
    await loadFollowMap(client);
    renderTopics();
    renderFeed();

    if (!state.posts.length) {
      setStatus("公开广场还没有动态，去个人发布页发第一条吧", "");
    } else {
      setStatus("已加载 " + state.posts.length + " 条动态", "ok");
    }
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
      const reaction = state.reactions.get(post.id) || {
        likeCount: 0,
        repostCount: 0,
        userLiked: false,
        userReposted: false
      };
      const comments = state.comments.get(post.id) || [];

      card.querySelector(".title").textContent = authorLabel(post);
      card.querySelector(".meta").textContent = formatTime(post.created_at) + " · " + comments.length + " 条评论";
      card.querySelector(".body-text").textContent = post.content || "";
      renderMedia(card.querySelector(".media-preview"), post.media_url || "");

      const likeBtn = card.querySelector(".like-btn");
      const repostBtn = card.querySelector(".repost-btn");
      const commentBtn = card.querySelector(".comment-btn");
      const followBtn = card.querySelector(".follow-btn");
      const commentWrap = card.querySelector(".comment-wrap");
      const commentList = card.querySelector(".comment-list");
      const commentForm = card.querySelector(".comment-form");
      const commentInput = commentForm.querySelector("input");

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

      if (!comments.length) {
        commentList.innerHTML = "<div class='comment'>还没有评论，来抢沙发吧。</div>";
      } else {
        commentList.innerHTML = "";
        comments.slice(0, 8).forEach(function (comment) {
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

          commentList.appendChild(row);
        });
      }

      likeBtn.addEventListener("click", async function () {
        await toggleReaction(post.id, "like");
      });

      repostBtn.addEventListener("click", async function () {
        await toggleReaction(post.id, "repost");
      });

      commentBtn.addEventListener("click", function () {
        commentWrap.classList.toggle("hidden");
        if (!commentWrap.classList.contains("hidden")) commentInput.focus();
      });

      commentForm.addEventListener("submit", async function (event) {
        event.preventDefault();
        await submitComment(post.id, commentInput.value);
      });

      feedEl.appendChild(card);
    });
  }

  async function toggleReaction(postId, reactionType) {
    if (!canWrite(reactionType === "like" ? "点赞" : "转发")) return;

    const client = state.context.client;
    const existing = await client
      .from("m_reactions")
      .select("id")
      .eq("post_id", postId)
      .eq("user_id", state.user.id)
      .eq("reaction_type", reactionType)
      .maybeSingle();

    if (existing.error) {
      setStatus("互动失败：" + existing.error.message, "err");
      return;
    }

    if (existing.data?.id) {
      const removeRes = await client.from("m_reactions").delete().eq("id", existing.data.id);
      if (removeRes.error) {
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
        setStatus("互动失败：" + addRes.error.message, "err");
        return;
      }
    }

    await loadPosts();
  }

  async function toggleFollow(followeeId, followeeName) {
    if (!canWrite("关注作者")) return;
    if (!followeeId || followeeId === state.user.id) return;

    const client = state.context.client;
    const followed = state.follows.has(followeeId);

    if (followed) {
      const removeRes = await client
        .from("follows")
        .delete()
        .eq("follower_id", state.user.id)
        .eq("followee_id", followeeId);

      if (removeRes.error) {
        setStatus("取消关注失败：" + removeRes.error.message, "err");
        return;
      }

      state.follows.delete(followeeId);
      setStatus("已取消关注 " + (followeeName || "该作者"), "ok");
      renderFeed();
      return;
    }

    const insertRes = await client.from("follows").insert({
      follower_id: state.user.id,
      followee_id: followeeId
    });

    if (insertRes.error) {
      const msg = String(insertRes.error.message || "").toLowerCase();
      if (!(insertRes.error.code === "23505" || msg.includes("duplicate"))) {
        setStatus("关注失败：" + insertRes.error.message, "err");
        return;
      }
    }

    state.follows.add(followeeId);
    setStatus("已关注 " + (followeeName || "该作者"), "ok");

    await client.from("notifications").insert({
      user_id: followeeId,
      text: (state.displayName || "有用户") + " 关注了你"
    });

    renderFeed();
  }

  async function submitComment(postId, rawText) {
    if (!canWrite("评论")) return;
    const text = String(rawText || "").trim();
    if (!text) {
      setStatus("评论内容不能为空", "err");
      return;
    }

    const insertRes = await state.context.client.from("m_comments").insert({
      post_id: postId,
      text: text,
      author_id: state.user.id,
      author_name: state.displayName
    });

    if (insertRes.error) {
      setStatus("评论失败：" + insertRes.error.message, "err");
      return;
    }

    setStatus("评论成功", "ok");
    await loadPosts();
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
        { href: "/community.html", label: "返回社区入口" },
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

  async function init() {
    applyCompactMode();
    if (localStorage.getItem("xiaoma_m_default_explore") === "1") {
      state.menuMode = "explore";
    }
    bindSideMenu();
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
