// キャラクター（ジムモン）の絵。段階 0〜5 × 気分 3種類のインラインSVGを返す純粋関数。
// 外部画像は使わない。背景が暗い前提（ライム色のアクセント色が映える）
const W = 140;
const G = 138; // 地面のy
const CX = 70;
const INK = '#141414';

const PALETTE = {
  genki: { body: '#ccff00', shade: '#9ccc00' },
  normal: { body: '#b9d83a', shade: '#8cab22' },
  shobori: { body: '#8e9a7c', shade: '#6c7760' },
};

function star(x, y, r) {
  return `<path d="M${x} ${y - r} l${r * 0.3} ${r * 0.7} l${r * 0.7} ${r * 0.3} l${-r * 0.7} ${r * 0.3} l${-r * 0.3} ${r * 0.7} l${-r * 0.3} ${-r * 0.7} l${-r * 0.7} ${-r * 0.3} l${r * 0.7} ${-r * 0.3}z" fill="#ffd24a"/>`;
}

function flatDumbbell(x, y) {
  return `<rect x="${x}" y="${y}" width="26" height="4" rx="2" fill="#bdbdbd"/><rect x="${x - 3}" y="${y - 6}" width="6" height="16" rx="2" fill="#2b2b2b"/><rect x="${x + 23}" y="${y - 6}" width="6" height="16" rx="2" fill="#2b2b2b"/>`;
}

function wrap(inner) {
  return `<svg viewBox="0 0 ${W} 150" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><ellipse cx="${CX}" cy="143" rx="36" ry="4" fill="#000" opacity=".4"/>${inner}</svg>`;
}

function egg(P, sad, mood) {
  const cy = G - 38;
  let s = `<g transform="rotate(${sad ? -9 : 0} ${CX} ${G})">`;
  if (mood === 'genki') s += `<circle cx="${CX}" cy="${cy}" r="48" fill="#ccff00" opacity=".12"/>`;
  s += `<ellipse cx="${CX}" cy="${cy}" rx="30" ry="38" fill="${P.body}"/>`;
  s += `<ellipse cx="${CX - 10}" cy="${cy - 14}" rx="6" ry="11" fill="#fff" opacity=".25"/>`;
  s += `<circle cx="${CX + 12}" cy="${cy + 10}" r="5" fill="${P.shade}"/><circle cx="${CX - 14}" cy="${cy + 18}" r="4" fill="${P.shade}"/><circle cx="${CX + 10}" cy="${cy - 14}" r="3.5" fill="${P.shade}"/>`;
  s += `<path d="M${CX - 28} ${cy} l8 -9 l7 9 l7 -9 l7 9 l7 -9 l7 9 l7 -9" fill="none" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>`;
  s += '</g>';
  if (sad) s += `<path d="M${CX + 34} ${cy - 26} q6 9 0 14 q-6 -5 0 -14z" fill="#7fc8ff"/>`;
  else if (mood === 'genki') s += star(CX + 40, cy - 34, 7);
  return wrap(s);
}

export function monsterSvg(stage, mood) {
  const st = Math.max(0, Math.min(5, Math.round(Number(stage) || 0)));
  const md = Object.hasOwn(PALETTE, mood) ? mood : 'normal';
  const P = PALETTE[md];
  const sad = md === 'shobori';
  if (st === 0) return egg(P, sad, md);

  const r = [0, 27, 31, 34, 37, 40][st];
  const cy = G - r;
  const wide = st >= 4;
  const rx = wide ? r * 1.1 : r;
  const D = [-1, 1];
  const barY = cy - r - 22;
  let s = `<g transform="translate(0 ${G}) scale(1 ${sad ? 0.94 : 1}) translate(0 ${-G})">`;

  // 背景（オーラ・マント）
  if (st === 5 && !sad) {
    s += `<circle cx="${CX}" cy="${cy}" r="${r + 12}" fill="#ccff00" opacity=".10"/><circle cx="${CX}" cy="${cy}" r="${r + 4}" fill="#ccff00" opacity=".13"/>`;
  }
  if (st === 5) {
    s += `<path d="M${CX - rx + 6} ${cy - r * 0.35} L${CX - rx - 16} ${G - 2} L${CX + rx + 16} ${G - 2} L${CX + rx - 6} ${cy - r * 0.35} Z" fill="${sad ? '#8a4a4d' : '#d9363e'}"/>`;
  }

  // 足・体
  s += `<ellipse cx="${CX - r * 0.5}" cy="${G - 3}" rx="${9 + st}" ry="5.5" fill="${P.shade}"/><ellipse cx="${CX + r * 0.5}" cy="${G - 3}" rx="${9 + st}" ry="5.5" fill="${P.shade}"/>`;
  s += wide
    ? `<ellipse cx="${CX}" cy="${cy}" rx="${rx}" ry="${r}" fill="${P.body}"/>`
    : `<circle cx="${CX}" cy="${cy}" r="${r}" fill="${P.body}"/>`;
  s += `<ellipse cx="${CX}" cy="${cy + r * 0.3}" rx="${rx * 0.55}" ry="${r * 0.5}" fill="#fff" opacity=".16"/>`;

  // 腕
  if (st === 1) for (const d of D) s += `<ellipse cx="${CX + d * (rx - 1)}" cy="${cy + 8}" rx="4.5" ry="7" fill="${P.shade}"/>`;
  if (st === 2) for (const d of D) s += `<ellipse cx="${CX + d * (rx + 2)}" cy="${cy + 6}" rx="6.5" ry="10" fill="${P.body}"/>`;
  if (st === 3) {
    for (const d of D) s += `<circle cx="${CX + d * (rx + 4)}" cy="${cy + 2}" r="9" fill="${P.body}"/><ellipse cx="${CX + d * (rx + 5)}" cy="${cy + 17}" rx="7" ry="9" fill="${P.body}"/>`;
  }
  if (st === 4) {
    for (const d of D) s += `<circle cx="${CX + d * (rx + 7)}" cy="${cy - 2}" r="14" fill="${P.body}"/><circle cx="${CX + d * (rx + 9)}" cy="${cy + 16}" r="10" fill="${P.body}"/>`;
  }
  if (st === 5) {
    if (!sad) {
      for (const d of D) {
        s += `<path d="M${CX + d * (rx + 8)} ${cy - 4} L${CX + d * 34} ${barY + 2}" stroke="${P.body}" stroke-width="16" stroke-linecap="round"/><circle cx="${CX + d * (rx + 8)}" cy="${cy - 4}" r="15" fill="${P.body}"/>`;
      }
    } else {
      for (const d of D) {
        s += `<circle cx="${CX + d * (rx + 8)}" cy="${cy + 2}" r="15" fill="${P.body}"/><circle cx="${CX + d * (rx + 10)}" cy="${cy + 22}" r="11" fill="${P.body}"/>`;
      }
    }
  }

  // 顔
  const ex = r * 0.36;
  const ey = cy - r * 0.1;
  const er = Math.max(3.4, r * 0.15);
  const my = ey + er + 7;
  for (const d of D) {
    const x = CX + d * ex;
    if (sad) {
      s += `<circle cx="${x}" cy="${ey}" r="${er * 0.85}" fill="${INK}"/><rect x="${x - er - 1}" y="${ey - er - 2}" width="${er * 2 + 2}" height="${er + 1.2}" fill="${P.body}"/>`;
      s += `<path d="M${CX + d * (ex + er + 2)} ${ey - er - 4} L${CX + d * (ex - er)} ${ey - er - 9}" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/>`;
    } else {
      s += `<circle cx="${x}" cy="${ey}" r="${er}" fill="${INK}"/><circle cx="${x + er * 0.35}" cy="${ey - er * 0.35}" r="${er * 0.38}" fill="#fff"/>`;
      s += `<ellipse cx="${CX + d * (ex + er + 5)}" cy="${ey + er + 4}" rx="4" ry="2.6" fill="#ff8fa3" opacity=".55"/>`;
      if (st >= 4) s += `<path d="M${CX + d * (ex + er + 2)} ${ey - er - 8} L${CX + d * (ex - er)} ${ey - er - 3}" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`;
    }
  }
  if (md === 'genki') {
    s += `<path d="M${CX - 8} ${my} Q${CX} ${my + 11} ${CX + 8} ${my} Z" fill="${INK}"/><ellipse cx="${CX}" cy="${my + 6}" rx="3.5" ry="2" fill="#ff7a8a"/>`;
  } else if (md === 'normal') {
    s += `<path d="M${CX - 6} ${my + 1} Q${CX} ${my + 6} ${CX + 6} ${my + 1}" fill="none" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/>`;
  } else {
    s += `<path d="M${CX - 6} ${my + 5} Q${CX} ${my - 1} ${CX + 6} ${my + 5}" fill="none" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/>`;
  }

  // 頭の飾り
  if (st === 2 || st === 3) {
    for (const d of D) s += `<path d="M${CX + d * r * 0.42} ${cy - r * 0.9} L${CX + d * r * 0.62} ${cy - r * 1.32} L${CX + d * r * 0.1} ${cy - r * 1.0} Z" fill="#f2efe6"/>`;
  }
  if (st === 3) {
    s += `<path d="M${CX - r * 0.93} ${cy - r * 0.4} Q${CX} ${cy - r * 0.72} ${CX + r * 0.93} ${cy - r * 0.4} L${CX + r * 0.9} ${cy - r * 0.22} Q${CX} ${cy - r * 0.54} ${CX - r * 0.9} ${cy - r * 0.22} Z" fill="#e5383b"/><path d="M${CX + r * 0.9} ${cy - r * 0.3} l12 -4 l-3 8 l11 3 l-14 2z" fill="#e5383b"/>`;
  }
  if (st === 4) {
    s += `<path d="M${CX - r * 0.5} ${cy - r * 0.82} L${CX - r * 0.38} ${cy - r * 1.38} L${CX - r * 0.08} ${cy - r * 0.95}Z M${CX - r * 0.2} ${cy - r * 0.95} L${CX} ${cy - r * 1.5} L${CX + r * 0.2} ${cy - r * 0.95}Z M${CX + r * 0.08} ${cy - r * 0.95} L${CX + r * 0.38} ${cy - r * 1.38} L${CX + r * 0.5} ${cy - r * 0.82}Z" fill="${P.shade}"/>`;
  }
  if (st === 5) {
    const base = cy - r * 0.88;
    s += `<g transform="rotate(${sad ? -14 : 0} ${CX} ${cy - r})"><path d="M${CX - 17} ${base} L${CX - 19} ${base - 17} L${CX - 9} ${base - 8} L${CX} ${base - 20} L${CX + 9} ${base - 8} L${CX + 19} ${base - 17} L${CX + 17} ${base} Z" fill="#ffd24a" stroke="#b8860b" stroke-width="1.5" stroke-linejoin="round"/></g>`;
  }

  // 持ち物（元気なときだけ持ち上げる。しょんぼりは床に落とす）
  if (st === 4 && !sad) {
    for (const d of D) {
      const hx = CX + d * (rx + 9);
      const hy = cy + 16;
      s += `<rect x="${hx - 2}" y="${hy - 16}" width="4" height="32" fill="#bdbdbd"/><rect x="${hx - 9}" y="${hy - 20}" width="18" height="6" rx="2" fill="#2b2b2b"/><rect x="${hx - 9}" y="${hy + 14}" width="18" height="6" rx="2" fill="#2b2b2b"/>`;
    }
  }
  if (st === 5 && !sad) {
    s += `<rect x="8" y="${barY - 2}" width="124" height="5" rx="2" fill="#d0d0d0"/><rect x="14" y="${barY - 14}" width="8" height="30" rx="2" fill="#2b2b2b"/><rect x="118" y="${barY - 14}" width="8" height="30" rx="2" fill="#2b2b2b"/><rect x="23" y="${barY - 9}" width="6" height="20" rx="2" fill="#555"/><rect x="111" y="${barY - 9}" width="6" height="20" rx="2" fill="#555"/>`;
    for (const d of D) s += `<circle cx="${CX + d * 34}" cy="${barY + 1}" r="7" fill="${P.body}"/>`;
  }
  if (md === 'genki' && (st === 3 || st === 4)) s += star(CX - rx - 16, cy - r * 0.95, 6) + star(CX + rx + 16, cy - r * 1.05, 5);
  s += '</g>';

  if (sad) {
    s += `<path d="M${CX + r * 0.78} ${cy - r * 0.72} q5 8 0 12 q-5 -4 0 -12z" fill="#7fc8ff"/>`;
    if (st === 4) s += flatDumbbell(4, G - 8) + flatDumbbell(106, G - 8);
    if (st === 5) {
      s += `<rect x="12" y="${G - 8}" width="116" height="4" rx="2" fill="#bdbdbd"/><rect x="14" y="${G - 16}" width="7" height="20" rx="2" fill="#2b2b2b"/><rect x="119" y="${G - 16}" width="7" height="20" rx="2" fill="#2b2b2b"/>`;
    }
  }
  return wrap(s);
}
