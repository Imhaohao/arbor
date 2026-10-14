/**
 * Canvas cannot read CSS custom properties, so the forest resolves the
 * oklch channel tokens from globals.css into sRGB strings itself. Kept here,
 * beside the tokens' only canvas consumer, rather than in a color library.
 */

export type Rgb = [number, number, number];

function oklchToLinearSrgb(L: number, C: number, hDeg: number): Rgb {
  const h = (hDeg * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

function encode(channel: number): number {
  const c = Math.min(1, Math.max(0, channel));
  const gamma = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
  return Math.round(gamma * 255);
}

/** Parses an oklch channel token value such as "0.52 0.105 150". */
export function oklchTokenToRgb(value: string): Rgb {
  const [L, C, h] = value.trim().split(/\s+/).map(Number);
  const [r, g, b] = oklchToLinearSrgb(L || 0, C || 0, h || 0);
  return [encode(r), encode(g), encode(b)];
}

export function mixRgb(a: Rgb, b: Rgb, t: number): Rgb {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

export const rgbCss = ([r, g, b]: Rgb, alpha = 1) =>
  alpha >= 1 ? `rgb(${r} ${g} ${b})` : `rgb(${r} ${g} ${b} / ${alpha})`;

/** Reads a token from the document root and converts it for canvas use. */
export function readToken(name: string): Rgb {
  const value = getComputedStyle(document.documentElement).getPropertyValue(`--${name}`);
  return oklchTokenToRgb(value);
}
