// App icon: a face-down Cờ Úp piece — a wine-red disc (#701e24) with a
// brass double ring (#c99636) on a dark wine-wood ground, its back
// stamped with the letters "ÚP". The glyph is drawn with plain stroke
// paths (no <text> element), so the icon renders identically on every
// platform regardless of the viewer's fonts — the same lesson the old
// Xiangqi icon learned with its CJK glyph path.
//
// Variants:
// - rounded:  favicon / general use (transparent corners, framed)
// - bleed:    full-bleed square (apple touch icon — iOS applies its mask)
// - maskable: full-bleed with the artwork inside the maskable safe zone

export type IconVariant = "rounded" | "bleed" | "maskable";

/** Bump this whenever the icon artwork changes. Home-screen icons are
 * snapshots (an installed shortcut never re-reads the icon), and the
 * /pwa PNG routes are served with a 1-year immutable cache — the ONLY
 * way existing devices ever fetch a new icon is a new URL, so every
 * icon URL carries `?v=${ICON_VERSION}` (manifest + layout metadata). */
export const ICON_VERSION = 3;

const BRASS = "#c99636";
const BRASS_LIGHT = "#e8c877";

// "ÚP" as stroke paths on the 512 grid, centered on the disc (256,256).
// U: x 182–238, bowl bottom y≈302. P: stem x 268, bowl to x≈322.
// The acute accent of Ú floats over the U.
const UP_GLYPH = `
      <g fill="none" stroke="${BRASS_LIGHT}" stroke-width="15" stroke-linecap="round" stroke-linejoin="round">
        <path d="M182 208 V272 A28 30 0 0 0 238 272 V208"/>
        <path d="M196 182 L218 166"/>
        <path d="M268 302 V208 H298 A26 24 0 0 1 298 256 H268"/>
      </g>`;

export function jieqiIconSvg(variant: IconVariant = "rounded"): string {
  const bleed = variant !== "rounded";
  const frame = bleed
    ? { x: 0, y: 0, w: 512, rx: 0 }
    : { x: 6, y: 6, w: 500, rx: 112 };
  const contentScale = variant === "maskable" ? 0.82 : 1;
  const content = `
      <circle cx="256" cy="256" r="176" fill="url(#wine)"/>
      <circle cx="256" cy="256" r="170" fill="none" stroke="${BRASS}" stroke-width="10"/>
      <circle cx="256" cy="256" r="146" fill="none" stroke="${BRASS}" stroke-width="4" opacity="0.85"/>
      ${UP_GLYPH}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="wood" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2A0D10"/>
      <stop offset="1" stop-color="#170507"/>
    </linearGradient>
    <radialGradient id="wine" cx="0.5" cy="0.38" r="0.85">
      <stop offset="0" stop-color="#93262E"/>
      <stop offset="1" stop-color="#701E24"/>
    </radialGradient>
    <clipPath id="iconClip"><rect x="${frame.x}" y="${frame.y}" width="${frame.w}" height="${frame.w}" rx="${frame.rx}"/></clipPath>
  </defs>
  <g clip-path="url(#iconClip)">
    <rect x="0" y="0" width="512" height="512" fill="url(#wood)"/>
    <g transform="translate(256 256) scale(${contentScale}) translate(-256 -256)">${content}
    </g>
  </g>
</svg>`;
}

/** Back-compat alias (old PacClone name). */
export const xiangqiIconSvg = jieqiIconSvg;
