// ============================================================
// EconomySystem — продажи, заказы, анти-чит по ценам, выставки, события по времени.
// ============================================================
import type { Game } from './Game';
import {
  priceCap, rand, uid, fmtMoney, fmtDuration, pick,
  EXHIBITION_MIN_LEVEL, EXHIBITION_MIN_QUALITY, PAPERS,
  type Ad, type Mail, type Order, type PaperKind,
} from './types';

export class EconomySystem {
  game: Game;
  private nextCommissionAt = 0;

  constructor(game: Game) {
    this.game = game;
  }

  private get save() { return this.game.save; }

  addMail(m: Omit<Mail, 'id' | 'minute' | 'read'>, silent = false) {
    this.save.inbox.unshift({ ...m, id: uid(), minute: this.save.timeMin, read: false });
    if (!silent) {
      this.game.audio.mailDing();
      this.game.toast('Новое письмо — загляните в почту на ПК', 'info');
      this.game.updateHud();
    }
  }

  // ---------- Доска объявлений ----------
  postAd(paintingId: string, price: number, tags: string[]): { ok: boolean; msg: string } {
    const s = this.save;
    const p = s.gallery.find(g => g.id === paintingId);
    if (!p) return { ok: false, msg: 'Выберите картину' };
    if (p.soldTo) return { ok: false, msg: 'Эта картина уже продана' };
    if (s.ads.some(a => a.paintingId === paintingId && a.status === 'active'))
      return { ok: false, msg: 'Объявление для этой картины уже висит' };
    if (!Number.isFinite(price) || price <= 0) return { ok: false, msg: 'Укажите цену больше нуля' };
    price = Math.round(price);
    const ad: Ad = {
      id: uid(), paintingId, title: p.title, price, tags: tags.slice(0, 5),
      postedMin: s.timeMin, resolveMin: s.timeMin + Math.round(rand(90, 300)),
      status: 'active', strikes: 0,
    };
    s.ads.unshift(ad);
    this.game.audio.pop();
    this.game.toast(`Объявление опубликовано: «${p.title}» за ${fmtMoney(price)}`, 'good');
    this.game.saveNow();
    return { ok: true, msg: 'Готово! Покупатели заглянут в течение дня.' };
  }

  toggleCommissionAd(): { ok: boolean; msg: string } {
    this.save.commissionAdActive = !this.save.commissionAdActive;
    if (this.save.commissionAdActive) this.nextCommissionAt = this.save.timeMin + Math.round(rand(120, 360));
    this.game.audio.pop();
    this.game.saveNow();
    return {
      ok: true,
      msg: this.save.commissionAdActive
        ? 'Объявление «Беру заказы» опубликовано на Толкучке!'
        : 'Объявление «Беру заказы» снято.',
    };
  }

  // ---------- Реакция на письма ----------
  respondOffer(mailId: string, accept: boolean) {
    const s = this.save;
    const mail = s.inbox.find(m => m.id === mailId);
    if (!mail || !mail.offer) return;
    const { adId, paintingId, amount, npcName } = mail.offer;
    const ad = s.ads.find(a => a.id === adId);
    const painting = s.gallery.find(g => g.id === paintingId);
    mail.read = true;
    if (!ad || !painting || ad.status !== 'active') {
      this.game.toast('Объявление уже неактуально', 'warn');
      this.game.refreshBrowser?.();
      return;
    }
    if (accept) {
      ad.status = 'sold';
      painting.soldTo = npcName;
      s.money += amount;
      s.stats.sold++; s.stats.earned += amount;
      this.game.audio.cash();
      this.game.gainXp(40 + Math.round(painting.quality / 2));
      this.addMail({
        from: mail.from, subject: `Re: «${painting.title}» — забираю!`,
        body: `Перевёл(а) ${fmtMoney(amount)}. Картина уже едет ко мне!\n\n${this.game.npcs.praise(painting)}\n\n— ${npcName}`,
        kind: 'result',
      });
      this.game.toast(`Продано! «${painting.title}» за ${fmtMoney(amount)}`, 'good');
    } else {
      ad.strikes++;
      if (ad.strikes >= 3) {
        ad.status = 'removed';
        this.game.toast('Покупатели устали ждать — объявление снято', 'warn');
      } else {
        ad.resolveMin = s.timeMin + Math.round(rand(200, 420));
        this.game.toast('Вы отказали. Возможно, предложат ещё...', 'info');
      }
    }
    this.game.saveNow();
    this.game.updateHud();
    this.game.refreshBrowser?.();
  }

  respondCommission(mailId: string, accept: boolean) {
    const s = this.save;
    const mail = s.inbox.find(m => m.id === mailId);
    if (!mail || !mail.commission) return;
    mail.read = true;
    if (accept) {
      const c = mail.commission;
      if (s.orders.some(o => o.status === 'active')) {
        this.game.toast('Сначала закончите текущий заказ!', 'warn');
        this.game.refreshBrowser?.();
        return;
      }
      const order: Order = {
        id: uid(), npcId: c.npcId, client: c.npcName, brief: c.brief,
        size: c.size, reward: c.reward, deadlineMin: c.deadlineMin, status: 'active',
      };
      s.orders.unshift(order);
      this.game.audio.pop();
      this.game.toast(`Заказ принят: ${c.brief}. Дедлайн — ${fmtDuration(c.deadlineMin - s.timeMin)}`, 'good');
    } else {
      this.game.toast('Заказ отклонён', 'info');
    }
    this.game.saveNow();
    this.game.updateHud();
    this.game.refreshBrowser?.();
  }

  completeOrder(order: Order, quality: number): { ok: boolean; reward: number } {
    const s = this.save;
    if (order.status !== 'active') return { ok: false, reward: 0 };
    if (s.timeMin > order.deadlineMin) {
      order.status = 'failed';
      s.xp = Math.max(0, s.xp - 40);
      this.addMail({
        from: `${order.client} <grom@pochta.art>`, subject: 'ЭТО СРЫВ СРОКОВ',
        body: `Я ждал(а) «${order.brief}» целую вечность!\nЗаказ отменён, репутация испорчена. Надеюсь, вы понимаете, что наговорили себе на плохой отзыв.\n\n— ${order.client}`,
        kind: 'result',
      });
      this.game.toast('Дедлайн провален! Репутация пострадала (−40 XP)', 'warn');
      this.game.audio.error();
      this.game.saveNow(); this.game.updateHud();
      return { ok: false, reward: 0 };
    }
    order.status = 'done';
    const mult = 0.7 + (quality / 100) * 0.6;
    const reward = Math.round(order.reward * mult);
    s.money += reward;
    s.stats.ordersDone++; s.stats.earned += reward;
    this.game.audio.cash();
    this.game.gainXp(60 + quality);
    const npc = this.game.npcs.byId(order.npcId);
    this.addMail({
      from: npc ? npc.email : 'client@pochta.art', subject: `«${order.brief}» — восторг!`,
      body: `Получил(а) картину! Качество — ${quality}/100, и это чувствуется.\nПеревёл(а) ${fmtMoney(reward)} и чаевые в виде горячей рекомендации друзьям.\n\n— ${order.client}`,
      kind: 'result',
    });
    this.game.toast(`Заказ сдан! +${fmtMoney(reward)}`, 'good');
    this.game.saveNow(); this.game.updateHud();
    return { ok: true, reward };
  }

  // ---------- Выставка ----------
  canExhibit(): { ok: boolean; msg: string } {
    const s = this.save;
    const lvl = this.game.level();
    if (lvl < EXHIBITION_MIN_LEVEL) return { ok: false, msg: `Галерея откроется на уровне ${EXHIBITION_MIN_LEVEL}` };
    const works = s.gallery.filter(g => !g.soldTo && !g.exhibited && g.quality >= EXHIBITION_MIN_QUALITY);
    if (works.length < 3) return { ok: false, msg: `Нужно 3 непроданные работы качеством ≥${EXHIBITION_MIN_QUALITY} (сейчас ${works.length})` };
    return { ok: true, msg: '' };
  }

  submitExhibition(ids: string[]): { ok: boolean; msg: string } {
    const can = this.canExhibit();
    if (!can.ok) return can;
    if (ids.length !== 3) return { ok: false, msg: 'Выберите ровно 3 работы' };
    const s = this.save;
    s.exhibitionWorks = ids;
    s.exhibitionState = 'submitted';
    s.exhibitionSubmitMin = s.timeMin;
    this.addMail({
      from: 'zayavki@belvorona.art', subject: 'Заявка в галерею «Белая ворона» принята',
      body: 'Ваше портфолио на рассмотрении куратора. Ответ придёт в течение дня.\n\nС уважением, куратор Лидия Марковна',
      kind: 'info',
    });
    this.game.saveNow();
    return { ok: true, msg: 'Заявка отправлена куратору!' };
  }

  // ---------- Игровое время: события ----------
  tick(now: number) {
    const s = this.save;

    // Объявления → письма покупателей
    for (const ad of s.ads) {
      if (ad.status === 'active' && ad.resolveMin <= now) this.resolveAd(ad, now);
    }
    // Объявление «беру заказы» (после загрузки сохранения таймер перевзводим)
    if (s.commissionAdActive && this.nextCommissionAt === 0) {
      this.nextCommissionAt = now + Math.round(rand(120, 400));
    }
    if (s.commissionAdActive && this.nextCommissionAt > 0 && now >= this.nextCommissionAt) {
      this.nextCommissionAt = now + Math.round(rand(600, 1000));
      this.makeCommissionOffer(now);
    }
    // Дедлайны заказов
    for (const o of s.orders) {
      if (o.status === 'active' && now > o.deadlineMin) {
        o.status = 'failed';
        s.xp = Math.max(0, s.xp - 40);
        this.addMail({
          from: `${o.client} <grom@pochta.art>`, subject: 'ГДЕ МОЯ КАРТИНА?!',
          body: `Срок по заказу «${o.brief}» истёк!\nЯ в ярости. Минус репутация, минус доверие, минус вы из моего списка художников.\n\n— ${o.client}`,
          kind: 'result',
        });
        this.game.toast(`Заказ «${o.brief}» провален: дедлайн прошёл`, 'warn');
      }
    }
    // Доставки
    for (const d of s.deliveries) {
      if (!d.arrived && d.arriveMin <= now) {
        d.arrived = true;
        this.game.onDeliveryArrived(d);
      }
    }
    // Приглашение на выставку (через 12 игровых часов)
    if (s.exhibitionState === 'submitted' && now >= s.exhibitionSubmitMin + 720) {
      s.exhibitionState = 'invited';
      this.addMail({
        from: 'kurатор@belvorona.art'.replace('к', 'k'), subject: 'ВЫ ПРИНЯТЫ! Выставка в «Белой вороне»',
        body: 'Лидия Марковна в восторге от ваших работ!\n\nЖдём вас на вернисаж — нажмите «Пойти на выставку». Прихватите хорошее настроение: пресса будет.\n\nP.S. Вход через чёрную дверь, там меньше папарацци.',
        kind: 'info', action: 'exhibition',
      });
    }
    // Ежедневная стипендия для защиты от софт-лока
    const day = Math.floor(now / 1440) + 1;
    if (s.lastStipendDay !== day && now % 1440 >= 540 && s.money < 20) {
      s.lastStipendDay = day;
      s.money += 20;
      this.addMail({
        from: 'upravdom@mansarda.ru', subject: 'Стипендия художнику',
        body: 'Палыч из домоуправления передаёт 20$ «на краски». говорит, талант не должен голодать.\n\nНе поминайте лихом.',
        kind: 'info',
      });
      this.game.audio.coin();
    }
  }

  private resolveAd(ad: Ad, now: number) {
    const s = this.save;
    const lvl = this.game.level();
    const cap = priceCap(lvl);
    const npc = this.game.npcs.buyerFor(lvl);
    const p = s.gallery.find(g => g.id === ad.paintingId);
    if (!p || p.soldTo) { ad.status = 'removed'; return; }

    if (ad.price > cap * 2.2) {
      // АНТИ-ЧИТ: безумная цена → сарказм от ИИ-аукциониста
      ad.strikes++;
      this.addMail({
        from: 'gomer7@artmarket.ai', subject: `Касательно цены ${fmtMoney(ad.price)}`,
        body: `Здравствуйте! Я Гомер-7, ИИ-аукционист платформы «Толкучка».\n\n${this.game.npcs.sarcasticOverprice(ad.price, cap)}\n\nОбъявление осталось висеть — вдруг у кого-то слишком много денег.`,
        kind: 'info',
      });
      if (ad.strikes >= 3) {
        ad.status = 'removed';
        this.addMail({
          from: 'gomer7@artmarket.ai', subject: 'Объявление снято алгоритмом',
          body: 'Три предупреждения — и алгоритм сдался. Перевыставьте картину по цене до ' + fmtMoney(cap) + '.',
          kind: 'info',
        });
      } else {
        ad.resolveMin = now + Math.round(rand(240, 420));
      }
      return;
    }

    if (ad.price > cap) {
      ad.resolveMin = now + Math.round(rand(200, 420));
      if (Math.random() < 0.5) {
        const amount = Math.round(cap * rand(0.75, 0.95));
        this.offerMail(ad, p.title, npc.id, npc.name, npc.email, amount, true);
      } else {
        this.addMail({
          from: npc.email, subject: `По поводу «${p.title}»`,
          body: `Красиво, спору нет. Но ${fmtMoney(ad.price)} — это перебор для меня.\nМожет, пересмотрите ценник? Я не гордый, я ещё зайду.\n\n— ${npc.name} (${npc.trait})`,
          kind: 'info',
        });
      }
      return;
    }

    // Адекватная цена → сделка
    if (Math.random() < 0.78) {
      this.offerMail(ad, p.title, npc.id, npc.name, npc.email, ad.price, false);
    } else {
      const amount = Math.round(ad.price * rand(0.8, 0.92));
      this.offerMail(ad, p.title, npc.id, npc.name, npc.email, amount, true);
    }
  }

  private offerMail(ad: Ad, title: string, npcId: string, npcName: string, email: string, amount: number, haggled: boolean) {
    this.addMail({
      from: email, subject: haggled ? `Торг по «${title}»` : `Хочу купить «${title}»!`,
      body: haggled
        ? `Здравствуйте! Картина красивая, но у меня только ${fmtMoney(amount)}. Могу взять прямо сейчас, если согласны.\n\n— ${npcName} (${this.game.npcs.byId(npcId)?.trait ?? 'ценитель'})`
        : `Здравствуйте! «${title}» — любовь с первого взгляда. Беру за ${fmtMoney(amount)}, как указано. Подтвердите!\n\n— ${npcName} (${this.game.npcs.byId(npcId)?.trait ?? 'ценитель'})`,
      kind: 'offer',
      offer: { adId: ad.id, paintingId: ad.paintingId, amount, npcId, npcName, haggled },
    });
  }

  private makeCommissionOffer(now: number) {
    const s = this.save;
    if (s.orders.some(o => o.status === 'active')) return;
    const lvl = this.game.level();
    const npc = this.game.npcs.buyerFor(lvl);
    const c = this.game.npcs.commission(lvl);
    const deadline = now + 480; // 8 игровых часов
    this.addMail({
      from: npc.email, subject: `Заказ: «${c.brief}», ${c.style}`,
      body: `Добрый день! Видел(а) ваше объявление «беру заказы».\n\nХочу картину: «${c.brief}», ${c.style}.\nФормат: ${PAPERS[c.size].name}. Гонорар: ${fmtMoney(c.reward)}.\nСрок: 8 часов — ${fmtDuration(deadline - now)}.\n\nЕсли берётесь — жмите «Принять заказ». Краски и холст ваши!\n\n— ${npc.name}`,
      kind: 'commission',
      commission: { npcId: npc.id, npcName: npc.name, brief: `${c.brief}, ${c.style}`, reward: c.reward, size: c.size, deadlineMin: deadline },
    });
  }
}
