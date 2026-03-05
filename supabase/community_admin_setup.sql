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
begin
  if new.username is not null then
    new.username := lower(trim(new.username));
    if new.username !~ '^[a-z0-9_]{3,24}$' then
      raise exception 'username must match ^[a-z0-9_]{3,24}$';
    end if;
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

-- Storage 说明：community-media bucket 建议设置“公开读 + 登录写”策略。
