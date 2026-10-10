import { num } from '../lib/numbers.js';
import { NAME } from '../lib/site.js';
import { ends } from './forms.js';

/**
 * The words of the site, in the language it is written in.
 *
 * <h2>This file is the original</h2>
 *
 * Every other language is declared as `const de: Words = {…}`, where `Words` is
 * `typeof ru`. So a key that is missing, misspelled or left over is a build error
 * rather than a blank on somebody's screen, and nothing has to check that fourteen
 * files agree — the compiler already does.
 *
 * Which text governs where a translation disagrees is a separate question, and only
 * the papers answer it: there the Russian text is the one that counts, and each of
 * those pages says so.
 *
 * <h2>Why some of them are functions</h2>
 *
 * A sentence with a number in it is written as a function of that number. The plugin
 * puts `{n}` in the text and fills it in; here a function gets the argument checked by
 * name and by type across all fourteen languages, and a translator can move the number
 * to wherever their language puts it — or say it with a different word for one, two and
 * five, which Russian needs and Japanese does not.
 */
const ru = {
  site: {
    /** The window's own title. The name is not translated; what follows it is. */
    title: `${NAME} — модели Blockbench`,
    description:
      'Каталог моделей Blockbench: посмотреть в 3D, скачать и открыть в Blockbench. Загрузить свои.',
    coming_skins: 'Скины появятся во второй версии сайта.',
    coming_animations: 'Анимации появятся в третьей версии сайта.',
  },

  nav: {
    models: 'Модели',
    skins: 'Скины',
    animations: 'Анимации',
  },

  head: {
    /** How many cards to a row, in the list that offers it. */
    per_row: (many: number) => `${many} в ряд`,
    /** The same control with nothing chosen, where there is room for two words. */
    per_row_short: 'В ряд',
    filters: 'Фильтры',
    filters_close: 'Убрать фильтры',
    filters_marked: 'Фильтры: что-то выбрано',
    upload: 'Загрузить',
    /** The picker itself, for somebody who cannot read the language on screen. */
    language: 'Язык',
    mine: 'Мои модели',
  },

  /**
   * The names of things the code knows by a code.
   *
   * Formats, licences, reasons for a report: the code travels, the name is read. They
   * used to live in `shared/modelRules.ts` beside the rules that check them, which put
   * Russian words in a file the plugin copies whole and the Worker imports — so the
   * lists of codes stayed there and the names came here.
   *
   * Keyed by the code itself, so a code with no name falls back to the code rather
   * than to a blank, and a format Blockbench adds tomorrow still reads.
   */
  names: {
    /** As Blockbench's own start screen calls them. */
    formats: {
      java_block: 'Java: блок или предмет',
      optifine_entity: 'OptiFine: сущность',
      optifine_part: 'OptiFine: часть',
      skin: 'Скин Minecraft',
      bedrock: 'Bedrock: сущность',
      bedrock_old: 'Bedrock: старая сущность',
      bedrock_block: 'Bedrock: блок',
      modded_entity: 'Сущность для мода',
      geckolib_model: 'GeckoLib',
      animated_entity_model: 'GeckoLib',
      free: 'Свободная модель',
      image: 'Картинка',
    },
    /**
     * The four groups a person looking for a model thinks in.
     *
     * Each names what it holds, because the group's own word says too little: nobody
     * knows what "free" covers until the formats in it are listed.
     */
    uses: {
      java: 'Java: блоки, предметы, OptiFine',
      bedrock: 'Bedrock: сущности и блоки',
      mods: 'Для модов: сущности, GeckoLib',
      free: 'Свободные: не для какой-то одной игры',
    },
    licenses: {
      cc0: 'CC0: без условий',
      'cc-by': 'CC BY: с указанием автора',
      'cc-by-sa': 'CC BY-SA: с автором, на тех же условиях',
      'cc-by-nc': 'CC BY-NC: с автором, некоммерчески',
      'cc-by-nc-sa': 'CC BY-NC-SA: с автором, некоммерчески, на тех же условиях',
      arr: 'Все права защищены',
    },
    /** What can be reported about a comment: shorter, and answered differently. */
    comment_reports: {
      unlawful: 'Нарушает закон',
      abuse: 'Оскорбления или травля',
      spam: 'Спам или реклама',
      private: 'Личные данные',
      other: 'Другое',
    },
    reports: {
      stolen: 'Чужая работа',
      unmarked: 'Для взрослых, но без пометки 18+',
      incomplete: 'Урезана, а полная версия где-то ещё',
      offensive: 'Нарушает закон',
      junk: 'Спам или мусор',
      broken: 'Не открывается или сломана',
      other: 'Другое',
    },
  },

  /** The list that lives inside one line: `Dropdown`. */
  drop: {
    chosen: (many: number) => `Выбрано: ${many}`,
    remove: 'Убрать',
    find: 'Найти',
    nothing: 'Ничего не подходит',
    /** Said at the foot of the list once the limit is reached. */
    most: (many: number) => `Больше ${many} выбрать нельзя`,
  },

  when: {
    /**
     * A date that has not happened, which is a clock out by a minute, not the future.
     *
     * Lower case, unlike the labels: this one is read in a row beside «вчера» and
     * «сегодня», which come from `Intl` and are written the way that language writes
     * them. A capital here would be the one word in the column wearing a hat.
     */
    just_now: 'только что',
  },

  /** The catalogue of models: the section that is open. */
  models: {
    /** The upload button here, where it is models and not skins. */
    upload: 'Загрузить модели',
    loading: 'Загружаю каталог…',
    broken: (why: string) => `Каталог не загрузился: ${why}`,
    empty_title: 'В каталоге пока пусто',
    empty_text: 'Первая опубликованная модель появится здесь. Загрузить можно из своих моделей.',
    /** Models exist, but none of them got through the filters. */
    nothing_found: 'Под эти условия ничего не подошло. Сбрось что-нибудь в фильтрах.',
    /** Dismisses a message that has been read. */
    understood: 'Понятно',
  },

  /**
   * One model, opened in a window.
   *
   * Almost every button here is an icon with a hint, so most of these come in pairs:
   * the hint, which is a sentence, and the `aria-label`, which is the one word a
   * screen reader says. They are not the same string on purpose — a reader reading
   * «Убрать из каталога. Опубликовать снова можно в любой момент.» for a button is
   * reading a paragraph where a verb was wanted.
   */
  win: {
    /** The window's own name before the model's is known. */
    a_model: 'Модель',
    not_opened: 'Модель не открылась',
    not_opened_why: (why: string) => `Модель не открылась: ${why}.`,
    opening: 'Открываю модель',
    opening_file: 'Открываю файл модели…',
    /** The file is gone from storage, which is a fault and not an empty catalogue. */
    file_missing: 'файл модели не нашёлся',
    picture_failed: 'картинка не получилась',
    prev: 'Предыдущая',
    prev_hint: 'Предыдущая (←)',
    next: 'Следующая',
    next_hint: 'Следующая (→)',
    at_of: (at: number, of: number) => `${at} из ${of}`,
    help_hint: 'Как открыть модель и другие вопросы',
    close: 'Закрыть',
    close_hint: 'Закрыть (Esc)',
    adult_cover: 'Модель для взрослых',
    show: 'Показать',
    play: 'Проиграть',
    stop: 'Остановить',
    no_clip: 'Без анимации',
    reset: 'Как было',
    reset_hint: 'Как было (или двойной щелчок)',
    download: 'Скачать',
    download_hint: 'Скачать файл .bbmodel',
    like: 'Нравится',
    like_hint: 'Нравится: модель попадёт в «Любимое»',
    unlike: 'Больше не нравится',
    taken_down: 'Снята с каталога',
    taken_down_hint: 'Снята с каталога тем, кто ведёт сайт. Почему, сказано в уведомлении на твоей странице.',
    publish: 'Опубликовать',
    publish_hint: 'Опубликовать: спросит лицензию и автора',
    hide: 'Убрать из каталога',
    hide_hint: 'Убрать из каталога. Опубликовать снова можно в любой момент.',
    edit: 'Изменить',
    edit_hint: 'Изменить название, описание и теги',
    look: 'Запомнить этот ракурс',
    look_hint: 'Запомнить этот ракурс: с него будет картинка карточки и с него модель откроется',
    drop: 'Удалить',
    drop_hint: 'Удалить модель с сайта',
    report: 'Пожаловаться',
    drag_hint: 'Тяни, чтобы повернуть; колесо — ближе и дальше',

    description: 'Описание',
    tags: 'Теги',
    no_tags: 'Тегов пока нет',
    about: 'О модели',
    talk: 'Обсуждение',
    check: 'Проверка',

    /** The counts in «О модели», each with the word its number asks for. */
    cubes: (n: number) => `${num(n)} ${ends('ru', n, { one: 'куб', few: 'куба', other: 'кубов' })}`,
    meshes: (n: number) => `${num(n)} ${ends('ru', n, { one: 'меш', few: 'меша', other: 'мешей' })}`,
    bones: (n: number) => `${num(n)} ${ends('ru', n, { one: 'кость', few: 'кости', other: 'костей' })}`,
    clips: (n: number) => `${num(n)} ${ends('ru', n, { one: 'анимация', few: 'анимации', other: 'анимаций' })}`,
    textures: (n: number) => `${num(n)} ${ends('ru', n, { one: 'текстура', few: 'текстуры', other: 'текстур' })}`,
    reports: (n: number) => `${num(n)} ${ends('ru', n, { one: 'жалоба', few: 'жалобы', other: 'жалоб' })}`,
    no_textures: 'Без текстур',
    not_embedded: (n: number) => `Не встроено: ${num(n)}`,

    fact_format: 'Формат проекта в Blockbench: от него зависит, куда модель пойдёт',
    fact_box_uv: 'Развёртка коробкой, как у мобов в игре',
    fact_face_uv: 'Развёртка по граням',
    fact_bones: 'Группы, они же кости: за них модель двигается',
    fact_clips: 'Анимации внутри файла: их можно проиграть здесь',
    fact_texture: (wide: number, tall: number) => `Самая большая текстура: ${wide} на ${tall} пикселей`,
    fact_no_textures: 'Текстур в файле нет',
    fact_not_embedded: 'Эти текстуры не встроены в файл, а лежали у автора на диске. Blockbench откроет модель без них.',
    fact_hd: (pixels: string) => `HD: ${pixels} текстуры на единицу модели, в игре один`,
    fact_adult: 'Помечена как модель для взрослых. Как их показывать, выбирается в меню аккаунта.',
    fact_downloads: 'Сколько раз скачали',
    fact_likes: 'Скольким людям она нравится',
    fact_published: 'Когда появилась в каталоге',
    fact_created: 'Когда загружена',
    fact_bytes: 'Размер файла .bbmodel',
    fact_license: 'Что можно делать с моделью, по слову того, кто её опубликовал',
    fact_print: 'Отпечаток модели: по нему сайт узнаёт ту же модель, даже если файл пересохранён',

    /** Only whoever runs the site sees these. */
    doubt_hint: 'Чья-то страница насчитала в файле не то, что заявил загрузивший',
    doubted: 'Файл не сходится с заявленным',
    reports_hint: 'Жалобы, которые ещё не разобраны',
    settle: 'Оставить',
    settle_hint: 'Посмотрено, всё в порядке: жалобы закрываются, модель остаётся как есть',
    mark: 'Пометить 18+',
    mark_hint: 'Пометить 18+: владелец снять эту пометку не сможет',
    unmark: 'Снять пометку 18+',
    unmark_hint: 'Снять пометку: модель снова видна всем',
    restore: 'Вернуть в каталог',
    takedown: 'Снять с каталога',
  },

  /**
   * The small windows a model's window opens over itself.
   *
   * Publishing, changing, deleting, reporting, taking down: each is one question with
   * one answer. The buttons that every one of them has — close, understood — are not
   * repeated here; they are read from `win` and `models`, which is the same button.
   */
  ask: {
    /** Said when the same model is already in the catalogue under somebody else. */
    open_existing: 'Открыть ту, что уже есть',
    second_try:
      'Тому, кто опубликовал её первым, ушло уведомление. Ещё одна такая попытка, и публиковать будет нельзя неделю.',

    /** A mark set by whoever runs the site: a line of words, because it is not a choice. */
    adult_fixed: 'Эта модель помечена 18+ тем, кто ведёт сайт. Снять пометку нельзя.',
    for_whom: 'Для кого',
    for_all: 'Для всех',
    for_adult: '18+, для взрослых',
    choose: 'Выбрать',
    adult_closed: 'В твоей стране модели 18+ на сайте закрыты, поэтому пометить модель так нельзя.',
    am_18: 'Мне есть 18 лет',
    am_18_hint: 'Спрашивается один раз',

    published_title: 'Опубликовано',
    remake_note: 'Если это переделка чужой модели, укажи автора основы в описании.',
    near_text: 'Модель уже в каталоге. В нём есть модель той же формы с другой раскраской: возможно, это одна основа.',
    open_near: 'Открыть ту модель',

    /**
     * A window's title with the model's name in it.
     *
     * The name is in quotes because a name dropped into a Russian sentence is read as
     * part of it, and would be asked to take a case it cannot. A language that does not
     * need the quotes can leave them out.
     */
    publish_title: (name: string) => `Опубликовать «${name}»`,
    publish_note: 'Убрать из каталога можно в любой момент.',
    publish: 'Опубликовать',
    publish_why:
      'Каталог видят все. Автором здесь считается тот, кто первым опубликовал модель: по файлу этого не установить, поэтому такое правило. Ту же модель второй раз сюда никто не выложит.',
    publish_warn: 'Модель для взрослых помечается обязательно. Без пометки её снимут, а аккаунт могут закрыть.',
    license: 'Лицензия',
    choose_license: 'Выбрать лицензию',
    license_link: 'Что разрешает эта лицензия',
    author: 'Автор, если это не ты',
    /** A field that may be left empty, said in the field itself. */
    optional: 'Необязательно',
    author_url: 'Где модель лежит у автора',
    url_optional: 'Ссылка, необязательно',

    edit_title: 'Изменить описание',
    edit_note: 'Файл модели остаётся тем же. Новую версию загрузи как новую модель.',
    save: 'Сохранить',
    name: 'Название',
    description: 'Описание',
    description_hint: 'Что это, для чего, что внутри',
    tags_upto: (most: number) => `Теги, до ${most}`,
    background: 'Фон за моделью',

    drop_title: (name: string) => `Удалить «${name}»`,
    drop_note: 'Вернуть её будет нельзя.',
    drop: 'Удалить',
    /**
     * Both of these are written out whole, with the catalogue clause and without it.
     *
     * The code used to paste the middle of the sentence in when the model was public,
     * which works in Russian and breaks wherever that clause goes somewhere else in the
     * sentence. Two sentences a translator can read from end to end are worth the
     * repetition.
     */
    drop_why: 'Модель, её файл и картинка удалятся с сайта насовсем. У тех, кто уже скачал файл, он останется.',
    drop_why_public:
      'Модель, её файл и картинка удалятся с сайта насовсем, и из каталога тоже. У тех, кто уже скачал файл, он останется.',

    /**
     * What the second field of a report asks for.
     *
     * Keyed by the kind reported, for the three kinds where «Подробности» says too
     * little: a stolen model is answered by where the original is, and a cut-down one by
     * where it sends people. Every other kind falls back to `details`.
     */
    report_heads: {
      stolen: 'Где оригинал и чей он',
      incomplete: 'Куда она отправляет за полной версией',
      unmarked: 'Что в ней для взрослых',
    },
    report_hints: {
      stolen: 'Ссылка на оригинал',
      incomplete: 'Ссылка или что написано в описании',
    },
    sent_title: 'Жалоба отправлена',
    sent_model: 'Тот, кто ведёт сайт, посмотрит модель. Спасибо.',
    sent_comment: 'Тот, кто ведёт сайт, прочитает комментарий. Спасибо.',
    report_title: (name: string) => `Пожаловаться на «${name}»`,
    report_note: 'Автор не узнает, кто пожаловался.',
    send: 'Отправить',
    what_wrong: 'Что не так',
    details: 'Подробности',
    comment_report_title: (who: string) => `Пожаловаться на комментарий «${who}»`,
    comment_report_note: 'Автор комментария не узнает, кто пожаловался.',

    take_mine_title: 'Удалить свой комментарий',
    take_title: (who: string) => `Снять комментарий «${who}»`,
    take_mine_note: 'Вернуть его будет нельзя.',
    take_note: 'Автору придёт уведомление с этими словами.',
    take: 'Снять',
    take_mine_why: 'На месте комментария останется строка о том, что он удалён. Ответы на него останутся.',
    which_rule: 'Какой пункт правил нарушен',
    take_why: 'За что снимается',
    take_why_hint: 'Автор увидит эти слова и сможет возразить',

    takedown_title: (name: string) => `Снять «${name}» с каталога`,
    restore_title: (name: string) => `Вернуть «${name}» в каталог`,
    owner_told: 'Владельцу придёт уведомление.',
    restore: 'Вернуть',
    takedown_why: 'Почему, для владельца',
    restore_why: 'Модель снова появится в каталоге, если владелец её не скрыл.',
  },

  /**
   * Letting Blockbench into an account: the one page something else opens.
   *
   * The plugin shows the same code in its own window, in its own language, and a
   * person compares the two by eye. So the code itself is never translated, and
   * everything around it has to be — this is the page where a reader who cannot read
   * it would press a button meaning "allow" to a question they did not understand.
   */
  link: {
    moment: 'Секунду…',
    looking: 'Смотрим, что за запрос…',
    code: (code: string) => `Код ${code}`,
    sign_in_first: 'Blockbench просит пустить его в твой аккаунт. Сначала войди на сайт — после входа вернёшься сюда, и тогда спросим.',
    broken_title: 'Этот вход не открыть',
    to_catalogue: 'В каталог',
    done_title: 'Готово',
    done_text:
      'Вернись в Blockbench: плагин сам заберёт доступ, это занимает пару секунд. Ключ появится на странице «Мои модели» — там же его можно убрать.',
    denied_title: 'Вход отклонён',
    denied_text: 'Blockbench в аккаунт не пустили. Если это была ты — нажми «Войти» в плагине ещё раз.',
    late_title: 'Запрос просрочен',
    late_text: 'На ответ было десять минут. Нажми «Войти» в Blockbench ещё раз — будет новый код.',
    ask_title: 'Пустить Blockbench в аккаунт?',
    compare: 'Этот код должен совпадать с тем, что написан в Blockbench. Если там другой — отказывай: значит, вход начал кто-то другой, а ответить просят тебя.',
    program: 'Программа',
    account: 'Аккаунт',
    answer_in: 'Ответить',
    under_minute: 'меньше минуты',
    minutes_left: (many: number) => `в течение ${many} мин`,
    can_head: 'Что сможет',
    can_look: 'Смотреть каталог и твои модели, в том числе черновики',
    can_publish: 'Публиковать новые модели и обновлять твои',
    can_talk: 'Ставить сердечки и писать комментарии от твоего имени',
    cannot_head: 'Чего не сможет',
    cannot_remove: 'Удалять модели и снимать их с каталога',
    cannot_age: 'Подтверждать, что тебе есть 18',
    cannot_report: 'Жаловаться на чужие модели, создавать и удалять ключи',
    full: (most: number) => `Ключей уже ${most}. Удали ненужный на странице «Мои модели» и нажми «Войти» в Blockbench ещё раз.`,
    allow: 'Разрешить',
    refuse: 'Отказать',
    my_models: 'Мои модели',
    afterwards: 'Разрешение — это ключ в списке «Ключи API». Его видно там всегда, и удалить его можно в любой момент.',
  },

  /** The page a section that is not open yet answers with. */
  later: {
    /** The section's own name is passed in, so it is declined once and here. */
    soon: (what: string) => `${what} скоро`,
    only_models: 'Пока здесь только модели Blockbench.',
    to_models: 'К моделям',
  },

  /**
   * The foot of every page.
   *
   * The four counts are written as whole sentences rather than as a label and a figure:
   * a row of labels reads as a dashboard, which is a thing to study, and this line is
   * meant to be read once. Each language names only the forms it has — see `forms.ts`.
   */
  foot: {
    models: (n: number) => `${num(n)} ${ends('ru', n, { one: 'модель', few: 'модели', other: 'моделей' })}`,
    authors: (n: number) => `${num(n)} ${ends('ru', n, { one: 'автор', few: 'автора', other: 'авторов' })}`,
    people: (n: number) => `${num(n)} ${ends('ru', n, { one: 'аккаунт', few: 'аккаунта', other: 'аккаунтов' })}`,
    downloads: (n: number) =>
      `${num(n)} ${ends('ru', n, { one: 'скачивание', few: 'скачивания', other: 'скачиваний' })}`,
    /**
     * What the site is not.
     *
     * Translated, because it is here to be understood. The English sentence beside it
     * is Mojang's own wording and stays in English in every language — their usage
     * guidelines ask for that one, and a translation of it would not be it.
     */
    unofficial:
      'Неофициальный сайт. Не продукт Minecraft, не одобрен Mojang или Microsoft и не связан с ними. Не связан с Blockbench.',
  },

  papers: {
    titles: {
      rules: 'Правила',
      data: 'Данные',
      contact: 'Контакты',
      faq: 'Вопросы',
      feedback: 'Отзывы',
    },
    /** The questions page, whose title is longer than its tab. */
    faq_title: 'Вопросы и ответы',
    contents: 'Содержание',
    /** A clause's number is also the way to hand that clause to somebody. */
    copy_clause: 'Скопировать ссылку на пункт',
    copied: 'Ссылка скопирована',
    changed_on: (day: string) => `Последнее изменение: ${day}`,
    /** Where models for adults are closed outright, when the answer is nowhere. */
    nowhere: 'нигде',
    /** The operator's e-mail is a secret the server has not been given yet. */
    no_email: 'ещё не задан на сервере — без него сайт нельзя открывать',
    /**
     * On every page whose words carry duties.
     *
     * Her decision: all fourteen languages, and the Russian text is the one that
     * counts. Said on the page rather than only in a file somewhere, because somebody
     * reading a translated rule has to know which text they are being held to.
     */
    governs: 'Переведено с русского. При расхождении смысла действует русский текст.',
  },

  /**
   * The wall of reviews: what people say about the plugin and about the site.
   *
   * Her four decisions of 9 October are in these words and nowhere else: two things
   * reviewed apart, words and a heart and no rating, and only people who signed in.
   * The heart says "this review was useful" and not "I agree with it" — hence a label
   * of its own rather than the one the talk under a model uses.
   */
  wall: {
    title: 'Отзывы о работе',
    lead: 'Здесь пишут о плагине и о сайте. Отзыв виден всем, и его можно переписать.',
    all: 'Всё',
    of_plugin: 'О плагине',
    of_site: 'О сайте',
    /** On a review, saying which of the two it is about. */
    is_plugin: 'Плагин',
    is_site: 'Сайт',
    say_plugin: 'Что скажешь о плагине',
    say_site: 'Что скажешь о сайте',
    answer: 'Что ответить',
    send: 'Написать',
    again: 'Переписать',
    reply: 'Ответить',
    not_reply: 'Не отвечать',
    reply_to: (who: string) => `Ответ: ${who}`,
    mine: 'Твой отзыв',
    /** Said under a review its author has rewritten since. */
    edited: 'Изменён',
    useful: 'Полезный отзыв',
    not_useful: 'Уже не полезный',
    take_mine: 'Удалить свой отзыв',
    take: 'Снять отзыв',
    report: 'Пожаловаться на отзыв',
    /**
     * What stands in the place of a review that was taken off, by whose hand it was.
     *
     * Its own words rather than the ones a comment under a model uses: there the third
     * hand is the model's owner, and on this wall that hand is deliberately absent.
     */
    gone_author: 'Автор удалил свой отзыв.',
    gone_site: 'Отзыв снят тем, кто ведёт сайт.',
    reading: 'Читаю отзывы…',
    none: 'Пока отзывов нет. Первый появится здесь.',
    none_plugin: 'О плагине ещё не писали.',
    none_site: 'О сайте ещё не писали.',
    sign_in: 'Отзывы пишут те, кто вошёл',
    barred: 'Писать пока нельзя',
    left: (n: number) => `${num(n)} ${ends('ru', n, { one: 'знак', few: 'знака', other: 'знаков' })} осталось`,
    counted: (n: number) => `${num(n)} ${ends('ru', n, { one: 'отзыв', few: 'отзыва', other: 'отзывов' })}`,
    /**
     * What the server refused, by its code.
     *
     * The Worker sends a code and an English sentence after it; this is where the code
     * becomes words. A code that arrives unknown to this dictionary falls back to that
     * English sentence, which is the one case where a visitor sees a language they did
     * not choose — better than a blank.
     */
    no: {
      wall_empty: 'Напиши, что сказать.',
      wall_no_thing: 'Выбери, о чём отзыв: о плагине или о сайте.',
      wall_bad_reply: 'Непонятно, на что это ответ.',
      wall_already: 'Отзыв об этом у тебя уже есть — его можно переписать.',
      wall_not_mine: 'Это не твой отзыв.',
      wall_gone: 'Этого отзыва больше нет.',
      wall_often: 'Подожди пару секунд перед следующим.',
      wall_hour: 'На этот час достаточно, продолжи позже.',
      wall_barred: 'Писать пока нельзя.',
    },
  },
};

/**
 * The shape every other language has to have.
 *
 * Taken from this file rather than written out by hand, so there is one place a new
 * word is added. Imported as a type only, which is what keeps the Russian dictionary
 * out of the bundle a German reader downloads.
 */
export type Words = typeof ru;

export default ru;
