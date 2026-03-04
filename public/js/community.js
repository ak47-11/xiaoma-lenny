(function () {
  const STORAGE_KEY = "xiaoma_community_posts_v1";
  const DELTA_TOPICS = ["攻略", "配装", "战报", "求助", "招募"];
  const CHARGE_TOPICS = ["日常", "学习", "视频", "图片", "灵感"];
  const bannedWords = ["spam", "博彩", "色情", "辱骂"];

  let activeTab = new URLSearchParams(window.location.search).get("tab") || "delta";
  if (!["delta", "charge"].includes(activeTab)) activeTab = "delta";

  const feedList = document.getElementById("feedList");
  const topics = document.getElementById("topics");
  const composerArea = document.getElementById("composerArea");
  const feedTitle = document.getElementById("feedTitle");
  const sortBy = document.getElementById("sortBy");
  const template = document.getElementById("postTemplate");

  function nowStr() {
    return new Date().toLocaleString("zh-CN", { hour12: false });
  }

  function seedPosts() {
    return [
      {
        id: crypto.randomUUID(),
        community: "delta",
        title: "夜战地图开局思路分享",
        content: "先占高点再包侧翼，双人组推荐一前压一断后，容错更高。",
        topic: "攻略",
        likes: 12,
        liked: false,
        collected: false,
        comments: [{ id: crypto.randomUUID(), text: "这个思路很实用", time: nowStr() }],
        mediaType: "",
        mediaUrl: "",
        createdAt: nowStr()
      },
      {
        id: crypto.randomUUID(),
        community: "charge",
        title: "今天学习完剪辑的第一条视频",
        content: "第一次尝试短视频剪辑，欢迎大家给点建议。",
        topic: "视频",
        likes: 20,
        liked: false,
        collected: false,
        comments: [{ id: crypto.randomUUID(), text: "节奏不错！", time: nowStr() }],
        mediaType: "video",
        mediaUrl: "https://www.w3schools.com/html/mov_bbb.mp4",
        createdAt: nowStr()
      }
    ];
  }

  function loadPosts() {
    try {
      const value = localStorage.getItem(STORAGE_KEY);
      if (!value) {
        const seeded = seedPosts();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
        return seeded;
      }
      return JSON.parse(value);
    } catch (error) {
      return seedPosts();
    }
  }

  function savePosts(posts) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(posts));
  }

  function safeText(input) {
    const text = (input || "").trim();
    const lowered = text.toLowerCase();
    const hit = bannedWords.find((word) => lowered.includes(word));
    if (hit) return { ok: false, msg: "内容包含敏感词，请调整后再发布" };
    return { ok: true, text };
  }

  function showToast(text) {
    const node = document.createElement("div");
    node.className = "toast";
    node.textContent = text;
    document.body.appendChild(node);
    setTimeout(() => node.remove(), 1500);
  }

  function buildComposer() {
    const isDelta = activeTab === "delta";
    const topicSet = isDelta ? DELTA_TOPICS : CHARGE_TOPICS;
    const titleLabel = isDelta ? "帖子标题" : "动态标题（可选）";
    const placeholder = isDelta ? "分享你的攻略、配装或组队信息" : "记录今天的学习、生活、作品想法";

    composerArea.innerHTML = [
      "<h3>发布内容</h3>",
      "<form id='postForm'>",
      "<div class='row'><input id='postTitle' maxlength='60' placeholder='" + titleLabel + "' /></div>",
      "<div class='row'><select id='postTopic'>" + topicSet.map((item) => "<option value='" + item + "'>" + item + "</option>").join("") + "</select></div>",
      "<div class='row'><textarea id='postContent' maxlength='1200' placeholder='" + placeholder + "'></textarea></div>",
      "<div class='row'><select id='mediaType'><option value=''>无媒体</option><option value='image'>图片链接</option><option value='video'>视频链接</option></select></div>",
      "<div class='row'><input id='mediaUrl' maxlength='600' placeholder='可填图片/视频 URL（如 https://...）' /></div>",
      "<button type='submit'>发布到" + (isDelta ? "三角洲讨论社区" : "充电社区") + "</button>",
      "</form>"
    ].join("");

    const postForm = document.getElementById("postForm");
    postForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const posts = loadPosts();

      const rawTitle = document.getElementById("postTitle").value;
      const rawContent = document.getElementById("postContent").value;
      const mediaType = document.getElementById("mediaType").value;
      const mediaUrl = document.getElementById("mediaUrl").value.trim();
      const topic = document.getElementById("postTopic").value;

      const checkedTitle = safeText(rawTitle || (activeTab === "delta" ? "未命名帖子" : "新动态"));
      const checkedContent = safeText(rawContent);
      if (!checkedTitle.ok || !checkedContent.ok) {
        showToast((checkedTitle.ok ? checkedContent : checkedTitle).msg);
        return;
      }
      if (!checkedContent.text) {
        showToast("请输入内容后再发布");
        return;
      }
      if (mediaType && !mediaUrl) {
        showToast("选择媒体类型后请填写 URL");
        return;
      }

      posts.unshift({
        id: crypto.randomUUID(),
        community: activeTab,
        title: checkedTitle.text,
        content: checkedContent.text,
        topic,
        likes: 0,
        liked: false,
        collected: false,
        comments: [],
        mediaType,
        mediaUrl,
        createdAt: nowStr()
      });

      savePosts(posts);
      showToast("发布成功");
      render();
    });
  }

  function renderTopics(posts) {
    const topicCount = {};
    posts
      .filter((item) => item.community === activeTab)
      .forEach((item) => {
        topicCount[item.topic] = (topicCount[item.topic] || 0) + 1;
      });

    const order = Object.entries(topicCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);

    topics.innerHTML = order.length
      ? order.map(([name, count]) => "<span>#" + name + " · " + count + "</span>").join("")
      : "<span>暂无话题，快来发布第一条</span>";
  }

  function drawMedia(post, target) {
    target.innerHTML = "";
    if (!post.mediaType || !post.mediaUrl) return;
    if (post.mediaType === "image") {
      const image = document.createElement("img");
      image.src = post.mediaUrl;
      image.alt = post.title;
      target.appendChild(image);
      return;
    }

    const video = document.createElement("video");
    video.src = post.mediaUrl;
    video.controls = true;
    video.preload = "metadata";
    target.appendChild(video);
  }

  function renderFeed(posts) {
    const selected = posts.filter((item) => item.community === activeTab);
    selected.sort((a, b) => {
      if (sortBy.value === "latest") return new Date(b.createdAt) - new Date(a.createdAt);
      return b.likes + b.comments.length * 2 - (a.likes + a.comments.length * 2);
    });

    feedList.innerHTML = "";
    if (!selected.length) {
      feedList.innerHTML = "<p>还没有内容，快发布第一条吧。</p>";
      return;
    }

    selected.forEach((post) => {
      const node = template.content.firstElementChild.cloneNode(true);
      node.querySelector(".post-title").textContent = post.title;
      node.querySelector(".meta").textContent = post.createdAt + " · 评论 " + post.comments.length;
      node.querySelector(".post-topic").textContent = post.topic;
      node.querySelector(".post-content").textContent = post.content;
      node.querySelector(".like-btn span").textContent = post.likes;
      drawMedia(post, node.querySelector(".media"));

      const likeBtn = node.querySelector(".like-btn");
      if (post.liked) likeBtn.classList.add("on");
      likeBtn.addEventListener("click", () => {
        const store = loadPosts();
        const target = store.find((item) => item.id === post.id);
        if (!target) return;
        target.liked = !target.liked;
        target.likes += target.liked ? 1 : -1;
        savePosts(store);
        render();
      });

      const collectBtn = node.querySelector(".collect-btn");
      collectBtn.classList.toggle("on", post.collected);
      collectBtn.addEventListener("click", () => {
        const store = loadPosts();
        const target = store.find((item) => item.id === post.id);
        if (!target) return;
        target.collected = !target.collected;
        savePosts(store);
        render();
      });

      const commentBox = node.querySelector(".comment-box");
      const commentList = node.querySelector(".comment-list");
      commentList.innerHTML = post.comments.length
        ? post.comments.map((item) => "<div class='comment'>" + item.text + "<br /><small>" + item.time + "</small></div>").join("")
        : "<p>还没有评论，抢个沙发～</p>";

      node.querySelector(".comment-toggle").addEventListener("click", () => {
        commentBox.classList.toggle("hidden");
      });

      node.querySelector(".comment-form").addEventListener("submit", (event) => {
        event.preventDefault();
        const input = event.target.querySelector("input");
        const checked = safeText(input.value);
        if (!checked.ok || !checked.text) {
          showToast(checked.ok ? "评论不能为空" : checked.msg);
          return;
        }

        const store = loadPosts();
        const target = store.find((item) => item.id === post.id);
        if (!target) return;
        target.comments.unshift({ id: crypto.randomUUID(), text: checked.text, time: nowStr() });
        savePosts(store);
        render();
      });

      feedList.appendChild(node);
    });
  }

  function render() {
    const posts = loadPosts();
    document.querySelectorAll(".tab").forEach((button) => {
      button.classList.toggle("active", button.dataset.tab === activeTab);
    });

    feedTitle.textContent = activeTab === "delta" ? "三角洲热帖" : "充电动态";
    buildComposer();
    renderTopics(posts);
    renderFeed(posts);
  }

  document.querySelectorAll(".tab").forEach((button) => {
    button.addEventListener("click", () => {
      activeTab = button.dataset.tab;
      render();
    });
  });

  sortBy.addEventListener("change", render);

  render();
})();
