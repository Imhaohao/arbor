// Pure SVG slide generation for the codebase-explainer video slice.
//
// One 1280x720 slide per lesson turn (plus a title card). Pure string
// building — rasterization (sharp) and encoding (ffmpeg) live in video.ts so
// everything here is unit-testable with zero native deps.

import type { LessonScript, LessonTurn } from "../specialists/codebase-explainer";

export const SLIDE_WIDTH = 1280;
export const SLIDE_HEIGHT = 720;

/** Speaker accent colors: Nova asks (warm), Kit guides (cool). */
const SPEAKER_COLOR: Record<string, string> = {
  Nova: "#f0a35e",
  Kit: "#6ea8fe",
};

const BG = "#101418";
const FG = "#e8edf2";
const MUTED = "#8a97a5";
const CHIP_BG = "#1c2530";

export function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Greedy word wrap sized for the slide's body font. Long unbreakable tokens
 *  are hard-split so a pathological path/identifier can never overflow. */
export function wrapText(text: string, maxChars = 46): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (let word of words) {
    while (word.length > maxChars) {
      if (line) {
        lines.push(line);
        line = "";
      }
      lines.push(word.slice(0, maxChars));
      word = word.slice(maxChars);
    }
    if (!line) line = word;
    else if (line.length + 1 + word.length <= maxChars) line += ` ${word}`;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function svgOpen(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SLIDE_WIDTH}" height="${SLIDE_HEIGHT}" viewBox="0 0 ${SLIDE_WIDTH} ${SLIDE_HEIGHT}"><rect width="${SLIDE_WIDTH}" height="${SLIDE_HEIGHT}" fill="${BG}"/>`;
}

const FONT = `font-family="Helvetica, Arial, sans-serif"`;
const MONO = `font-family="Menlo, Consolas, monospace"`;

/** Title card shown during the audio lead-in. */
export function buildTitleSlideSvg(lesson: LessonScript): string {
  const titleLines = wrapText(lesson.title, 30);
  const premiseLines = wrapText(lesson.premise, 58);
  let y = 280;
  const title = titleLines
    .map((l) => {
      const t = `<text x="640" y="${y}" text-anchor="middle" fill="${FG}" font-size="56" font-weight="bold" ${FONT}>${escapeXml(l)}</text>`;
      y += 68;
      return t;
    })
    .join("");
  y += 12;
  const premise = premiseLines
    .map((l) => {
      const t = `<text x="640" y="${y}" text-anchor="middle" fill="${MUTED}" font-size="26" ${FONT}>${escapeXml(l)}</text>`;
      y += 36;
      return t;
    })
    .join("");
  const badge = `<text x="640" y="80" text-anchor="middle" fill="${MUTED}" font-size="20" ${FONT}>Arbor Codebase Explainer</text>`;
  return `${svgOpen()}${badge}${title}${premise}</svg>`;
}

/** One slide per dialogue turn: speaker chip, optional file/symbol ref chip,
 *  wrapped spoken line, and a progress bar along the bottom. */
export function buildTurnSlideSvg(
  turn: LessonTurn,
  turnIndex: number,
  totalTurns: number,
  lesson: LessonScript,
): string {
  const color = SPEAKER_COLOR[turn.speaker] ?? FG;
  const parts: string[] = [svgOpen()];

  // Header: lesson title (muted) + turn counter.
  parts.push(
    `<text x="80" y="70" fill="${MUTED}" font-size="20" ${FONT}>${escapeXml(lesson.title)}</text>`,
    `<text x="1200" y="70" text-anchor="end" fill="${MUTED}" font-size="20" ${FONT}>${turnIndex + 1} / ${totalTurns}</text>`,
  );

  // Speaker chip.
  parts.push(
    `<rect x="80" y="130" rx="18" width="150" height="44" fill="${CHIP_BG}"/>`,
    `<circle cx="110" cy="152" r="9" fill="${color}"/>`,
    `<text x="130" y="160" fill="${FG}" font-size="24" font-weight="bold" ${FONT}>${escapeXml(turn.speaker)}</text>`,
  );

  // Ref chip (file/symbol the line is about).
  if (turn.ref) {
    const ref = escapeXml(turn.ref);
    const w = Math.min(1040, 24 + turn.ref.length * 13);
    parts.push(
      `<rect x="250" y="130" rx="18" width="${w}" height="44" fill="${CHIP_BG}"/>`,
      `<text x="${250 + w / 2}" y="159" text-anchor="middle" fill="${color}" font-size="21" ${MONO}>${ref}</text>`,
    );
  }

  // Spoken line, wrapped.
  let y = 270;
  for (const line of wrapText(turn.line, 46)) {
    parts.push(`<text x="80" y="${y}" fill="${FG}" font-size="40" ${FONT}>${escapeXml(line)}</text>`);
    y += 58;
  }

  // Progress bar.
  const progress = totalTurns > 0 ? (turnIndex + 1) / totalTurns : 0;
  parts.push(
    `<rect x="80" y="672" width="1120" height="6" rx="3" fill="${CHIP_BG}"/>`,
    `<rect x="80" y="672" width="${Math.round(1120 * progress)}" height="6" rx="3" fill="${color}"/>`,
  );

  parts.push("</svg>");
  return parts.join("");
}
