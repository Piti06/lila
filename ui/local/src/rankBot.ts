import { Zerofish, Position } from 'zerofish';
import { clamp } from 'common';
import { Libot, Result, Matchup, Outcome } from './types';
import { botScore } from './testUtil';

export class RankBot implements Libot {
  static readonly MAX_LEVEL = 30;

  imageUrl = site.asset.url('lifat/bots/images/baby-robot.webp', { version: 'bot000' });
  isRankBot = true;

  constructor(
    readonly zf: Zerofish,
    readonly level: number,
  ) {}

  get uid() {
    return `#${this.level}`;
  }

  get name() {
    return `Stockfish`;
  }

  get glicko() {
    return { r: (this.level + 8) * 75, rd: 20 };
  }
  get ratingText() {
    return `${this.glicko.r}`;
  }
  get depth() {
    return clamp(this.level - 9, { min: 1, max: 20 });
  }

  get description() {
    return `Stockfish UCI_Elo ${this.glicko.r} depth ${this.depth}`;
  }

  async move(pos: Position) {
    return (await this.zf.goFish(pos, { level: this.level, search: { depth: this.depth } }, 1)).bestmove;
  }
}

export function rankBotMatchup(bot: Libot, last?: Result): Matchup[] {
  const { r, rd } = bot.glicko ?? { r: 1500, rd: 350 };
  if (rd < 60) return [];
  const score = last ? botScore(last, bot.uid) : 0.5;
  const lvl = rankBotLevel(r + (Math.random() + score - 1) * (rd * 1.5));
  return [Math.random() < 0.5 ? { white: bot.uid, black: `#${lvl}` } : { white: `#${lvl}`, black: bot.uid }];
}

function rankBotLevel(rating: number) {
  return clamp(Math.round(rating / 75) - 8, { min: 0, max: RankBot.MAX_LEVEL });
}
