-- COMB: shared rooms, IRC log, short questions. Rows are unowned (no accounts).

create table if not exists rooms (
  id text primary key,
  kind text not null,
  label text not null,
  public_code text,
  created_at timestamptz not null default now()
);

create unique index if not exists rooms_public_code_idx
  on rooms (public_code)
  where public_code is not null;

create table if not exists messages (
  id bigserial primary key,
  room_id text not null,
  author_key text not null,
  nick text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists messages_room_id_idx on messages (room_id, id);

create table if not exists questions (
  id bigserial primary key,
  room_id text not null,
  author_key text not null,
  nick text not null,
  title text not null,
  tag text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists questions_room_id_idx on questions (room_id, id desc);

create table if not exists answers (
  id bigserial primary key,
  question_id bigint not null,
  author_key text not null,
  nick text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists answers_question_id_idx on answers (question_id, id);

create table if not exists presence (
  room_id text not null,
  author_key text not null,
  nick text not null,
  seen_at timestamptz not null default now(),
  primary key (room_id, author_key)
);

insert into rooms (id, kind, label, public_code)
values ('street', 'street', '大通り', 'STREET')
on conflict (id) do nothing;

insert into messages (room_id, author_key, nick, body)
select
  'street',
  'system',
  'largo-0',
  '大通りが開いた。名前は largo-番号。同じルーターの内側は「この回線」。合わなければ合い言葉。'
where not exists (
  select 1 from messages where room_id = 'street' and author_key = 'system'
);
