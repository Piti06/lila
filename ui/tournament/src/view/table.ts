import { opposite } from '@lichess-org/chessground/util';
import * as licon from 'lib/licon';
import { type VNode, bind, onInsert, looseH as h } from 'lib/snabbdom';
import { player as renderPlayer } from './util';
import type { Duel, DuelPlayer, FeaturedGame, TournamentOpts } from '../interfaces';
import { teamName } from './battle';
import type TournamentController from '../ctrl';
import { initMiniGames } from 'lib/view/miniBoard';

function featuredPlayer(game: FeaturedGame, color: Color, opts: TournamentOpts) {
  const player = game[color];
  return h('span.mini-game__player', [
    h('span.mini-game__user', [
      h('strong', '#' + player.rank),
      renderPlayer(player, true, opts.showRatings, false),
      player.berserk && h('i', { attrs: { 'data-icon': licon.Berserk, title: 'Berserk' } }),
    ]),
    game.c
      ? h(`span.mini-game__clock.mini-game__clock--${color}`, {
          attrs: { 'data-time': game.c[color], 'data-managed': 1 },
        })
      : h('span.mini-game__result', game.winner ? (game.winner === color ? '1' : '0') : '½'),
  ]);
}

function featured(game: FeaturedGame, opts: TournamentOpts): VNode {
  return h(
    `div.tour__featured.mini-game.mini-game-${game.id}.mini-game--init.is2d`,
    {
      attrs: { 'data-state': `${game.fen},${game.orientation},${game.lastMove}`, 'data-live': game.id },
      hook: onInsert(site.powertip.manualUserIn),
    },
    [
      featuredPlayer(game, opposite(game.orientation), opts),
      h('a.cg-wrap', { attrs: { href: `/${game.id}/${game.orientation}` } }),
      featuredPlayer(game, game.orientation, opts),
    ],
  );
}

const duelPlayerMeta = (p: DuelPlayer, ctrl: TournamentController) => [
  h('em.rank', '#' + p.k),
  p.t && h('em.utitle', p.t),
  ctrl.opts.showRatings && h('em.rating', '' + p.r),
];

function renderDuel(ctrl: TournamentController) {
  const battle = ctrl.data.teamBattle,
    duelTeams = ctrl.data.duelTeams;
  return (d: Duel) =>
    h('a.glpt.force-ltr', { key: d.id, attrs: { href: '/' + d.id } }, [
      battle &&
        duelTeams &&
        h(
          'line.t',
          [0, 1].map(i => teamName(battle, duelTeams[d.p[i].n.toLowerCase()])),
        ),
      h('line.a', [h('strong', d.p[0].n), h('span', duelPlayerMeta(d.p[1], ctrl).reverse())]),
      h('line.b', [h('span', duelPlayerMeta(d.p[0], ctrl)), h('strong', d.p[1].n)]),
    ]);
}

const initMiniGame = (node: VNode) => initMiniGames(node.elm as HTMLElement);

export default function (ctrl: TournamentController): VNode {
  return h('div.tour__table', { hook: { insert: initMiniGame, postpatch: initMiniGame } }, [
    ctrl.data.featured && featured(ctrl.data.featured, ctrl.opts),
    ctrl.data.duels.length > 0 &&
      h(
        'section.tour__duels',
        { hook: bind('click', _ => !ctrl.disableClicks) },
        [h('h2', i18n.site.topGames)].concat(ctrl.data.duels.map(renderDuel(ctrl))),
      ),
  ]);
}
