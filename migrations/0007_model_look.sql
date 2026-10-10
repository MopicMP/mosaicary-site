-- The angle an author shows their model from: two numbers in radians, null for none.
--
-- Two columns and not a baked picture, because the angle is needed where no picture
-- can help: the window turns the model, the Blockbench plugin draws it itself, and
-- both have to start where the card's picture ended. Null in both means the one angle
-- everything used before anybody could choose — from the north-west, a little under
-- thirty degrees up — which shows the back of any model whose face is not where the
-- editor's north is.
alter table models add column look_spin real;
alter table models add column look_tilt real;
