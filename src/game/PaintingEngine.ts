// ============================================================
// PaintingEngine — рисование на PixiJS.
// Мазок = «штамповка» текстуры ворса вдоль линии (интерполяция +
// поворот по направлению движения), BlendMode 'erase' для мастихина,
// RYB-смешивание пигментов на палитре, мокрая/сухая кисть, черновики.
// ============================================================
import { Container, Graphics, Sprite, Texture, RenderTexture } from 'pixi.js';
import type { Game } from './Game';
import { SaveSystem } from './SaveSystem';
import {
  PAPERS, TUBES, clamp, lerp, angleLerp, uid, mixRYB, rgbToHex, hexToRgb,
  type Order, type PaperKind, type PaintingMeta,
} from './types';

type Tool = 'brush' | 'pencil' | 'marker' | 'eraser';

export class PaintingEngine {
  game: Game;
  root = new Container();
  paperKind: PaperKind = 'a4';
  order: Order | null = null;
  active = false;

  private rtW = 600; private rtH = 848;
  private paintRT: RenderTexture | null = null;
  private paperContainer = new Container();
  private rtSprite: Sprite | null = null;
  private stamp: Sprite;
  private cursor: Graphics;
  private tips: Record<string, Texture> = {};

  private tool: Tool = 'pencil';
  private shape: 'round' | 'flat' = 'round';
  private brushColor: string | null = null;
  private wet = 0; // 0..100
  private markerIdx = 0;
  private size = 18;
  private water = 70;

  private strokes = 0;
  private colorsUsed = new Set<string>();
  private toolsUsed = new Set<string>();
  private isDown = false;
  private lastPt: { x: number; y: number } | null = null;
  private lastAngle = 0;
  private lastSfx = 0;
  private dryWarned = false;

  private ui: HTMLDivElement | null = null;
  private palCanvas: HTMLCanvasElement | null = null;
  private palCtx: CanvasRenderingContext2D | null = null;
  private draftTimer: number | null = null;
  private clockTimer: number | null = null;
  private draftStrokes = -1;

  private onMove: ((e: any) => void) | null = null;
  private onUp: (() => void) | null = null;

  constructor(game: Game) {
    this.game = game;
    this.stamp = new Sprite(Texture.EMPTY);
    this.cursor = new Graphics();
  }

  // ================= Текстуры ворса =================
  private makeTips() {
    const mk = (draw: (ctx: CanvasRenderingContext2D) => void) => {
      const c = document.createElement('canvas');
      c.width = 128; c.height = 128;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#fff';
      draw(ctx);
      return Texture.from(c);
    };
    // Круглая кисть: пучок ворсинок с неровным краем
    this.tips.round = mk((ctx) => {
      ctx.translate(64, 64);
      for (let i = 0; i < 30; i++) {
        const a = Math.random() * Math.PI * 2;
        const d = Math.pow(Math.random(), 0.6) * 36;
        ctx.save();
        ctx.rotate(a); ctx.translate(d, 0);
        ctx.globalAlpha = 0.1 + Math.random() * 0.2;
        ctx.beginPath();
        ctx.ellipse(0, 0, 3 + Math.random() * 6, 1.5 + Math.random() * 2.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      const g = ctx.createRadialGradient(0, 0, 2, 0, 0, 34);
      g.addColorStop(0, 'rgba(255,255,255,0.4)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.globalAlpha = 1; ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, 34, 0, Math.PI * 2); ctx.fill();
    });
    // Плоская кисть: полосы ворса вдоль X (поворачивается по движению)
    this.tips.flat = mk((ctx) => {
      for (let x = 18; x < 110; x += 3) {
        const h = 34 + Math.sin(x * 1.7) * 5 + Math.random() * 6;
        ctx.globalAlpha = 0.16 + Math.random() * 0.12;
        ctx.fillRect(x, 64 - h / 2, 2.2, h);
      }
      ctx.globalAlpha = 0.12;
      ctx.beginPath(); ctx.roundRect(16, 42, 96, 44, 10); ctx.fill();
    });
    // Карандаш: зернистый грифель
    this.tips.pencil = mk((ctx) => {
      ctx.translate(64, 64);
      for (let i = 0; i < 26; i++) {
        const a = Math.random() * Math.PI * 2, d = Math.random() * 6;
        ctx.globalAlpha = 0.25 + Math.random() * 0.4;
        ctx.fillRect(Math.cos(a) * d, Math.sin(a) * d, 1.4, 1.4);
      }
    });
    // Фломастер: плотное мягкое перо
    this.tips.marker = mk((ctx) => {
      ctx.globalAlpha = 0.5;
      ctx.beginPath(); ctx.roundRect(26, 46, 76, 36, 16); ctx.fill();
      ctx.globalAlpha = 0.45;
      ctx.beginPath(); ctx.roundRect(30, 50, 68, 28, 12); ctx.fill();
    });
    // Мастихин-ластик: мягкий круг
    this.tips.eraser = mk((ctx) => {
      const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 42);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.7, 'rgba(255,255,255,0.7)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 128, 128);
    });
  }

  private paperTexture(): Texture {
    const c = document.createElement('canvas');
    c.width = this.rtW; c.height = this.rtH;
    const ctx = c.getContext('2d')!;
    const isCanvas = this.paperKind.startsWith('cv');
    ctx.fillStyle = isCanvas ? '#f3eee1' : '#faf7ef';
    ctx.fillRect(0, 0, c.width, c.height);
    // зерно
    for (let i = 0; i < (this.rtW * this.rtH) / 26; i++) {
      ctx.fillStyle = `rgba(60,50,40,${Math.random() * 0.05})`;
      ctx.fillRect(Math.random() * c.width, Math.random() * c.height, 1, 1);
    }
    if (isCanvas) {
      // фактура холста
      ctx.strokeStyle = 'rgba(120,100,70,0.08)';
      for (let x = 0; x < c.width; x += 4) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, c.height); ctx.stroke(); }
      for (let y = 0; y < c.height; y += 4) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(c.width, y); ctx.stroke(); }
    }
    // виньетка
    const g = ctx.createRadialGradient(c.width / 2, c.height / 2, Math.min(c.width, c.height) / 3, c.width / 2, c.height / 2, Math.max(c.width, c.height) / 1.1);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(70,55,35,0.12)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, c.width, c.height);
    return Texture.from(c);
  }

  // ================= Открытие =================
  async open(paperKind: PaperKind, order: Order | null) {
    const save = this.game.save;
    const def = PAPERS[paperKind];
    this.paperKind = paperKind;
    this.order = order;
    this.active = true;
    this.strokes = 0; this.colorsUsed.clear(); this.toolsUsed.clear();
    this.isDown = false; this.lastPt = null; this.wet = 0; this.brushColor = null; this.dryWarned = false;
    this.draftStrokes = -1;
    if (save.markers.length) this.markerIdx = 0;

    const s = Math.min(1, 900 / Math.max(def.w, def.h));
    this.rtW = Math.round(def.w * s);
    this.rtH = Math.round(def.h * s);
    this.paintRT = RenderTexture.create({ width: this.rtW, height: this.rtH });

    if (Object.keys(this.tips).length === 0) this.makeTips();
    this.tool = save.brushes.length ? 'brush' : 'pencil';
    this.shape = save.brushes.some(b => b === 'b-flat') ? 'round' : 'round';

    // сцена
    this.root.removeChildren();
    const bg = new Graphics();
    bg.rect(0, 0, 4, 4).fill(0x00000000);
    this.root.addChild(bg);
    this.paperContainer.destroy({ children: true });
    this.paperContainer = new Container();
    const paperSpr = new Sprite(this.paperTexture());
    const shadow = new Graphics();
    shadow.roundRect(6, 10, this.rtW, this.rtH, 6).fill({ color: 0x1a120c, alpha: 0.45 });
    this.paperContainer.addChild(shadow, paperSpr);
    this.rtSprite = new Sprite(this.paintRT);
    this.rtSprite.eventMode = 'static';
    this.rtSprite.cursor = 'crosshair';
    this.rtSprite.on('pointerdown', (e: any) => this.startStroke(e));
    this.paperContainer.addChild(this.rtSprite);
    this.root.addChild(this.paperContainer);
    this.cursor.eventMode = 'none';
    this.paperContainer.addChild(this.cursor);
    this.game.sceneRoot.addChild(this.root);

    this.onMove = (e: any) => this.handleMove(e);
    this.onUp = () => this.endStroke();
    const st = this.game.app.stage as any;
    st.eventMode = 'static';
    st.hitArea = this.game.app.screen;
    this.game.app.stage.on('pointermove', this.onMove);
    this.game.app.stage.on('pointerup', this.onUp);
    this.game.app.stage.on('pointerupoutside', this.onUp);

    this.buildDOM();
    this.layout();
    this.updateToolUI();
    this.updateWetUI();

    // черновик?
    if (save.draftMeta?.paper === paperKind) {
      try {
        const url = await SaveSystem.idbGet('draft');
        if (url && this.paintRT) {
          const img = new Image();
          await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('img')); img.src = url; });
          const tex = Texture.from(img);
          const spr = new Sprite(tex);
          this.game.app.renderer.render({ container: spr, target: this.paintRT, clear: false });
          this.draftStrokes = 1;
          this.strokes = 1;
          this.game.toast('Черновик восстановлен — продолжайте шедевр!', 'good');
          spr.destroy(); tex.destroy(true);
        }
      } catch { /* черновик битый — игнор */ }
    }

    this.draftTimer = window.setInterval(() => this.saveDraft(false), 12000);
    this.clockTimer = window.setInterval(() => this.updateClockUI(), 1000);
    this.updateClockUI();
  }

  // ================= DOM-интерфейс =================
  private buildDOM() {
    this.closeDOM();
    const save = this.game.save;
    const div = document.createElement('div');
    div.className = 'paint-ui';
    const tubeChips = TUBES.filter(t => (save.tubes[t.id] ?? 0) > 0)
      .map(t => `<button class="tube" data-tube="${t.id}" title="${t.name}"><span class="tube-cap" style="background:${t.color}"></span><span class="tube-amt" style="width:${Math.round(save.tubes[t.id])}%"></span></button>`)
      .join('') || '<div class="tube-empty">Красок нет — купите в «КраскиМаркет» на ПК</div>';
    const markerChips = save.markers.map((m, i) =>
      `<button class="mk" data-mk="${i}" style="background:${m.color}" title="Фломастер"></button>`).join('');
    const hasRound = save.brushes.some(b => ['b-round', 'b-soft'].includes(b));
    const hasFlat = save.brushes.some(b => b === 'b-flat');

    div.innerHTML = `
      <div class="p-top">
        <div class="p-topcard p-paper">
          <div class="p-label">${PAPERS[this.paperKind].name}${this.order ? ' · ЗАКАЗ' : ''}</div>
          <div class="p-sub" id="p-order-line">${this.order ? this.order.brief : 'Энергия: <span id="p-energy"></span>'}</div>
        </div>
        <div class="p-actions">
          ${this.order ? '<button class="pbtn pbtn-gold" id="p-submit-order">Сдать заказ</button>' : ''}
          <button class="pbtn pbtn-gold" id="p-save">В галерею</button>
          <button class="pbtn" id="p-download">Скачать PNG</button>
          <button class="pbtn" id="p-exit">Выйти</button>
        </div>
      </div>
      <div class="p-tools">
        <button class="tool ${!save.brushes.length ? 'locked' : ''}" data-tool="brush" title="Кисть (нужна кисть из магазина)">
          <svg viewBox="0 0 24 24"><path d="M4 20c2.5-.5 4-1.5 5.5-3L18 8.5 15.5 6 7 14.5C5.5 16 4.5 17.5 4 20z" fill="currentColor"/><path d="M16.5 5l2.5 2.5 1.5-1.5c.8-.8.8-2 0-2.5-.6-.6-1.8-.6-2.5 0L16.5 5z" fill="currentColor" opacity=".6"/></svg>
          <span>Кисть</span>
        </button>
        <button class="tool" data-tool="pencil" title="Карандаш">
          <svg viewBox="0 0 24 24"><path d="M5 19l1-4L16.5 4.5a2 2 0 013 0l.5.5a2 2 0 010 3L9.5 18.5 5 19z" fill="currentColor"/><path d="M6 15l3 3" stroke="rgba(0,0,0,.35)"/></svg>
          <span>Карандаш</span>
        </button>
        <button class="tool ${!save.markers.length ? 'locked' : ''}" data-tool="marker" title="Фломастер">
          <svg viewBox="0 0 24 24"><path d="M9 3h6v6H9z" fill="currentColor" opacity=".55"/><path d="M8 9h8l-1 10a2 2 0 01-2 2h-2a2 2 0 01-2-2L8 9z" fill="currentColor"/></svg>
          <span>Фломастер</span>
        </button>
        <button class="tool" data-tool="eraser" title="Мастихин (ластик)">
          <svg viewBox="0 0 24 24"><path d="M6 14L14 6l4 4-8 8H6v-4z" fill="currentColor"/><path d="M14 6l4 4 2-2a1.5 1.5 0 000-2l-2-2a1.5 1.5 0 00-2 0l-2 2z" fill="currentColor" opacity=".5"/><rect x="5" y="18" width="14" height="2" rx="1" fill="currentColor" opacity=".4"/></svg>
          <span>Мастихин</span>
        </button>
        <div class="tool-sep"></div>
        <button class="shapebtn ${hasRound ? '' : 'locked'}" data-shape="round" title="Круглый ворс">Круг</button>
        <button class="shapebtn ${hasFlat ? '' : 'locked'}" data-shape="flat" title="Плоский ворс">Плоская</button>
        ${save.markers.length ? `<div class="mk-row" id="mk-row">${markerChips}</div>` : ''}
      </div>
      <div class="p-bottom">
        <div class="palette-wrap">
          <canvas id="palette-cv" width="300" height="190"></canvas>
          <div class="palette-hint">палитра: макните кисть сюда</div>
          <div class="wet-row">
            <span class="wet-label" id="wet-label">Кисть сухая</span>
            <div class="wet-bar"><div class="wet-fill" id="wet-fill"></div></div>
          </div>
        </div>
        <div class="tube-rack">${tubeChips}</div>
        <div class="sliders">
          <label>Размер <span id="size-val">${this.size}</span>
            <input type="range" id="size-range" min="3" max="60" value="${this.size}">
          </label>
          <label>Вода / прозрачность <span id="water-val">${this.water}%</span>
            <input type="range" id="water-range" min="10" max="100" value="${this.water}">
          </label>
        </div>
      </div>
    `;
    this.game.root.appendChild(div);
    this.ui = div;

    this.palCanvas = div.querySelector('#palette-cv') as HTMLCanvasElement;
    this.palCtx = this.palCanvas.getContext('2d', { willReadFrequently: true })!;

    // события
    div.querySelectorAll('[data-tool]').forEach(b => b.addEventListener('click', () => this.selectTool((b as HTMLElement).dataset.tool as Tool)));
    div.querySelectorAll('[data-shape]').forEach(b => b.addEventListener('click', () => this.selectShape((b as HTMLElement).dataset.shape as 'round' | 'flat')));
    div.querySelectorAll('[data-tube]').forEach(b => b.addEventListener('click', () => this.dipTube((b as HTMLElement).dataset.tube!)));
    div.querySelectorAll('[data-mk]').forEach(b => b.addEventListener('click', () => { this.markerIdx = +(b as HTMLElement).dataset.mk!; this.updateToolUI(); this.game.audio.click(); }));
    (div.querySelector('#size-range') as HTMLInputElement).addEventListener('input', e => {
      this.size = +(e.target as HTMLInputElement).value;
      div.querySelector('#size-val')!.textContent = String(this.size);
    });
    (div.querySelector('#water-range') as HTMLInputElement).addEventListener('input', e => {
      this.water = +(e.target as HTMLInputElement).value;
      div.querySelector('#water-val')!.textContent = this.water + '%';
    });
    this.palCanvas.addEventListener('pointerdown', e => this.paletteClick(e));
    div.querySelector('#p-save')!.addEventListener('click', () => this.saveFlow(false));
    div.querySelector('#p-download')!.addEventListener('click', () => this.downloadPNG());
    div.querySelector('#p-exit')!.addEventListener('click', () => this.exitFlow());
    div.querySelector('#p-submit-order')?.addEventListener('click', () => this.saveFlow(true));
  }

  private closeDOM() {
    if (this.ui) { this.ui.remove(); this.ui = null; }
    this.palCanvas = null; this.palCtx = null;
  }

  // ================= Раскладка =================
  layout() {
    if (!this.active) return;
    const w = this.game.app.renderer.width / this.game.app.renderer.resolution;
    const h = this.game.app.renderer.height / this.game.app.renderer.resolution;
    const availW = w - 120, availH = h - 250;
    const sc = Math.min(availW / this.rtW, availH / this.rtH, 1.1);
    this.paperContainer.scale.set(sc);
    this.paperContainer.position.set(90 + (availW - this.rtW * sc) / 2, 70 + (availH - this.rtH * sc) / 2);
  }

  // ================= Инструменты =================
  private selectTool(t: Tool) {
    const save = this.game.save;
    if (t === 'brush' && !save.brushes.length) { this.game.toast('Кистей пока нет — купите в «КраскиМаркет»', 'warn'); this.game.audio.error(); return; }
    if (t === 'marker' && !save.markers.length) { this.game.toast('Фломастеров нет — купите набор', 'warn'); this.game.audio.error(); return; }
    this.tool = t;
    this.game.audio.click();
    this.updateToolUI();
  }

  private selectShape(sh: 'round' | 'flat') {
    const save = this.game.save;
    if (sh === 'flat' && !save.brushes.some(b => b === 'b-flat')) { this.game.toast('Плоская кисть не куплена', 'warn'); return; }
    if (sh === 'round' && !save.brushes.some(b => ['b-round', 'b-soft'].includes(b))) { this.game.toast('Круглая кисть не куплена', 'warn'); return; }
    this.shape = sh;
    this.game.audio.click();
    this.updateToolUI();
  }

  private dipTube(id: string) {
    const save = this.game.save;
    const amount = save.tubes[id] ?? 0;
    const def = TUBES.find(t => t.id === id)!;
    if (!save.brushes.length) { this.game.toast('Сначала купите кисть!', 'warn'); return; }
    if (amount <= 0) { this.game.toast(`«${def.name}» — тюбик пуст`, 'warn'); this.game.audio.error(); return; }
    save.tubes[id] = Math.max(0, amount - 2.5);
    this.brushColor = def.color;
    this.wet = 100;
    if (this.tool !== 'brush') this.tool = 'brush';
    this.game.audio.squelch();
    this.updateToolUI(); this.updateWetUI(); this.renderTubes();
    this.game.saveNow();
  }

  private renderTubes() {
    if (!this.ui) return;
    const save = this.game.save;
    this.ui.querySelectorAll<HTMLElement>('[data-tube]').forEach(el => {
      const id = el.dataset.tube!;
      const amt = el.querySelector<HTMLElement>('.tube-amt');
      if (amt) amt.style.width = Math.round(save.tubes[id] ?? 0) + '%';
      el.classList.toggle('empty', (save.tubes[id] ?? 0) <= 0);
    });
  }

  private updateToolUI() {
    if (!this.ui) return;
    this.ui.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('on', (b as HTMLElement).dataset.tool === this.tool));
    this.ui.querySelectorAll('[data-shape]').forEach(b => b.classList.toggle('on', (b as HTMLElement).dataset.shape === this.shape));
    this.ui.querySelectorAll('[data-mk]').forEach(b => b.classList.toggle('on', +(b as HTMLElement).dataset.mk! === this.markerIdx));
  }

  private updateWetUI() {
    if (!this.ui) return;
    const fill = this.ui.querySelector<HTMLElement>('#wet-fill');
    const label = this.ui.querySelector<HTMLElement>('#wet-label');
    if (fill) fill.style.width = this.wet + '%';
    if (label) {
      if (this.tool === 'brush') {
        label.textContent = !this.brushColor ? 'Кисть сухая — макните в краску!' : this.wet <= 0 ? 'Кисть высохла — на палитру!' : 'Кисть влажная';
        label.className = 'wet-label ' + (this.wet > 0 ? 'wet-ok' : 'wet-dry');
      } else {
        label.textContent = this.tool === 'pencil' ? 'Карандаш всегда готов' : this.tool === 'marker' ? 'Фломастер: чернила ' + Math.round(this.game.save.markers[this.markerIdx]?.ink ?? 0) + '%' : 'Мастихин стирает мазки';
        label.className = 'wet-label';
      }
    }
  }

  private updateClockUI() {
    if (!this.ui) return;
    const el = this.ui.querySelector<HTMLElement>('#p-energy');
    if (el) el.innerHTML = `<b class="${this.game.save.energy < 20 ? 'low' : ''}">${Math.round(this.game.save.energy)}</b>/100`;
    const ord = this.ui.querySelector<HTMLElement>('#p-order-line');
    if (this.order && ord && this.order.status === 'active') {
      const left = this.order.deadlineMin - this.game.save.timeMin;
      ord.innerHTML = `${this.order.brief} · осталось: <b class="${left < 60 ? 'low' : ''}">${left > 0 ? Math.floor(left / 60) + 'ч ' + (left % 60) + 'м' : 'СРОК ВЫШЕЛ'}</b>`;
    }
  }

  // ================= Палитра (RYB) =================
  private paletteClick(e: PointerEvent) {
    if (!this.palCanvas || !this.palCtx) return;
    const rect = this.palCanvas.getBoundingClientRect();
    const x = Math.round((e.clientX - rect.left) / rect.width * this.palCanvas.width);
    const y = Math.round((e.clientY - rect.top) / rect.height * this.palCanvas.height);
    const px = this.palCtx.getImageData(clamp(x, 0, this.palCanvas.width - 1), clamp(y, 0, this.palCanvas.height - 1), 1, 1).data;
    const hasPaint = px[3] > 16;

    if (this.brushColor && this.wet > 0) {
      // положить краску: смешать с тем, что уже на палитре (RYB!)
      const under = hasPaint ? rgbToHex(px[0], px[1], px[2]) : null;
      const mixed = under && under !== this.brushColor ? mixRYB(this.brushColor, under, 0.55) : this.brushColor;
      const ctx = this.palCtx;
      const r = 14 + this.water * 0.12;
      const g = ctx.createRadialGradient(x, y, 1, x, y, r);
      const [mr, mg, mb] = hexToRgb(mixed);
      g.addColorStop(0, `rgba(${mr},${mg},${mb},0.92)`);
      g.addColorStop(1, `rgba(${mr},${mg},${mb},0)`);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `rgba(${mr},${mg},${mb},0.85)`;
      ctx.beginPath(); ctx.ellipse(x, y, r * 0.55, r * 0.4, Math.random(), 0, Math.PI * 2); ctx.fill();
      this.brushColor = mixed;
      this.wet = 100;
      this.game.audio.squelch();
    } else {
      // подобрать смешанный цвет
      if (hasPaint) {
        if (!this.game.save.brushes.length) { this.game.toast('Нужна кисть — купите в магазине', 'warn'); return; }
        this.brushColor = rgbToHex(px[0], px[1], px[2]);
        this.wet = 100;
        this.tool = 'brush';
        this.game.audio.squelch();
        this.updateToolUI();
      } else {
        this.game.toast('Палитра чистая. Сначала макните кисть в тюбик!', 'info');
      }
    }
    this.updateWetUI();
  }

  // ================= Рисование =================
  private startStroke(e: any) {
    const save = this.game.save;
    if (this.tool === 'brush') {
      if (!this.brushColor || this.wet <= 0) {
        if (!this.dryWarned) {
          this.game.toast('Кисть сухая! Тюбик → палитра → холст', 'warn');
          this.dryWarned = true;
          setTimeout(() => (this.dryWarned = false), 3000);
        }
        this.game.audio.error();
        return;
      }
    }
    if (this.tool === 'marker') {
      const mk = save.markers[this.markerIdx];
      if (!mk || mk.ink <= 0) { this.game.toast('Фломастер высох!', 'warn'); this.game.audio.error(); return; }
    }
    if (save.energy <= 0) { this.game.toast('Нет сил рисовать — поешьте (доставка с ПК)', 'warn'); this.game.audio.error(); return; }
    this.isDown = true;
    const p = this.rtSprite!.toLocal(e.global ?? e.data.global);
    this.lastPt = { x: p.x, y: p.y };
    this.lastAngle = Math.random() * Math.PI;
    this.doStamp(p.x, p.y, this.lastAngle);
  }

  private handleMove(e: any) {
    if (!this.active || !this.rtSprite) return;
    const p = this.rtSprite.toLocal(e.global ?? e.data.global);
    this.updateCursor(p);
    if (!this.isDown) return;
    if (p.x < -20 || p.y < -20 || p.x > this.rtW + 20 || p.y > this.rtH + 20) return;
    const save = this.game.save;
    if (save.energy <= 0 && this.tool !== 'eraser') { this.endStroke(); this.game.toast('Силы кончились прямо за мазком... поешьте!', 'warn'); return; }
    const lp = this.lastPt!;
    const dx = p.x - lp.x, dy = p.y - lp.y;
    const dist = Math.hypot(dx, dy);
    const skill = save.skill;
    const spacing = Math.max(2, this.size * 0.16) * Math.pow(0.9, skill - 1);
    const steps = Math.floor(dist / spacing);
    if (steps < 1) return;
    const targetAngle = Math.atan2(dy, dx);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const x = lerp(lp.x, p.x, t), y = lerp(lp.y, p.y, t);
      this.lastAngle = angleLerp(this.lastAngle, targetAngle, 0.35);
      this.doStamp(x, y, this.lastAngle);
    }
    this.lastPt = p;
  }

  private doStamp(x: number, y: number, angle: number) {
    if (!this.paintRT) return;
    const save = this.game.save;
    let tint = 0x3b3b46, alpha = 0.45, blend: any = 'normal';
    const scaleBase = this.size / 100;
    let scale = scaleBase;

    if (this.tool === 'brush') {
      if (this.wet <= 0) { this.endStroke(); return; }
      tint = parseInt(this.brushColor!.slice(1), 16);
      alpha = (0.16 + (this.water / 100) * 0.34) * (0.6 + 0.4 * (this.wet / 100));
      scale = scaleBase * (0.92 + Math.random() * 0.16);
      this.wet = Math.max(0, this.wet - (0.5 - this.water * 0.003));
      this.toolsUsed.add('brush');
      this.colorsUsed.add(this.brushColor!);
    } else if (this.tool === 'pencil') {
      alpha = 0.28 + Math.random() * 0.1;
      scale = scaleBase * 0.8;
      angle = Math.random() * Math.PI;
      this.toolsUsed.add('pencil');
      this.colorsUsed.add('#3b3b46');
    } else if (this.tool === 'marker') {
      const mk = save.markers[this.markerIdx];
      if (!mk || mk.ink <= 0) { this.endStroke(); return; }
      tint = parseInt(mk.color.slice(1), 16);
      alpha = 0.5;
      mk.ink = Math.max(0, mk.ink - 0.22);
      this.toolsUsed.add('marker');
      this.colorsUsed.add(mk.color);
    } else if (this.tool === 'eraser') {
      alpha = 1;
      blend = 'erase'; // мастихин снимает краску (destination-out)
      scale = scaleBase * 1.3;
      this.toolsUsed.add('eraser');
    }

    const s = this.stamp;
    s.texture = this.tool === 'brush' ? (this.shape === 'flat' ? this.tips.flat : this.tips.round) : this.tips[this.tool];
    s.position.set(x, y);
    s.rotation = angle;
    s.scale.set(Math.max(0.05, scale));
    s.alpha = clamp(alpha, 0.02, 1);
    (s as any).tint = tint;
    (s as any).blendMode = blend;
    this.game.app.renderer.render({ container: s, target: this.paintRT, clear: false });

    this.strokes++;
    save.stats.strokes++;
    if (this.tool !== 'eraser') save.energy = Math.max(0, save.energy - 0.012);

    const now = performance.now();
    if (now - this.lastSfx > 70) {
      this.lastSfx = now;
      if (this.tool === 'brush') this.game.audio.brush(this.size);
      else if (this.tool === 'pencil') this.game.audio.scratch();
      else if (this.tool === 'marker') this.game.audio.marker();
      else this.game.audio.erase();
    }
    this.updateWetUI();
  }

  private updateCursor(p: { x: number; y: number }) {
    const c = this.cursor;
    c.clear();
    const onPaper = p.x >= 0 && p.y >= 0 && p.x <= this.rtW && p.y <= this.rtH;
    if (!onPaper) { c.visible = false; return; }
    c.visible = true;
    const r = Math.max(3, this.size / 2 * (this.tool === 'eraser' ? 1.3 : 1));
    const dry = this.tool === 'brush' && (!this.brushColor || this.wet <= 0);
    c.circle(p.x, p.y, r).stroke({ color: dry ? 0xd9534f : 0xffffff, width: 1.5, alpha: 0.9 });
    if (dry) { c.moveTo(p.x - r, p.y - r); c.lineTo(p.x + r, p.y + r); c.stroke({ color: 0xd9534f, width: 1.5, alpha: 0.9 }); }
    if (this.brushColor && this.tool === 'brush') {
      c.circle(p.x, p.y, 2.4).fill({ color: parseInt(this.brushColor.slice(1), 16), alpha: 0.9 });
    }
  }

  private endStroke() {
    this.isDown = false;
    this.lastPt = null;
  }

  // ================= Экспорт =================
  private composite(): HTMLCanvasElement {
    const comp = new Container();
    const bg = new Graphics();
    bg.rect(0, 0, this.rtW, this.rtH).fill({ color: this.paperKind.startsWith('cv') ? 0xf3eee1 : 0xfaf7ef });
    comp.addChild(bg);
    const spr = new Sprite(this.paintRT!);
    comp.addChild(spr);
    const canvas = (this.game.app.renderer as any).extract.canvas({ target: comp, resolution: 1 });
    comp.destroy({ children: true });
    return canvas;
  }

  private thumbOf(full: HTMLCanvasElement): string {
    const w = 340, h = Math.round(full.height / full.width * w);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d')!.drawImage(full, 0, 0, w, h);
    return c.toDataURL('image/jpeg', 0.82);
  }

  private computeQuality(): number {
    // покрытие: уменьшенная копия
    const small = document.createElement('canvas');
    small.width = 80; small.height = 80;
    const sctx = small.getContext('2d')!;
    sctx.drawImage(this.composite(), 0, 0, 80, 80);
    const data = sctx.getImageData(0, 0, 80, 80).data;
    let covered = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] > 24) covered++;
    const coverage = covered / (80 * 80);
    const tier = PAPERS[this.paperKind].tier;
    const q = Math.round(
      coverage * 95 +
      Math.min(this.colorsUsed.size, 12) * 2.5 +
      Math.min(this.strokes, 600) / 12 +
      this.toolsUsed.size * 3 +
      (tier - 1) * 6 +
      (this.game.save.skill - 1) * 5,
    );
    return clamp(q, 3, 99);
  }

  private downloadPNG() {
    const canvas = this.composite();
    const a = document.createElement('a');
    a.download = `kartina-${Date.now()}.png`;
    a.href = canvas.toDataURL('image/png');
    a.click();
    this.game.audio.cameraShutter();
    this.game.toast('Скачивание началось (в WebView сработает DownloadListener)', 'info');
  }

  // ================= Сохранение/выход =================
  saveDraft(force: boolean) {
    if (!this.active) return;
    if (this.strokes === 0) return;
    if (!force && this.strokes === this.draftStrokes) return;
    this.draftStrokes = this.strokes;
    try {
      const url = this.composite().toDataURL('image/jpeg', 0.85);
      SaveSystem.idbSet('draft', url);
      this.game.save.draftMeta = { paper: this.paperKind };
      this.game.saveNow(true);
    } catch { /* noop */ }
  }

  private saveFlow(isOrder: boolean) {
    if (this.strokes === 0 && !isOrder) { this.game.toast('Холст пуст — нечего сохранять', 'warn'); return; }
    const defTitle = isOrder && this.order ? this.order.brief : `Без названия №${this.game.save.gallery.length + 1}`;
    this.game.modal({
      title: isOrder ? 'Сдать заказчику' : 'Название картины',
      body: `<div class="m-body">
        <p class="m-hint">${isOrder ? 'Картина уйдёт клиенту сразу после упаковки.' : 'Как назовём шедевр? Название влияет на продажи примерно никак, но приятно.'}</p>
        <input class="m-input" id="m-title" maxlength="40" value="${defTitle.replace(/"/g, '&quot;')}">
      </div>`,
      buttons: [
        { label: 'Отмена', onClick: () => this.game.closeModal() },
        {
          label: isOrder ? 'Упаковать и отправить' : 'Сохранить', primary: true,
          onClick: () => {
            const input = document.querySelector<HTMLInputElement>('#m-title');
            const title = (input?.value || '').trim() || defTitle;
            this.game.closeModal();
            this.doSave(title, isOrder);
          },
        },
      ],
    });
  }

  private doSave(title: string, isOrder: boolean) {
    const save = this.game.save;
    const full = this.composite();
    const quality = this.computeQuality();
    const meta: PaintingMeta = {
      id: uid(), title, quality, minute: save.timeMin, paper: this.paperKind,
      thumb: this.thumbOf(full), palette: [...this.colorsUsed].slice(0, 8),
      strokes: this.strokes, tools: [...this.toolsUsed],
    };
    save.gallery.unshift(meta);
    save.draftMeta = null;
    SaveSystem.idbDel('draft');
    SaveSystem.idbSet('paint_' + meta.id, full.toDataURL('image/png'));
    this.game.gainXp(5 + Math.round(quality / 4));
    this.game.audio.pop();
    this.game.toast(`«${title}» в галерее! Качество ${quality}/100`, 'good');

    if (isOrder && this.order && this.order.status === 'active') {
      const res = this.game.economy.completeOrder(this.order, quality);
      if (res.ok) meta.soldTo = this.order.client;
    }
    this.game.updateHud();
    this.game.saveNow();
    this.close();
    this.game.exitPainting();
  }

  exitFlow() {
    if (this.strokes === 0) { this.close(); this.game.exitPainting(); return; }
    this.game.modal({
      title: 'Покинуть мольберт?',
      body: '<div class="m-body"><p class="m-hint">Черновик сохранится автоматически — незаконченный шедевр не пропадёт и встретит вас на этом же листе.</p></div>',
      buttons: [
        { label: 'Остаться', onClick: () => this.game.closeModal() },
        {
          label: 'В галерею', onClick: () => { this.game.closeModal(); this.saveFlow(false); },
        },
        {
          label: 'Выйти (черновик)', primary: true, onClick: () => {
            this.game.closeModal();
            this.saveDraft(true);
            this.game.toast('Черновик сохранён на мольберте', 'info');
            this.close();
            this.game.exitPainting();
          },
        },
      ],
    });
  }

  requestEsc() { this.exitFlow(); }

  close() {
    this.active = false;
    if (this.draftTimer !== null) { clearInterval(this.draftTimer); this.draftTimer = null; }
    if (this.clockTimer !== null) { clearInterval(this.clockTimer); this.clockTimer = null; }
    const st = this.game.app.stage;
    if (this.onMove) st.off('pointermove', this.onMove);
    if (this.onUp) { st.off('pointerup', this.onUp); st.off('pointerupoutside', this.onUp); }
    this.onMove = null; this.onUp = null;
    this.closeDOM();
    this.game.sceneRoot.removeChild(this.root);
    this.paperContainer.destroy({ children: true });
    this.paperContainer = new Container();
    this.rtSprite = null;
    if (this.paintRT) { this.paintRT.destroy(true); this.paintRT = null; }
    this.order = null;
  }
}
