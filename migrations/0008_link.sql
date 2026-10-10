-- Requests from a program to be let into an account, waiting for a person to agree.
--
-- Short-lived rows: ten minutes, then they are swept by the next request from the
-- same kind of place. Nothing here is a key. The key is made at the moment it is
-- handed over, so a row read later — in a backup, by whoever runs the site — opens
-- nothing, and a request nobody came back for leaves no key behind at all.
create table link_requests (
  -- The public half, shown in the plugin and standing in the page's address.
  code    text primary key,
  -- SHA-256 of the half only the plugin that started this knows. Looked up by it.
  secret  text not null unique,
  -- What the program called itself; becomes the key's name.
  device  text not null,
  made    text not null,
  expires text not null,
  -- waiting | allowed | denied | taken
  state   text not null default 'waiting',
  -- Who agreed, from the moment they did.
  owner   text references users(id) on delete cascade,
  -- The key this turned into, kept only so a row's history is readable while it lives.
  key_id  text references api_keys(id) on delete set null
);

-- Swept by expiry, and asked for by expiry on every start.
create index link_requests_expires on link_requests (expires);
