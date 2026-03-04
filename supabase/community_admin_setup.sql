-- 社区与管理台基础表（在 Supabase SQL Editor 执行）

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  role text default 'user' check (role in ('user', 'moderator', 'admin')),
  created_at timestamptz default now()
);

create table if not exists community_posts (
  id uuid primary key default gen_random_uuid(),
  community text not null check (community in ('delta', 'charge')),
  title text,
  content text not null,
  topic text,
  likes int not null default 0,
  author_id uuid references auth.users(id) on delete set null,
  author_name text,
  media_type text,
  media_url text,
  created_at timestamptz default now()
);

create table if not exists community_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references community_posts(id) on delete cascade,
  text text not null,
  author_id uuid references auth.users(id) on delete set null,
  author_name text,
  created_at timestamptz default now()
);

create table if not exists follows (
  id bigserial primary key,
  follower_id uuid not null references auth.users(id) on delete cascade,
  followee_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  unique(follower_id, followee_id)
);

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  text text not null,
  created_at timestamptz default now()
);

create table if not exists moderation_queue (
  id uuid primary key default gen_random_uuid(),
  source_type text,
  source_id text,
  content_preview text,
  reason text,
  submitter_id uuid references auth.users(id) on delete set null,
  submitter_name text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists operation_logs (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references auth.users(id) on delete set null,
  admin_email text,
  action text,
  target_type text,
  target_id text,
  detail text,
  created_at timestamptz default now()
);

alter table profiles enable row level security;
alter table community_posts enable row level security;
alter table community_comments enable row level security;
alter table follows enable row level security;
alter table notifications enable row level security;
alter table moderation_queue enable row level security;
alter table operation_logs enable row level security;

-- 通用读取策略
drop policy if exists "profiles_read_all" on profiles;
create policy "profiles_read_all" on profiles for select using (true);

drop policy if exists "posts_read_all" on community_posts;
create policy "posts_read_all" on community_posts for select using (true);

drop policy if exists "comments_read_all" on community_comments;
create policy "comments_read_all" on community_comments for select using (true);

-- 用户可写自己的资料
drop policy if exists "profiles_upsert_self" on profiles;
create policy "profiles_upsert_self" on profiles
for all using (auth.uid() = id) with check (auth.uid() = id);

-- 发帖、改帖、删帖
drop policy if exists "posts_insert_auth" on community_posts;
create policy "posts_insert_auth" on community_posts
for insert with check (auth.uid() is not null);

drop policy if exists "posts_update_owner_or_admin" on community_posts;
create policy "posts_update_owner_or_admin" on community_posts
for update using (
  auth.uid() = author_id
  or exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin', 'moderator'))
);

drop policy if exists "posts_delete_owner_or_admin" on community_posts;
create policy "posts_delete_owner_or_admin" on community_posts
for delete using (
  auth.uid() = author_id
  or exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin', 'moderator'))
);

-- 评论
drop policy if exists "comments_insert_auth" on community_comments;
create policy "comments_insert_auth" on community_comments
for insert with check (auth.uid() is not null);

drop policy if exists "comments_delete_owner_or_admin" on community_comments;
create policy "comments_delete_owner_or_admin" on community_comments
for delete using (
  auth.uid() = author_id
  or exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin', 'moderator'))
);

-- 关注与通知
drop policy if exists "follows_all_auth" on follows;
create policy "follows_all_auth" on follows
for all using (auth.uid() is not null) with check (auth.uid() is not null);

drop policy if exists "notifications_read_self" on notifications;
create policy "notifications_read_self" on notifications
for select using (auth.uid() = user_id);

drop policy if exists "notifications_insert_auth" on notifications;
create policy "notifications_insert_auth" on notifications
for insert with check (auth.uid() is not null);

-- 管理员可改角色
drop policy if exists "profiles_admin_update_roles" on profiles;
create policy "profiles_admin_update_roles" on profiles
for update using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
)
with check (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
);

-- 审核队列：登录用户可提交，管理员/版主可查看和处理
drop policy if exists "queue_insert_auth" on moderation_queue;
create policy "queue_insert_auth" on moderation_queue
for insert with check (auth.uid() is not null);

drop policy if exists "queue_read_admin_or_mod" on moderation_queue;
create policy "queue_read_admin_or_mod" on moderation_queue
for select using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin', 'moderator'))
);

drop policy if exists "queue_update_admin_or_mod" on moderation_queue;
create policy "queue_update_admin_or_mod" on moderation_queue
for update using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin', 'moderator'))
)
with check (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin', 'moderator'))
);

-- 操作日志：管理员/版主可记录，管理员/版主可读
drop policy if exists "logs_insert_admin_or_mod" on operation_logs;
create policy "logs_insert_admin_or_mod" on operation_logs
for insert with check (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin', 'moderator'))
);

drop policy if exists "logs_read_admin_or_mod" on operation_logs;
create policy "logs_read_admin_or_mod" on operation_logs
for select using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin', 'moderator'))
);

-- Storage: community-media bucket 需要在 Storage 创建并允许读取。
-- 可在 Storage policies 中设置：公开读，认证用户写。
