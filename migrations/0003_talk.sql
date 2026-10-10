-- Hearts instead of stars, and talk under a model.
--
-- The star was called "put aside for yourself" on the button and `stars` in the table,
-- and meant a liking in the sorting — three different things wearing one name. It is a
-- heart everywhere now, down to the column, because a column named `stars` under a
-- heart is how the next person reading this writes the wrong label.
alter table stars rename to likes;
alter table models rename column stars to likes;
drop index stars_user;
create index likes_user on likes (user_id);

-- What people say under a model.
--
-- Shown the moment it is written, with no queue in front of it: a catalogue where an
-- answer appears tomorrow is a catalogue nobody answers in. What makes that safe is
-- the other direction — anybody can report a comment, the author of the model can take
-- one off their own page, and whoever runs the site can take any of them off.
create table comments (
  id       text primary key,
  model_id text not null references models(id) on delete cascade,
  user_id  text not null references users(id) on delete cascade,
  -- The comment this one answers, and always one that answers nothing itself: a single
  -- level of replies, so a thread cannot grow into a staircase unreadable on a phone.
  -- Answering an answer attaches to the same root instead.
  reply_to text references comments(id) on delete cascade,
  said     text not null,
  made     text not null,
  -- Taken down. The row stays and `said` is emptied in the same step: the replies hang
  -- off this row, and a decision about what somebody wrote has to still be answerable
  -- afterwards (article 17 of Regulation (EU) 2022/2065). What was written is gone.
  gone     integer not null default 0,
  -- Who took it down: 'author' the person who wrote it, 'owner' the person the model
  -- belongs to, 'site' whoever runs the site. Shown as words, since "deleted" alone
  -- reads as censorship when the author deleted it themselves.
  gone_by  text,
  why      text not null default '',
  likes    integer not null default 0
);

-- Oldest first inside a model: that is the order a conversation is read in.
create index comments_model on comments (model_id, made);
create index comments_user on comments (user_id, made desc);
create index comments_reply on comments (reply_to, made);

create table comment_likes (
  comment_id text not null references comments(id) on delete cascade,
  user_id    text not null references users(id) on delete cascade,
  made       text not null,
  primary key (comment_id, user_id)
);

create index comment_likes_user on comment_likes (user_id);

-- Reports about comments, kept apart from reports about models: they are answered by
-- different acts, and a mixed table would mean every query asking which kind it has.
create table comment_reports (
  id         text primary key,
  comment_id text not null references comments(id) on delete cascade,
  user_id    text references users(id) on delete set null,
  kind       text not null,
  said       text not null default '',
  made       text not null
);

create unique index comment_reports_once on comment_reports (comment_id, user_id);

-- How many comments a model has, the ones taken down not counted. Kept on the model so
-- that a page of cards is one query and not one query per card.
alter table models add column comments integer not null default 0;
