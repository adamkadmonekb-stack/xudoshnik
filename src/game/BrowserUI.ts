// ============================================================
// BrowserUI — имитация ОС «ArtOS»: рабочий стол, окна, браузер
// «Ирис» с локальными сайтами, почта, галерея файлов и телефон.
// Всё — DOM, события делегированы через data-act.
// ============================================================
import type { Game } from './Game';
import {
  TUBES, BRUSHES, MARKER_SET, PAPER_PACKS, FOODS, STUDIES, PAPERS,
  fmtMoney, fmtDayTime, fmtDuration, priceCap,
  type PaperKind, type ShopKind,
} from './types';

const SITES: Record<string, { name: string; url: string }> = {
  home: { name: 'Ирис — стартовая', url: 'iris://start' },
  doska: { name: 'Толкучка — доска объявлений', url: 'tolkuchka.ru' },
  paints: { name: 'КраскиМаркет', url: 'kraski-market.ru' },
  paper: { name: 'Бумажка.ру', url: 'bumazhka.ru' },
  food: { name: 'ЕдаДа — доставка', url: 'eda-da.ru' },
  study: { name: 'Курсы.арт', url: 'kursy.art' },
};

export class BrowserUI {
  game: Game;
  root: HTMLDivElement;
  private booted = false;
  private route = 'home';
  private openApps = new Set<string>();
  private zTop = 20;
  private mailView: string | null = null;
  private phoneTab: 'doska' | 'mail' = 'doska';
  private phoneMail: string | null = null;
  private exhibitSel = new Set<string>();
  private dragState: { win: HTMLElement; dx: number; dy: number } | null = null;

  constructor(game: Game) {
    this.game = game;
    this.root = document.createElement('div');
    this.root.className = 'os-root hidden';
    this.root.innerHTML = `<div class="os-boot" id="os-boot"></div><div class="os-desktop hidden" id="os-desktop"></div>`;
    game.root.appendChild(this.root);
    this.root.addEventListener('click', e => this.onClick(e));
    this.root.addEventListener('pointerdown', e => this.onDragStart(e as PointerEvent));
    window.addEventListener('pointermove', this.onDragMove);
    window.addEventListener('pointerup', this.onDragStop);
  }

  destroy() {
    window.removeEventListener('pointermove', this.onDragMove);
    window.removeEventListener('pointerup', this.onDragStop);
    this.root.remove();
  }

  get isOpen() { return !this.root.classList.contains('hidden'); }

  open() {
    this.root.classList.remove('hidden');
    this.game.audio.whoosh();
    if (!this.booted) {
      this.booted = true;
      const boot = this.root.querySelector<HTMLElement>('#os-boot')!;
      boot.innerHTML = `<div class="boot-logo">ArtOS</div><div class="boot-bar"><div class="boot-fill"></div></div><div class="boot-sub">загрузка творческих драйверов…</div>`;
      setTimeout(() => {
        boot.classList.add('hidden');
        this.root.querySelector('#os-desktop')!.classList.remove('hidden');
        this.renderDesktop();
      }, 1100);
    } else {
      this.refresh();
    }
  }

  close() {
    this.root.classList.add('hidden');
    this.game.audio.whoosh();
  }

  // ---------- каркас ----------
  private renderDesktop() {
    const desk = this.root.querySelector<HTMLElement>('#os-desktop')!;
    const unread = this.game.save.inbox.filter(m => !m.read).length;
    desk.innerHTML = `
      <div class="wall-deco d1"></div><div class="wall-deco d2"></div><div class="wall-deco d3"></div>
      <div class="os-icons">
        <div class="os-icon" data-act="open-app" data-app="browser"><div class="ic ic-browser"></div><span>Ирис</span></div>
        <div class="os-icon" data-act="open-app" data-app="mail"><div class="ic ic-mail">${unread ? '<i class="badge">' + unread + '</i>' : ''}</div><span>Почта</span></div>
        <div class="os-icon" data-act="open-app" data-app="phone"><div class="ic ic-phone"></div><span>Телефон</span></div>
        <div class="os-icon" data-act="open-app" data-app="files"><div class="ic ic-files"></div><span>Картины</span></div>
        <div class="os-icon" data-act="trash"><div class="ic ic-trash"></div><span>Корзина</span></div>
      </div>
      <div class="os-windows" id="os-windows"></div>
      <div class="os-taskbar">
        <button class="tb-start" data-act="os-close"><span class="tb-logo"></span>Пуск</button>
        <div class="tb-apps" id="tb-apps"></div>
        <div class="tb-tray">
          <span class="tb-money">${fmtMoney(this.game.save.money)}</span>
          <span class="tb-clock">${fmtDayTime(this.game.save.timeMin)}</span>
        </div>
      </div>
    `;
    this.renderTaskbar();
    for (const app of this.openApps) this.spawnWindow(app);
    if (this.openApps.size === 0) this.openApp('browser');
  }

  private renderTaskbar() {
    const tb = this.root.querySelector<HTMLElement>('#tb-apps');
    if (!tb) return;
    const names: Record<string, string> = { browser: 'Ирис', mail: 'Почта', phone: 'Телефон', files: 'Картины' };
    tb.innerHTML = [...this.openApps].map(a => `<button class="tb-app" data-act="focus-app" data-app="${a}">${names[a] ?? a}</button>`).join('');
    const money = this.root.querySelector<HTMLElement>('.tb-money');
    if (money) money.textContent = fmtMoney(this.game.save.money);
    const clock = this.root.querySelector<HTMLElement>('.tb-clock');
    if (clock) clock.textContent = fmtDayTime(this.game.save.timeMin);
    const mailIc = this.root.querySelector<HTMLElement>('.ic-mail');
    if (mailIc) {
      const unread = this.game.save.inbox.filter(m => !m.read).length;
      mailIc.innerHTML = (unread ? '<i class="badge">' + unread + '</i>' : '');
    }
  }

  updateClock() {
    const clock = this.root.querySelector<HTMLElement>('.tb-clock');
    if (clock) clock.textContent = fmtDayTime(this.game.save.timeMin);
  }

  refresh() {
    if (!this.isOpen || !this.booted) return;
    this.renderTaskbar();
    for (const app of this.openApps) {
      const body = this.root.querySelector<HTMLElement>(`#win-${app} .win-body`);
      if (body) { body.innerHTML = this.renderApp(app); this.bindForms(app, body); }
    }
  }

  openApp(app: string) {
    if (app === 'trash') { this.game.toast('В корзине только огрызок ластика и мечты о славе', 'info'); this.game.audio.pop(); return; }
    this.openApps.add(app);
    this.spawnWindow(app);
    this.renderTaskbar();
    this.game.audio.click();
  }

  private spawnWindow(app: string) {
    const host = this.root.querySelector<HTMLElement>('#os-windows');
    if (!host) return;
    if (this.root.querySelector(`#win-${app}`)) { this.focusWindow(app); return; }
    const names: Record<string, string> = { browser: 'Браузер «Ирис»', mail: 'Почта', phone: 'Телефон', files: 'Мои картины' };
    const sizes: Record<string, [number, number]> = { browser: [780, 540], mail: [660, 480], phone: [380, 640], files: [700, 520] };
    const [w, h] = sizes[app];
    const idx = [...this.openApps].indexOf(app);
    const win = document.createElement('div');
    win.className = 'win';
    win.id = 'win-' + app;
    win.style.width = w + 'px'; win.style.height = h + 'px';
    win.style.left = Math.max(6, 40 + idx * 26) + 'px';
    win.style.top = Math.max(6, 20 + idx * 22) + 'px';
    win.style.zIndex = String(++this.zTop);
    win.innerHTML = `
      <div class="win-head">
        <span class="win-title">${names[app]}</span>
        <button class="win-close" data-act="close-app" data-app="${app}">✕</button>
      </div>
      <div class="win-body"></div>`;
    win.addEventListener('pointerdown', () => { win.style.zIndex = String(++this.zTop); });
    host.appendChild(win);
    const body = win.querySelector<HTMLElement>('.win-body')!;
    body.innerHTML = this.renderApp(app);
    this.bindForms(app, body);
  }

  private focusWindow(app: string) {
    const win = this.root.querySelector<HTMLElement>('#win-' + app);
    if (win) win.style.zIndex = String(++this.zTop);
  }

  // ---------- рендер приложений ----------
  private renderApp(app: string): string {
    if (app === 'browser') return this.renderBrowser();
    if (app === 'mail') return this.renderMail();
    if (app === 'phone') return this.renderPhone();
    if (app === 'files') return this.renderFiles();
    return '';
  }

  // ===== Браузер =====
  private renderBrowser(): string {
    const s = SITES[this.route];
    return `
      <div class="br-bar">
        <button class="br-btn" data-act="nav" data-to="home">⌂</button>
        <button class="br-btn" data-act="nav" data-to="${this.route === 'home' ? 'doska' : this.route}">↻</button>
        <div class="br-url">${s.url}</div>
      </div>
      <div class="br-page">${this.renderRoute()}</div>
    `;
  }

  private renderRoute(): string {
    switch (this.route) {
      case 'doska': return this.pageDoska();
      case 'paints': return this.pagePaints();
      case 'paper': return this.pagePaper();
      case 'food': return this.pageFood();
      case 'study': return this.pageStudy();
      default: return this.pageHome();
    }
  }

  private pageHome(): string {
    const tips = [
      'Совет: смешивайте краски на палитре — RYB-пигменты дают живые оттенки.',
      'Совет: цена выше рынка = сарказм от ИИ-аукциониста Гомер-7.',
      'Совет: сухая кисть не рисует. Тюбик → палитра → холст.',
      'Совет: заказы на картины платят больше прямых продаж.',
      'Совет: кот Батон повышает мораль. Научно доказано Батоном.',
    ];
    return `
      <div class="site home-site">
        <div class="iris-logo">Ирис</div>
        <div class="iris-sub">поисковик творческих людей</div>
        <div class="home-grid">
          <button class="home-tile t-doska" data-act="nav" data-to="doska"><b>Толкучка</b><span>доска объявлений</span></button>
          <button class="home-tile t-paints" data-act="nav" data-to="paints"><b>КраскиМаркет</b><span>краски · кисти · фломастеры</span></button>
          <button class="home-tile t-paper" data-act="nav" data-to="paper"><b>Бумажка.ру</b><span>бумага и холсты</span></button>
          <button class="home-tile t-food" data-act="nav" data-to="food"><b>ЕдаДа</b><span>доставка у порога</span></button>
          <button class="home-tile t-study" data-act="nav" data-to="study"><b>Курсы.арт</b><span>прокачайте навык</span></button>
        </div>
        <div class="home-tip">${tips[this.game.save.timeMin % tips.length]}</div>
      </div>`;
  }

  private pageDoska(): string {
    const save = this.game.save;
    const lvl = this.game.level();
    const cap = priceCap(lvl);
    const unsold = save.gallery.filter(g => !g.soldTo && !save.ads.some(a => a.paintingId === g.id && a.status === 'active'));
    const active = save.ads.filter(a => a.status === 'active');
    const history = save.ads.filter(a => a.status !== 'active').slice(0, 6);
    return `
      <div class="site doska-site">
        <div class="site-head">ТОЛКУЧКА <span>· объявления района Мансардовка</span></div>
        <div class="doska-grid">
          <div class="card">
            <div class="card-h">Продать картину</div>
            ${unsold.length ? `
              <form data-form="ad" class="ad-form">
                <label>Картина
                  <select id="ad-painting">${unsold.map(p => `<option value="${p.id}">«${p.title}» · кач. ${p.quality}</option>`).join('')}</select>
                </label>
                <label>Цена, $ <input type="number" id="ad-price" min="1" step="1" value="${Math.min(cap, 100 + lvl * 60)}"></label>
                <div class="hint-line">Потолок рынка для уровня ${lvl}: <b>${fmtMoney(cap)}</b>. Дороже — рискуете нарваться на Гомер-7.</div>
                <label>Теги (через запятую) <input type="text" id="ad-tags" placeholder="уют, акварель, кот"></label>
                <button class="btn btn-gold" type="submit">Опубликовать</button>
              </form>` : `<p class="m-hint">Нет свободных картин. Нарисуйте что-нибудь на мольберте!${save.gallery.length ? ' (несколько уже продано или висит в объявлениях)' : ''}</p>`}
          </div>
          <div class="card">
            <div class="card-h">Работа на заказ</div>
            <p class="m-hint">Объявление «БЕРУ ЗАКАЗЫ» привлекает клиентов с конкретными идеями. Гонорары выше, но есть дедлайны — 8 часов!</p>
            <button class="btn ${save.commissionAdActive ? 'btn-danger' : 'btn-gold'}" data-act="toggle-commission">
              ${save.commissionAdActive ? 'Снять объявление' : 'Разместить «Беру заказы»'}
            </button>
          </div>
        </div>
        <div class="card">
          <div class="card-h">Мои объявления</div>
          ${active.length || history.length ? `
            <table class="tbl">
              <tr><th>Товар</th><th>Цена</th><th>Статус</th></tr>
              ${active.map(a => `<tr><td>«${a.title}»</td><td>${fmtMoney(a.price)}</td><td><span class="st st-act">висит</span>${a.strikes ? ` <span class="st st-bad">Гомер-7: ${a.strikes}/3</span>` : ''}</td></tr>`).join('')}
              ${history.map(a => `<tr class="dim"><td>«${a.title}»</td><td>${fmtMoney(a.price)}</td><td><span class="st ${a.status === 'sold' ? 'st-good' : 'st-bad'}">${a.status === 'sold' ? 'продано' : 'снято'}</span></td></tr>`).join('')}
            </table>` : '<p class="m-hint">Пока пусто. Первая продажа ждёт!</p>'}
        </div>
      </div>`;
  }

  private shopCard(kind: ShopKind, id: string, name: string, desc: string, price: number, tier: number, owned: boolean, extra = ''): string {
    const lvl = this.game.level();
    const locked = tier > lvl;
    return `
      <div class="shop-item ${locked ? 'locked' : ''}">
        <div class="shop-ico shop-ico-${kind}">${extra}</div>
        <div class="shop-info"><b>${name}</b><span>${desc}</span>${owned ? '<span class="st st-good">куплено</span>' : ''}</div>
        <div class="shop-buy">
          <div class="shop-price">${fmtMoney(price)}</div>
          ${owned ? '' : locked
            ? `<div class="lock-note">уровень ${tier}</div>`
            : `<button class="btn btn-small" data-act="buy" data-kind="${kind}" data-id="${id}">Купить</button>`}
        </div>
      </div>`;
  }

  private pagePaints(): string {
    const save = this.game.save;
    return `
      <div class="site">
        <div class="site-head">КРАСКИМАРКЕТ <span>· всё для мазка</span></div>
        <div class="card"><div class="card-h">Краски (тюбик = 40 маканий)</div>
          ${TUBES.map(t => this.shopCard('paint', t.id, t.name, 'пигмент', t.price, t.tier, false, `<i style="background:${t.color}"></i>`)).join('')}
        </div>
        <div class="card"><div class="card-h">Кисти</div>
          ${BRUSHES.map(b => this.shopCard('brush', b.id, b.name, b.shape === 'round' ? 'круглая форма мазка' : 'плоская форма мазка', b.price, b.tier, save.brushes.includes(b.id))).join('')}
        </div>
        <div class="card"><div class="card-h">Фломастеры</div>
          ${this.shopCard('markers', MARKER_SET.id, MARKER_SET.name, '6 цветов, свои чернила, не требуют палитры', MARKER_SET.price, MARKER_SET.tier, save.markers.length > 0,
            `<i style="background:linear-gradient(90deg,#e04747,#3b6fd4,#2f9e57,#e0a52e)"></i>`)}
        </div>
      </div>`;
  }

  private pagePaper(): string {
    const save = this.game.save;
    return `
      <div class="site">
        <div class="site-head">БУМАЖКА.РУ <span>· шуршим с 1998 года</span></div>
        <div class="card"><div class="card-h">Носители для шедевров</div>
          ${PAPER_PACKS.map(p => this.shopCard('paper', p.kind, p.name, `${PAPERS[p.kind].w}×${PAPERS[p.kind].h} px · в наличии: ${save.papers[p.kind]}`, p.price, p.tier, false)).join('')}
        </div>
      </div>`;
  }

  private pageFood(): string {
    return `
      <div class="site">
        <div class="site-head">ЕДАДА <span>· курьер позвонит в дверь</span></div>
        <div class="card"><div class="card-h">Меню (восстанавливает энергию)</div>
          ${FOODS.map(f => this.shopCard('food', f.id, f.name, `${f.desc} · +${f.energy} энергии`, f.price, 1, false)).join('')}
          <p class="m-hint">После оплаты слушайте дверной звонок — курьер оставит пакет у двери.</p>
        </div>
      </div>`;
  }

  private pageStudy(): string {
    const save = this.game.save;
    return `
      <div class="site">
        <div class="site-head">КУРСЫ.АРТ <span>· станьте рукой-машиной</span></div>
        <div class="card"><div class="card-h">Навык рисования: уровень ${save.skill}/3</div>
          ${STUDIES.map(s => this.shopCard('study', s.id, s.name, s.desc, s.price, s.tier, save.skill >= s.skillTo)).join('')}
          <p class="m-hint">Навык делает мазок плотнее и добавляет качество каждой работе.</p>
        </div>
      </div>`;
  }

  // ===== Почта =====
  private mailActions(m: any): string {
    const save = this.game.save;
    if (m.kind === 'offer' && m.offer) {
      const ad = save.ads.find(a => a.id === m.offer.adId);
      if (!ad || ad.status !== 'active') return '<p class="st st-bad">Предложение уже неактуально</p>';
      return `<div class="mail-actions">
        <button class="btn btn-gold" data-act="offer" data-id="${m.id}" data-yes="1">Продать за ${fmtMoney(m.offer.amount)}</button>
        <button class="btn" data-act="offer" data-id="${m.id}" data-yes="0">Отказать</button>
      </div>`;
    }
    if (m.kind === 'commission' && m.commission) {
      const hasOrder = save.orders.some(o => o.status === 'active');
      return `<div class="mail-actions">
        <button class="btn btn-gold ${hasOrder ? 'disabled' : ''}" data-act="commission" data-id="${m.id}" data-yes="1">${hasOrder ? 'Сначала сдайте текущий заказ' : 'Принять заказ'}</button>
        <button class="btn" data-act="commission" data-id="${m.id}" data-yes="0">Отклонить</button>
      </div>`;
    }
    if (m.action === 'exhibition' && save.exhibitionState === 'invited') {
      return `<div class="mail-actions"><button class="btn btn-gold" data-act="exhibit-go">Пойти на выставку</button></div>`;
    }
    return '';
  }

  private renderMail(): string {
    const save = this.game.save;
    if (this.mailView) {
      const m = save.inbox.find(x => x.id === this.mailView);
      if (m) {
        return `
          <div class="mail-app">
            <div class="mail-top"><button class="btn btn-small" data-act="mail-back">← Входящие</button></div>
            <div class="mail-read">
              <div class="mail-subj">${m.subject}</div>
              <div class="mail-meta">От: ${m.from} · ${fmtDayTime(m.minute)}</div>
              <div class="mail-body">${m.body}</div>
              ${this.mailActions(m)}
            </div>
          </div>`;
      }
      this.mailView = null;
    }
    const items = save.inbox.map(m => `
      <div class="mail-item ${m.read ? '' : 'unread'}" data-act="mail-open" data-id="${m.id}">
        <span class="mail-dot"></span>
        <div class="mail-i-subj">${m.subject}</div>
        <div class="mail-i-from">${m.from} · ${fmtDayTime(m.minute)}</div>
      </div>`).join('');
    return `
      <div class="mail-app">
        <div class="mail-top"><b>Входящие</b> <span class="m-hint">(${save.inbox.length})</span></div>
        <div class="mail-list">${items || '<p class="m-hint">Пусто. Выставьте картину на Толкучку — и письма потекут рекой.</p>'}</div>
      </div>`;
  }

  // ===== Картины (файлы) =====
  private renderFiles(): string {
    const save = this.game.save;
    const can = this.game.economy.canExhibit();
    const eligible = save.gallery.filter(g => !g.soldTo && !g.exhibited && g.quality >= 55);
    let exhPanel = '';
    if (save.exhibitionState === 'submitted') {
      exhPanel = `<div class="exh-panel">Заявка у куратора. Ждите письма-приглашения…</div>`;
    } else if (save.exhibitionState === 'invited') {
      exhPanel = `<div class="exh-panel">Приглашение получено! <button class="btn btn-gold btn-small" data-act="exhibit-go">Пойти на выставку</button></div>`;
    } else if (can.ok) {
      exhPanel = `
        <div class="exh-panel">
          <b>Выставка в «Белой вороне».</b> Выберите 3 работы (выбрано: <span id="exh-count">${this.exhibitSel.size}</span>/3):
          <div class="exh-thumbs">
            ${eligible.map(g => `<img class="exh-thumb ${this.exhibitSel.has(g.id) ? 'sel' : ''}" data-act="exhibit-select" data-id="${g.id}" src="${g.thumb}" alt="">`).join('')}
          </div>
          <button class="btn btn-gold ${this.exhibitSel.size === 3 ? '' : 'disabled'}" data-act="exhibit-submit">Отправить заявку</button>
        </div>`;
    } else {
      exhPanel = `<div class="exh-panel dim">Выставка: ${can.msg}</div>`;
    }
    const grid = save.gallery.map(g => `
      <div class="file-item">
        <img src="${g.thumb}" alt="">
        <div class="file-meta">
          <b>«${g.title}»</b>
          <span>качество ${g.quality} · ${PAPERS[g.paper as PaperKind].name}</span>
          ${g.soldTo ? '<span class="st st-good">продано: ' + g.soldTo + '</span>' : ''}
          ${g.exhibited ? '<span class="st st-act">была на выставке</span>' : ''}
        </div>
      </div>`).join('');
    return `
      <div class="files-app">
        <div class="card">${exhPanel}</div>
        <div class="files-grid">${grid || '<p class="m-hint">Папка «Шедевры» пуста. Мольберт скучает.</p>'}</div>
      </div>`;
  }

  // ===== Телефон =====
  private renderPhone(): string {
    const save = this.game.save;
    const tabBtns = `
      <div class="ph-tabs">
        <button class="${this.phoneTab === 'doska' ? 'on' : ''}" data-act="phone-tab" data-tab="doska">Доска</button>
        <button class="${this.phoneTab === 'mail' ? 'on' : ''}" data-act="phone-tab" data-tab="mail">Почта${save.inbox.some(m => !m.read) ? ' •' : ''}</button>
      </div>`;
    if (this.phoneTab === 'mail') {
      if (this.phoneMail) {
        const m = save.inbox.find(x => x.id === this.phoneMail);
        if (m) {
          return `<div class="phone">${tabBtns}<div class="ph-content">
            <button class="btn btn-small" data-act="phone-mail-back">←</button>
            <div class="mail-subj">${m.subject}</div>
            <div class="mail-meta">${m.from}</div>
            <div class="mail-body">${m.body}</div>
            ${this.mailActions(m)}
          </div></div>`;
        }
        this.phoneMail = null;
      }
      return `<div class="phone">${tabBtns}<div class="ph-content">
        ${save.inbox.map(m => `<div class="mail-item mini ${m.read ? '' : 'unread'}" data-act="phone-mail-open" data-id="${m.id}">
          <div class="mail-i-subj">${m.subject}</div><div class="mail-i-from">${m.from}</div></div>`).join('') || '<p class="m-hint">Нет писем</p>'}
      </div></div>`;
    }
    // доска
    const unsold = save.gallery.filter(g => !g.soldTo && !save.ads.some(a => a.paintingId === g.id && a.status === 'active'));
    return `<div class="phone">${tabBtns}<div class="ph-content">
      <div class="card">
        <div class="card-h">Толкучка с телефона</div>
        ${unsold.length ? `<form data-form="ad-phone" class="ad-form">
          <select id="adp-painting">${unsold.map(p => `<option value="${p.id}">«${p.title}»</option>`).join('')}</select>
          <input type="number" id="adp-price" min="1" value="${Math.min(priceCap(this.game.level()), 150)}">
          <button class="btn btn-gold btn-small" type="submit">Продать</button>
        </form>` : '<p class="m-hint">Нет свободных картин</p>'}
        <button class="btn btn-small ${save.commissionAdActive ? 'btn-danger' : ''}" data-act="toggle-commission">
          ${save.commissionAdActive ? 'Заказы: ВКЛ' : 'Беру заказы: ВЫКЛ'}
        </button>
      </div>
      ${save.ads.filter(a => a.status === 'active').map(a => `<div class="mail-item mini"><div class="mail-i-subj">«${a.title}» — ${fmtMoney(a.price)}</div><div class="mail-i-from">висит на доске</div></div>`).join('')}
    </div></div>`;
  }

  // ---------- события ----------
  private onClick(e: Event) {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (!el || !this.isOpen) return;
    const act = el.dataset.act!;
    const id = el.dataset.id;
    switch (act) {
      case 'open-app': this.openApp(el.dataset.app!); break;
      case 'close-app': {
        const app = el.dataset.app!;
        this.openApps.delete(app);
        this.root.querySelector('#win-' + app)?.remove();
        this.renderTaskbar();
        break;
      }
      case 'focus-app': this.focusWindow(el.dataset.app!); break;
      case 'os-close': this.close(); this.game.afterOSClosed(); break;
      case 'nav': this.route = el.dataset.to!; this.refresh(); this.game.audio.click(); break;
      case 'buy': this.game.buy(el.dataset.kind as ShopKind, id!); this.refresh(); break;
      case 'toggle-commission': this.game.toggleCommissionAd(); this.refresh(); break;
      case 'mail-open': this.mailView = id!; this.game.markRead(id!); this.refresh(); break;
      case 'mail-back': this.mailView = null; this.refresh(); break;
      case 'offer': this.game.respondOffer(id!, el.dataset.yes === '1'); break;
      case 'commission': if (el.classList.contains('disabled')) return; this.game.respondCommission(id!, el.dataset.yes === '1'); break;
      case 'exhibit-go': this.close(); this.game.visitExhibition(); break;
      case 'exhibit-select':
        if (this.exhibitSel.has(id!)) this.exhibitSel.delete(id!); else if (this.exhibitSel.size < 3) this.exhibitSel.add(id!);
        this.game.audio.click();
        this.refresh();
        break;
      case 'exhibit-submit': {
        const res = this.game.submitExhibition([...this.exhibitSel]);
        if (res.ok) this.exhibitSel.clear();
        this.refresh();
        break;
      }
      case 'phone-tab': this.phoneTab = el.dataset.tab as 'doska' | 'mail'; this.phoneMail = null; this.refresh(); break;
      case 'phone-mail-open': this.phoneMail = id!; this.game.markRead(id!); this.refresh(); break;
      case 'phone-mail-back': this.phoneMail = null; this.refresh(); break;
      case 'trash': this.openApp('trash'); break;
    }
  }

  private bindForms(app: string, body: HTMLElement) {
    const adForm = body.querySelector<HTMLFormElement>('[data-form="ad"]');
    if (adForm) {
      adForm.addEventListener('submit', ev => {
        ev.preventDefault();
        const pid = adForm.querySelector<HTMLSelectElement>('#ad-painting')!.value;
        const price = parseFloat(adForm.querySelector<HTMLInputElement>('#ad-price')!.value);
        const tags = adForm.querySelector<HTMLInputElement>('#ad-tags')!.value.split(',').map(s => s.trim()).filter(Boolean);
        const res = this.game.postAd(pid, price, tags);
        if (res.ok) this.refresh(); else this.game.toast(res.msg, 'warn');
      });
    }
    const adPhone = body.querySelector<HTMLFormElement>('[data-form="ad-phone"]');
    if (adPhone) {
      adPhone.addEventListener('submit', ev => {
        ev.preventDefault();
        const pid = adPhone.querySelector<HTMLSelectElement>('#adp-painting')!.value;
        const price = parseFloat(adPhone.querySelector<HTMLInputElement>('#adp-price')!.value);
        const res = this.game.postAd(pid, price, []);
        if (res.ok) this.refresh(); else this.game.toast(res.msg, 'warn');
      });
    }
    void app;
  }

  // ---------- перетаскивание окон ----------
  private onDragStart = (e: PointerEvent) => {
    const head = (e.target as HTMLElement).closest<HTMLElement>('.win-head');
    if (!head || (e.target as HTMLElement).closest('.win-close')) return;
    const win = head.parentElement as HTMLElement;
    const r = win.getBoundingClientRect();
    this.dragState = { win, dx: e.clientX - r.left, dy: e.clientY - r.top };
    win.style.zIndex = String(++this.zTop);
  };
  private onDragMove = (e: PointerEvent) => {
    if (!this.dragState) return;
    const { win, dx, dy } = this.dragState;
    win.style.left = Math.max(-100, Math.min(window.innerWidth - 80, e.clientX - dx)) + 'px';
    win.style.top = Math.max(0, Math.min(window.innerHeight - 60, e.clientY - dy)) + 'px';
  };
  private onDragStop = () => { this.dragState = null; };
}
