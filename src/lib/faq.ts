/**
 * The questions people ask, answered once, on a page of their own.
 *
 * <h2>Why not in the model window</h2>
 *
 * "Как открыть" used to sit in every model window, the same three lines under every
 * model, read once and scrolled past for ever after. A window is for the model. The
 * answer lives here, and the window keeps a question mark in its top bar that comes
 * straight to it.
 *
 * Each answer has a key, which is its address: `/faq#open` opens the page on it.
 * The text uses the same little markup as the rules — `[words](paper#key)` for a link.
 * Everything said is checked against what the site does, as with the rules: a help
 * page that describes a site that does not exist is worse than none.
 */

export interface Question {
  key: string;
  question: string;
  answer: string;
}

export const FAQ: Question[] = [
  {
    key: 'open',
    question: 'Как открыть модель в Blockbench?',
    answer:
      'Скачай файл кнопкой со стрелкой в окне модели и перетащи его в окно Blockbench или открой через меню File, Open Model. Можно и без установки — так же в веб-версии на web.blockbench.net. Это обычный проект .bbmodel: кубы, текстуры и анимации откроются такими, какими их сохранил автор.',
  },
  {
    key: 'formats',
    question: 'Что значат «Java», «Bedrock», «Для модов» и «Свободная»?',
    answer:
      'Это формат проекта, который автор выбрал в Blockbench, когда создавал модель. Java — блоки, предметы и модели OptiFine для Java Edition. Bedrock — сущности и блоки для Bedrock Edition. Для модов — сущности для модов и модели GeckoLib. Свободная — модель не для одной конкретной игры. Точный формат указан в сведениях о модели, и по нему можно искать в фильтрах.',
  },
  {
    key: 'looks',
    question: 'Почему на сайте модель выглядит не совсем как в Blockbench?',
    answer:
      'Сайт рисует модель так, как она будет выглядеть в игре, а не в редакторе. Части, помеченные в Blockbench «не экспортировать», сайт не рисует: в игре их не будет. Кубы без своего цвета Blockbench при каждом открытии красит случайно, а сайт — всегда одним и тем же цветом. Если в формате с одной текстурой сохранены две, сайт берёт ту, которую называют грани модели. Сам файл от этого не меняется: скачивается ровно то, что загрузил автор.',
  },
  {
    key: 'upload',
    question: 'Как загрузить свою модель?',
    answer:
      'Войди через Discord или GitHub, открой «Мои модели» и нажми «Загрузить». Можно сразу несколько файлов .bbmodel, и у каждого свои описание, теги, лицензия и фон. Пути к папкам на твоём диске сайт убирает из файла ещё до отправки. Загруженная модель сначала видна только тебе и попадает в каталог, когда ты её опубликуешь.',
  },
  {
    key: 'license',
    question: 'Что значит лицензия модели?',
    answer:
      'То, что автор разрешает делать с моделью. CC0 — что угодно, без условий. CC BY — что угодно, но с указанием автора. NC в названии — только некоммерчески, SA — дальше на тех же условиях. «Все права защищены» — автор ничего сверх закона не разрешает, так что прежде чем использовать модель где-то ещё, спроси его. Ссылка на полный текст лицензии — в окне модели.',
  },
  {
    key: 'adult',
    question: 'Почему я вижу не все модели?',
    answer:
      'Модели 18+ скрыты, пока не войдёшь и не подтвердишь возраст в меню аккаунта; там же выбирается, показывать их размытыми или как есть. В некоторых странах они закрыты полностью — см. [правила, раздел о моделях для взрослых](rules#adult-gate).',
  },
  {
    key: 'background',
    question: 'Как поменять фон за моделями?',
    answer:
      'Кнопкой с квадратиком цвета в верхней строке, рядом с «в ряд». «Только пустые» подкладывает выбранный цвет под модели, у которых автор не задал свой фон, «Заменить все» — под все. Выбор хранится только в твоём браузере.',
  },
  {
    key: 'report',
    question: 'Как пожаловаться на модель или комментарий?',
    answer:
      'Кнопкой с флажком в окне модели или рядом с комментарием: там выбирается, что именно не так. Без аккаунта — письмом, как сказано на странице [«Контакты»](contact#letter). Что бывает дальше, описано в [правилах](rules#report).',
  },
];
