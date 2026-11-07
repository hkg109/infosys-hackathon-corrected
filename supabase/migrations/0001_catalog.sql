-- 공통 학과 자료(공식 자료 수집 → 검토 → 게시). 개인 플랜은 브라우저에 저장하므로 여기 없다.

create table if not exists data_sources (
  id text primary key,
  title text not null,
  url text not null,
  kind text not null check (kind in ('api', 'public_page', 'manual')),
  scope text not null default '',
  access_note text not null default ''
);

create table if not exists collection_runs (
  id bigint generated always as identity primary key,
  source_id text not null references data_sources(id),
  collected_at timestamptz not null default now(),
  status text not null check (status in ('success', 'failed')),
  raw_hash text,
  parser_version text not null,
  error_summary text
);

create table if not exists catalog_versions (
  id bigint generated always as identity primary key,
  version text not null unique,
  campus text not null,
  department text not null,
  curriculum text not null,
  status text not null default 'draft' check (status in ('draft', 'reviewed', 'published', 'archived')),
  collected_at date not null,
  published_at timestamptz,
  unknowns jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

-- 학과·교육과정마다 게시본은 하나만
create unique index if not exists one_published_per_scope
  on catalog_versions (campus, department, curriculum)
  where status = 'published';

create table if not exists courses (
  catalog_version_id bigint not null references catalog_versions(id) on delete cascade,
  course_code text not null,
  name text not null,
  credits numeric(3,1) not null check (credits > 0),
  recommended_year smallint,
  semester smallint check (semester in (0, 1, 2)),
  offering_end_year smallint,
  category text,
  prerequisites text[] not null default '{}',
  prerequisite_status text not null default 'unknown' check (prerequisite_status in ('verified', 'assumed', 'unknown')),
  source_id text not null references data_sources(id),
  primary key (catalog_version_id, course_code)
);

-- 서비스의 진로 추천(학교 공식 정보와 분리)
create table if not exists career_tags (
  catalog_version_id bigint not null references catalog_versions(id) on delete cascade,
  course_code text not null,
  "group" text not null check ("group" in ('common', 'security', 'data')),
  reason text not null,
  primary key (catalog_version_id, course_code)
);

create table if not exists academic_rules (
  catalog_version_id bigint not null references catalog_versions(id) on delete cascade,
  rule_key text not null,
  value text not null,
  status text not null check (status in ('verified', 'assumed', 'unknown')),
  source_id text references data_sources(id),
  note text not null default '',
  primary key (catalog_version_id, rule_key)
);

-- 게시 전환: 같은 범위의 기존 게시본을 보관하고 새 버전을 게시한다(한 트랜잭션).
create or replace function publish_catalog_version(target_version text)
returns void language plpgsql security definer set search_path = public as $$
declare v catalog_versions;
begin
  select * into v from catalog_versions where version = target_version for update;
  if v is null then raise exception 'version % not found', target_version; end if;
  if v.status <> 'reviewed' then raise exception 'version % is %, expected reviewed', target_version, v.status; end if;
  if not exists (select 1 from courses where catalog_version_id = v.id) then
    raise exception 'version % has no courses', target_version;
  end if;
  update catalog_versions set status = 'archived'
    where campus = v.campus and department = v.department and curriculum = v.curriculum and status = 'published';
  update catalog_versions set status = 'published', published_at = now() where id = v.id;
end $$;

revoke execute on function publish_catalog_version(text) from public, anon, authenticated;

-- RLS: 방문자는 게시본만 읽고, 쓰기는 service role(import 스크립트)만
alter table data_sources enable row level security;
alter table collection_runs enable row level security;
alter table catalog_versions enable row level security;
alter table courses enable row level security;
alter table career_tags enable row level security;
alter table academic_rules enable row level security;

create policy "read sources" on data_sources for select using (true);
create policy "read published versions" on catalog_versions for select using (status = 'published');
create policy "read published courses" on courses for select using (
  exists (select 1 from catalog_versions v where v.id = catalog_version_id and v.status = 'published'));
create policy "read published tags" on career_tags for select using (
  exists (select 1 from catalog_versions v where v.id = catalog_version_id and v.status = 'published'));
create policy "read published rules" on academic_rules for select using (
  exists (select 1 from catalog_versions v where v.id = catalog_version_id and v.status = 'published'));
