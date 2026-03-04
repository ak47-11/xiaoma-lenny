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
  const queueCountEl = document.getElementById("queueCount");
  const logCountEl = document.getElementById("logCount");

  const postTableEl = document.getElementById("postTable");
  const commentTableEl = document.getElementById("commentTable");
  const userTableEl = document.getElementById("userTable");
  const queueTableEl = document.getElementById("queueTable");
  const logTableEl = document.getElementById("logTable");

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

  async function logAction(action, targetType, targetId, detail) {
    const payload = {
      admin_id: currentUser?.id || null,
      admin_email: currentUser?.email || "unknown",
      action,
      target_type: targetType,
      target_id: String(targetId || ""),
      detail: detail || ""
    };

    await sb.from("operation_logs").insert(payload);
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
    if (emailAdmin) {
      await sb.from("profiles").upsert({ id: currentUser.id, display_name: currentUser.email || "admin", role: "admin" }, { onConflict: "id" });
      return true;
    }

    const roleRes = await sb.from("profiles").select("role").eq("id", currentUser.id).maybeSingle();
    if (!roleRes.error && roleRes.data?.role === "admin") return true;

    setStatus("你没有管理权限，请联系管理员分配 admin 角色", "err");
    refreshBtn.disabled = true;
    return false;
  }

  async function loadMetrics() {
    const [postRes, commentRes, userRes, queueRes, logRes] = await Promise.all([
      sb.from("community_posts").select("id", { count: "exact", head: true }),
      sb.from("community_comments").select("id", { count: "exact", head: true }),
      sb.from("profiles").select("id", { count: "exact", head: true }),
      sb.from("moderation_queue").select("id", { count: "exact", head: true }).eq("status", "pending"),
      sb.from("operation_logs").select("id", { count: "exact", head: true })
    ]);

    postCountEl.textContent = postRes.error ? "-" : String(postRes.count || 0);
    commentCountEl.textContent = commentRes.error ? "-" : String(commentRes.count || 0);
    userCountEl.textContent = userRes.error ? "-" : String(userRes.count || 0);
    queueCountEl.textContent = queueRes.error ? "-" : String(queueRes.count || 0);
    logCountEl.textContent = logRes.error ? "-" : String(logRes.count || 0);
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
        await logAction("delete_post", "community_posts", postId, "管理员删除帖子");
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
        await logAction("delete_comment", "community_comments", commentId, "管理员删除评论");
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
        await logAction("update_role", "profiles", userId, "角色更新为: " + nextRole);
        setStatus("角色已更新", "ok");
      });
    });
  }

  async function loadQueue() {
    const queueRes = await sb
      .from("moderation_queue")
      .select("id,content_preview,reason,source_type,source_id,submitter_name,status,created_at")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(80);

    if (queueRes.error) {
      queueTableEl.innerHTML = "<tr><td colspan='5'>无法加载审核队列（请先创建 moderation_queue 表）</td></tr>";
      return;
    }

    const rows = queueRes.data || [];
    if (!rows.length) {
      queueTableEl.innerHTML = "<tr><td colspan='5'>暂无待审核内容</td></tr>";
      return;
    }

    queueTableEl.innerHTML = rows.map(function (row) {
      return "<tr>" +
        "<td>" + escapeHtml((row.content_preview || "").slice(0, 80)) + "</td>" +
        "<td>" + escapeHtml(row.reason || "敏感词命中") + "</td>" +
        "<td>" + escapeHtml(row.submitter_name || "匿名") + "</td>" +
        "<td>" + formatDate(row.created_at) + "</td>" +
        "<td>" +
          "<button class='primary' data-approve='" + row.id + "'>放行</button> " +
          "<button class='danger' data-reject='" + row.id + "' data-source-type='" + escapeHtml(row.source_type || "") + "' data-source-id='" + escapeHtml(row.source_id || "") + "'>驳回</button>" +
        "</td>" +
      "</tr>";
    }).join("");

    queueTableEl.querySelectorAll("button[data-approve]").forEach(function (button) {
      button.addEventListener("click", async function () {
        const id = button.getAttribute("data-approve");
        const result = await sb.from("moderation_queue").update({ status: "approved", reviewed_by: currentUser.id, reviewed_at: new Date().toISOString() }).eq("id", id);
        if (result.error) {
          setStatus("放行失败：" + result.error.message, "err");
          return;
        }
        await logAction("approve_queue", "moderation_queue", id, "放行敏感词队列内容");
        setStatus("已放行", "ok");
        await refreshData();
      });
    });

    queueTableEl.querySelectorAll("button[data-reject]").forEach(function (button) {
      button.addEventListener("click", async function () {
        const id = button.getAttribute("data-reject");
        const sourceType = button.getAttribute("data-source-type");
        const sourceId = button.getAttribute("data-source-id");

        const markRes = await sb.from("moderation_queue").update({ status: "rejected", reviewed_by: currentUser.id, reviewed_at: new Date().toISOString() }).eq("id", id);
        if (markRes.error) {
          setStatus("驳回失败：" + markRes.error.message, "err");
          return;
        }

        if (sourceType === "post" && sourceId) {
          await sb.from("community_posts").delete().eq("id", sourceId);
        }
        if (sourceType === "comment" && sourceId) {
          await sb.from("community_comments").delete().eq("id", sourceId);
        }

        await logAction("reject_queue", "moderation_queue", id, "驳回并删除源内容: " + sourceType + "#" + sourceId);
        setStatus("已驳回并处理源内容", "ok");
        await refreshData();
      });
    });
  }

  async function loadLogs() {
    const logRes = await sb
      .from("operation_logs")
      .select("id,admin_email,action,target_type,target_id,detail,created_at")
      .order("created_at", { ascending: false })
      .limit(80);

    if (logRes.error) {
      logTableEl.innerHTML = "<tr><td colspan='5'>无法加载操作日志（请先创建 operation_logs 表）</td></tr>";
      return;
    }

    const rows = logRes.data || [];
    if (!rows.length) {
      logTableEl.innerHTML = "<tr><td colspan='5'>暂无日志</td></tr>";
      return;
    }

    logTableEl.innerHTML = rows.map(function (row) {
      return "<tr>" +
        "<td>" + escapeHtml(row.admin_email || "-") + "</td>" +
        "<td>" + escapeHtml(row.action || "-") + "</td>" +
        "<td>" + escapeHtml((row.target_type || "-") + "#" + (row.target_id || "-")) + "</td>" +
        "<td>" + escapeHtml(row.detail || "-") + "</td>" +
        "<td>" + formatDate(row.created_at) + "</td>" +
      "</tr>";
    }).join("");
  }

  async function refreshData() {
    setStatus("正在刷新数据...", "");
    await Promise.all([loadMetrics(), loadPosts(), loadComments(), loadUsers(), loadQueue(), loadLogs()]);
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
