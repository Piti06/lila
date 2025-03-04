import makeZerofish, { type Zerofish, type Position } from 'zerofish';
import * as co from 'chessops';
import { Bot, score } from './bot';
import { RateBot } from './dev/rateBot';
import { type CardData } from './handOfCards';
import { type ObjectStorage, objectStorage } from 'common/objectStorage';
import { defined } from 'common';
import { deepFreeze } from 'common/algo';
import { pubsub } from 'common/pubsub';
import type { BotInfo, SoundEvent, MoveSource, MoveArgs, MoveResult, LocalSpeed } from './types';
import { env } from './localEnv';
import * as xhr from 'common/xhr';

export class BotCtrl {
  zerofish: Zerofish;
  serverBots: Record<string, BotInfo>;
  localBots: Record<string, BotInfo>;
  readonly bots: Map<string, Bot & MoveSource> = new Map();
  readonly rateBots: RateBot[] = [];
  readonly uids: Record<Color, string | undefined> = { white: undefined, black: undefined };
  private store: ObjectStorage<BotInfo>;
  private busy = false;
  private bestMove = { uci: '0000', cp: 0 };

  constructor() {}

  get white(): BotInfo | undefined {
    return this.get(this.uids.white);
  }

  get black(): BotInfo | undefined {
    return this.get(this.uids.black);
  }

  get isBusy(): boolean {
    return this.busy;
  }

  get firstUid(): string | undefined {
    return this.bots.keys().next()?.value;
  }

  get all(): BotInfo[] {
    // except for rate bots
    return [...this.bots.values()] as Bot[];
  }

  get playing(): BotInfo[] {
    return [this.white, this.black].filter(defined);
  }

  async init(serverBots: BotInfo[]): Promise<this> {
    this.zerofish = await makeZerofish({
      locator: (file: string) => site.asset.url(`npm/${file}`, { documentOrigin: file.endsWith('js') }),
      nonce: document.body.dataset.nonce,
      dev: !!env.dev,
    });
    if (env.dev) {
      for (let i = 0; i <= RateBot.MAX_LEVEL; i++) {
        this.rateBots.push(new RateBot(i));
      }
    }
    return this.initBots(serverBots.filter(Bot.viable));
  }

  async initBots(defBots?: BotInfo[]): Promise<this> {
    const [localBots, serverBots] = await Promise.all([
      this.storedBots(),
      defBots ?? xhr.json('/bots').then(res => res.bots.filter(Bot.viable)),
    ]);
    for (const b of [...serverBots, ...localBots]) {
      if (Bot.viable(b)) this.bots.set(b.uid, new Bot(b));
    }
    this.localBots = {};
    this.serverBots = {};
    localBots.forEach((b: BotInfo) => (this.localBots[b.uid] = deepFreeze(b)));
    serverBots.forEach((b: BotInfo) => (this.serverBots[b.uid] = deepFreeze(b)));
    pubsub.complete('local.bots.ready');
    if (this.uids.white && !this.bots.has(this.uids.white)) this.uids.white = undefined;
    if (this.uids.black && !this.bots.has(this.uids.black)) this.uids.black = undefined;
    return this;
  }

  async move(args: MoveArgs): Promise<MoveResult | undefined> {
    const bot = this[args.chess.turn] as BotInfo & MoveSource;
    if (!bot) return undefined;
    if (this.busy) return undefined; // ignore different call stacks
    this.busy = true;
    const cp = bot instanceof Bot && bot.needsScore ? (await this.fetchBestMove(args.pos)).cp : undefined;
    const move = await bot?.move({ ...args, cp });
    //if (!this[co.opposite(args.chess.turn)]) this.bestMove = await this.fetchBestMove(args.pos);
    this.busy = false;
    return move?.uci !== '0000' ? move : undefined;
  }

  get(uid: string | undefined): BotInfo | undefined {
    if (uid === undefined) return undefined;
    return this.bots.get(uid) ?? this.rateBots[Number(uid.slice(1))];
  }

  sorted(by: 'alpha' | LocalSpeed = 'alpha'): BotInfo[] {
    if (by === 'alpha') return [...this.bots.values()].sort((a, b) => a.name.localeCompare(b.name));
    else
      return [...this.bots.values()].sort((a, b) => {
        return Bot.rating(a, by) - Bot.rating(b, by) || a.name.localeCompare(b.name);
      });
  }

  setUids({ white, black }: { white?: string | undefined; black?: string | undefined }): void {
    this.uids.white = white;
    this.uids.black = black;
    env.assets.preload([white, black].filter(defined));
  }

  // stop(): void {
  //   return this.zerofish.stop();
  // }

  reset(): void {
    this.bestMove = { uci: '0000', cp: 0 };
    return this.zerofish.reset();
  }

  storeBot(bot: BotInfo): Promise<any> {
    delete this.localBots[bot.uid];
    this.bots.set(bot.uid, new Bot(bot));
    if (Bot.isSame(this.serverBots[bot.uid], bot)) return this.store.remove(bot.uid);
    this.localBots[bot.uid] = deepFreeze(structuredClone(bot));
    return this.store.put(bot.uid, bot);
  }

  async deleteStoredBot(uid: string): Promise<void> {
    await this.store.remove(uid);
    this.bots.delete(uid);
    await this.initBots();
  }

  async clearStoredBots(uids?: string[]): Promise<void> {
    await (uids ? Promise.all(uids.map(uid => this.store.remove(uid))) : this.store.clear());
    await this.initBots();
  }

  async setServerBot(bot: BotInfo): Promise<void> {
    this.bots.set(bot.uid, new Bot(bot));
    this.serverBots[bot.uid] = deepFreeze(structuredClone(bot));
    delete this.localBots[bot.uid];
    await this.store.remove(bot.uid);
  }

  imageUrl(bot: BotInfo | string | undefined): string | undefined {
    if (typeof bot === 'string') bot = this.get(bot);
    return bot?.image && env.assets.getImageUrl(bot.image);
  }

  card(bot: BotInfo): CardData {
    return {
      label: `${bot.name}${bot.ratings.classical ? ' ' + bot.ratings.classical : ''}`,
      domId: uidToDomId(bot.uid)!,
      imageUrl: this.imageUrl(bot),
      classList: [],
    };
  }

  groupedCard(bot: BotInfo, isDirty?: (b: BotInfo) => boolean): CardData | undefined {
    const cd = this.card(bot);
    const local = this.localBots[bot.uid];
    const server = this.serverBots[bot.uid];
    if (isDirty?.(local ?? server)) cd?.classList.push('dirty');
    if (!server) cd?.classList.push('local-only');
    else if (server.version > bot.version) cd?.classList.push('upstream-changes');
    else if (local && !Bot.isSame(local, server)) cd?.classList.push('local-changes');
    return cd;
  }

  groupedSort(speed: LocalSpeed = 'classical'): (a: CardData, b: CardData) => number {
    return (a, b) => {
      for (const c of ['dirty', 'local-only', 'local-changes', 'upstream-changes']) {
        if (a.classList.includes(c) && !b.classList.includes(c)) return -1;
        if (!a.classList.includes(c) && b.classList.includes(c)) return 1;
      }
      const [ab, bb] = [this.get(domIdToUid(a.domId)), this.get(domIdToUid(b.domId))];
      return Bot.rating(ab, speed) - Bot.rating(bb, speed) || a.label.localeCompare(b.label);
    };
  }

  playSound(c: Color, eventList: SoundEvent[]): number {
    const prioritized = soundPriority.filter(e => eventList.includes(e));
    for (const soundList of prioritized.map(priority => this[c]?.sounds?.[priority] ?? [])) {
      let r = Math.random();
      for (const { key, chance, delay, mix } of soundList) {
        r -= chance / 100;
        if (r > 0) continue;
        // right now we play at most one sound per move, might want to revisit this.
        // also definitely need cancelation of the timeout
        site.sound
          .load(key, env.assets.getSoundUrl(key))
          .then(() => setTimeout(() => site.sound.play(key, Math.min(1, mix * 2)), delay * 1000));
        return Math.min(1, (1 - mix) * 2);
      }
    }
    return 1;
  }

  private storedBots() {
    return (
      this.store?.getMany() ??
      objectStorage<BotInfo>({ store: 'local.bots', version: 2, upgrade: this.upgrade }).then(s => {
        this.store = s;
        return s.getMany();
      })
    );
  }

  private upgrade = (change: IDBVersionChangeEvent, store: IDBObjectStore): void => {
    const req = store.openCursor();
    req.onsuccess = e => {
      const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
      if (!cursor) return;
      cursor.update(Bot.migrate(change.oldVersion, cursor.value));
      cursor.continue();
    };
  };

  private async fetchBestMove(pos: Position): Promise<{ uci: string; cp: number }> {
    const best = (await this.zerofish.goFish(pos, { multipv: 1, by: { depth: 12 } })).lines[0];
    return { uci: best.moves[0], cp: score(best) };
  }
}

export function uidToDomId(uid: string | undefined): string | undefined {
  return uid?.startsWith('#') ? `bot-id-${uid.slice(1)}` : undefined;
}

export function domIdToUid(domId: string | undefined): string | undefined {
  return domId && domId.startsWith('bot-id-') ? `#${domId.slice(7)}` : undefined;
}

const soundPriority: SoundEvent[] = [
  'playerWin',
  'botWin',
  'playerCheck',
  'botCheck',
  'playerCapture',
  'botCapture',
  'playerMove',
  'botMove',
  'greeting',
];
