/**
 * The shape of the data, one numbered step at a time.
 *
 * <h2>Why the SQL is in a TypeScript file</h2>
 *
 * Because the build compiles TypeScript and copies nothing else. A directory of
 * `.sql` files needs a copy step in the build, a second one in the Docker image,
 * and a third the day the working directory is not what somebody expected — and
 * when any of those is missed the failure is at boot, in production, with an empty
 * database. Strings in a module cannot be left behind.
 *
 * <h2>Why steps rather than one file</h2>
 *
 * Because the schema in `docs/site.md` describes where this is going, and writing
 * all of it now would be writing tables against code that does not exist yet. Each
 * step is added when the thing that needs it is built, is applied once, and is
 * never edited afterwards — an edited migration is a database that differs between
 * the machine it was written on and the one it runs on.
 */

export interface Step {
  /** Ordered, and part of the record of what has been applied. */
  name: string;
  sql: string;
}

export const MIGRATIONS: Step[] = [
  {
    name: '001-users',
    sql: `
      create table users (
        id          text primary key,
        discord_id  text unique not null,
        handle      text not null,
        avatar      text,
        created     timestamptz not null default now(),
        seen        timestamptz not null default now()
      );

      create index users_discord on users (discord_id);
    `,
  },
  {
    name: '002-skins',
    sql: `
      create table skins (
        id          text primary key,
        owner       text references users(id) on delete cascade,
        author      text not null,
        name        text not null,
        fingerprint text not null,
        width       int  not null,
        layout      int  not null,
        gender      text not null default 'neutral',
        visibility  text not null default 'private',
        bytes       bytea not null,
        created     timestamptz not null default now()
      );

      -- The same file twice is one skin. Per owner rather than globally: two
      -- people finding the same skin elsewhere both keep their own copy, and
      -- neither can discover what the other has by uploading a guess.
      create unique index skins_owner_print on skins (owner, fingerprint);
      create index skins_seen on skins (visibility, created desc);

      create table masks (
        skin_id text primary key references skins(id) on delete cascade,
        encoded text not null,
        by_hand boolean not null default true,
        updated timestamptz not null default now()
      );

      create table tags (
        skin_id text references skins(id) on delete cascade,
        tag     text not null,
        primary key (skin_id, tag)
      );

      create index tags_tag on tags (tag);

      create table collections (
        id      text primary key,
        owner   text not null references users(id) on delete cascade,
        name    text not null,
        created timestamptz not null default now()
      );

      create table collection_items (
        collection text references collections(id) on delete cascade,
        skin       text references skins(id) on delete cascade,
        rank       int not null default 0,
        primary key (collection, skin)
      );
    `,
  },
  {
    name: '003-authorship',
    sql: `
      -- Who says what about who drew this, kept apart from who uploaded it.
      -- 'none'      nobody has said anything
      -- 'claimed'   somebody said it is theirs, and showed nothing
      -- 'confirmed' it was shown, or settled by the person who runs the site
      alter table skins add column author_state text not null default 'none';
      alter table skins add column author_name  text;
      alter table skins add column author_url   text;
      -- 'mine' | 'someone' | 'unknown', answered when publishing and never guessed
      alter table skins add column origin       text;
      alter table skins add column published    timestamptz;

      -- The drawing rather than the file: a picture squared off at 64x64 with
      -- transparent pixels flattened, so re-saving and rescaling land in the
      -- same place. 'exact' equal means the same drawing whatever the bytes.
      create table prints (
        skin_id text primary key references skins(id) on delete cascade,
        exact   text not null,
        blocks  bytea not null,
        pixels  bytea not null,
        ink     int not null
      );

      create index prints_exact on prints (exact);

      -- Every refusal to publish somebody else's work, kept. The rule needs to
      -- know whether this has happened before with this pair, and a record of
      -- attempts is also the only way to tell carelessness from persistence.
      create table attempts (
        id      text primary key,
        who     text not null references users(id) on delete cascade,
        skin_id text references skins(id) on delete set null,
        against text references skins(id) on delete set null,
        verdict text not null,
        made    timestamptz not null default now()
      );

      create index attempts_who on attempts (who, made desc);

      -- Somebody is told when their work is involved. Read here rather than
      -- e-mailed: no addresses are held, and a notice in the site is a notice
      -- that cannot be lost or filtered.
      create table notices (
        id      text primary key,
        who     text not null references users(id) on delete cascade,
        kind    text not null,
        about   text references skins(id) on delete cascade,
        said    text not null,
        made    timestamptz not null default now(),
        seen    boolean not null default false
      );

      create index notices_who on notices (who, made desc);
    `,
  },
  {
    name: '004-samples-name-their-author',
    sql: `
      -- The shipped samples were put in before there was anywhere to say who drew
      -- them, so they read as though somebody had merely uploaded them. The list
      -- they came from does name an author; this says so, and says it as what it
      -- is — a name nobody checked, not a fact.
      --
      -- A separate step rather than an edit to 003, because 003 has been applied
      -- and a migration that changes after it has run is a database that differs
      -- between the machine it was written on and the one it runs on.
      update skins set author_name = author, origin = 'someone'
       where owner is null and author_name is null;
    `,
  },
  {
    name: '005-animations',
    sql: `
      -- Animations, and the one place where authorship is not a hard question.
      -- A skin is a picture that says nothing about who drew it; an animation
      -- arrives in a pack, from a named person, with the pack's own terms
      -- attached. So the author is a column and not a claim, and the links to
      -- where they can be found and supported travel with every single entry.
      create table animations (
        id        text primary key,
        pack      text not null,
        slug      text not null,
        name      text not null,
        author    text not null,
        author_url  text,
        support_url text,
        description text not null default '',
        loop      boolean not null default false,
        ticks     int not null default 0,
        -- The emote as it was written, byte for byte. Not reformatted and not
        -- reduced: the pack's terms forbid altering the files, and there is no
        -- reason to want to.
        body      bytea not null,
        icon      bytea,
        added     timestamptz not null default now()
      );

      create unique index animations_pack_slug on animations (pack, slug);
      create index animations_name on animations (name);

      create table animation_tags (
        animation text references animations(id) on delete cascade,
        tag       text not null,
        primary key (animation, tag)
      );

      create index animation_tags_tag on animation_tags (tag);
    `,
  },
  {
    name: '006-tag-kinds',
    sql: `
      -- Which label is a category and which is a subdivision of one, as the pack
      -- itself has it. Worked out once by the mod's extractor, by containment:
      -- every "JoJo" is also "Мульти вселенная", so JoJo sits inside it, while
      -- only a sixth of the parent is JoJo, so it does not sit inside JoJo.
      --
      -- Read from the pack rather than derived again here, because the game's
      -- picker shows this tree and a catalogue that groups the same animations
      -- differently is a second answer to a question with one.
      create table tag_kinds (
        tag    text primary key,
        parent text
      );
    `,
  },
];

/**
 * Why the pictures are in the database rather than in a bucket.
 *
 * Everyone will tell you not to, and at a million files they are right. Here the
 * numbers are: a skin is fifty kilobytes and at most four megabytes, and this is a
 * catalogue one person and their friends put things in. A thousand of them is well
 * under a gigabyte.
 *
 * Against that, a bucket is a second service, a second set of credentials, a second
 * thing that can be down, and a second place where "delete the skin" can half work
 * and leave an orphan. One `delete` here takes the row and the bytes together,
 * backups cover both, and there is nothing to keep in step.
 *
 * The day this is wrong will be obvious — it is the day the database is mostly
 * pictures — and moving is a column swapped for a key, with the reading already
 * behind one route.
 */


/**
 * What is deliberately not here.
 *
 * No e-mail address. Discord will hand one over for the asking, and there is
 * nothing here that would ever send one — so asking would mean holding a column of
 * other people's addresses to no end, and every such column is one more thing that
 * can leak. If something one day needs to write to people, that is the day to ask
 * for it, and people will be asked again at that point rather than quietly.
 */
