// ============================================================
// Типы, константы, утилиты, RYB-смешивание пигментов
// ============================================================

export type PaperKind = 'a4' | 'a3' | 'canvas';
export type ToolId = 'pencil' | 'brush' | 'marker' | 'knife';
export type ShapeId = 'round' | 'flat' | 'grain' | 'soft';

export interface ToolDef { id: ToolId; name: string; minLevel: number; }
export const TOOLS: ToolDef[] = [
  { id: 'pencil', name: 'Карандаш', minLevel: 1 },
  { id: 'brush', name: 'Кисть', minLevel: 1 },
  { id: 'marker', name: 'Фломастер', minLevel: 2 },
  { id: 'knife', name: 'Мастихин', minLevel: 3 },
];

export interface PaperDef { id: PaperKind; name: string; w: number; h: number; price: number; minLevel: number; }
export const PAPERS: Record<PaperKind, PaperDef> = {
  a4: { id: 'a4', name: 'Бумага А4', w: 496, h: 702, price: 3, minLevel: 1 },
  a3: { id: 'a3', name: 'Бумага А3', w: 702, h: 992, price: 7, minLevel: 1 },
  canvas: { id: 'canvas', name: 'Холст на подрамнике', w: 700, h: 880, price: 18, minLevel: 2 },
};

export interface PaintDef { id: string; name: string; hex: string; price: number; minLevel: number; }
// Базовые пигменты + белила
export const PAINTS: PaintDef[] = [
  { id: 'red', name: 'Кадмий красный', hex: '#c1272d', price: 8, minLevel: 1 },
  { id: 'yellow', name: 'Охра жёлтая', hex: '#f2b01e', price: 8, minLevel: 1 },
  { id: 'blue', name: 'Ультрамарин', hex: '#2456a4', price: 8, minLevel: 1 },
  { id: 'white', name: 'Белила титановые', hex: '#f5f1e6', price: 6, minLevel: 1 },
];
// Дополнительные пигменты (смешать нельзя — только купить)
export const EXTRA_PAINTS: PaintDef[] = [
  { id: 'green', name: 'Виридоновая', hex: '#2e7d5b', price: 12, minLevel: 2 },
  { id: 'orange', name: 'Кадмий оранжевый', hex: '#e2711d', price: 12, minLevel: 2 },
  { id: 'purple', name: 'Хинакридон фиолетовый', hex: '#6d3a8f', price: 14, minLevel: 3 },
  { id: 'black', name: 'Сажа газовая', hex: '#26222e', price: 9, minLevel: 2 },
  { id: 'brown', name: 'Умбра жжёная', hex: '#6e4526', price: 10, minLevel: 2 },
  { id: 'pink', name: 'Краплак розовый', hex: '#d95a7a', price: 13, minLevel: 3 },
  { id: 'teal', name: 'Бирюза кобальтовая', hex: '#2a8f8f', price: 13, minLevel: 4 },
  { id: 'gold', name: 'Золото поталь', hex: '#d9a441', price: 22, minLevel: 5 },
];
export const ALL_PAINTS = [...PAINTS, ...EXTRA_PAINTS];
export const START_TUBES = ['red', 'yellow', 'blue', 'white'];

export interface BrushDef { id: string; name: string; price: number; minLevel: number; }
export const BRUSHES: BrushDef[] = [
  { id: 'basic', name: 'Щетинная №2', price: 0, minLevel: 1 },
  { id: 'soft', name: 'Белка №4 (мягкая)', price: 15, minLevel: 2 },
];

export interface Delivery { id: string; label: string; arriveMin: number; arrived: boolean; payload: { kind: 'food' | 'purchase'; items?: { id: string; count: number }[] } }

export interface PaintingMeta {
  id: string; title: string; quality: number; size: PaperKind;
  createdMin: number; thumb: string; soldTo?: string; exhibited?: boolean;
}

export interface Ad {
  id: string; paintingId: string; title: string; price: number; tags: string[];
  postedMin: number; resolveMin: number; status: 'active' | 'sold' | 'removed';
  strikes: number;
}

export interface MailOffer { adId: string; paintingId: string; amount: number; npcId: string; npcName: string; haggled: boolean; }
export interface MailCommission { npcId: string; npcName: string; brief: string; reward: number; size: PaperKind; deadlineMin: number; }
export interface Mail {
  id: string; from: string; subject: string; body: string; minute: number;
  read: boolean; kind: 'info' | 'offer' | 'commission' | 'result';
  offer?: MailOffer; commission?: MailCommission; action?: 'exhibition';
}

export interface Order {
  id: string; npcId: string; client: string; brief: string; size: PaperKind;
  reward: number; deadlineMin: number; status: 'active' | 'done' | 'failed';
}

export interface NPC { id: number; name: string; trait: string; style: string; budget: number; tier: number; email: string; }

export interface SaveData {
  version: number;
  started: boolean;
  playerName: string;
  money: number;
  xp: number;
  timeMin: number;          // игровые минуты с начала
  muted: boolean;
  papers: Record<PaperKind, number>;
  tubes: Record<string, number>;        // краска → оставшийся объём 0..100
  brushes: string[];
  skill: number;            // 1..10
  gallery: PaintingMeta[];
  inbox: Mail[];
  ads: Ad[];
  commissionAdActive: boolean;
  orders: Order[];
  deliveries: Delivery[];
  draftMeta: { paper: PaperKind; savedAt: number } | null;
  exhibitionState: 'none' | 'submitted' | 'invited' | 'done';
  exhibitionWorks: string[];
  exhibitionSubmitMin: number;
  exhibitionsDone: number;
  stats: { sold: number; earned: number; strokes: number; ordersDone: number };
  lastStipendDay: number;
}

export function newSave(): SaveData {
  const tubes: Record<string, number> = {};
  for (const id of START_TUBES) tubes[id] = 100;
  return {
    version: 1, started: false, playerName: 'Художник',
    money: 50, xp: 0, timeMin: 9 * 60, muted: false,
    papers: { a4: 3, a3: 0, canvas: 0 },
    tubes,
    brushes: ['basic'],
    skill: 1,
    gallery: [], inbox: [], ads: [], commissionAdActive: false,
    orders: [], deliveries: [], draftMeta: null,
    exhibitionState: 'none', exhibitionWorks: [], exhibitionSubmitMin: 0, exhibitionsDone: 0,
    stats: { sold: 0, earned: 0, strokes: 0, ordersDone: 0 },
    lastStipendDay: 0,
  };
}

export const LEVEL_TITLES = ['', 'Самоучка', 'Любитель', 'Художник', 'Мастер кисти', 'Виртуоз', 'Легенда мансарды'];
export const MAX_LEVEL = 6;
export function levelFromXp(xp: number) { return Math.min(MAX_LEVEL, 1 + Math.floor(xp / 400)); }
export function xpForLevel(l: number) { return (l - 1) * 400; }
export function priceCap(level: number) { return Math.round(120 * Math.pow(1.9, level - 1)); }
export const EXHIBITION_MIN_LEVEL = 4;
export const EXHIBITION_MIN_QUALITY = 55;

// ---------- утилиты ----------
export function rand(a: number, b: number) { return a + Math.random() * (b - a); }
export function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
export function uid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); }
export function fmtMoney(n: number) { return Math.round(n).toLocaleString('ru-RU') + '$'; }
export function fmtGameTime(min: number) {
  const m = ((Math.floor(min) % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60), mm = m % 60;
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}
export function fmtDuration(min: number) {
  min = Math.max(0, Math.round(min));
  const h = Math.floor(min / 60), m = min % 60;
  if (h <= 0) return `${m} мин`;
  return `${h} ч ${m} мин`;
}

// ---------- RYB-смешивание пигментов ----------
export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}
export function rgbToRyb(r: number, g: number, b: number): [number, number, number] {
  const w = Math.min(r, g, b);
  const rr = r - w, gg = g - w, bb = b - w;
  const mg = Math.min(gg, bb);
  const y = gg - mg;
  let bl = bb - mg;
  if (bl !== 0 && mg !== 0) bl /= 2;
  if (y !== 0 && mg !== 0) bl /= 2;
  const ryy = rr + y;
  const blbl = bl + mg;
  const mx = Math.max(ryy, y, blbl) || 1;
  const n = 255 / mx;
  return [ryy * n, y * n, blbl * n];
}
export function rybToRgb(r: number, y: number, b: number): [number, number, number] {
  const w = Math.min(r, y, b);
  const rr = r - w, yy = y - w, bb = b - w;
  const mg = Math.min(yy, bb);
  let g = yy - mg;
  let bl = bb - mg;
  if (bl !== 0 && mg !== 0) bl /= 2;
  if (g !== 0 && mg !== 0) g *= 2;
  let red = rr + g;
  let grn = g + mg;
  if (red !== 0 && grn !== 0) { red /= 2; grn /= 2; }
  const mx = Math.max(red, grn, bl) || 1;
  const n = 255 / mx;
  return [red * n, grn * n, bl * n];
}
/** Смешать два цвета как пигменты (RYB), t — доля второго */
export function mixPigments(hexA: string, hexB: string, t: number): string {
  const a = rgbToRyb(...hexToRgb(hexA));
  const b = rgbToRyb(...hexToRgb(hexB));
  const m: [number, number, number] = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  return rgbToHex(...rybToRgb(m[0], m[1], m[2]));
}
