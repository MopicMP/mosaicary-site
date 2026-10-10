-- Reviews of the work itself: a comment that is about the plugin or about the site.
--
-- Her four decisions of 9 October: two things to review and each review marked with
-- its own, words and a heart and no rating at all, a native dialog in the plugin
-- posting with its key, and only people who signed in.
--
-- <h2>Why a review is a comment and not a table of its own</h2>
--
-- Everything a comment already carries is what a review needs: a heart, a report,
-- removal with a reason its author is told and may object to, one level of replies, a
-- queue for whoever runs the site, and the allowances that stop a script. A second
-- table would mean a second copy of all of that, and the two copies would drift
-- apart — the first time one of them gets a fix the other does not. So the comment
-- gets a subject instead, and a comment under a model becomes one subject of three.
--
-- <h2>Why the table is rebuilt</h2>
--
-- `model_id` was `not null`, and a review has no model. SQLite cannot drop a
-- `not null`, so the only way is a new table and a copy.
--
-- The awkward part is that `comment_likes` and `comment_reports` point at this table.
-- `drop table` of a table that is pointed at performs an implicit `delete from` first,
-- and that fires `on delete cascade` — both children would be emptied on the way out.
-- So they are copied aside first and put back afterwards.
--
-- The copy goes in two passes, the starts of threads before the replies, because
-- `reply_to` points into this same table and the order rows come out in is nobody's
-- promise. Two passes instead of `pragma defer_foreign_keys`, which D1 need not have.

create table comments_about (
  id       text primary key,
  -- Null for a review: it is about the work, not about a model. A review therefore
  -- also survives a model being deleted, which is the whole point of it being a review.
  model_id text references models(id) on delete cascade,
  -- What this is about: 'model', 'plugin' or 'site'. A word rather than a number, so
  -- that a row read in the database says what it is without a table to look it up in.
  about    text not null default 'model',
  user_id  text not null references users(id) on delete cascade,
  reply_to text references comments_about(id) on delete cascade,
  said     text not null,
  made     text not null,
  -- When the author last rewrote it, or null. Only a review can be rewritten: it is
  -- one person's standing opinion and they are allowed to change it. A comment under
  -- a model is part of a conversation, and rewriting it changes what the answers
  -- below it are answering.
  edited   text,
  gone     integer not null default 0,
  gone_by  text,
  why      text not null default '',
  likes    integer not null default 0
);

insert into comments_about (id, model_id, about, user_id, reply_to, said, made, gone, gone_by, why, likes)
  select id, model_id, 'model', user_id, reply_to, said, made, gone, gone_by, why, likes
    from comments where reply_to is null;

insert into comments_about (id, model_id, about, user_id, reply_to, said, made, gone, gone_by, why, likes)
  select id, model_id, 'model', user_id, reply_to, said, made, gone, gone_by, why, likes
    from comments where reply_to is not null;

create table likes_kept as select * from comment_likes;
create table reports_kept as select * from comment_reports;

drop table comments;
alter table comments_about rename to comments;

insert into comment_likes select * from likes_kept;
insert into comment_reports select * from reports_kept;
drop table likes_kept;
drop table reports_kept;

-- The three the old table had, which went with it.
create index comments_model on comments (model_id, made);
create index comments_user on comments (user_id, made desc);
create index comments_reply on comments (reply_to, made);

-- The wall of reviews, newest first. The other way round from a model's talk on
-- purpose: a conversation is read from its beginning, a wall of reviews from today.
create index comments_about on comments (about, made desc);

-- One review per person per thing. Not a rule the page is asked to keep politely: a
-- second one written from a script at the same moment would otherwise get through
-- between the check and the insert.
--
-- `gone = 0` is in the condition, so taking one's own review off frees the place to
-- write another. The row that was taken off stays where it was, because the answers
-- to it hang from it.
create unique index comments_once on comments (about, user_id)
  where reply_to is null and about <> 'model' and gone = 0;
