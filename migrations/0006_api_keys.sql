-- Keys a person makes for the Blockbench plugin, and later for scripts of their own.
--
-- Only a hash of the key is kept. The key itself is shown once, when it is made, and
-- whoever reads this table afterwards — a backup, a leak, the one running the site —
-- cannot use what they read: a SHA-256 of 238 random bits is not walked back.
-- Looked up by that hash, so nothing has to be compared character by character.
create table api_keys (
  id      text primary key,
  owner   text not null references users(id) on delete cascade,
  -- What the person called it, so that among three keys they can tell which one sits
  -- in which Blockbench before taking one away.
  name    text not null,
  hash    text not null unique,
  -- The last four characters, to match a key against the list without the key.
  hint    text not null,
  created text not null,
  -- When it was last used, to the hour: enough to see that a forgotten key still works
  -- somewhere, without a write to the database on every request.
  used    text
);
create index api_keys_owner on api_keys (owner);
