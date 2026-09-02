// ============================================================
// NPCManager — 128 скриптованных ИИ-покупателей: имена, характеры, бюджеты.
// ============================================================
import { mulberry, pick, colorName, clamp, fmtMoney, rand, type PaintingMeta, type PaperKind } from './types';

export interface NPC {
  id: string; name: string; email: string; trait: string; tone: string;
  tier: number; budgetMult: number;
}

const FIRST = ['Алексей', 'Мария', 'Иван', 'Ольга', 'Дмитрий', 'Анна', 'Сергей', 'Екатерина', 'Николай', 'Татьяна', 'Павел', 'Ирина', 'Виктор', 'Светлана', 'Артём', 'Наталья', 'Григорий', 'Вера', 'Максим', 'Людмила', 'Борис', 'Ксения', 'Роман', 'Дарья', 'Степан', 'Алиса', 'Тимур', 'Полина', 'Владислав', 'Маргарита', 'Олеся', 'Константин'];
const LAST = ['Соболев', 'Кузнецов', 'Орлова', 'Мельников', 'Зайцева', 'Воронин', 'Лебедева', 'Соколов', 'Козлова', 'Морозов', 'Павлова', 'Семёнов', 'Голубева', 'Виноградов', 'Крылова', 'Ершов', 'Никитина', 'Фёдоров', 'Белова', 'Григорьев', 'Романова', 'Сергеев', 'Андреева', 'Тарасов', 'Ильина', 'Ковалёв', 'Медведева', 'Лазарев', 'Беляев', 'Соловьёва', 'Шестаков', 'Устинова'];
const TRAITS = ['ценитель абстракций', 'любит пейзажи', 'фанат ярких мазков', 'минималист', 'коллекционер', 'скептик со стажем', 'меценат', 'арт-блогер', 'искусствовед', 'ностальгирующий романтик', 'дизайнер интерьеров', 'просто ищет подарок маме'];
const TONES = ['вежливый', 'саркастичный', 'восторженный', 'деловой', 'загадочный'];

const SARCASTIC: ((p: string, c: string) => string)[] = [
  (p, c) => `Анализ завершён. ${p} при рыночном потолке ${c} — это не цена, это крик души. Рекомендую мольберт-тайм-аут.`,
  (p, c) => `Я ИИ, у меня нет чувств, но даже мне неловко. ${p}? Серьёзно? Рынок говорит: не больше ${c}.`,
  (p, c) => `За ${p} я могу купить небольшую галерею. Ваша картина прекрасна, но не настолько. Потолок: ${c}.`,
  (p, c) => `Обнаружена аномалия: цена ${p} превышает гравитацию вашего уровня (до ${c}). Сделка отклонена. Пришлите что-то реалистичнее.`,
  (p, c) => `Мой алгоритм смеха активирован. ${p}! Ха-ха. Ха. Ладно, максимум ${c} — и то из уважения к палитре.`,
  (p, c) => `Подсказка от Гомер-7: сначала репутация — потом миллионы. Сейчас ваш потолок ${c}. Работайте над мазком!`,
];

const PRAISE_HI = [
  '«{title}» — это же готовый шедевр! {color} просто вибрирует. Вешаю над диваном.',
  'Плакал(а). Немного. {color} в «{title}» попал(а) мне прямо в сердце.',
  'Коллекционирую двадцать лет — «{title}» входит в топ-3. {color} — гениальный ход.',
  'Показал(а) «{title}» тёще. Она молчала целую минуту. Это высшая похвала.',
];
const PRAISE_MID = [
  '«{title}» очень уютная вещь. {color} — приятный акцент. Спасибо!',
  'Хорошая работа, чувствуется рука. «{title}» отлично встала между полками.',
  'Не Малевич, конечно, но «{title}» мне нравится. Жене тоже.',
];
const PRAISE_LOW = [
  'Ну... за свои деньги — нормально. «{title}» теперь живёт на даче.',
  'Видел(а) и хуже. {color} смелый, одобряю. Тренируйтесь дальше!',
];

const BRIEFS = ['Закат над морем', 'Портрет моего кота Барсика', 'Ночной город в дождь', 'Букет пионов', 'Туманные горы', 'Абстракция «Настроение вторника»', 'Старый маяк', 'Утро в сосновом лесу', 'Космос и киты', 'Чайная церемония', 'Балкон с геранью', 'Первый снег'];
const STYLES = ['в тёплых тонах', 'минималистично', 'яркими смелыми мазками', 'в пастельной гамме', 'немного меланхолично', 'с золотыми акцентами', 'почти монохромно', 'в духе примитивизма'];

export class NPCManager {
  npcs: NPC[] = [];

  constructor(seed = 20240907) {
    const rng = mulberry(seed);
    const tiers: [number, number][] = [[1, 40], [2, 30], [3, 26], [4, 20], [5, 12]];
    let n = 0;
    for (const [tier, count] of tiers) {
      for (let i = 0; i < count; i++) {
        const fn = FIRST[Math.floor(rng() * FIRST.length)];
        const ln = LAST[Math.floor(rng() * LAST.length)];
        this.npcs.push({
          id: 'npc' + (++n),
          name: `${fn} ${ln}`,
          email: `${fn.toLowerCase()}.${ln.toLowerCase()}@pochta.art`.replace(/ё/g, 'e'),
          trait: TRAITS[Math.floor(rng() * TRAITS.length)],
          tone: TONES[Math.floor(rng() * TONES.length)],
          tier,
          budgetMult: 0.8 + rng() * 0.6,
        });
      }
    }
  }

  buyerFor(level: number): NPC {
    const maxTier = clamp(level + 1, 1, 5);
    const pool = this.npcs.filter(n => n.tier <= maxTier);
    return pool[Math.floor(Math.random() * pool.length)];
  }

  byId(id: string): NPC | undefined { return this.npcs.find(n => n.id === id); }

  budgetOf(npc: NPC): number {
    return Math.round((110 + npc.tier * 170) * npc.budgetMult * rand(0.75, 1.35));
  }

  sarcasticOverprice(price: number, cap: number): string {
    return pick(SARCASTIC)(fmtMoney(price), fmtMoney(cap));
  }

  praise(p: PaintingMeta): string {
    const color = p.palette.length ? colorName(p.palette[0]) : 'цвет';
    const pool = p.quality >= 75 ? PRAISE_HI : p.quality >= 50 ? PRAISE_MID : PRAISE_LOW;
    return pick(pool).replace(/\{title\}/g, p.title).replace(/\{color\}/g, color);
  }

  commission(level: number): { brief: string; style: string; size: PaperKind; reward: number } {
    const sizes: PaperKind[] = level >= 3 ? ['a4', 'a3', 'cv-s', 'cv-m'] : level >= 2 ? ['a4', 'a3', 'cv-s'] : ['a4', 'a3'];
    const size = pick(sizes);
    const base: Record<PaperKind, number> = { 'a4': 180, 'a3': 260, 'cv-s': 380, 'cv-m': 520, 'cv-l': 700 };
    const reward = Math.round((base[size] * (1 + level * 0.15)) / 5) * 5;
    return { brief: pick(BRIEFS), style: pick(STYLES), size, reward };
  }
}
