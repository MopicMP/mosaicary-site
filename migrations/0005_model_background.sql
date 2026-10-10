-- The colour an author puts behind their model, as `#rrggbb`; null for none.
--
-- A column and not a picture: the card's picture is drawn with a transparent
-- background and laid over this colour by the page. That way somebody looking can
-- still put their own colour behind every card, or only behind the ones without one,
-- and nothing has to be drawn again when an author changes their mind.
alter table models add column background text;
