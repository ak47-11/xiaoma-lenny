-- 社区与管理台强鉴权初始化脚本（在 Supabase SQL Editor 执行）
-- 执行后可解决 profiles 缺字段（如 bio/contact）与角色权限过宽问题

create extension if not exists pgcrypto;

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text,
  display_name text,
  bio text,
  contact text,
  role text default 'user' check (role in ('user', 'moderator', 'admin')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table profiles add column if not exists username text;
alter table profiles add column if not exists display_name text;
alter table profiles add column if not exists bio text;
alter table profiles add column if not exists contact text;
alter table profiles add column if not exists role text default 'user';
alter table profiles add column if not exists created_at timestamptz default now();
alter table profiles add column if not exists updated_at timestamptz default now();

create unique index if not exists profiles_username_unique_idx
on profiles (lower(username))
where username is not null;

create table if not exists community_posts (
  id uuid primary key default gen_random_uuid(),
  community text not null check (community in ('delta', 'charge')),
  title text,
  content text not null,
  topic text,
  likes int not null default 0,
  author_id uuid not null references auth.users(id) on delete cascade,
  author_name text,
  media_type text,
  media_url text,
  created_at timestamptz default now()
);

create table if not exists community_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references community_posts(id) on delete cascade,
  text text not null,
  author_id uuid not null references auth.users(id) on delete cascade,
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
  submitter_id uuid not null references auth.users(id) on delete cascade,
  submitter_name text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists operation_logs (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references auth.users(id) on delete cascade,
  admin_email text,
  action text,
  target_type text,
  target_id text,
  detail text,
  created_at timestamptz default now()
);

create table if not exists m_posts (
  id uuid primary key default gen_random_uuid(),
  content text not null check (char_length(content) <= 280),
  media_url text,
  author_id uuid not null references auth.users(id) on delete cascade,
  author_name text,
  created_at timestamptz default now()
);

create table if not exists m_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references m_posts(id) on delete cascade,
  text text not null check (char_length(text) <= 300),
  author_id uuid not null references auth.users(id) on delete cascade,
  author_name text,
  created_at timestamptz default now()
);

create table if not exists m_reactions (
  id bigserial primary key,
  post_id uuid not null references m_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reaction_type text not null check (reaction_type in ('like', 'repost')),
  created_at timestamptz default now(),
  unique(post_id, user_id, reaction_type)
);

create index if not exists m_posts_created_at_idx on m_posts (created_at desc);
create index if not exists m_comments_post_created_idx on m_comments (post_id, created_at desc);
create index if not exists m_reactions_post_type_idx on m_reactions (post_id, reaction_type);
create unique index if not exists m_reactions_unique_idx on m_reactions (post_id, user_id, reaction_type);

create table if not exists mi_videos (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) <= 120),
  summary text,
  video_url text not null,
  cover_url text,
  category text not null default '综合推荐',
  duration_text text,
  tags text[] not null default '{}',
  play_count int not null default 0,
  like_count int not null default 0,
  favorite_count int not null default 0,
  author_id uuid not null references auth.users(id) on delete cascade,
  author_name text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists mi_video_actions (
  id bigserial primary key,
  video_id uuid not null references mi_videos(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  action_type text not null check (action_type in ('like', 'favorite')),
  created_at timestamptz default now(),
  unique(video_id, user_id, action_type)
);

create table if not exists mi_video_comments (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references mi_videos(id) on delete cascade,
  text text not null check (char_length(text) <= 500),
  author_id uuid not null references auth.users(id) on delete cascade,
  author_name text,
  created_at timestamptz default now()
);

create table if not exists mi_video_views (
  id bigserial primary key,
  video_id uuid not null references mi_videos(id) on delete cascade,
  viewer_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  unique(video_id, viewer_id)
);

create index if not exists mi_videos_created_at_idx on mi_videos (created_at desc);
create index if not exists mi_videos_category_idx on mi_videos (category);
create index if not exists mi_video_comments_video_created_idx on mi_video_comments (video_id, created_at desc);
create unique index if not exists mi_video_actions_unique_idx on mi_video_actions (video_id, user_id, action_type);
create unique index if not exists mi_video_views_unique_idx on mi_video_views (video_id, viewer_id);

create table if not exists lenny_articles (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) <= 160),
  summary text,
  content text not null,
  article_type text not null check (article_type in ('blog', 'tutorial', 'analysis')),
  tags text[] not null default '{}',
  read_count int not null default 0,
  like_count int not null default 0,
  bookmark_count int not null default 0,
  author_id uuid not null references auth.users(id) on delete cascade,
  author_name text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists lenny_article_actions (
  id bigserial primary key,
  article_id uuid not null references lenny_articles(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  action_type text not null check (action_type in ('like', 'bookmark')),
  created_at timestamptz default now(),
  unique(article_id, user_id, action_type)
);

create table if not exists lenny_article_comments (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references lenny_articles(id) on delete cascade,
  text text not null check (char_length(text) <= 800),
  author_id uuid not null references auth.users(id) on delete cascade,
  author_name text,
  created_at timestamptz default now()
);

create table if not exists lenny_article_reads (
  id bigserial primary key,
  article_id uuid not null references lenny_articles(id) on delete cascade,
  reader_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  unique(article_id, reader_id)
);

create index if not exists lenny_articles_created_at_idx on lenny_articles (created_at desc);
create index if not exists lenny_articles_type_idx on lenny_articles (article_type);
create index if not exists lenny_article_comments_article_created_idx on lenny_article_comments (article_id, created_at desc);
create unique index if not exists lenny_article_actions_unique_idx on lenny_article_actions (article_id, user_id, action_type);
create unique index if not exists lenny_article_reads_unique_idx on lenny_article_reads (article_id, reader_id);

alter table m_posts add column if not exists content text;
alter table m_posts add column if not exists media_url text;
alter table m_posts add column if not exists author_id uuid;
alter table m_posts add column if not exists author_name text;
alter table m_posts add column if not exists created_at timestamptz default now();

alter table m_comments add column if not exists post_id uuid;
alter table m_comments add column if not exists text text;
alter table m_comments add column if not exists author_id uuid;
alter table m_comments add column if not exists author_name text;
alter table m_comments add column if not exists created_at timestamptz default now();

alter table m_reactions add column if not exists post_id uuid;
alter table m_reactions add column if not exists user_id uuid;
alter table m_reactions add column if not exists reaction_type text;
alter table m_reactions add column if not exists created_at timestamptz default now();

alter table mi_videos add column if not exists title text;
alter table mi_videos add column if not exists summary text;
alter table mi_videos add column if not exists video_url text;
alter table mi_videos add column if not exists cover_url text;
alter table mi_videos add column if not exists category text default '综合推荐';
alter table mi_videos add column if not exists duration_text text;
alter table mi_videos add column if not exists tags text[] not null default '{}';
alter table mi_videos add column if not exists play_count int not null default 0;
alter table mi_videos add column if not exists like_count int not null default 0;
alter table mi_videos add column if not exists favorite_count int not null default 0;
alter table mi_videos add column if not exists author_id uuid;
alter table mi_videos add column if not exists author_name text;
alter table mi_videos add column if not exists created_at timestamptz default now();
alter table mi_videos add column if not exists updated_at timestamptz default now();

alter table mi_video_actions add column if not exists video_id uuid;
alter table mi_video_actions add column if not exists user_id uuid;
alter table mi_video_actions add column if not exists action_type text;
alter table mi_video_actions add column if not exists created_at timestamptz default now();

alter table mi_video_comments add column if not exists video_id uuid;
alter table mi_video_comments add column if not exists text text;
alter table mi_video_comments add column if not exists author_id uuid;
alter table mi_video_comments add column if not exists author_name text;
alter table mi_video_comments add column if not exists created_at timestamptz default now();

alter table mi_video_views add column if not exists video_id uuid;
alter table mi_video_views add column if not exists viewer_id uuid;
alter table mi_video_views add column if not exists created_at timestamptz default now();

alter table lenny_articles add column if not exists title text;
alter table lenny_articles add column if not exists summary text;
alter table lenny_articles add column if not exists content text;
alter table lenny_articles add column if not exists article_type text;
alter table lenny_articles add column if not exists tags text[] not null default '{}';
alter table lenny_articles add column if not exists read_count int not null default 0;
alter table lenny_articles add column if not exists like_count int not null default 0;
alter table lenny_articles add column if not exists bookmark_count int not null default 0;
alter table lenny_articles add column if not exists author_id uuid;
alter table lenny_articles add column if not exists author_name text;
alter table lenny_articles add column if not exists created_at timestamptz default now();
alter table lenny_articles add column if not exists updated_at timestamptz default now();

alter table lenny_article_actions add column if not exists article_id uuid;
alter table lenny_article_actions add column if not exists user_id uuid;
alter table lenny_article_actions add column if not exists action_type text;
alter table lenny_article_actions add column if not exists created_at timestamptz default now();

alter table lenny_article_comments add column if not exists article_id uuid;
alter table lenny_article_comments add column if not exists text text;
alter table lenny_article_comments add column if not exists author_id uuid;
alter table lenny_article_comments add column if not exists author_name text;
alter table lenny_article_comments add column if not exists created_at timestamptz default now();

alter table lenny_article_reads add column if not exists article_id uuid;
alter table lenny_article_reads add column if not exists reader_id uuid;
alter table lenny_article_reads add column if not exists created_at timestamptz default now();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_set_updated_at on profiles;
create trigger trg_profiles_set_updated_at
before update on profiles
for each row
execute function public.set_updated_at();

drop trigger if exists trg_mi_videos_set_updated_at on mi_videos;
create trigger trg_mi_videos_set_updated_at
before update on mi_videos
for each row
execute function public.set_updated_at();

drop trigger if exists trg_lenny_articles_set_updated_at on lenny_articles;
create trigger trg_lenny_articles_set_updated_at
before update on lenny_articles
for each row
execute function public.set_updated_at();

create or replace function public.is_admin(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from profiles p
    where p.id = uid and p.role = 'admin'
  );
$$;

create or replace function public.is_admin_or_moderator(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from profiles p
    where p.id = uid and p.role in ('admin', 'moderator')
  );
$$;

create or replace function public.profiles_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  jwt_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
  is_privileged boolean := (
    jwt_role = 'service_role'
    or current_user in ('postgres', 'supabase_admin', 'supabase_auth_admin', 'service_role')
  );
begin
  if new.username is not null then
    new.username := lower(trim(new.username));
    if new.username !~ '^[a-z0-9_]{3,24}$' then
      raise exception 'username must match ^[a-z0-9_]{3,24}$';
    end if;
  end if;

  if is_privileged then
    if new.role is null then
      new.role := 'user';
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.role is null then
      new.role := 'user';
    end if;
    if new.role <> 'user' and not public.is_admin(auth.uid()) then
      raise exception 'only admin can assign elevated role';
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.role is distinct from old.role and not public.is_admin(auth.uid()) then
      raise exception 'only admin can change role';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_profiles_guard on profiles;
create trigger trg_profiles_guard
before insert or update on profiles
for each row
execute function public.profiles_guard();

alter table profiles enable row level security;
alter table community_posts enable row level security;
alter table community_comments enable row level security;
alter table follows enable row level security;
alter table notifications enable row level security;
alter table moderation_queue enable row level security;
alter table operation_logs enable row level security;
alter table m_posts enable row level security;
alter table m_comments enable row level security;
alter table m_reactions enable row level security;
alter table mi_videos enable row level security;
alter table mi_video_actions enable row level security;
alter table mi_video_comments enable row level security;
alter table mi_video_views enable row level security;
alter table lenny_articles enable row level security;
alter table lenny_article_actions enable row level security;
alter table lenny_article_comments enable row level security;
alter table lenny_article_reads enable row level security;

-- 清理旧策略名
drop policy if exists "profiles_read_all" on profiles;
drop policy if exists "profiles_upsert_self" on profiles;
drop policy if exists "profiles_admin_update_roles" on profiles;
drop policy if exists "posts_read_all" on community_posts;
drop policy if exists "posts_insert_auth" on community_posts;
drop policy if exists "posts_update_owner_or_admin" on community_posts;
drop policy if exists "posts_delete_owner_or_admin" on community_posts;
drop policy if exists "comments_read_all" on community_comments;
drop policy if exists "comments_insert_auth" on community_comments;
drop policy if exists "comments_delete_owner_or_admin" on community_comments;
drop policy if exists "follows_all_auth" on follows;
drop policy if exists "notifications_read_self" on notifications;
drop policy if exists "notifications_insert_auth" on notifications;
drop policy if exists "queue_insert_auth" on moderation_queue;
drop policy if exists "queue_read_admin_or_mod" on moderation_queue;
drop policy if exists "queue_update_admin_or_mod" on moderation_queue;
drop policy if exists "logs_insert_admin_or_mod" on operation_logs;
drop policy if exists "logs_read_admin_or_mod" on operation_logs;
drop policy if exists "m_posts_select_public" on m_posts;
drop policy if exists "m_posts_insert_self" on m_posts;
drop policy if exists "m_posts_update_owner_or_admin" on m_posts;
drop policy if exists "m_posts_delete_owner_or_admin" on m_posts;
drop policy if exists "m_comments_select_public" on m_comments;
drop policy if exists "m_comments_insert_self" on m_comments;
drop policy if exists "m_comments_delete_owner_or_admin" on m_comments;
drop policy if exists "m_reactions_select_public" on m_reactions;
drop policy if exists "m_reactions_insert_self" on m_reactions;
drop policy if exists "m_reactions_delete_self_or_admin" on m_reactions;
drop policy if exists "mi_videos_select_public" on mi_videos;
drop policy if exists "mi_videos_insert_self" on mi_videos;
drop policy if exists "mi_videos_update_owner_or_admin" on mi_videos;
drop policy if exists "mi_videos_delete_owner_or_admin" on mi_videos;
drop policy if exists "mi_video_actions_select_public" on mi_video_actions;
drop policy if exists "mi_video_actions_insert_self" on mi_video_actions;
drop policy if exists "mi_video_actions_delete_self_or_admin" on mi_video_actions;
drop policy if exists "mi_video_comments_select_public" on mi_video_comments;
drop policy if exists "mi_video_comments_insert_self" on mi_video_comments;
drop policy if exists "mi_video_comments_delete_owner_or_admin" on mi_video_comments;
drop policy if exists "mi_video_views_select_public" on mi_video_views;
drop policy if exists "mi_video_views_insert_self" on mi_video_views;
drop policy if exists "mi_video_views_delete_self_or_admin" on mi_video_views;
drop policy if exists "lenny_articles_select_public" on lenny_articles;
drop policy if exists "lenny_articles_insert_self" on lenny_articles;
drop policy if exists "lenny_articles_update_owner_or_admin" on lenny_articles;
drop policy if exists "lenny_articles_delete_owner_or_admin" on lenny_articles;
drop policy if exists "lenny_article_actions_select_public" on lenny_article_actions;
drop policy if exists "lenny_article_actions_insert_self" on lenny_article_actions;
drop policy if exists "lenny_article_actions_delete_self_or_admin" on lenny_article_actions;
drop policy if exists "lenny_article_comments_select_public" on lenny_article_comments;
drop policy if exists "lenny_article_comments_insert_self" on lenny_article_comments;
drop policy if exists "lenny_article_comments_delete_owner_or_admin" on lenny_article_comments;
drop policy if exists "lenny_article_reads_select_public" on lenny_article_reads;
drop policy if exists "lenny_article_reads_insert_self" on lenny_article_reads;
drop policy if exists "lenny_article_reads_delete_self_or_admin" on lenny_article_reads;

-- Profiles
create policy "profiles_select_public"
on profiles for select
using (true);

create policy "profiles_insert_self"
on profiles for insert
with check (auth.uid() = id);

create policy "profiles_update_self_or_admin"
on profiles for update
using (auth.uid() = id or public.is_admin(auth.uid()))
with check (auth.uid() = id or public.is_admin(auth.uid()));

-- Posts
create policy "posts_select_public"
on community_posts for select
using (true);

create policy "posts_insert_self"
on community_posts for insert
with check (auth.uid() = author_id);

create policy "posts_update_owner_or_admin"
on community_posts for update
using (auth.uid() = author_id or public.is_admin_or_moderator(auth.uid()))
with check (auth.uid() = author_id or public.is_admin_or_moderator(auth.uid()));

create policy "posts_delete_owner_or_admin"
on community_posts for delete
using (auth.uid() = author_id or public.is_admin_or_moderator(auth.uid()));

-- Comments
create policy "comments_select_public"
on community_comments for select
using (true);

create policy "comments_insert_self"
on community_comments for insert
with check (auth.uid() = author_id);

create policy "comments_delete_owner_or_admin"
on community_comments for delete
using (auth.uid() = author_id or public.is_admin_or_moderator(auth.uid()));

-- Follows
create policy "follows_select_auth"
on follows for select
using (auth.uid() is not null);

create policy "follows_insert_self"
on follows for insert
with check (auth.uid() = follower_id);

create policy "follows_delete_self_or_admin"
on follows for delete
using (auth.uid() = follower_id or public.is_admin(auth.uid()));

-- Notifications
create policy "notifications_select_self"
on notifications for select
using (auth.uid() = user_id);

create policy "notifications_insert_auth"
on notifications for insert
with check (auth.uid() is not null);

-- Moderation queue
create policy "queue_insert_self"
on moderation_queue for insert
with check (auth.uid() = submitter_id);

create policy "queue_select_admin_or_mod"
on moderation_queue for select
using (public.is_admin_or_moderator(auth.uid()));

create policy "queue_update_admin_or_mod"
on moderation_queue for update
using (public.is_admin_or_moderator(auth.uid()))
with check (public.is_admin_or_moderator(auth.uid()));

-- Operation logs
create policy "logs_select_admin_or_mod"
on operation_logs for select
using (public.is_admin_or_moderator(auth.uid()));

create policy "logs_insert_admin_or_mod"
on operation_logs for insert
with check (
  public.is_admin_or_moderator(auth.uid())
  and auth.uid() = admin_id
);

-- M posts / comments / reactions
create policy "m_posts_select_public"
on m_posts for select
using (true);

create policy "m_posts_insert_self"
on m_posts for insert
with check (auth.uid() = author_id);

create policy "m_posts_update_owner_or_admin"
on m_posts for update
using (auth.uid() = author_id or public.is_admin_or_moderator(auth.uid()))
with check (auth.uid() = author_id or public.is_admin_or_moderator(auth.uid()));

create policy "m_posts_delete_owner_or_admin"
on m_posts for delete
using (auth.uid() = author_id or public.is_admin_or_moderator(auth.uid()));

create policy "m_comments_select_public"
on m_comments for select
using (true);

create policy "m_comments_insert_self"
on m_comments for insert
with check (auth.uid() = author_id);

create policy "m_comments_delete_owner_or_admin"
on m_comments for delete
using (auth.uid() = author_id or public.is_admin_or_moderator(auth.uid()));

create policy "m_reactions_select_public"
on m_reactions for select
using (true);

create policy "m_reactions_insert_self"
on m_reactions for insert
with check (auth.uid() = user_id);

create policy "m_reactions_delete_self_or_admin"
on m_reactions for delete
using (auth.uid() = user_id or public.is_admin_or_moderator(auth.uid()));

-- Mi videos / actions / comments
create policy "mi_videos_select_public"
on mi_videos for select
using (true);

create policy "mi_videos_insert_self"
on mi_videos for insert
with check (auth.uid() = author_id);

create policy "mi_videos_update_owner_or_admin"
on mi_videos for update
using (auth.uid() = author_id or public.is_admin_or_moderator(auth.uid()))
with check (auth.uid() = author_id or public.is_admin_or_moderator(auth.uid()));

create policy "mi_videos_delete_owner_or_admin"
on mi_videos for delete
using (auth.uid() = author_id or public.is_admin_or_moderator(auth.uid()));

create policy "mi_video_actions_select_public"
on mi_video_actions for select
using (true);

create policy "mi_video_actions_insert_self"
on mi_video_actions for insert
with check (auth.uid() = user_id);

create policy "mi_video_actions_delete_self_or_admin"
on mi_video_actions for delete
using (auth.uid() = user_id or public.is_admin_or_moderator(auth.uid()));

create policy "mi_video_comments_select_public"
on mi_video_comments for select
using (true);

create policy "mi_video_comments_insert_self"
on mi_video_comments for insert
with check (auth.uid() = author_id);

create policy "mi_video_comments_delete_owner_or_admin"
on mi_video_comments for delete
using (auth.uid() = author_id or public.is_admin_or_moderator(auth.uid()));

create policy "mi_video_views_select_public"
on mi_video_views for select
using (true);

create policy "mi_video_views_insert_self"
on mi_video_views for insert
with check (auth.uid() = viewer_id);

create policy "mi_video_views_delete_self_or_admin"
on mi_video_views for delete
using (auth.uid() = viewer_id or public.is_admin_or_moderator(auth.uid()));

-- Lenny articles / actions / comments
create policy "lenny_articles_select_public"
on lenny_articles for select
using (true);

create policy "lenny_articles_insert_self"
on lenny_articles for insert
with check (auth.uid() = author_id);

create policy "lenny_articles_update_owner_or_admin"
on lenny_articles for update
using (auth.uid() = author_id or public.is_admin_or_moderator(auth.uid()))
with check (auth.uid() = author_id or public.is_admin_or_moderator(auth.uid()));

create policy "lenny_articles_delete_owner_or_admin"
on lenny_articles for delete
using (auth.uid() = author_id or public.is_admin_or_moderator(auth.uid()));

create policy "lenny_article_actions_select_public"
on lenny_article_actions for select
using (true);

create policy "lenny_article_actions_insert_self"
on lenny_article_actions for insert
with check (auth.uid() = user_id);

create policy "lenny_article_actions_delete_self_or_admin"
on lenny_article_actions for delete
using (auth.uid() = user_id or public.is_admin_or_moderator(auth.uid()));

create policy "lenny_article_comments_select_public"
on lenny_article_comments for select
using (true);

create policy "lenny_article_comments_insert_self"
on lenny_article_comments for insert
with check (auth.uid() = author_id);

create policy "lenny_article_comments_delete_owner_or_admin"
on lenny_article_comments for delete
using (auth.uid() = author_id or public.is_admin_or_moderator(auth.uid()));

create policy "lenny_article_reads_select_public"
on lenny_article_reads for select
using (true);

create policy "lenny_article_reads_insert_self"
on lenny_article_reads for insert
with check (auth.uid() = reader_id);

create policy "lenny_article_reads_delete_self_or_admin"
on lenny_article_reads for delete
using (auth.uid() = reader_id or public.is_admin_or_moderator(auth.uid()));

-- Storage 说明：community-media bucket 建议设置“公开读 + 登录写”策略。
