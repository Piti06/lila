import { drag } from './crazyCtrl';
import { h } from 'snabbdom';
import type { MouchEvent } from '@lichess-org/chessground/types';
import { onInsert } from 'lib/snabbdom';
import type AnalyseCtrl from '../ctrl';

const eventNames = ['mousedown', 'touchstart'];
const oKeys = ['pawn', 'knight', 'bishop', 'rook', 'queen'] as const;

type Position = 'top' | 'bottom';

export default function (ctrl: AnalyseCtrl, color: Color, position: Position) {
  if (!ctrl.node.crazy || ctrl.data.game.variant.key !== 'crazyhouse') return;
  const pocket = ctrl.node.crazy.pockets[color === 'white' ? 0 : 1];
  const dropped = ctrl.justDropped;
  const captured = ctrl.justCaptured;
  if (captured) captured.role = captured.promoted ? 'pawn' : captured.role;
  const activeColor = color === ctrl.turnColor();
  const usable = activeColor && !ctrl.node.san?.endsWith('#');
  return h(
    `div.pocket.is2d.pocket-${position}.pos-${ctrl.bottomColor()}`,
    {
      class: { usable },
      hook: onInsert(el => {
        eventNames.forEach(name => {
          el.addEventListener(name, e => drag(ctrl, color, e as MouchEvent));
        });
      }),
    },
    oKeys.map(role => {
      let nb = pocket[role] || 0;
      if (activeColor) {
        if (dropped === role) nb--;
        if (captured && captured.role === role) nb++;
      }
      return h(
        'div.pocket-c1',
        h(
          'div.pocket-c2',
          h('piece.' + role + '.' + color, {
            attrs: { 'data-role': role, 'data-color': color, 'data-nb': nb },
          }),
        ),
      );
    }),
  );
}
