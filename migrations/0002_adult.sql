-- Models for adults, and how each person wants to be shown them.
--
-- A model is for adults when its owner says so, on publishing or later, or when
-- whoever runs the site marks it. A mark set by the site cannot be taken off by the
-- owner: `adult_fixed` is what stops a model being withdrawn from the catalogue and
-- published again as one for everybody.
alter table models add column adult integer not null default 0;
alter table models add column adult_fixed integer not null default 0;

-- When the person said they are eighteen or older; null if they never have. The time
-- rather than a yes, since when it was said is what any question about it asks.
alter table users add column adult_ok text;
-- 'hide', 'blur' or 'open'. Anything but 'hide' counts only once adult_ok is set.
alter table users add column adult_view text not null default 'hide';
