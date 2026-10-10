-- The accounts and models the live check talks about, put in from scratch.
--
-- Its own database rather than the one the site is looked at in: the check writes
-- comments, takes them off and sends notices, and none of that belongs in whatever is
-- on screen in the browser. Everything here is `insert or replace`, and the talk from
-- the run before is cleared, so the check can be run again and again.
--
-- Four accounts, because taking a comment off is three different acts: the author
-- deleting their own words, the person a model belongs to clearing their own page, and
-- whoever runs the site clearing anything. The fourth is a bystander who writes and
-- reports. Admin is not in here: it comes from ADMINS, see admin.env.

delete from comment_reports;
delete from comment_likes;
delete from comments;
delete from notices;
delete from likes;
delete from model_tags where model_id in ('LiveModel001', 'LiveShut0001');
delete from models where id in ('LiveModel001', 'LiveShut0001');
delete from identities where user_id in ('liveowner001', 'livesaid0001', 'liveother001', 'livesite0001');
delete from users where id in ('liveowner001', 'livesaid0001', 'liveother001', 'livesite0001');

insert into users (id, handle, face, via, created, seen, adult_ok, adult_view) values
  ('liveowner001', 'Автор модели', null, 'discord', '2026-10-01T10:00:00.000Z', '2026-10-06T10:00:00.000Z', null, 'hide'),
  ('livesaid0001', 'Кто спросил', null, 'github', '2026-10-02T10:00:00.000Z', '2026-10-06T10:00:00.000Z', null, 'hide'),
  ('liveother001', 'Кто мимо шёл', null, 'github', '2026-10-03T10:00:00.000Z', '2026-10-06T10:00:00.000Z', null, 'hide'),
  ('livesite0001', 'Кто ведёт сайт', null, 'discord', '2026-10-04T10:00:00.000Z', '2026-10-06T10:00:00.000Z', null, 'hide');

-- The last subject is the one admin.env names, so that account is the admin.
insert into identities (provider, subject, user_id, handle, face) values
  ('discord', 'live-owner', 'liveowner001', 'Автор модели', null),
  ('github', 'live-said', 'livesaid0001', 'Кто спросил', null),
  ('github', 'live-other', 'liveother001', 'Кто мимо шёл', null),
  ('discord', 'admin-subject', 'livesite0001', 'Кто ведёт сайт', null);

-- Two models of the same person's: one in the catalogue, one only theirs. The numbers
-- are what an uploading page would have counted; no file is in the bucket, which the
-- talk routes never ask about.
insert into models (
  id, owner, name, description, format, version, box_uv, cubes, meshes, bones, animations,
  textures, embedded, texture_width, texture_height, density, sha256, print, shape, bytes,
  state, has_preview, visibility, license, hidden, doubted, adult, published, created, updated,
  downloads, likes, comments
) values
  (
    'LiveModel001', 'liveowner001', 'Проверочная модель', 'Стоит здесь ради проверки обсуждения.',
    'free', '4.10', 0, 12, 0, 3, 1, 1, 1, 64, 64, 1.0,
    'aa00000000000000000000000000000000000000000000000000000000000001',
    'bb00000000000000000000000000000000000000000000000000000000000001',
    'cc00000000000000000000000000000000000000000000000000000000000001',
    20480, 'ready', 0, 'public', 'cc0', 0, 0, 0,
    '2026-10-05T12:00:00.000Z', '2026-10-05T12:00:00.000Z', '2026-10-05T12:00:00.000Z', 0, 0, 0
  ),
  (
    'LiveShut0001', 'liveowner001', 'Закрытая модель', 'Её видно только автору.',
    'free', '4.10', 0, 4, 0, 1, 0, 1, 1, 32, 32, 1.0,
    'aa00000000000000000000000000000000000000000000000000000000000002',
    'bb00000000000000000000000000000000000000000000000000000000000002',
    'cc00000000000000000000000000000000000000000000000000000000000002',
    8192, 'ready', 0, 'private', null, 0, 0, 0,
    null, '2026-10-05T12:30:00.000Z', '2026-10-05T12:30:00.000Z', 0, 0, 0
  );
