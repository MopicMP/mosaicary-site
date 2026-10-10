-- The rule a decision cites, kept beside the notice that tells the author about it.
--
-- The notice's words already name the clause, by its number and in a few words. This
-- is the same clause by its key, which does not move when the rules are renumbered,
-- so the bell can link to the clause as it stands now. Null for every notice that is
-- not a decision against somebody: a comment, a reply, a model put back.
alter table notices add column rule text;
