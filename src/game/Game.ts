// ============================================================
// Game — оркестратор: Pixi-приложение, сцены, HUD, время, покупки.
// ============================================================
import { Application, Container } from 'pixi.js';
import confetti from 'canvas-confetti';
import { AudioSynth } from './AudioSynth';
import { SaveSystem } from './SaveSystem';
import { NPCManager } from './NPCManager';
import { EconomySystem } from './EconomySystem';
import { PaintingEngine } from './PaintingEngine';
import { RoomScene, ExhibitionScene } from './RoomScene';
import { BrowserUI } from './BrowserUI';
import {
  newSave, PAPERS, TUBES, BRUSHES, MARKER_SET, PAPER_PACKS, FOODS, STUDIES,
  fmtMoney, fmtDayTime, fmtDuration, xpProgress, levelForXp, priceCap,
  LEVEL_TITLES, MAX_LEVEL, rand, WELCOME_MAIL,
  type SaveData, type PaperKind, type Order, type Delivery, type ShopKind, type PaintingMeta,
} from './types';

type Mode = 'title' | 'room' | 'painting' | 'exhibition';
interface ModalBtn { label: string; primary?: boolean; danger?: boolean; onClick: () => void; }

export class Game {
  root: HTMLElement;
  save: SaveData;
  app!: Application;
  sceneRoot = new Container();
  audio = new AudioSynth();
  npcs = new NPCManager();
  economy: EconomySystem;
  painting: PaintingEngine;
  room: RoomScene;
  browser: BrowserUI;
  private exhibition: ExhibitionScene | null = null;

  private stageEl!: HTMLDivElement;
  private hudEl!: HTMLDivElement;
  private toastsEl!: HTMLDivElement;
  private tooltipEl!: HTMLDivElement;
  private modalEl!: HTMLDivElement;
  private titleEl!: HTMLDivElement;

  private mode: Mode = 'title';
  private clockTimer: number | null = null;
  private tickCount = 0;
  private winShown = false;
  private lastW = 0; private lastH = 0;
  private keyHandler = (e: KeyboardEvent) => this.onKey(e);

  constructor(root: HTMLElement) {
    this.root = root;
    this.save = SaveSystem.load() ?? newSave();
    this.save.started = false; // пока не нажали «играть»
    this.economy = new EconomySystem(this);
    this.painting = new PaintingEngine(this);
    this.room = new RoomScene(this);
    this.audio.setMuted(this.save.muted);
    this.buildShell();
    this.browser = new BrowserUI(this);
    this.showTitle();
    this.ready = this.initPixi();
  }

  private ready: Promise<void> = Promise.resolve();

  refreshBrowser = () => this.browser.refresh();

  // ---------- каркас DOM ----------
  private buildShell() {
    this.root.innerHTML = '';
    this.stageEl = document.createElement('div');
    this.stageEl.className = 'stage';
    this.hudEl = document.createElement('div');
    this.hudEl.className = 'hud hidden';
    this.toastsEl = document.createElement('div');
    this.toastsEl.className = 'toasts';
    this.tooltipEl = document.createElement('div');
    this.tooltipEl.className = 'tooltip hidden';
    this.modalEl = document.createElement('div');
    this.modalEl.className = 'modal-root hidden';
    this.titleEl = document.createElement('div');
    this.titleEl.className = 'title-screen';
    this.root.append(this.stageEl, this.hudEl, this.toastsEl, this.tooltipEl, this.modalEl, this.titleEl);
    window.addEventListener('keydown', this.keyHandler);
    window.addEventListener('resize', () => this.onResize());
  }

  private async initPixi() {
    this.app = new Application();
    await this.app.init({ antialias: true, background: '#171016', resizeTo: this.stageEl, preference: 'webgl' });
    this.app.stage.addChild(this.sceneRoot);
    this.app.ticker.add(t => this.update(t.deltaMS));
    this.onResize();
  }

  destroy() {
    window.removeEventListener('keydown', this.keyHandler);
    if (this.clockTimer !== null) clearInterval(this.clockTimer);
    this.browser.destroy();
    if (this.app) this.app.destroy(true);
  }

  private onResize() {
    if (!this.app) return;
    const w = this.stageEl.clientWidth, h = this.stageEl.clientHeight;
    if (w === this.lastW && h === this.lastH) return;
    this.lastW = w; this.lastH = h;
    if (this.mode === 'room') this.room.resize(w, h);
    if (this.mode === 'exhibition') this.exhibition?.resize(w, h);
    if (this.mode === 'painting') this.painting.layout();
  }

  private update(dtMs: number) {
    if (this.mode === 'room') this.room.update(dtMs);
    if (this.mode === 'exhibition') this.exhibition?.update(dtMs);
  }

  // ---------- титульный экран ----------
  private showTitle() {
    this.mode = 'title';
    this.hudEl.classList.add('hidden');
    const has = SaveSystem.hasSave();
    this.titleEl.innerHTML = `
      <div class="t-splat s1"></div><div class="t-splat s2"></div><div class="t-splat s3"></div><div class="t-splat s4"></div>
      <div class="t-inner">
        <div class="t-brush"><svg viewBox="0 0 120 24"><path d="M2 18 C 30 4, 60 22, 118 8" stroke="#ffd166" stroke-width="5" fill="none" stroke-linecap="round"/></svg></div>
        <h1 class="t-logo">МАНСАРДА</h1>
        <div class="t-sub">симулятор художника · лоу-фай edition</div>
        <div class="t-buttons">
          ${has ? '<button class="btn btn-gold btn-big" id="t-continue">Продолжить</button>' : ''}
          <button class="btn ${has ? '' : 'btn-gold'} btn-big" id="t-new">Новая игра</button>
        </div>
        <div class="t-controls">
          <div class="t-ctrl-h">Управление</div>
          <div>Мышь / палец — всё в мире кликается</div>
          <div>Мольберт — рисование · ПК — интернет и почта · Дверь — курьеры</div>
          <div>Esc — меню / закрыть окно</div>
        </div>
        <div class="t-foot">ArtOS · 128 ИИ-покупателей · RYB-смешивание красок · Web Audio лоу-фай</div>
      </div>
    `;
    this.titleEl.classList.remove('hidden');
    this.titleEl.querySelector('#t-continue')?.addEventListener('click', () => {
      this.audio.unlock(); this.audio.pop();
      this.audio.startMusic();
      this.startGame(SaveSystem.load() ?? newSave());
    });
    this.titleEl.querySelector('#t-new')?.addEventListener('click', () => {
      this.audio.unlock(); this.audio.pop();
      const begin = () => {
        this.audio.startMusic();
        const s = newSave();
        s.inbox.unshift({ ...WELCOME_MAIL, id: 'welcome', minute: s.timeMin, read: false });
        this.startGame(s);
        setTimeout(() => this.toast('Оглянитесь: мольберт, ПК, дверь и стол — всё кликается', 'info'), 800);
        setTimeout(() => this.toast('Начните с карандашного наброска — продайте его и купите кисть!', 'good'), 5000);
      };
      if (has) {
        this.modal({
          title: 'Новая игра?', body: '<div class="m-body"><p class="m-hint">Старое сохранение будет перезаписано. Батон, конечно, останется, а вот картины — нет.</p></div>',
          buttons: [
            { label: 'Отмена', onClick: () => this.closeModal() },
            { label: 'Начать заново', primary: true, onClick: () => { this.closeModal(); begin(); } },
          ],
        });
      } else begin();
    });
  }

  private async startGame(save: SaveData) {
    await this.ready;
    this.save = save;
    this.save.started = true;
    this.titleEl.classList.add('hidden');
    this.titleEl.innerHTML = '';
    this.buildHud();
    this.enterRoom();
    this.startClock();
    this.saveNow();
  }

  // ---------- часы ----------
  private startClock() {
    if (this.clockTimer !== null) return;
    this.clockTimer = window.setInterval(() => this.gameTick(), 1000);
  }

  private gameTick() {
    if (this.mode === 'title') return;
    this.save.timeMin++;
    this.tickCount++;
    if (this.mode === 'room') this.save.energy = Math.min(100, this.save.energy + 0.15);
    this.economy.tick(this.save.timeMin);
    if (this.mode === 'room' && this.tickCount % 10 === 0) this.room.setTimeOfDay(this.save.timeMin);
    this.browser.updateClock();
    this.updateHud();
    if (this.tickCount % 30 === 0) this.saveNow(true);
  }

  // ---------- сцены ----------
  private enterRoom() {
    this.mode = 'room';
    this.exhibition?.unmount(); this.exhibition = null;
    this.room.mount();
    this.room.setTimeOfDay(this.save.timeMin);
    this.room.refreshFrames();
    this.room.refreshEasel();
    this.hudEl.classList.remove('hidden');
    this.updateHud();
    const pending = this.save.deliveries.find(d => d.arrived);
    if (pending && !this.room.hasPackage()) this.room.playCourier(pending);
  }

  private leaveRoom() {
    this.room.unmount();
    this.hudEl.classList.add('hidden');
  }

  onEaselClick() {
    this.audio.click();
    const save = this.save;
    const order = save.orders.find(o => o.status === 'active');
    const options = (Object.keys(PAPERS) as PaperKind[]).filter(k => save.papers[k] > 0);
    if (!options.length) {
      this.toast('Бумага закончилась! Загляните в «Бумажка.ру» на ПК', 'warn');
      this.audio.error();
      return;
    }
    const orderHtml = order ? `
      <div class="card m-order">
        <b>Активный заказ:</b> ${order.brief}<br>
        <span class="m-hint">Формат: ${PAPERS[order.size].name} · осталось ${fmtDuration(order.deadlineMin - save.timeMin)} · гонорар ${fmtMoney(order.reward)}</span><br>
        <button class="btn btn-gold" id="m-order-go" ${save.papers[order.size] > 0 ? '' : 'disabled'}>
          ${save.papers[order.size] > 0 ? 'Рисовать заказ' : 'Нет нужного холста — купите!'}
        </button>
      </div>` : '';
    this.modal({
      title: 'Мольберт',
      body: `<div class="m-body">
        ${orderHtml}
        <div class="m-hint">Выберите лист:</div>
        <div class="paper-list">
          ${options.map(k => `<button class="btn paper-btn" data-paper="${k}">${PAPERS[k].name} <b>×${save.papers[k]}</b></button>`).join('')}
        </div>
      </div>`,
      buttons: [{ label: 'Передумал', onClick: () => this.closeModal() }],
    });
    this.modalEl.querySelectorAll<HTMLElement>('[data-paper]').forEach(b => {
      b.addEventListener('click', () => {
        this.closeModal();
        this.openPainting(b.dataset.paper as PaperKind, null);
      });
    });
    this.modalEl.querySelector('#m-order-go')?.addEventListener('click', () => {
      this.closeModal();
      if (order) this.openPainting(order.size, order);
    });
  }

  private async openPainting(paper: PaperKind, order: Order | null) {
    if (this.save.papers[paper] <= 0) { this.toast('Такой бумаги больше нет', 'warn'); return; }
    this.save.papers[paper]--;
    this.saveNow();
    this.leaveRoom();
    this.mode = 'painting';
    await this.painting.open(paper, order);
  }

  exitPainting() {
    this.enterRoom();
  }

  onPCClick() {
    this.audio.click();
    this.hudEl.classList.add('hidden');
    this.browser.open();
  }

  afterOSClosed() {
    if (this.mode !== 'title') this.hudEl.classList.remove('hidden');
    this.updateHud();
  }

  onDeskClick() {
    this.audio.click();
    const s = this.save;
    const tubeList = TUBES.filter(t => (s.tubes[t.id] ?? 0) > 0).map(t => `<span class="inv-chip"><i style="background:${t.color}"></i>${t.name}: ${Math.round(s.tubes[t.id])}%</span>`).join('') || '<span class="m-hint">красок нет</span>';
    const brushList = s.brushes.map(id => BRUSHES.find(b => b.id === id)?.name).filter(Boolean).join(', ') || 'нет';
    this.modal({
      title: 'Стол художника',
      body: `<div class="m-body inv-body">
        <div class="inv-row"><b>Бумага:</b> ${(Object.keys(PAPERS) as PaperKind[]).map(k => s.papers[k] > 0 ? `${PAPERS[k].name} ×${s.papers[k]}` : '').filter(Boolean).join(' · ') || 'пусто'}</div>
        <div class="inv-row"><b>Кисти:</b> ${brushList}</div>
        <div class="inv-row"><b>Фломастеры:</b> ${s.markers.length ? s.markers.length + ' шт' : 'нет'}</div>
        <div class="inv-row"><b>Краски:</b> ${tubeList}</div>
        <div class="inv-row"><b>Навык:</b> ${'★'.repeat(s.skill)}${'☆'.repeat(3 - s.skill)}</div>
        <p class="m-hint">Пополнить запасы можно в магазинах на ПК (браузер «Ирис»). Потолок рынка: ${fmtMoney(priceCap(this.level()))}.</p>
      </div>`,
      buttons: [{ label: 'Понятно', primary: true, onClick: () => this.closeModal() }],
    });
  }

  onDoorClick() {
    this.audio.click();
    this.room.animateDoor();
    if (this.room.hasPackage()) {
      this.toast('Посылка уже на полу — кликните по ней!', 'info');
      return;
    }
    const pending = this.save.deliveries.find(d => !d.arrived);
    if (pending) {
      this.audio.knock();
      this.toast(`Курьер ещё в пути (${fmtDuration(pending.arriveMin - this.save.timeMin)}). Слышно, как хлопают двери подъезда.`, 'info');
    } else {
      this.audio.knock();
      this.toast([
        'За дверью тихо. Только Палыч кряхтит на лестнице.',
        'Никого. Зато какой вид из окна!',
        'Тишина. Может, заказать еды на eda-da.ru?',
      ][Math.floor(Math.random() * 3)], 'info');
    }
  }

  onDeliveryArrived(d: Delivery) {
    this.audio.doorbell();
    this.toast('Дзынь! Курьер у двери с пакетом', 'good');
    if (this.mode === 'room') this.room.playCourier(d);
  }

  collectPackage(d: Delivery) {
    this.save.deliveries = this.save.deliveries.filter(x => x.id !== d.id);
    const food = FOODS.find(f => f.id === d.foodId);
    if (food) {
      this.save.energy = Math.min(100, this.save.energy + food.energy);
      this.audio.eat();
      this.toast(`${food.name}: +${food.energy} энергии. Вкусно!`, 'good');
    }
    this.updateHud();
    this.saveNow();
  }

  // ---------- экономика (обёртки для UI) ----------
  level() { return levelForXp(this.save.xp); }

  buy(kind: ShopKind, id: string) {
    const s = this.save;
    const lvl = this.level();
    const pay = (price: number): boolean => {
      if (s.money < price) { this.toast('Не хватает денег — продайте что-нибудь!', 'warn'); this.audio.error(); return false; }
      s.money -= price;
      this.audio.cash();
      return true;
    };
    if (kind === 'paint') {
      const t = TUBES.find(x => x.id === id)!;
      if (t.tier > lvl) { this.toast(`Нужен уровень ${t.tier}`, 'warn'); return; }
      if (!pay(t.price)) return;
      s.tubes[id] = 100;
      this.toast(`Куплено: ${t.name}. Кисть будет рада`, 'good');
    } else if (kind === 'brush') {
      const b = BRUSHES.find(x => x.id === id)!;
      if (s.brushes.includes(id)) return;
      if (b.tier > lvl) { this.toast(`Нужен уровень ${b.tier}`, 'warn'); return; }
      if (!pay(b.price)) return;
      s.brushes.push(id);
      this.toast(`Куплено: ${b.name}`, 'good');
    } else if (kind === 'markers') {
      if (s.markers.length) return;
      if (!pay(MARKER_SET.price)) return;
      s.markers = MARKER_SET.colors.map(c => ({ color: c, ink: 120 }));
      this.toast('Набор фломастеров ваш!', 'good');
    } else if (kind === 'paper') {
      const p = PAPER_PACKS.find(x => x.kind === id as PaperKind)!;
      if (p.tier > lvl) { this.toast(`Нужен уровень ${p.tier}`, 'warn'); return; }
      if (!pay(p.price)) return;
      s.papers[p.kind] += p.qty;
      this.toast(`Куплено: ${p.name}`, 'good');
    } else if (kind === 'food') {
      const f = FOODS.find(x => x.id === id)!;
      if (!pay(f.price)) return;
      s.deliveries.push({ id: 'd' + Date.now(), label: f.name, foodId: f.id, arriveMin: s.timeMin + Math.round(rand(20, 40)), arrived: false });
      this.toast(`${f.name} готовится. Курьер выехал!`, 'good');
    } else if (kind === 'study') {
      const st = STUDIES.find(x => x.id === id)!;
      if (s.skill >= st.skillTo) return;
      if (st.tier > lvl) { this.toast(`Нужен уровень ${st.tier}`, 'warn'); return; }
      if (!pay(st.price)) return;
      s.skill = st.skillTo;
      this.audio.levelUp();
      this.toast(`Навык вырос до ${'★'.repeat(s.skill)}!`, 'good');
    }
    this.updateHud();
    this.saveNow();
  }

  postAd(pid: string, price: number, tags: string[]) { return this.economy.postAd(pid, price, tags); }
  toggleCommissionAd() {
    const res = this.economy.toggleCommissionAd();
    this.toast(res.msg, 'info');
  }
  respondOffer(id: string, yes: boolean) { this.economy.respondOffer(id, yes); }
  respondCommission(id: string, yes: boolean) { this.economy.respondCommission(id, yes); }
  markRead(id: string) {
    const m = this.save.inbox.find(x => x.id === id);
    if (m) { m.read = true; this.updateHud(); this.saveNow(true); }
  }
  submitExhibition(ids: string[]) {
    const res = this.economy.submitExhibition(ids);
    this.toast(res.msg, res.ok ? 'good' : 'warn');
    return res;
  }

  visitExhibition() {
    if (this.save.exhibitionState !== 'invited') return;
    const works = this.save.exhibitionWorks
      .map(id => this.save.gallery.find(g => g.id === id))
      .filter((g): g is PaintingMeta => !!g);
    if (works.length < 3) { this.save.exhibitionState = 'none'; return; }
    this.leaveRoom();
    this.mode = 'exhibition';
    this.exhibition = new ExhibitionScene(this, works);
    this.exhibition.mount();
    this.audio.applause();
  }

  finishExhibition() {
    const s = this.save;
    for (const id of s.exhibitionWorks) {
      const g = s.gallery.find(x => x.id === id);
      if (g) g.exhibited = true;
    }
    s.exhibitionsHeld++;
    s.exhibitionState = 'none';
    s.exhibitionWorks = [];
    s.money += 120;
    this.gainXp(150);
    this.audio.cash();
    this.celebrate();
    this.economy.addMail({
      from: 'kurатор@belvorona.art'.replace('к', 'k'), subject: 'Вернисаж удался!',
      body: 'Пресса в восторге, каталог распродан! Переводим 120$ роялти.\nЛидия Марковна просила передать: «Талант, талант!»\n\nЖдём новую программу.',
      kind: 'info',
    });
    this.enterRoom();
    this.saveNow();
  }

  gainXp(n: number) {
    const before = this.level();
    this.save.xp += n;
    const after = this.level();
    if (after > before) {
      this.audio.levelUp();
      this.celebrate();
      const unlocks: string[] = [];
      if (after >= 2) unlocks.push('холсты на подрамнике, новые краски, курсы акварели');
      if (after >= 3) unlocks.push('большие холсты, масляные краски, выставки в «Белой вороне»');
      this.economy.addMail({
        from: 'upravdom@mansarda.ru', subject: `Уровень ${after}: «${LEVEL_TITLES[after]}»`,
        body: `Район гудит о ваших работах! Новый титул: «${LEVEL_TITLES[after]}».\n\nОткрылось: ${unlocks.join('; ') || 'уважение Батона'}.\nПотолок рынка теперь ${fmtMoney(priceCap(after))}.`,
        kind: 'info',
      });
      if (after >= 5 && !this.winShown) {
        this.winShown = true;
        this.modal({
          title: 'Вы — признанный художник!',
          body: `<div class="m-body"><p class="m-quote">Уровень ${after} из ${MAX_LEVEL}. Картины продаются, заказы горят, Батон гордится.</p><p class="m-hint">Игра продолжается в свободном режиме — покорите выставку!</p></div>`,
          buttons: [{ label: 'Творить дальше', primary: true, onClick: () => this.closeModal() }],
        });
      }
    }
    this.updateHud();
  }

  private celebrate() {
    confetti({ particleCount: 90, spread: 75, origin: { y: 0.5 }, colors: ['#ffd166', '#7fd6a4', '#e0755a', '#8fb7dd'] });
  }

  // ---------- HUD ----------
  private buildHud() {
    this.hudEl.innerHTML = `
      <div class="hud-left">
        <div class="chip chip-money" id="hud-money"></div>
        <div class="chip chip-lvl"><div class="lvl-row"><span id="hud-lvl"></span></div><div class="xp-bar"><div class="xp-fill" id="hud-xp"></div></div></div>
        <div class="chip chip-energy"><span class="e-ico"></span><div class="e-bar"><div class="e-fill" id="hud-energy"></div></div></div>
      </div>
      <div class="hud-right">
        <div class="chip chip-order hidden" id="hud-order"></div>
        <div class="chip chip-clock" id="hud-clock"></div>
        <button class="chip chip-btn" id="hud-mail" title="Почта"></button>
        <button class="chip chip-btn" id="hud-sound" title="Звук"></button>
        <button class="chip chip-btn" id="hud-menu" title="Меню">☰</button>
      </div>
      <div class="hud-hint">Мольберт — рисовать · ПК — магазины и почта · Esc — меню</div>
    `;
    this.hudEl.querySelector('#hud-mail')!.addEventListener('click', () => {
      this.hudEl.classList.add('hidden');
      this.browser.open();
      this.browser.openApp('mail');
    });
    this.hudEl.querySelector('#hud-sound')!.addEventListener('click', () => {
      this.save.muted = !this.save.muted;
      this.audio.setMuted(this.save.muted);
      this.saveNow(true);
      this.updateHud();
    });
    this.hudEl.querySelector('#hud-menu')!.addEventListener('click', () => this.openPause());
  }

  updateHud() {
    if (!this.hudEl.querySelector('#hud-money')) return;
    const s = this.save;
    const prog = xpProgress(s.xp);
    this.hudEl.querySelector('#hud-money')!.textContent = fmtMoney(s.money);
    this.hudEl.querySelector('#hud-lvl')!.textContent = `ур. ${prog.level} · ${LEVEL_TITLES[prog.level]}`;
    (this.hudEl.querySelector('#hud-xp') as HTMLElement).style.width = prog.pct + '%';
    const ef = this.hudEl.querySelector('#hud-energy') as HTMLElement;
    ef.style.width = Math.round(s.energy) + '%';
    ef.classList.toggle('low', s.energy < 25);
    this.hudEl.querySelector('#hud-clock')!.textContent = fmtDayTime(s.timeMin);
    const unread = s.inbox.filter(m => !m.read).length;
    this.hudEl.querySelector('#hud-mail')!.innerHTML = `<span class="mail-glyph"></span>${unread ? `<i class="badge">${unread}</i>` : ''}`;
    this.hudEl.querySelector('#hud-sound')!.textContent = s.muted ? '∅' : '♪';
    // заказ
    const order = s.orders.find(o => o.status === 'active');
    const oc = this.hudEl.querySelector('#hud-order')!;
    if (order) {
      oc.classList.remove('hidden');
      const left = order.deadlineMin - s.timeMin;
      oc.innerHTML = `<span class="ord-label">Заказ: ${order.brief}</span><span class="ord-time ${left < 60 ? 'low' : ''}">${left > 0 ? fmtDuration(left) : 'просрочен!'}</span><button class="btn btn-gold btn-tiny" id="hud-order-go">Рисовать</button>`;
      const btn = oc.querySelector('#hud-order-go');
      if (btn && !(btn as any)._bound) {
        (btn as any)._bound = true;
        btn.addEventListener('click', () => {
          const o = this.save.orders.find(x => x.status === 'active');
          if (o) this.openPainting(o.size, o);
        });
      }
    } else {
      oc.classList.add('hidden');
    }
  }

  // ---------- пауза / меню ----------
  private openPause() {
    this.modal({
      title: 'Пауза',
      body: `<div class="m-body"><p class="m-hint">Мансарда подождёт. Батон тоже.</p></div>`,
      buttons: [
        { label: 'Продолжить', primary: true, onClick: () => this.closeModal() },
        { label: 'Справка', onClick: () => { this.closeModal(); this.openHelp(); } },
        { label: this.save.muted ? 'Звук: выкл' : 'Звук: вкл', onClick: () => { this.save.muted = !this.save.muted; this.audio.setMuted(this.save.muted); this.closeModal(); this.openPause(); } },
        { label: 'Сохранить', onClick: () => { this.saveNow(); this.toast('Сохранено', 'good'); this.closeModal(); } },
        { label: 'В главное меню', danger: true, onClick: () => { this.closeModal(); this.quitToTitle(); } },
      ],
    });
  }

  private openHelp() {
    this.modal({
      title: 'Как жить художнику',
      body: `<div class="m-body help-body">
        <p><b>Цикл:</b> рисуйте → продавайте на Толкучке → покупайте краски и холсты → растите в уровнях → заказы → выставка.</p>
        <p><b>Рисование:</b> кисть рисует только мокрой: кликните тюбик → кликните палитру (краски смешаются по RYB!) → водите по листу. Карандаш и мастихин — всегда готовы. Фломастеры не требуют палитры.</p>
        <p><b>Анти-чит:</b> задрать цену в 10 раз не выйдет — ИИ-аукционист Гомер-7 высмеет и снимет объявление.</p>
        <p><b>Энергия:</b> тает за мольбертом, восстанавливается едой с доставки (слушайте дверной звонок).</p>
        <p><b>Заказы:</b> 8 игровых часов (≈8 минут реальных). Просрочка = −40 XP и гневное письмо.</p>
        <p><b>Черновики:</b> незаконченная картина сохраняется на мольберте автоматически.</p>
      </div>`,
      buttons: [{ label: 'Ясно', primary: true, onClick: () => this.closeModal() }],
    });
  }

  private quitToTitle() {
    if (this.painting.active) {
      this.painting.saveDraft(true);
      this.painting.close();
    }
    this.saveNow();
    this.browser.close();
    this.room.unmount();
    this.closeModal();
    this.showTitle();
  }

  private onKey(e: KeyboardEvent) {
    if (e.key !== 'Escape') return;
    if (this.modalEl && !this.modalEl.classList.contains('hidden')) { this.closeModal(); return; }
    if (this.browser.isOpen) { this.browser.close(); this.afterOSClosed(); return; }
    if (this.mode === 'painting') { this.painting.requestEsc(); return; }
    if (this.mode === 'room') this.openPause();
  }

  // ---------- UI-утилиты ----------
  toast(msg: string, kind: 'info' | 'good' | 'warn' = 'info') {
    const t = document.createElement('div');
    t.className = 'toast t-' + kind;
    t.textContent = msg;
    this.toastsEl.appendChild(t);
    setTimeout(() => t.classList.add('out'), 2800);
    setTimeout(() => t.remove(), 3300);
    while (this.toastsEl.children.length > 4) this.toastsEl.firstChild?.remove();
  }

  showTooltip(label: string, hint: string, x: number, y: number): () => void {
    this.tooltipEl.innerHTML = `<b>${label}</b><span>${hint}</span>`;
    this.tooltipEl.classList.remove('hidden');
    const r = this.tooltipEl.getBoundingClientRect();
    this.tooltipEl.style.left = Math.min(window.innerWidth - r.width - 8, x + 16) + 'px';
    this.tooltipEl.style.top = Math.min(window.innerHeight - r.height - 8, y + 18) + 'px';
    return () => this.tooltipEl.classList.add('hidden');
  }

  modal(opts: { title: string; body: string; buttons: ModalBtn[] }) {
    this.modalEl.innerHTML = `
      <div class="modal-panel">
        <div class="modal-title">${opts.title}</div>
        <div class="modal-body">${opts.body}</div>
        <div class="modal-btns">${opts.buttons.map((b, i) =>
          `<button class="btn ${b.primary ? 'btn-gold' : ''} ${b.danger ? 'btn-danger' : ''}" data-mi="${i}">${b.label}</button>`).join('')}
        </div>
      </div>`;
    this.modalEl.classList.remove('hidden');
    this.audio.click();
    this.modalEl.querySelectorAll<HTMLElement>('[data-mi]').forEach(b => {
      b.addEventListener('click', () => opts.buttons[+b.dataset.mi!].onClick());
    });
  }

  closeModal() {
    this.modalEl.classList.add('hidden');
    this.modalEl.innerHTML = '';
  }

  saveNow(silent = false) {
    SaveSystem.save(this.save);
    if (!silent) this.toast('Прогресс сохранён', 'info');
  }
}
