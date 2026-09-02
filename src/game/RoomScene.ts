// ============================================================
// RoomScene — мансарда на PixiJS: мольберт, дверь, ПК, стол, кот,
// день/ночь за окном, курьер с посылкой, картины на стене.
// ExhibitionScene — сцена выставки в галерее.
// ============================================================
import { Container, Graphics, Sprite, Texture, Text } from 'pixi.js';
import type { Game } from './Game';
import type { Delivery, PaintingMeta } from './types';

const W = 1280, H = 720;
const FLOOR_Y = 470;

interface Tween { t: number; dur: number; fn: (p: number) => void; done?: () => void; }

function gradTex(w: number, h: number, stops: [number, string][]) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, h);
  for (const [p, col] of stops) g.addColorStop(p, col);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  return Texture.from(c);
}
function radialTex(size: number, color: string) {
  // Округляем размер вверх до ближайшей степени двойки
  const s = Math.pow(2, Math.ceil(Math.log2(size)));
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(s / 2, s / 2, 2, s / 2, s / 2, s / 2);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  return Texture.from(c);
}

export class RoomScene {
  game: Game;
  root = new Container();
  active = false;
  private fit = new Container();
  private tweens: Tween[] = [];
  private t = 0;
  private sky!: Graphics;
  private stars!: Graphics;
  private moon!: Sprite;
  private clouds: Sprite[] = [];
  private lampGlow!: Sprite;
  private screenGfx!: Graphics;
  private cat!: Container;
  private catTail!: Graphics;
  private zzz: Text | null = null;
  private zzzTimer = 0;
  private dust: Sprite[] = [];
  private frameSprs: Sprite[] = [];
  private doorSlab!: Graphics;
  private packageSpr: Container | null = null;
  private pendingDelivery: Delivery | null = null;
  private courier: Container | null = null;
  private courierState: 'none' | 'in' | 'drop' | 'out' = 'none';
  private courierT = 0;
  private easelPaper!: Container;
  private hotspots: { spr: Sprite; label: string; hint: string; click: () => void }[] = [];
  private tooltipHide: (() => void) | null = null;
  private flickTimer = 0;

  constructor(game: Game) { this.game = game; }

  // ---------- построение ----------
  mount() {
    this.active = true;
    this.game.sceneRoot.addChild(this.root);
    this.build();
    this.resize(this.game.app.renderer.width, this.game.app.renderer.height);
    this.setTimeOfDay(this.game.save.timeMin);
    this.refreshFrames();
    this.refreshEasel();
  }
  unmount() {
    this.active = false;
    this.hideTooltip();
    this.root.removeChildren();
    this.fit.removeChildren();
    this.game.sceneRoot.removeChild(this.root);
    this.hotspots = [];
    this.frameSprs = [];
    this.clouds = [];
    this.dust = [];
    this.tweens = [];
    this.courier = null;
    this.courierState = 'none';
    this.packageSpr = null;
    this.pendingDelivery = null;
    this.zzz = null;
  }

  private build() {
    const f = this.fit;
    this.root.addChild(f);
    f.removeChildren();

    // стена
    const wall = new Sprite(gradTex(64, 64, [[0, '#332640'], [0.75, '#2a2036'], [1, '#241b2e']]));
    wall.width = W; wall.height = FLOOR_Y;
    f.addChild(wall);
    // кирпичная фактура
    const bricks = new Graphics();
    for (let y = 12; y < FLOOR_Y - 20; y += 34) {
      const off = (y / 34) % 2 ? 40 : 0;
      for (let x = -40 + off; x < W; x += 80) {
        bricks.roundRect(x + 2, y + 2, 76, 30, 3).stroke({ color: 0x1d1526, width: 1.5, alpha: 0.5 });
      }
    }
    f.addChild(bricks);
    // плинтус
    const skirt = new Graphics();
    skirt.rect(0, FLOOR_Y - 10, W, 12).fill({ color: 0x191020 });
    f.addChild(skirt);
    // пол
    const floor = new Graphics();
    floor.rect(0, FLOOR_Y, W, H - FLOOR_Y).fill({ color: 0x5c4128 });
    for (let i = 0; i < 14; i++) {
      const x = i * 96;
      floor.rect(x, FLOOR_Y, 2.5, H - FLOOR_Y).fill({ color: 0x432e1a, alpha: 0.8 });
      floor.rect(x + 8, FLOOR_Y, 5, H - FLOOR_Y).fill({ color: 0x6b4c2e, alpha: 0.5 });
    }
    f.addChild(floor);
    // ковёр
    const rug = new Graphics();
    rug.ellipse(640, 615, 300, 80).fill({ color: 0x7c3b46, alpha: 0.85 });
    rug.ellipse(640, 615, 260, 64).fill({ color: 0x93504f, alpha: 0.8 });
    rug.ellipse(640, 615, 130, 32).fill({ color: 0xa8655a, alpha: 0.7 });
    f.addChild(rug);

    this.buildWindow(f);
    this.buildDoor(f);
    this.buildFrames(f);
    this.buildDesk(f);
    this.buildEasel(f);
    this.buildLamp(f);
    this.buildPlant(f);
    this.buildCat(f);
    this.buildDust(f);
    this.buildHotspots(f);
  }

  private buildWindow(f: Container) {
    const wx = 190, wy = 95, ww = 250, wh = 215;
    this.sky = new Graphics();
    f.addChild(this.sky);
    // звёзды и луна
    this.stars = new Graphics();
    const sr = () => Math.random();
    for (let i = 0; i < 16; i++) {
      this.stars.circle(wx + 12 + sr() * (ww - 24), wy + 10 + sr() * (wh - 60), 1 + sr()).fill({ color: 0xfff4d6, alpha: 0.9 });
    }
    f.addChild(this.stars);
    this.moon = new Sprite(radialTex(64, 'rgba(255,244,214,0.95)'));
    this.moon.anchor.set(0.5);
    this.moon.position.set(wx + ww - 55, wy + 52);
    this.moon.scale.set(0.8);
    f.addChild(this.moon);
    // облака
    const cloudTex = radialTex(90, 'rgba(255,255,255,0.55)');
    for (let i = 0; i < 3; i++) {
      const c = new Sprite(cloudTex);
      c.scale.set(1.1 - i * 0.2, 0.45);
      c.position.set(wx + 40 + i * 70, wy + 45 + i * 34);
      this.clouds.push(c);
      f.addChild(c);
    }
    // рама
    const frame = new Graphics();
    frame.rect(wx - 12, wy - 12, ww + 24, wh + 24).fill({ color: 0x241a2c });
    frame.rect(wx, wy, ww, wh).stroke({ color: 0x3d2c47, width: 6 });
    frame.rect(wx + ww / 2 - 3, wy, 6, wh).fill({ color: 0x3d2c47 });
    frame.rect(wx, wy + wh / 2 - 3, ww, 6).fill({ color: 0x3d2c47 });
    // подоконник и горшок
    frame.rect(wx - 20, wy + wh + 12, ww + 40, 12).fill({ color: 0x31243c });
    f.addChild(frame);
    const pot = new Graphics();
    pot.rect(wx + 22, wy + wh - 16, 26, 20).fill({ color: 0x8a4a3a });
    pot.circle(wx + 35, wy + wh - 24, 12).fill({ color: 0x3f7a4e });
    pot.circle(wx + 26, wy + wh - 32, 8).fill({ color: 0x4c8f5c });
    pot.circle(wx + 45, wy + wh - 30, 7).fill({ color: 0x3f7a4e });
    f.addChild(pot);
    (this as any)._wx = wx; (this as any)._ww = ww;
  }

  private buildDoor(f: Container) {
    const dx = 40, dy = 150, dw = 108, dh = FLOOR_Y - dy + 2;
    const opening = new Graphics();
    opening.rect(dx, dy, dw, dh).fill({ color: 0x120c16 });
    f.addChild(opening);
    this.doorSlab = new Graphics();
    this.doorSlab.rect(0, 0, dw, dh).fill({ color: 0x6e4a2c });
    this.doorSlab.rect(10, 12, dw - 20, dh * 0.42).stroke({ color: 0x54371f, width: 4 });
    this.doorSlab.rect(10, dh * 0.52, dw - 20, dh * 0.4).stroke({ color: 0x54371f, width: 4 });
    this.doorSlab.circle(dw - 16, dh * 0.52, 5).fill({ color: 0xd9b36a });
    this.doorSlab.position.set(dx, dy);
    f.addChild(this.doorSlab);
    const doorFrame = new Graphics();
    doorFrame.rect(dx - 8, dy - 10, dw + 16, 10).fill({ color: 0x31243c });
    doorFrame.rect(dx - 8, dy, 8, dh).fill({ color: 0x31243c });
    doorFrame.rect(dx + dw, dy, 8, dh).fill({ color: 0x31243c });
    f.addChild(doorFrame);
  }

  private buildFrames(f: Container) {
    const xs = [520, 680, 840];
    for (const x of xs) {
      const fr = new Graphics();
      fr.rect(x - 8, 102, 136, 116).fill({ color: 0x8a5a33 });
      fr.rect(x - 2, 108, 124, 104).fill({ color: 0xf0e8d8 });
      f.addChild(fr);
      const spr = new Sprite(Texture.EMPTY);
      spr.position.set(x + 2, 112);
      spr.width = 116; spr.height = 96;
      this.frameSprs.push(spr);
      f.addChild(spr);
      const nail = new Graphics();
      nail.circle(x + 60, 96, 2.5).fill({ color: 0x999999 });
      f.addChild(nail);
    }
  }

  private buildDesk(f: Container) {
    const dx = 950, dy = 402;
    const desk = new Graphics();
    desk.rect(dx - 14, dy, 308, 16).fill({ color: 0x7a5230 });
    desk.rect(dx - 14, dy + 16, 308, 6).fill({ color: 0x5d3d22 });
    desk.rect(dx + 6, dy + 22, 14, 130).fill({ color: 0x5d3d22 });
    desk.rect(dx + 250, dy + 22, 14, 130).fill({ color: 0x5d3d22 });
    desk.rect(dx + 210, dy + 22, 56, 40).fill({ color: 0x6b4728 });
    desk.rect(dx + 216, dy + 30, 44, 8).fill({ color: 0x54371f });
    f.addChild(desk);
    // монитор
    const mon = new Graphics();
    mon.roundRect(dx + 70, dy - 118, 150, 100, 8).fill({ color: 0x23202b });
    mon.rect(dx + 132, dy - 18, 26, 12).fill({ color: 0x23202b });
    mon.rect(dx + 112, dy - 8, 66, 7).fill({ color: 0x1b1922 });
    f.addChild(mon);
    this.screenGfx = new Graphics();
    f.addChild(this.screenGfx);
    (this as any)._mon = { x: dx + 78, y: dy - 110, w: 134, h: 84 };
    // клавиатура и кружка
    const kb = new Graphics();
    kb.roundRect(dx + 90, dy - 8, 110, 8, 3).fill({ color: 0x2e2a38 });
    f.addChild(kb);
    const mug = new Graphics();
    mug.roundRect(dx + 30, dy - 22, 20, 22, 3).fill({ color: 0xc96f4a });
    mug.roundRect(dx + 48, dy - 17, 8, 12, 4).stroke({ color: 0xc96f4a, width: 3 });
    f.addChild(mug);
    // стул
    const chair = new Graphics();
    chair.roundRect(dx + 110, dy + 60, 90, 14, 6).fill({ color: 0x4a3550 });
    chair.rect(dx + 190, dy - 10, 14, 84).fill({ color: 0x4a3550 });
    chair.rect(dx + 120, dy + 74, 10, 76).fill({ color: 0x33233c });
    chair.rect(dx + 178, dy + 74, 10, 76).fill({ color: 0x33233c });
    f.addChild(chair);
  }

  private buildEasel(f: Container) {
    const ex = 560, ey = 372;
    const easel = new Graphics();
    // тренога
    easel.poly([ex + 70, ey - 10, ex + 78, ey - 10, ex + 130, ey + 260, ex + 118, ey + 260]).fill({ color: 0x7a5230 });
    easel.poly([ex, ey + 260, ex + 12, ey + 260, ex + 64, ey - 10, ex + 56, ey - 10]).fill({ color: 0x8a5d36 });
    easel.poly([ex + 62, ey + 40, ex + 70, ey + 40, ex + 74, ey + 260, ex + 66, ey + 260]).fill({ color: 0x6b4728 });
    // полочка
    easel.rect(ex - 6, ey + 168, 152, 10).fill({ color: 0x94683c });
    f.addChild(easel);
    this.easelPaper = new Container();
    this.easelPaper.position.set(ex + 6, ey + 8);
    f.addChild(this.easelPaper);
  }

  private buildLamp(f: Container) {
    const lx = 880;
    const lamp = new Graphics();
    lamp.rect(lx - 3, 330, 6, 210).fill({ color: 0x3a2f45 });
    lamp.ellipse(lx, 545, 26, 8).fill({ color: 0x3a2f45 });
    lamp.poly([lx - 34, 330, lx + 34, 330, lx + 22, 292, lx - 22, 292]).fill({ color: 0xd98e4a });
    f.addChild(lamp);
    this.lampGlow = new Sprite(radialTex(256, 'rgba(255,190,110,0.5)'));
    this.lampGlow.anchor.set(0.5);
    this.lampGlow.position.set(lx, 350);
    this.lampGlow.scale.set(1.4);
    f.addChild(this.lampGlow);
    const bulb = new Sprite(radialTex(48, 'rgba(255,236,180,0.95)'));
    bulb.anchor.set(0.5);
    bulb.position.set(lx, 330);
    f.addChild(bulb);
  }

  private buildPlant(f: Container) {
    const px = 168, py = 470;
    const pl = new Graphics();
    pl.poly([px - 26, py, px + 26, py, px + 18, py + 46, px - 18, py + 46]).fill({ color: 0x8a4a3a });
    for (let i = 0; i < 7; i++) {
      const a = -Math.PI / 2 + (i - 3) * 0.32;
      const len = 46 + (i % 3) * 16;
      pl.ellipse(px + Math.cos(a) * len * 0.5, py - 6 + Math.sin(a) * len * 0.5, 10, len * 0.55).fill({ color: i % 2 ? 0x3f7a4e : 0x4c8f5c, alpha: 0.95 });
    }
    f.addChild(pl);
  }

  private buildCat(f: Container) {
    this.cat = new Container();
    this.cat.position.set(735, 596);
    const body = new Graphics();
    body.ellipse(0, 0, 44, 26).fill({ color: 0x4a4458 });
    body.circle(-40, -12, 17).fill({ color: 0x4a4458 });
    body.poly([-52, -24, -46, -38, -38, -26]).fill({ color: 0x4a4458 });
    body.poly([-34, -26, -28, -38, -22, -24]).fill({ color: 0x4a4458 });
    body.ellipse(-40, -10, 3, 1.6).fill({ color: 0x191020 });
    body.ellipse(-31, -10, 3, 1.6).fill({ color: 0x191020 });
    body.poly([18, 8, 52, -2, 50, 6, 20, 16]).fill({ color: 0x4a4458 });
    this.cat.addChild(body);
    this.catTail = new Graphics();
    this.catTail.poly([0, 0, 34, -14, 38, -6, 6, 8]).fill({ color: 0x3d3749 });
    this.catTail.position.set(36, 2);
    this.cat.addChild(this.catTail);
    f.addChild(this.cat);
  }

  private buildDust(f: Container) {
    const tex = radialTex(10, 'rgba(255,240,210,0.8)');
    for (let i = 0; i < 26; i++) {
      const d = new Sprite(tex);
      d.scale.set(0.4 + Math.random() * 0.6);
      d.position.set(150 + Math.random() * 1000, 120 + Math.random() * 420);
      d.alpha = 0.06 + Math.random() * 0.1;
      (d as any)._sp = 4 + Math.random() * 8;
      (d as any)._ph = Math.random() * 6.28;
      this.dust.push(d);
      f.addChild(d);
    }
  }

  private buildHotspots(f: Container) {
    const mk = (x: number, y: number, w: number, h: number, label: string, hint: string, click: () => void) => {
      const g = new Graphics();
      g.roundRect(x, y, w, h, 10).stroke({ color: 0xffd166, width: 3, alpha: 0.9 });
      g.visible = false;
      const spr = new Sprite(Texture.EMPTY);
      spr.width = w; spr.height = h;
      spr.position.set(x, y);
      spr.eventMode = 'static';
      spr.cursor = 'pointer';
      spr.on('pointerover', (e: any) => {
        g.visible = true;
        this.game.audio.hover();
        this.tooltipHide = this.game.showTooltip(label, hint, e.nativeEvent?.clientX ?? 0, e.nativeEvent?.clientY ?? 0);
      });
      spr.on('pointerout', () => { g.visible = false; this.hideTooltip(); });
      spr.on('pointerdown', () => { this.hideTooltip(); click(); });
      f.addChild(g, spr);
      this.hotspots.push({ spr, label, hint, click });
    };
    mk(480, 350, 230, 300, 'Мольберт', 'Рисовать картину', () => this.game.onEaselClick());
    mk(1000, 270, 250, 160, 'Игровой ПК', 'Браузер, почта, магазины', () => this.game.onPCClick());
    mk(24, 130, 140, 350, 'Дверь', 'Вдруг там курьер?', () => this.game.onDoorClick());
    mk(936, 430, 308, 140, 'Стол', 'Принадлежности и запасы', () => this.game.onDeskClick());
    mk(690, 560, 110, 70, 'Кот Батон', 'Моральная поддержка', () => {
      this.game.audio.meow();
      this.game.toast(['Мур. Батон одобряет ваш мазок.', 'Батон потянулся. Знак свыше: рисуйте.', 'Мрр! Критика принята.'][Math.floor(Math.random() * 3)], 'info');
    });
  }

  private hideTooltip() {
    if (this.tooltipHide) { this.tooltipHide(); this.tooltipHide = null; }
  }

  // ---------- публичное ----------
  resize(w: number, h: number) {
    const s = Math.min(w / W, h / H);
    this.fit.scale.set(s);
    this.fit.position.set((w - W * s) / 2, (h - H * s) / 2);
  }

  setTimeOfDay(min: number) {
    const m = ((min % 1440) + 1440) % 1440;
    const wx = (this as any)._wx as number, ww = (this as any)._ww as number;
    let top = '#7fb2d9', bot = '#c8e0ea', night = false;
    if (m >= 21 * 60 || m < 5 * 60) { top = '#10182e'; bot = '#23304d'; night = true; }
    else if (m < 8 * 60) { top = '#3a4a6e'; bot = '#e0a06a'; }
    else if (m >= 17 * 60) { top = '#5a4a6e'; bot = '#e08a5a'; }
    this.sky.clear();
    const g = this.sky;
    const c = document.createElement('canvas');
    c.width = 8; c.height = 8;
    const ctx = c.getContext('2d')!;
    const lg = ctx.createLinearGradient(0, 0, 0, 8);
    lg.addColorStop(0, top); lg.addColorStop(1, bot);
    ctx.fillStyle = lg; ctx.fillRect(0, 0, 8, 8);
    g.rect(wx, 95, ww, 215).fill({ texture: Texture.from(c) });
    this.stars.visible = night;
    this.moon.visible = night;
    this.clouds.forEach(cl => (cl.visible = !night));
    this.lampGlow.alpha = night ? 0.9 : 0.35;
  }

  refreshFrames() {
    const works = this.game.save.gallery.slice(0, 3);
    this.frameSprs.forEach((spr, i) => {
      const w = works[i];
      if (!w) { spr.texture = Texture.EMPTY; spr.visible = false; return; }
      const img = new Image();
      img.onload = () => {
        if (!this.active) return;
        spr.texture = Texture.from(img);
        const sc = Math.min(116 / img.width, 96 / img.height);
        spr.width = img.width * sc; spr.height = img.height * sc;
        spr.position.x = 520 + i * 160 + 2 + (116 - spr.width) / 2;
        spr.visible = true;
      };
      img.src = w.thumb;
    });
  }

  refreshEasel() {
    this.easelPaper.removeChildren();
    const g = new Graphics();
    g.rect(0, 0, 128, 160).fill({ color: 0xf5efe0 });
    g.rect(0, 0, 128, 160).stroke({ color: 0xd8cdb8, width: 2 });
    this.easelPaper.addChild(g);
    if (this.game.save.draftMeta) {
      const scr = new Graphics();
      scr.moveTo(20, 40); scr.bezierCurveTo(50, 10, 80, 70, 108, 36);
      scr.moveTo(24, 90); scr.bezierCurveTo(60, 60, 70, 120, 104, 92);
      scr.moveTo(30, 130); scr.bezierCurveTo(55, 112, 90, 148, 102, 126);
      scr.stroke({ color: 0x6b6b78, width: 2.5, alpha: 0.8 });
      this.easelPaper.addChild(scr);
      const tag = new Text({ text: 'черновик', style: { fontFamily: 'PT Mono, monospace', fontSize: 12, fill: 0x8a8071 } });
      tag.position.set(38, 165);
      this.easelPaper.addChild(tag);
    }
  }

  // ---------- курьер ----------
  playCourier(delivery: Delivery) {
    if (this.courier) return;
    this.pendingDelivery = delivery;
    this.courier = new Container();
    const c = this.courier;
    const g = new Graphics();
    g.ellipse(0, 34, 26, 7).fill({ color: 0x000000, alpha: 0.3 }); // тень
    g.roundRect(-18, -30, 36, 58, 10).fill({ color: 0x3f7f6f }); // куртка
    g.roundRect(-18, -30, 36, 16, 8).fill({ color: 0x35695c });
    g.circle(0, -44, 14).fill({ color: 0xe8b48f }); // голова
    g.poly([-14, -50, 14, -50, 10, -60, -10, -60]).fill({ color: 0xd95f43 }); // кепка
    g.rect(-14, -52, 28, 4).fill({ color: 0xb84e36 });
    g.circle(-5, -44, 1.8).fill({ color: 0x26222e });
    g.circle(5, -44, 1.8).fill({ color: 0x26222e });
    g.roundRect(-26, -12, 20, 18, 3).fill({ color: 0xb98748 }); // коробка
    g.rect(-26, -5, 20, 3).fill({ color: 0x8a6234 });
    c.addChild(g);
    c.position.set(94, 560);
    c.scale.set(1.15);
    this.fit.addChild(c);
    this.courierState = 'in';
    this.courierT = 0;
    this.game.audio.doorbell();
  }

  private collectPackage() {
    if (!this.pendingDelivery) return;
    this.game.collectPackage(this.pendingDelivery);
    this.pendingDelivery = null;
    if (this.packageSpr) { this.packageSpr.destroy(); this.packageSpr = null; }
  }

  // ---------- апдейт ----------
  update(dtMs: number) {
    if (!this.active) return;
    const dt = dtMs / 1000;
    this.t += dt;

    // облака
    const wx = (this as any)._wx as number, ww = (this as any)._ww as number;
    this.clouds.forEach((c, i) => {
      c.x += dt * (6 + i * 3);
      if (c.x > wx + ww + 40) c.x = wx - 50;
      c.alpha = (c.x > wx - 30 && c.x < wx + ww + 10) ? 1 : 0;
    });
    // пыль
    for (const d of this.dust) {
      d.y -= dt * (d as any)._sp;
      d.x += Math.sin(this.t + (d as any)._ph) * dt * 6;
      if (d.y < 100) d.y = 560;
    }
    // кот
    this.cat.scale.y = 1 + Math.sin(this.t * 2.2) * 0.025;
    this.catTail.rotation = Math.sin(this.t * 1.3) * 0.18;
    this.zzzTimer += dt;
    if (!this.zzz && this.zzzTimer > 4) {
      this.zzz = new Text({ text: 'z Z', style: { fontFamily: 'PT Mono, monospace', fontSize: 15, fill: 0xcfc5dd } });
      this.zzz.position.set(760, 560);
      this.zzz.alpha = 0;
      this.fit.addChild(this.zzz);
    }
   if (this.zzz) {
     this.zzz.alpha = Math.sin(this.t * 1.5) * 0.5 + 0.5;
     this.zzz.y = 560 - ((this.t * 8) % 26);
     if (this.zzzTimer > 8) { this.zzz.destroy(); this.zzz = null; this.zzzTimer = 0; }
    }
    // экран ПК
    this.flickTimer += dt;
    if (this.flickTimer > 0.12) {
      this.flickTimer = 0;
      const m = (this as any)._mon;
      const s = this.screenGfx;
      s.clear();
      const flick = 0.85 + Math.random() * 0.15;
      s.rect(m.x, m.y, m.w, m.h).fill({ color: 0x2b3a52, alpha: flick });
      s.rect(m.x + 8, m.y + 10, 60, 6).fill({ color: 0x7fd6a4, alpha: 0.7 * flick });
      s.rect(m.x + 8, m.y + 24, m.w - 16, 4).fill({ color: 0x55708f, alpha: 0.6 * flick });
      s.rect(m.x + 8, m.y + 34, m.w - 40, 4).fill({ color: 0x55708f, alpha: 0.5 * flick });
      s.rect(m.x + 8, m.y + 48, 84, 26).fill({ color: 0x35496b, alpha: 0.8 * flick });
    }
    // лампа дышит
    this.lampGlow.scale.set(1.4 + Math.sin(this.t * 1.1) * 0.04);
    // посылка пульсирует
    if (this.packageSpr) this.packageSpr.scale.set(1 + Math.sin(this.t * 5) * 0.05);

    // курьер
    if (this.courier) {
      this.courierT += dt;
      const c = this.courier;
      if (this.courierState === 'in') {
        const p = Math.min(1, this.courierT / 1.4);
        c.position.x = 94 + p * 300;
        c.position.y = 560 - Math.abs(Math.sin(p * 20)) * 5;
        if (p >= 1) { this.courierState = 'drop'; this.courierT = 0; this.game.audio.pop(); }
      } else if (this.courierState === 'drop') {
        c.scale.y = 1.15 - Math.sin(Math.min(1, this.courierT / 0.4) * Math.PI) * 0.18;
        if (this.courierT > 0.5) {
          // посылка на пол
          const pk = new Container();
          const g = new Graphics();
          g.roundRect(-20, -16, 40, 30, 4).fill({ color: 0xb98748 });
          g.rect(-20, -3, 40, 4).fill({ color: 0x8a6234 });
          g.roundRect(-20, -16, 40, 30, 4).stroke({ color: 0xffd166, width: 2.5, alpha: 0.9 });
          pk.addChild(g);
          const lbl = new Text({ text: 'клик!', style: { fontFamily: 'PT Mono, monospace', fontSize: 12, fill: 0xffd166 } });
          lbl.anchor.set(0.5);
          lbl.position.set(0, -30);
          pk.addChild(lbl);
          pk.position.set(330, 612);
          pk.eventMode = 'static';
          pk.cursor = 'pointer';
          pk.on('pointerdown', () => this.collectPackage());
          this.fit.addChild(pk);
          this.packageSpr = pk;
          this.courierState = 'out';
          this.courierT = 0;
        }
      } else if (this.courierState === 'out') {
        const p = Math.min(1, this.courierT / 1.2);
        c.position.x = 394 - p * 310;
        c.position.y = 560 - Math.abs(Math.sin(p * 18)) * 5;
        c.scale.set(1.15);
        if (p >= 1) { c.destroy(); this.courier = null; this.courierState = 'none'; this.game.audio.knock(); }
      }
    }

    // твины
    for (let i = this.tweens.length - 1; i >= 0; i--) {
      const tw = this.tweens[i];
      tw.t += dt;
      tw.fn(Math.min(1, tw.t / tw.dur));
      if (tw.t >= tw.dur) { tw.done?.(); this.tweens.splice(i, 1); }
    }
  }

  animateDoor() {
    const slab = this.doorSlab;
    this.tweens.push({
      t: 0, dur: 0.7,
      fn: p => {
        const o = p < 0.5 ? p * 2 : (1 - p) * 2;
        slab.scale.x = 1 - o * 0.75;
      },
      done: () => { slab.scale.x = 1; },
    });
  }

  hasPackage() { return !!this.packageSpr; }
}

// ============================================================
// ExhibitionScene — вернисаж в галерее «Белая ворона»
// ============================================================
export class ExhibitionScene {
  game: Game;
  root = new Container();
  active = false;
  private fit = new Container();
  private works: PaintingMeta[];
  private viewed = new Set<number>();
  private t = 0;
  private spots: Sprite[] = [];

  constructor(game: Game, works: PaintingMeta[]) {
    this.game = game;
    this.works = works;
  }

  mount() {
    this.active = true;
    this.game.sceneRoot.addChild(this.root);
    this.root.addChild(this.fit);
    this.build();
    this.resize(this.game.app.renderer.width, this.game.app.renderer.height);
  }
  unmount() {
    this.active = false;
    this.root.removeChildren();
    this.game.sceneRoot.removeChild(this.root);
  }
  resize(w: number, h: number) {
    const s = Math.min(w / W, h / H);
    this.fit.scale.set(s);
    this.fit.position.set((w - W * s) / 2, (h - H * s) / 2);
  }
  update(dtMs: number) {
    if (!this.active) return;
    this.t += dtMs / 1000;
    this.spots.forEach((s, i) => { s.alpha = 0.5 + Math.sin(this.t * 1.4 + i) * 0.12; });
  }

  private build() {
    const f = this.fit;
    const wall = new Graphics();
    wall.rect(0, 0, W, 500).fill({ color: 0xe6e0d2 });
    wall.rect(0, 500, W, H - 500).fill({ color: 0x6b4a2f });
    wall.rect(0, 492, W, 10).fill({ color: 0x54371f });
    f.addChild(wall);
    // лепнина
    const trim = new Graphics();
    trim.rect(0, 60, W, 4).fill({ color: 0xd6cfbd });
    f.addChild(trim);
    const spotTex = radialTex(300, 'rgba(255,246,214,0.55)');
    const xs = [250, 640, 1030];
    this.works.forEach((w, i) => {
      const x = xs[i];
      const spot = new Sprite(spotTex);
      spot.anchor.set(0.5, 0);
      spot.position.set(x, 40);
      spot.scale.set(1.3, 1.8);
      this.spots.push(spot);
      f.addChild(spot);
      const frame = new Graphics();
      frame.rect(x - 130, 120, 260, 300).fill({ color: 0x8a6a3a });
      frame.rect(x - 118, 132, 236, 276).fill({ color: 0xf6f1e6 });
      f.addChild(frame);
      const img = new Image();
      img.onload = () => {
        if (!this.active) return;
        const spr = new Sprite(Texture.from(img));
        const sc = Math.min(216 / img.width, 256 / img.height);
        spr.width = img.width * sc; spr.height = img.height * sc;
        spr.position.set(x - spr.width / 2, 142 + (256 - spr.height) / 2);
        f.addChild(spr);
        const hit = new Sprite(Texture.EMPTY);
        hit.width = 260; hit.height = 300;
        hit.position.set(x - 130, 120);
        hit.eventMode = 'static';
        hit.cursor = 'pointer';
        hit.on('pointerdown', () => this.clickWork(i));
        f.addChild(hit);
      };
      img.src = w.thumb;
      const plaque = new Graphics();
      plaque.roundRect(x - 60, 440, 120, 26, 4).fill({ color: 0xd9cfb8 });
      f.addChild(plaque);
      const title = new Text({ text: `«${w.title}»`, style: { fontFamily: 'PT Mono, monospace', fontSize: 12, fill: 0x4a3f2e } });
      title.anchor.set(0.5);
      title.position.set(x, 453);
      f.addChild(title);
    });
    const banner = new Text({ text: 'ГАЛЕРЕЯ «БЕЛАЯ ВОРОНА» — персональная выставка', style: { fontFamily: '"Press Start 2P", monospace', fontSize: 16, fill: 0x4a3f2e } });
    banner.anchor.set(0.5, 0);
    banner.position.set(W / 2, 540);
    f.addChild(banner);
    const hint = new Text({ text: 'кликайте по картинам, чтобы прочитать отзывы прессы', style: { fontFamily: 'Rubik, sans-serif', fontSize: 15, fill: 0xd8cfb8 } });
    hint.anchor.set(0.5, 0);
    hint.position.set(W / 2, 580);
    f.addChild(hint);
    // бархатный канат
    const rope = new Graphics();
    rope.circle(180, 640, 8).fill({ color: 0xd9b36a });
    rope.circle(1100, 640, 8).fill({ color: 0xd9b36a });
    rope.moveTo(180, 632); rope.bezierCurveTo(500, 690, 780, 690, 1100, 632);
    rope.stroke({ color: 0x7c3b46, width: 6 });
    f.addChild(rope);
  }

  private clickWork(i: number) {
    const w = this.works[i];
    this.viewed.add(i);
    this.game.audio.applause();
    const review = this.game.npcs.praise(w);
    const critic = ['Арт-журнал «Пятно»', 'Блог «Мазок-Друг»', 'Газета «Вечерняя палитра»'][i % 3];
    this.game.modal({
      title: `Отзыв: «${w.title}»`,
      body: `<div class="m-body"><p class="m-quote">${review}</p><p class="m-hint">— ${critic}, ★ ${Math.min(5, 3 + Math.round(w.quality / 25))}/5</p></div>`,
      buttons: [{ label: 'Поклониться', primary: true, onClick: () => { this.game.closeModal(); this.checkDone(); } }],
    });
  }

  private checkDone() {
    if (this.viewed.size < 3) return;
    this.game.finishExhibition();
  }
}
