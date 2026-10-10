-- The catalogue of Blockbench models, first version.
--
-- Applied with `wrangler d1 migrations apply`, once, and never edited afterwards: an
-- edited migration is a database that differs between the machine it was written on
-- and the one it runs on. Anything that changes goes into the next numbered file.
--
-- Times are ISO 8601 strings written by the Worker (`new Date().toISOString()`), so
-- that they compare correctly as text and read the same in every client.

-- People. Not keyed by any provider's id: one person may sign in through Discord on
-- one day and GitHub on another, and both have to land on the same models.
create table users (
  id           text primary key,
  handle       text not null,
  face         text,
  -- The provider the account was made through. Its name and picture are the ones
  -- shown; signing in through the other one does not overwrite them.
  via          text not null,
  created      text not null,
  seen         text not null,
  -- Set by hand by whoever runs the site. The automatic wait after a second copied
  -- upload is worked out from `attempts` instead, so it expires on its own.
  barred_until text
);

-- Which outside accounts are which person. Keyed by the provider's own id and never
-- by a name: names change, and a table keyed by one loses track of whose models are
-- whose the first time somebody renames themselves.
create table identities (
  provider text not null,
  subject  text not null,
  user_id  text not null references users(id) on delete cascade,
  handle   text not null,
  face     text,
  primary key (provider, subject)
);

create index identities_user on identities (user_id);

create table models (
  id             text primary key,
  owner          text not null references users(id) on delete cascade,
  name           text not null,
  description    text not null default '',

  -- What the uploading page found in the file. The server never opens the file; each
  -- page that opens it counts again and says so when the numbers disagree.
  format         text not null,
  version        text not null,
  box_uv         integer not null,
  cubes          integer not null,
  meshes         integer not null,
  bones          integer not null,
  animations     integer not null,
  textures       integer not null,
  embedded       integer not null,
  texture_width  integer not null,
  texture_height integer not null,
  density        real not null,

  -- The file's bytes, checked by R2 as they arrive.
  sha256         text not null,
  -- The model with its paint: equal means the same model, however it was saved.
  print          text not null,
  -- The geometry alone: equal means somebody repainted the same model.
  shape          text not null,
  bytes          integer not null,

  -- 'incoming' from the moment the row exists until the file is in the bucket.
  state          text not null default 'incoming',
  has_preview    integer not null default 0,
  visibility     text not null default 'private',
  license        text,
  -- Who made it, when that is somebody other than the person uploading it.
  author_name    text,
  author_url     text,
  -- Taken down by whoever runs the site. The owner still sees it and why.
  hidden         integer not null default 0,
  -- A page that opened the file counted something different from what was declared.
  -- Read only by whoever runs the site: anybody can send a doubt, so it cannot be a
  -- mark shown to the public.
  doubted        integer not null default 0,
  published      text,
  created        text not null,
  updated        text not null,
  downloads      integer not null default 0,
  stars          integer not null default 0
);

-- The same file twice from one person is one model. Per owner rather than globally:
-- two people keeping the same file privately is not a claim by either of them, and a
-- global rule would let anybody find out what somebody else has by uploading a guess.
create unique index models_owner_sha on models (owner, sha256);
create index models_owner on models (owner, created desc);
create index models_seen on models (visibility, hidden, state, published desc);
create index models_print on models (print);
create index models_shape on models (shape);

create table model_tags (
  model_id text not null references models(id) on delete cascade,
  tag      text not null,
  primary key (model_id, tag)
);

create index model_tags_tag on model_tags (tag);

create table stars (
  model_id text not null references models(id) on delete cascade,
  user_id  text not null references users(id) on delete cascade,
  made     text not null,
  primary key (model_id, user_id)
);

create index stars_user on stars (user_id);

create table reports (
  id       text primary key,
  model_id text not null references models(id) on delete cascade,
  user_id  text references users(id) on delete set null,
  kind     text not null,
  said     text not null default '',
  made     text not null
);

create unique index reports_once on reports (model_id, user_id);

-- Every refusal to publish somebody else's model, kept. The rule needs to know
-- whether this has happened before with this pair, and a record of attempts is the
-- only way to tell carelessness from persistence.
create table attempts (
  id       text primary key,
  who      text not null references users(id) on delete cascade,
  model_id text references models(id) on delete set null,
  against  text references models(id) on delete set null,
  made     text not null
);

create index attempts_who on attempts (who, made desc);

-- Somebody is told when their work is involved. Read on the site rather than sent:
-- no addresses are held, and a notice on the site cannot be lost or filtered.
create table notices (
  id    text primary key,
  who   text not null references users(id) on delete cascade,
  kind  text not null,
  about text references models(id) on delete cascade,
  said  text not null,
  made  text not null,
  seen  integer not null default 0
);

create index notices_who on notices (who, made desc);
