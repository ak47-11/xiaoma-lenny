(function () {
  const SUPABASE_URL = "https://vtplvtwbkyydxmcxgctn.supabase.co";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ0cGx2dHdia3l5ZHhtY3hnY3RuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2MDI1NDYsImV4cCI6MjA4ODE3ODU0Nn0.JmmCCDbv9rkVSSCOfhrFwUgwzNMTvsDda_C956EjatU";

  const STORAGE_POSTS = "xiaoma_community_posts_v2";
  const STORAGE_NOTICES = "xiaoma_community_notices_v1";
  const STORAGE_FOLLOWS = "xiaoma_community_follows_v1";
  const STORAGE_LIKED = "xiaoma_community_liked_v1";
  const STORAGE_COLLECT = "xiaoma_community_collect_v1";

  const DELTA_TOPICS = ["攻略", "配装", "战报", "求助", "招募"];
  const CHARGE_TOPICS = ["日常", "学习", "视频", "图片", "灵感"];
  const bannedWords = ["spam", "博彩", "色情", "辱骂", "侮辱"];

  const state = {
    tab: new URLSearchParams(window.location.search).get("tab") || "delta",
    sortBy: "hot",
    cloudReady: false,
    viewer: null,
    viewerName: "游客",
    posts: [],
    followingSet: new Set(),
    likedSet: new Set(),
    collectSet: new Set(),
    notices: []
  };

  if (!["delta", "charge"].includes(state.tab)) state.tab = "delta";

  const supabase = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

  const feedList = document.getElementById("feedList");
  const topics = document.getElementById("topics");
  const composerArea = document.getElementById("composerArea");
  const feedTitle = document.getElementById("feedTitle");
  const sortByEl = document.getElementById("sortBy");
  const viewerCard = document.getElementById("viewerCard");
  const noticeList = document.getElementById("noticeList");
  const postTemplate = document.getElementById("postTemplate");

  function nowStr() {
    return new Date().toLocaleString("zh-CN", { hour12: false });
  }

  function randomId() {
    return crypto.randomUUID();
  }

  function readJson(key, fallbackValue) {
    try {
      const value = localStorage.getItem(key);
      return value ? JSON.parse(value) : fallbackValue;
    } catch (error) {
      return fallbackValue;
    }
  }

  function writeJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function showToast(text) {
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = text;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 1800);
  }

  function bumpButton(button) {
    button.classList.remove("bump");
    button.offsetHeight;
    button.classList.add("bump");
  }

  function floatHeart(button) {
    const rect = button.getBoundingClientRect();
    const node = document.createElement("div");
    node.className = "heart-float";
    node.textContent = "❤";
    node.style.left = rect.left + rect.width / 2 - 6 + "px";
    node.style.top = rect.top - 6 + "px";
    document.body.appendChild(node);
    setTimeout(() => node.remove(), 700);
  }

  function safeText(input) {
    const text = (input || "").trim();
    const lowered = text.toLowerCase();
    const hit = bannedWords.find((word) => lowered.includes(word));
    if (hit) return { ok: false, msg: "内容包含敏感词，请调整后再发布" };
    return { ok: true, text };
  }

  function seedPosts() {
    return [
      {
        id: randomId(),
        community: "delta",
        title: "夜战地图开局思路分享",
        content: "先占高点再包侧翼，双人组推荐一前压一断后，容错更高。",
        topic: "攻略",
        likes: 12,
        author_id: "seed_author_1",
        author_name: "小马Lenny",
        comments: [{ id: randomId(), text: "这个思路很实用", time: nowStr(), author_name: "玩家A" }],
        media_type: "",
        media_url: "",
        created_at: new Date().toISOString()
      },
      {
        id: randomId(),
        community: "charge",
        title: "今天学习完剪辑的第一条视频",
        content: "第一次尝试短视频剪辑，欢迎大家给点建议。",
        topic: "视频",
        likes: 20,
        author_id: "seed_author_2",
        author_name: "电量少女",
        comments: [{ id: randomId(), text: "节奏不错！", time: nowStr(), author_name: "路过喵" }],
        media_type: "video",
        media_url: "https://www.w3schools.com/html/mov_bbb.mp4",
        created_at: new Date().toISOString()
      }
    ];
  }

  function ensureLocalStore() {
    const posts = readJson(STORAGE_POSTS, null);
    if (!posts) writeJson(STORAGE_POSTS, seedPosts());
  }

  function getLocalPosts() {
    ensureLocalStore();
    return readJson(STORAGE_POSTS, []);
  }

  function setLocalPosts(posts) {
    writeJson(STORAGE_POSTS, posts);
  }

  async function canUseCloud() {
    if (!supabase) return false;
    try {
      const probe = await supabase.from("community_posts").select("id").limit(1);
      return !probe.error;
    } catch (error) {
      return false;
    }
  }

  async function loadViewer() {
    if (!supabase) return;
    const result = await supabase.auth.getSession();
    const user = result.data.session?.user || null;
    state.viewer = user;
    state.viewerName = user?.user_metadata?.name || user?.user_metadata?.full_name || user?.email || "游客";

    if (!user) {
      viewerCard.innerHTML = "未登录，当前为游客模式（可浏览、点赞、评论本地数据）";
      return;
    }

    if (!state.cloudReady) {
      viewerCard.innerHTML = "<b>" + state.viewerName + "</b><br />已登录（当前仍在本地模式，等待数据库表创建）";
      return;
    }

    let profileName = state.viewerName;
    try {
      const profileRes = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", user.id)
        .maybeSingle();

      if (!profileRes.error && profileRes.data?.display_name) {
        profileName = profileRes.data.display_name;
      } else {
        await supabase.from("profiles").upsert({ id: user.id, display_name: profileName }, { onConflict: "id" });
      }
    } catch (error) {
      profileName = state.viewerName;
    }

    state.viewerName = profileName;
    viewerCard.innerHTML = "<b>" + profileName + "</b><br />UID: " + user.id.slice(0, 8) + "...";
  }

  async function loadNotices() {
    if (state.cloudReady && state.viewer) {
      const cloudRes = await supabase
        .from("notifications")
        .select("id,text,created_at")
        .eq("user_id", state.viewer.id)
        .order("created_at", { ascending: false })
        .limit(10);

      if (!cloudRes.error) {
        state.notices = (cloudRes.data || []).map((item) => ({
          id: item.id,
          text: item.text,
          time: new Date(item.created_at).toLocaleString("zh-CN", { hour12: false })
        }));
        return;
      }
    }

    state.notices = readJson(STORAGE_NOTICES, []);
  }

  function pushLocalNotice(text) {
    const list = readJson(STORAGE_NOTICES, []);
    list.unshift({ id: randomId(), text, time: nowStr() });
    writeJson(STORAGE_NOTICES, list.slice(0, 20));
    state.notices = list.slice(0, 20);
  }

  async function pushNotice(text, userId) {
    if (state.cloudReady && userId) {
      const result = await supabase.from("notifications").insert({ user_id: userId, text });
      if (!result.error) return;
    }
    pushLocalNotice(text);
  }

  function renderNotices() {
    if (!state.notices.length) {
      noticeList.innerHTML = "<div class='notice'>暂无通知</div>";
      return;
    }

    noticeList.innerHTML = state.notices
      .slice(0, 8)
      .map((notice) => "<div class='notice'>" + notice.text + "<br /><small>" + notice.time + "</small></div>")
      .join("");
  }

  async function loadFollowState() {
    if (state.cloudReady && state.viewer) {
      const cloudRes = await supabase
        .from("follows")
        .select("followee_id")
        .eq("follower_id", state.viewer.id);
      if (!cloudRes.error) {
        state.followingSet = new Set((cloudRes.data || []).map((item) => item.followee_id));
        return;
      }
    }

    state.followingSet = new Set(readJson(STORAGE_FOLLOWS, []));
  }

  function saveLocalFollowState() {
    writeJson(STORAGE_FOLLOWS, [...state.followingSet]);
  }

  function loadLocalActionState() {
    state.likedSet = new Set(readJson(STORAGE_LIKED, []));
    state.collectSet = new Set(readJson(STORAGE_COLLECT, []));
  }

  function saveLocalActionState() {
    writeJson(STORAGE_LIKED, [...state.likedSet]);
    writeJson(STORAGE_COLLECT, [...state.collectSet]);
  }

  async function fetchPosts() {
    if (state.cloudReady) {
      const cloudRes = await supabase
        .from("community_posts")
        .select("id,community,title,content,topic,likes,author_id,author_name,media_type,media_url,created_at")
        .order("created_at", { ascending: false })
        .limit(200);

      if (!cloudRes.error) {
        const posts = cloudRes.data || [];
        for (const post of posts) {
          const commentsRes = await supabase
            .from("community_comments")
            .select("id,text,author_name,created_at")
            .eq("post_id", post.id)
            .order("created_at", { ascending: false })
            .limit(30);

          post.comments = (commentsRes.data || []).map((comment) => ({
            id: comment.id,
            text: comment.text,
            author_name: comment.author_name || "匿名用户",
            time: new Date(comment.created_at).toLocaleString("zh-CN", { hour12: false })
          }));
        }

        state.posts = posts;
        return;
      }
    }

    state.posts = getLocalPosts();
  }

  async function uploadMedia(file, community) {
    if (!file) return "";

    if (!state.cloudReady) {
      showToast("当前为本地模式，文件上传已跳过（可填媒体链接）");
      return "";
    }

    const ext = file.name.split(".").pop();
    const path = community + "/" + Date.now() + "-" + randomId() + "." + ext;
    const uploadRes = await supabase.storage.from("community-media").upload(path, file, {
      upsert: false,
      contentType: file.type
    });

    if (uploadRes.error) {
      showToast("上传失败：" + uploadRes.error.message);
      return "";
    }

    const publicUrlRes = supabase.storage.from("community-media").getPublicUrl(path);
    return publicUrlRes.data.publicUrl;
  }

  async function createPost(payload) {
    if (state.cloudReady && state.viewer) {
      const cloudPayload = {
        community: payload.community,
        title: payload.title,
        content: payload.content,
        topic: payload.topic,
        likes: 0,
        author_id: state.viewer.id,
        author_name: state.viewerName,
        media_type: payload.media_type,
        media_url: payload.media_url
      };

      const cloudRes = await supabase.from("community_posts").insert(cloudPayload);
      if (!cloudRes.error) {
        return true;
      }
      showToast("云端发布失败，已自动切本地发布");
    }

    const posts = getLocalPosts();
    posts.unshift({
      id: randomId(),
      ...payload,
      likes: 0,
      author_id: state.viewer?.id || "guest",
      author_name: state.viewerName,
      comments: [],
      created_at: new Date().toISOString()
    });
    setLocalPosts(posts);
    return true;
  }

  async function toggleLike(post) {
    const key = "like:" + post.id;
    const liked = state.likedSet.has(key);
    const diff = liked ? -1 : 1;

    if (state.cloudReady) {
      const cloudRes = await supabase
        .from("community_posts")
        .update({ likes: Math.max((post.likes || 0) + diff, 0) })
        .eq("id", post.id);
      if (!cloudRes.error) {
        if (liked) state.likedSet.delete(key);
        else state.likedSet.add(key);
        saveLocalActionState();

        if (!liked && post.author_id && post.author_id !== state.viewer?.id) {
          await pushNotice(state.viewerName + " 点赞了你的帖子《" + post.title + "》", post.author_id);
        }
        return;
      }
    }

    const posts = getLocalPosts();
    const target = posts.find((item) => item.id === post.id);
    if (!target) return;
    target.likes = Math.max((target.likes || 0) + diff, 0);
    setLocalPosts(posts);

    if (liked) state.likedSet.delete(key);
    else state.likedSet.add(key);
    saveLocalActionState();

    if (!liked && post.author_id !== "guest") {
      pushLocalNotice(state.viewerName + " 点赞了《" + post.title + "》");
    }
  }

  async function toggleCollect(post) {
    const key = "collect:" + post.id;
    if (state.collectSet.has(key)) state.collectSet.delete(key);
    else state.collectSet.add(key);
    saveLocalActionState();
  }

  async function addComment(post, text) {
    if (state.cloudReady && state.viewer) {
      const cloudRes = await supabase.from("community_comments").insert({
        post_id: post.id,
        text,
        author_id: state.viewer.id,
        author_name: state.viewerName
      });

      if (!cloudRes.error) {
        if (post.author_id && post.author_id !== state.viewer.id) {
          await pushNotice(state.viewerName + " 评论了你的帖子《" + post.title + "》", post.author_id);
        }
        return true;
      }
    }

    const posts = getLocalPosts();
    const target = posts.find((item) => item.id === post.id);
    if (!target) return false;
    target.comments = target.comments || [];
    target.comments.unshift({ id: randomId(), text, author_name: state.viewerName, time: nowStr() });
    setLocalPosts(posts);
    pushLocalNotice(state.viewerName + " 评论了《" + post.title + "》");
    return true;
  }

  async function toggleFollow(authorId, authorName) {
    if (!authorId || authorId === state.viewer?.id) return;

    if (state.followingSet.has(authorId)) {
      if (state.cloudReady && state.viewer) {
        await supabase.from("follows").delete().eq("follower_id", state.viewer.id).eq("followee_id", authorId);
      }
      state.followingSet.delete(authorId);
      saveLocalFollowState();
      return;
    }

    if (state.cloudReady && state.viewer) {
      const cloudRes = await supabase.from("follows").insert({ follower_id: state.viewer.id, followee_id: authorId });
      if (!cloudRes.error) {
        state.followingSet.add(authorId);
        saveLocalFollowState();
        await pushNotice(state.viewerName + " 关注了你", authorId);
        return;
      }
    }

    state.followingSet.add(authorId);
    saveLocalFollowState();
    pushLocalNotice(state.viewerName + " 关注了 " + (authorName || "作者"));
  }

  function buildComposer() {
    const isDelta = state.tab === "delta";
    const topics = isDelta ? DELTA_TOPICS : CHARGE_TOPICS;
    const placeholder = isDelta ? "分享你的攻略、配装、组队或版本理解" : "分享你的图文、视频、学习记录与灵感";

    composerArea.innerHTML = [
      "<h3>发布内容</h3>",
      "<form id='postForm'>",
      "<div class='row'><input id='postTitle' maxlength='60' placeholder='标题（选填）' /></div>",
      "<div class='row'><select id='postTopic'>" + topics.map((item) => "<option value='" + item + "'>" + item + "</option>").join("") + "</select></div>",
      "<div class='row'><textarea id='postContent' maxlength='1200' placeholder='" + placeholder + "'></textarea></div>",
      "<div class='counter' id='contentCounter'>0 / 1200</div>",
      "<div class='row uploader'><input id='mediaFile' type='file' accept='image/*,video/*' /><input id='mediaUrl' maxlength='600' placeholder='或手动填写图片/视频 URL（https://...）' /><div id='mediaPreview' class='preview'></div></div>",
      "<button type='submit'>发布到" + (isDelta ? "三角洲讨论社区" : "充电社区") + "</button>",
      "<div class='hint'>云端模式支持上传文件到 Supabase Storage（bucket: community-media）</div>",
      "</form>"
    ].join("");

    const postContent = document.getElementById("postContent");
    const counter = document.getElementById("contentCounter");
    postContent.addEventListener("input", () => {
      counter.textContent = postContent.value.length + " / 1200";
    });

    const mediaFile = document.getElementById("mediaFile");
    const mediaPreview = document.getElementById("mediaPreview");
    mediaFile.addEventListener("change", () => {
      mediaPreview.innerHTML = "";
      const file = mediaFile.files?.[0];
      if (!file) return;
      const objectUrl = URL.createObjectURL(file);

      if (file.type.startsWith("image/")) {
        mediaPreview.innerHTML = "<img src='" + objectUrl + "' alt='预览图' />";
      } else if (file.type.startsWith("video/")) {
        mediaPreview.innerHTML = "<video src='" + objectUrl + "' controls></video>";
      }
    });

    document.getElementById("postForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const submitBtn = event.target.querySelector("button[type='submit']");
      submitBtn.disabled = true;
      submitBtn.textContent = "发布中...";
      const rawTitle = document.getElementById("postTitle").value || (isDelta ? "未命名帖子" : "新动态");
      const rawContent = document.getElementById("postContent").value;
      const topic = document.getElementById("postTopic").value;
      const manualUrl = document.getElementById("mediaUrl").value.trim();
      const file = mediaFile.files?.[0] || null;

      const checkedTitle = safeText(rawTitle);
      const checkedContent = safeText(rawContent);
      if (!checkedTitle.ok || !checkedContent.ok) {
        showToast((checkedTitle.ok ? checkedContent : checkedTitle).msg);
        return;
      }
      if (!checkedContent.text) {
        showToast("请输入内容后再发布");
        return;
      }

      let mediaUrl = manualUrl;
      let mediaType = "";

      if (file) {
        mediaType = file.type.startsWith("image/") ? "image" : file.type.startsWith("video/") ? "video" : "";
        if (mediaType) {
          const uploaded = await uploadMedia(file, state.tab);
          if (uploaded) mediaUrl = uploaded;
        }
      } else if (manualUrl) {
        mediaType = /\.(mp4|mov|webm|m4v)(\?|$)/i.test(manualUrl) ? "video" : "image";
      }

      await createPost({
        community: state.tab,
        title: checkedTitle.text,
        content: checkedContent.text,
        topic,
        media_type: mediaType,
        media_url: mediaUrl
      });

      submitBtn.disabled = false;
      submitBtn.textContent = "发布到" + (isDelta ? "三角洲讨论社区" : "充电社区");
      showToast("发布成功");
      await refreshAll();
    });
  }

  function renderTopics() {
    const topicCount = {};
    state.posts
      .filter((post) => post.community === state.tab)
      .forEach((post) => {
        topicCount[post.topic] = (topicCount[post.topic] || 0) + 1;
      });

    const top = Object.entries(topicCount)
      .sort((first, second) => second[1] - first[1])
      .slice(0, 8);

    topics.innerHTML = top.length
      ? top.map(([topic, count]) => "<span>#" + topic + " · " + count + "</span>").join("")
      : "<span>暂无话题，快来发布第一条</span>";
  }

  function drawMedia(post, mediaBox) {
    mediaBox.innerHTML = "";
    if (!post.media_type || !post.media_url) return;

    if (post.media_type === "video") {
      const video = document.createElement("video");
      video.src = post.media_url;
      video.controls = true;
      video.preload = "metadata";
      mediaBox.appendChild(video);
      return;
    }

    const image = document.createElement("img");
    image.src = post.media_url;
    image.alt = post.title || "社区图片";
    mediaBox.appendChild(image);
  }

  function sortedPosts() {
    const list = state.posts.filter((post) => post.community === state.tab);
    const sorted = [...list];

    sorted.sort((first, second) => {
      if (state.sortBy === "latest") return new Date(second.created_at) - new Date(first.created_at);
      const firstScore = (first.likes || 0) + (first.comments?.length || 0) * 2;
      const secondScore = (second.likes || 0) + (second.comments?.length || 0) * 2;
      return secondScore - firstScore;
    });

    return sorted;
  }

  function renderFeed() {
    const list = sortedPosts();
    feedList.innerHTML = "";
    if (!list.length) {
      feedList.innerHTML = "<p>还没有内容，快发布第一条吧。</p>";
      return;
    }

    list.forEach((post) => {
      const node = postTemplate.content.firstElementChild.cloneNode(true);
      node.querySelector(".post-title").textContent = post.title;
      node.querySelector(".post-topic").textContent = post.topic;
      node.querySelector(".post-content").textContent = post.content;
      node.querySelector(".author-line").textContent = "作者：" + (post.author_name || "匿名用户");
      node.querySelector(".meta").textContent = new Date(post.created_at).toLocaleString("zh-CN", { hour12: false }) + " · 评论 " + (post.comments?.length || 0);
      node.querySelector(".like-btn span").textContent = post.likes || 0;
      drawMedia(post, node.querySelector(".media"));

      const likeKey = "like:" + post.id;
      const collectKey = "collect:" + post.id;

      const likeBtn = node.querySelector(".like-btn");
      likeBtn.classList.toggle("on", state.likedSet.has(likeKey));
      likeBtn.addEventListener("click", async () => {
        const willLike = !state.likedSet.has(likeKey);
        bumpButton(likeBtn);
        if (willLike) floatHeart(likeBtn);
        await toggleLike(post);
        await refreshAll();
      });

      const collectBtn = node.querySelector(".collect-btn");
      collectBtn.classList.toggle("on", state.collectSet.has(collectKey));
      collectBtn.addEventListener("click", async () => {
        bumpButton(collectBtn);
        await toggleCollect(post);
        await refreshAll();
      });

      const followBtn = node.querySelector(".follow-btn");
      const canFollow = !!post.author_id && post.author_id !== state.viewer?.id;
      followBtn.style.display = canFollow ? "inline-block" : "none";
      followBtn.classList.toggle("on", state.followingSet.has(post.author_id));
      followBtn.textContent = state.followingSet.has(post.author_id) ? "已关注" : "+ 关注作者";
      followBtn.addEventListener("click", async () => {
        bumpButton(followBtn);
        await toggleFollow(post.author_id, post.author_name);
        await refreshAll();
      });

      const commentBox = node.querySelector(".comment-box");
      const commentList = node.querySelector(".comment-list");
      const comments = post.comments || [];
      commentList.innerHTML = comments.length
        ? comments
            .map((comment) => "<div class='comment'><b>" + (comment.author_name || "用户") + "：</b>" + comment.text + "<br /><small>" + comment.time + "</small></div>")
            .join("")
        : "<p>还没有评论，抢个沙发～</p>";

      node.querySelector(".comment-toggle").addEventListener("click", () => {
        commentBox.classList.toggle("hidden");
      });

      const quickReplies = ["支持一下", "很有帮助", "学到了", "这个太实用啦"];
      const quickWrap = document.createElement("div");
      quickWrap.className = "quick-replies";
      quickWrap.innerHTML = quickReplies.map((item) => "<button type='button' class='quick-tag'>" + item + "</button>").join("");
      commentBox.appendChild(quickWrap);

      const commentInput = node.querySelector(".comment-form input");
      quickWrap.querySelectorAll(".quick-tag").forEach((tag) => {
        tag.addEventListener("click", () => {
          commentInput.value = tag.textContent;
          commentInput.focus();
        });
      });

      node.querySelector(".comment-form").addEventListener("submit", async (event) => {
        event.preventDefault();
        const input = event.target.querySelector("input");
        const sendBtn = event.target.querySelector("button");
        sendBtn.disabled = true;
        sendBtn.textContent = "发送中";
        const checked = safeText(input.value);
        if (!checked.ok || !checked.text) {
          sendBtn.disabled = false;
          sendBtn.textContent = "发送";
          showToast(checked.ok ? "评论不能为空" : checked.msg);
          return;
        }

        await addComment(post, checked.text);
        sendBtn.disabled = false;
        sendBtn.textContent = "发送";
        await refreshAll();
      });

      feedList.appendChild(node);
    });
  }

  function renderTabs() {
    document.body.classList.remove("tab-delta", "tab-charge");
    document.body.classList.add(state.tab === "delta" ? "tab-delta" : "tab-charge");
    document.querySelectorAll(".tab").forEach((button) => {
      button.classList.toggle("active", button.dataset.tab === state.tab);
    });
    feedTitle.textContent = state.tab === "delta" ? "🎯 三角洲热帖" : "✨ 充电动态";
  }

  async function refreshAll() {
    await fetchPosts();
    await loadNotices();
    renderTabs();
    renderNotices();
    buildComposer();
    renderTopics();
    renderFeed();
  }

  function bindGlobalEvents() {
    document.querySelectorAll(".tab").forEach((button) => {
      button.addEventListener("click", async () => {
        state.tab = button.dataset.tab;
        await refreshAll();
      });
    });

    sortByEl.addEventListener("change", async () => {
      state.sortBy = sortByEl.value;
      renderFeed();
    });
  }

  async function init() {
    state.cloudReady = await canUseCloud();
    loadLocalActionState();
    await loadViewer();
    await loadFollowState();
    bindGlobalEvents();
    await refreshAll();

    if (!state.cloudReady) {
      showToast("当前为本地模式；创建 Supabase 社区表后会自动切云端");
    }
  }

  init();
})();
