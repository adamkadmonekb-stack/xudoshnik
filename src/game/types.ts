// ============================================================
// «Мансарда» — симулятор художника. Общие типы, константы, утилиты.
// ============================================================

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const rand = (a: number, b: number) => a + Math.random() * (b - a);
export const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

export function uid(): string {
  return Date.now().toString(36) + Math.floor(Math.random() * 1e9).toString(36);
}

/** Детерминированный ГПСЧ (mulberry32) — для базы NPC. */
export function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function angleLerp(a: number, b: number, t: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

// ---------- Цвет: RYB-смешивание пигментов (Gosset & Chen) ----------
export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
export function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0');
  return '#' + c(r) + c(g) + c(b);
}
export function rgb2ryb(r: number, g: number, b: number): [number, number, number] {
  const w = Math.min(r, g, b);
  r -= w; g -= w; b -= w;
  const mg = Math.max(r, g, b);
  let y = Math.min(r, g);
  r -= y; g -= y;
  if (b && g) { b /= 2; g /= 2; }
  y += g; b += g;
  const my = Math.max(r, y, b);
  if (my) { const n = mg / my; r *= n; y *= n; b *= n; }
  return [r, y, b];
}
export function ryb2rgb(r: number, y: number, b: number): [number, number, number] {
  const w = Math.min(r, y, b);
  r -= w; y -= w; b -= w;
  const mg = Math.max(r, y, b);
  let g = Math.min(y, b);
  y -= g; b -= g;
  if (b && g) { b /= 2; g /= 2; }
  r += y; g += y;
  const my = Math.max(r, g, b);
  if (my) { const n = mg / my; r *= n; g *= n; b *= n; }
  return [r, g, b];
}
/** Смешать два цвета как пигменты (RYB), t — доля второго. */
export function mixRYB(hexA: string, hexB: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(hexA);
  const [r2, g2, b2] = hexToRgb(hexB);
  const a = rgb2ryb(r1, g1, b1);
  const b = rgb2ryb(r2, g2, b2);
  const m: [number, number, number] = [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  const rgb = ryb2rgb(m[0], m[1], m[2]);
  return rgbToHex(rgb[0], rgb[1], rgb[2]);
}

const COLOR_NAMES: [string, string][] = [
  ['#c23b3b', 'красный'], ['#e0a52e', 'жёлтый'], ['#2f4fae', 'синий'], ['#2e8b6a', 'зелёный'],
  ['#d96f2b', 'оранжевый'], ['#7a4fd0', 'фиолетовый'], ['#d65fa0', 'розовый'], ['#2b2b30', 'чёрный'],
  ['#efe9dc', 'белый'], ['#8a5a33', 'коричневый'], ['#2a9d9d', 'бирюзовый'], ['#f2c14e', 'золотой'],
];
export function colorName(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  let best = COLOR_NAMES[0][1], bd = 1e9;
  for (const [h, n] of COLOR_NAMES) {
    const [r2, g2, b2] = hexToRgb(h);
    const d = (r - r2) ** 2 + (g - g2) ** 2 + (b - b2) ** 2;
    if (d < bd) { bd = d; best = n; }
  }
  return best;
}

// ---------- Форматирование ----------
export const fmtMoney = (n: number) => '$' + Math.round(n).toLocaleString('ru-RU');
export const fmtClock = (min: number) => {
  const m = ((min % 1440) + 1440) % 1440;
  return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
};
export const fmtDay = (min: number) => Math.floor(min / 1440) + 1;
export const fmtDayTime = (min: number) => `День ${fmtDay(min)}, ${fmtClock(min)}`;
export function fmtDuration(mins: number): string {
  mins = Math.max(0, Math.round(mins));
  const h = Math.floor(mins / 60), m = mins % 60;
  if (h >= 24) return `${Math.floor(h / 24)} д ${h % 24} ч`;
  if (h > 0) return `${h} ч ${m} мин`;
  return `${m} мин`;
}

// ---------- Бумага / холсты ----------
export type PaperKind = 'a4' | 'a3' | 'cv-s' | 'cv-m' | 'cv-l';
export interface PaperDef { kind: PaperKind; name: string; w: number; h: number; tier: number; }
export const PAPERS: Record<PaperKind, PaperDef> = {
  'a4': { kind: 'a4', name: 'Бумага А4', w: 600, h: 848, tier: 1 },
  'a3': { kind: 'a3', name: 'Бумага А3', w: 848, h: 1200, tier: 1 },
  'cv-s': { kind: 'cv-s', name: 'Холст 40×50', w: 640, h: 800, tier: 2 },
  'cv-m': { kind: 'cv-m', name: 'Холст 60×80', w: 720, h: 960, tier: 2 },
  'cv-l': { kind: 'cv-l', name: 'Холст 80×100', w: 800, h: 1000, tier: 3 },
};

// ---------- Каталог магазина ----------
export type ShopKind = 'paint' | 'brush' | 'markers' | 'paper' | 'food' | 'study';
export interface TubeDef { id: string; name: string; color: string; price: number; tier: number; }
export const TUBES: TubeDef[] = [
  { id: 'white', name: 'Белила титановые', color: '#efe9dc', price: 14, tier: 1 },
  { id: 'black', name: 'Кость чёрная', color: '#2b2b30', price: 16, tier: 1 },
  { id: 'red', name: 'Краплак красный', color: '#c23b3b', price: 18, tier: 1 },
  { id: 'yellow', name: 'Охра золотистая', color: '#e0a52e', price: 18, tier: 1 },
  { id: 'blue', name: 'Ультрамарин', color: '#2f4fae', price: 20, tier: 1 },
  { id: 'green', name: 'Виридоновая зелёная', color: '#2e8b6a', price: 26, tier: 2 },
  { id: 'orange', name: 'Марс оранжевый', color: '#d96f2b', price: 26, tier: 2 },
  { id: 'pink', name: 'Розовый кварц', color: '#d65fa0', price: 28, tier: 2 },
  { id: 'teal', name: 'Бирюза', color: '#2a9d9d', price: 30, tier: 2 },
];
export interface BrushDef { id: string; name: string; shape: 'round' | 'flat'; price: number; tier: number; }
export const BRUSHES: BrushDef[] = [
  { id: 'b-round', name: 'Кисть круглая №6', shape: 'round', price: 35, tier: 1 },
  { id: 'b-flat', name: 'Кисть плоская №12', shape: 'flat', price: 60, tier: 1 },
  { id: 'b-soft', name: 'Синтетика мягкая №8', shape: 'round', price: 95, tier: 2 },
];
export const MARKER_SET = {
  id: 'mk6', name: 'Набор фломастеров, 6 шт', price: 45, tier: 1,
  colors: ['#e04747', '#3b6fd4', '#2f9e57', '#e0a52e', '#7a4fd0', '#2b2b30'],
};
export interface PaperPack { kind: PaperKind; name: string; qty: number; price: number; tier: number; }
export const PAPER_PACKS: PaperPack[] = [
  { kind: 'a4', name: 'Бумага А4, 5 листов', qty: 5, price: 32, tier: 1 },
  { kind: 'a3', name: 'Бумага А3, 3 листа', qty: 3, price: 45, tier: 1 },
  { kind: 'cv-s', name: 'Холст на подрамнике 40×50', qty: 1, price: 55, tier: 2 },
  { kind: 'cv-m', name: 'Холст на подрамнике 60×80', qty: 1, price: 90, tier: 2 },
  { kind: 'cv-l', name: 'Холст на подрамнике 80×100', qty: 1, price: 140, tier: 3 },
];
export interface FoodDef { id: string; name: string; price: number; energy: number; desc: string; }
export const FOODS: FoodDef[] = [
  { id: 'coffee', name: 'Кофе с собой', price: 5, energy: 18, desc: 'Горячий и крепкий' },
  { id: 'ramen', name: 'Рамен', price: 9, energy: 32, desc: 'С яйцом и нори' },
  { id: 'pizza', name: 'Пицца «4 сыра»', price: 12, energy: 45, desc: 'Тянется сыр' },
  { id: 'cake', name: 'Тортик «Мансарда»', price: 16, energy: 60, desc: 'Медовые коржи' },
];
export interface StudyDef { id: string; name: string; price: number; tier: number; skillTo: number; desc: string; }
export const STUDIES: StudyDef[] = [
  { id: 'study1', name: 'Курсы акварели', price: 200, tier: 2, skillTo: 2, desc: 'Мазок станет увереннее (+качество)' },
  { id: 'study2', name: 'Мастер-класс масла', price: 500, tier: 3, skillTo: 3, desc: 'Почти профессионал (+качество)' },
];

// ---------- Прогрессия ----------
export const LEVEL_TITLES = ['', 'Самоучка', 'Любитель', 'Художник', 'Мастер кисти', 'Виртуоз', 'Легенда мансарды'];
export const LEVEL_XP = [0, 0, 150, 420, 850, 1500, 2400];
export const MAX_LEVEL = 6;
export function levelForXp(xp: number): number {
  let lvl = 1;
  for (let i = 1; i < LEVEL_XP.length; i++) if (xp >= LEVEL_XP[i]) lvl = i;
  return Math.min(lvl, MAX_LEVEL);
}
export function xpProgress(xp: number): { level: number; into: number; need: number; pct: number } {
  const level = levelForXp(xp);
  if (level >= MAX_LEVEL) return { level, into: 1, need: 1, pct: 100 };
  const base = LEVEL_XP[level], next = LEVEL_XP[level + 1];
  return { level, into: xp - base, need: next - base, pct: Math.round(((xp - base) / (next - base)) * 100) };
}
/** Анти-чит: потолок адекватной цены для уровня. */
export const priceCap = (level: number) => 150 + level * 300;
export const EXHIBITION_MIN_LEVEL = 3;
export const EXHIBITION_MIN_QUALITY = 55;

// ---------- Сущности ----------
export interface OwnedMarker { color: string; ink: number; }
export interface PaintingMeta {
  id: string; title: string; quality: number; minute: number; paper: PaperKind;
  thumb: string; palette: string[]; strokes: number; tools: string[];
  soldTo?: string; exhibited?: boolean;
}
export interface Ad {
  id: string; paintingId: string; title: string; price: number; tags: string[];
  postedMin: number; resolveMin: number; status: 'active' | 'sold' | 'removed'; strikes: number;
}
export interface OfferPayload { adId: string; paintingId: string; amount: number; npcId: string; npcName: string; haggled: boolean; }
export interface CommissionPayload { npcId: string; npcName: string; brief: string; reward: number; size: PaperKind; deadlineMin: number; }
export interface Mail {
  id: string; from: string; subject: string; body: string; minute: number; read: boolean;
  kind: 'info' | 'offer' | 'commission' | 'result';
  offer?: OfferPayload; commission?: CommissionPayload; action?: 'exhibition';
}
export interface Order {
  id: string; npcId: string; client: string; brief: string; size: PaperKind;
  reward: number; deadlineMin: number; status: 'active' | 'done' | 'failed';
}
export interface Delivery { id: string; label: string; foodId: string; arriveMin: number; arrived: boolean; }

export interface SaveData {
  version: number; started: boolean; muted: boolean;
  money: number; xp: number; energy: number; skill: number;
  timeMin: number; lastStipendDay: number;
  tubes: Record<string, number>;
  brushes: string[];
  markers: OwnedMarker[];
  papers: Record<PaperKind, number>;
  gallery: PaintingMeta[];
  ads: Ad[];
  commissionAdActive: boolean;
  inbox: Mail[];
  orders: Order[];
  deliveries: Delivery[];
  exhibitionsHeld: number;
  exhibitionState: 'none' | 'submitted' | 'invited' | 'visited';
  exhibitionWorks: string[];
  exhibitionSubmitMin: number;
  draftMeta: { paper: PaperKind } | null;
  stats: { sold: number; ordersDone: number; earned: number; strokes: number };
}

export function newSave(): SaveData {
  return {
    version: 1, started: true, muted: false,
    money: 50, xp: 0, energy: 80, skill: 1,
    timeMin: 8 * 60 + 30, lastStipendDay: 0,
    tubes: {}, brushes: [], markers: [],
    papers: { 'a4': 3, 'a3': 0, 'cv-s': 0, 'cv-m': 0, 'cv-l': 0 },
    gallery: [], ads: [], commissionAdActive: false, inbox: [],
    orders: [], deliveries: [],
    exhibitionsHeld: 0, exhibitionState: 'none', exhibitionWorks: [], exhibitionSubmitMin: 0,
    draftMeta: null,
    stats: { sold: 0, ordersDone: 0, earned: 0, strokes: 0 },
  };
}

export const WELCOME_MAIL: Omit<Mail, 'id' | 'minute' | 'read'> = {
  from: 'upravdom@mansarda.ru', subject: 'Добро пожаловать в мансарду!',
  body: 'Здравствуй, сосед! Ты снял мансарду №9 — холст мечты, а не комнату.\n\nС чего начать:\n• Кликни по СТОЛУ — там твои карандаши и бумага А4.\n• Мольберт ждёт: выбери лист и рисуй (карандашом — пока это всё, что есть).\n• ПК у окна: доска объявлений «Толкучка», магазины, почта.\n• Готовую картину выставь на продажу — заглянет кто-нибудь из 128 местных ценителей.\n\nНе голодай: энергия тает за мольбертом, еду привозит курьер (слушай звонок).\n\n— Управдом Палыч',
  kind: 'info',
};
