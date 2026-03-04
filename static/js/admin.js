(function () {
  const script = document.currentScript;
  const supabaseUrl = script?.dataset?.supabaseUrl || "";
  const supabaseAnonKey = script?.dataset?.supabaseAnonKey || "";
  const ADMIN_EMAILS = ["3102850054@qq.com"];

  const statusEl = document.getElementById("status");
  const viewerTextEl = document.getElementById("viewerText");

  const postCountEl = document.getElementById("postCount");
  const commentCountEl = document.getElementById("commentCount");
  const userCountEl = document.getElementById("userCount");

  const postTableEl = document.getElementById("postTable");
  const commentTableEl = document.getElementById("commentTable");
  const userTableEl = document.getElementById("userTable");

  const refreshBtn = document.getElementById("refreshBtn");
  const logoutBtn = document.getElementById("logoutBtn");

  if (!supabaseUrl || !supabaseAnonKey) {
    statusEl.textContent = "缺少 Supabase 配置";
    statusEl.className = "status err";
    return;
  }

  const sb = window.supabase.createClient(supabaseUrl, supabaseAnonKey);
  let currentUser = null;

  function setStatus(text, kind) {
    statusEl.textContent = text;
    statusEl.className = "status" + (kind ? " " + kind : "");
  }

  function formatDate(input) {
    if (!input) return "-";
    return new Date(input).toLocaleString("zh-CN", { hour12: false });
  }

  function escapeHtml(input) {
    return String(input || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  async function requireAdmin() {
    const session = (await sb.auth.getSession()).data.session;
    if (!session?.user) {
      window.location.href = "/auth.html?next=/admin.html";
      return false;
    }

    currentUser = session.user;
    viewerTextEl.textContent = "已登录：" + (currentUser.email || currentUser.id);

    const emailAdmin = ADMIN_EMAILS.includes((currentUser.email || "").toLowerCase());
    if (emailAdmin) return true;

    const roleRes = await sb.from("profiles").select("role").eq("id", currentUser.id).maybeSingle();
    if (!roleRes.error && roleRes.data?.role === "admin") return true;

    setStatus("你没有管理权限，请联系管理员分配 admin 角色", "err");
    refreshBtn.disabled = true;
    return false;
  }

  async function loadMetrics() {
    const [postRes, commentRes, userRes] = await Promise.all([
      sb.from("community_posts").select("id", { count: "exact", head: true }),
      sb.from("community_comments").select("id", { count: "exact", head: true }),
      sb.from("profiles").select("id", { count: "exact", head: true })
    ]);

    postCountEl.textContent = postRes.error ? "-" : String(postRes.count || 0);
    commentCountEl.textContent = commentRes.error ? "-" : String(commentRes.count || 0);
    userCountEl.textContent = userRes.error ? "-" : String(userRes.count || 0);
  }

  async function loadPosts() {
    const postRes = await sb
      .from("community_posts")
      .select("id,title,author_name,community,created_at")
      .order("created_at", { ascending: false })
      .limit(40);

    if (postRes.error) {
      postTableEl.innerHTML = "<tr><td colspan='5'>无法加载帖子（可能尚未建表）</td></tr>";
      return;
    }

    const rows = postRes.data || [];
    if (!rows.length) {
      postTableEl.innerHTML = "<tr><td colspan='5'>暂无数据</td></tr>";
      return;
    }

    postTableEl.innerHTML = rows.map(function (row) {
      return "<tr>" +
        "<td>" + escapeHtml(row.title || "未命名") + "</td>" +
        "<td>" + escapeHtml(row.author_name || "匿名") + "</td>" +
        "<td>" + escapeHtml(row.community || "-") + "</td>" +
        "<td>" + formatDate(row.created_at) + "</td>" +
        "<td><button class='danger' data-post-id='" + row.id + "'>删除</button></td>" +
      "</tr>";
    }).join("");

    postTableEl.querySelectorAll("button[data-post-id]").forEach(function (button) {
      button.addEventListener("click", async function () {
        const postId = button.getAttribute("data-post-id");
        if (!confirm("确定删除这条帖子吗？")) return;

        const result = await sb.from("community_posts").delete().eq("id", postId);
        if (result.error) {
          setStatus("删除帖子失败：" + result.error.message, "err");
          return;
        }
        setStatus("帖子已删除", "ok");
        await refreshData();
      });
    });
  }

  async function loadComments() {
    const commentRes = await sb
      .from("community_comments")
      .select("id,post_id,text,author_name,created_at")
      .order("created_at", { ascending: false })
      .limit(60);

    if (commentRes.error) {
      commentTableEl.innerHTML = "<tr><td colspan='5'>无法加载评论（可能尚未建表）</td></tr>";
      return;
    }

    const rows = commentRes.data || [];
    if (!rows.length) {
      commentTableEl.innerHTML = "<tr><td colspan='5'>暂无数据</td></tr>";
      return;
    }

    commentTableEl.innerHTML = rows.map(function (row) {
      return "<tr>" +
        "<td>" + escapeHtml((row.text || "").slice(0, 90)) + "</td>" +
        "<td>" + escapeHtml(row.author_name || "匿名") + "</td>" +
        "<td>" + escapeHtml(row.post_id || "-") + "</td>" +
        "<td>" + formatDate(row.created_at) + "</td>" +
        "<td><button class='danger' data-comment-id='" + row.id + "'>删除</button></td>" +
      "</tr>";
    }).join("");

    commentTableEl.querySelectorAll("button[data-comment-id]").forEach(function (button) {
      button.addEventListener("click", async function () {
        const commentId = button.getAttribute("data-comment-id");
        if (!confirm("确定删除这条评论吗？")) return;

        const result = await sb.from("community_comments").delete().eq("id", commentId);
        if (result.error) {
          setStatus("删除评论失败：" + result.error.message, "err");
          return;
        }
        setStatus("评论已删除", "ok");
        await refreshData();
      });
    });
  }

  async function loadUsers() {
    const userRes = await sb
      .from("profiles")
      .select("id,display_name,role")
      .order("id", { ascending: true })
      .limit(120);

    if (userRes.error) {
      userTableEl.innerHTML = "<tr><td colspan='4'>无法加载用户（请先创建 profiles 表）</td></tr>";
      return;
    }

    const rows = userRes.data || [];
    if (!rows.length) {
      userTableEl.innerHTML = "<tr><td colspan='4'>暂无用户数据</td></tr>";
      return;
    }

    userTableEl.innerHTML = rows.map(function (row) {
      const role = row.role || "user";
      return "<tr>" +
        "<td>" + escapeHtml(row.id) + "</td>" +
        "<td>" + escapeHtml(row.display_name || "-") + "</td>" +
        "<td>" +
          "<select class='role' data-role-id='" + row.id + "'>" +
            "<option value='user'" + (role === "user" ? " selected" : "") + ">user</option>" +
            "<option value='moderator'" + (role === "moderator" ? " selected" : "") + ">moderator</option>" +
            "<option value='admin'" + (role === "admin" ? " selected" : "") + ">admin</option>" +
          "</select>" +
        "</td>" +
        "<td><button class='primary' data-save-role='" + row.id + "'>保存</button></td>" +
      "</tr>";
    }).join("");

    userTableEl.querySelectorAll("button[data-save-role]").forEach(function (button) {
      button.addEventListener("click", async function () {
        const userId = button.getAttribute("data-save-role");
        const select = userTableEl.querySelector("select[data-role-id='" + userId + "']");
        const nextRole = select.value;

        const result = await sb.from("profiles").update({ role: nextRole }).eq("id", userId);
        if (result.error) {
          setStatus("更新角色失败：" + result.error.message, "err");
          return;
        }
        setStatus("角色已更新", "ok");
      });
    });
  }

  async function refreshData() {
    setStatus("正在刷新数据...", "");
    await Promise.all([loadMetrics(), loadPosts(), loadComments(), loadUsers()]);
    setStatus("数据已更新", "ok");
  }

  refreshBtn.addEventListener("click", refreshData);
  logoutBtn.addEventListener("click", async function () {
    await sb.auth.signOut();
    window.location.href = "/auth.html";
  });

  (async function init() {
    const ok = await requireAdmin();
    if (!ok) return;
    await refreshData();
  })();
})();
