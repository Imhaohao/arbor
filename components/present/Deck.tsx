"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowsOut, ArrowsIn, CaretLeft, CaretRight } from "@phosphor-icons/react";
import { slides } from "./slides";

const NEXT_KEYS = new Set(["ArrowRight", " ", "PageDown", "ArrowDown"]);
const PREV_KEYS = new Set(["ArrowLeft", "PageUp", "ArrowUp"]);
const FULLSCREEN_KEYS = new Set(["f", "F"]);

type KeyAction =
  | { kind: "next" }
  | { kind: "prev" }
  | { kind: "fullscreen" }
  | { kind: "goto"; target: number };

function digitTarget(key: string): number | null {
  if (!/^[0-9]$/.test(key)) return null;
  const target = parseInt(key, 10) - 1;
  return target >= 0 && target < slides.length ? target : null;
}

function resolveKeyAction(key: string): KeyAction | null {
  if (NEXT_KEYS.has(key)) return { kind: "next" };
  if (PREV_KEYS.has(key)) return { kind: "prev" };
  if (FULLSCREEN_KEYS.has(key)) return { kind: "fullscreen" };
  if (key === "Home") return { kind: "goto", target: 0 };
  if (key === "End") return { kind: "goto", target: slides.length - 1 };
  const target = digitTarget(key);
  return target === null ? null : { kind: "goto", target };
}

export function Deck() {
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [isFs, setIsFs] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const next = useCallback(() => {
    setIndex((i) => {
      if (i >= slides.length - 1) return i;
      setDirection(1);
      return i + 1;
    });
  }, []);

  const prev = useCallback(() => {
    setIndex((i) => {
      if (i <= 0) return i;
      setDirection(-1);
      return i - 1;
    });
  }, []);

  const goTo = useCallback((target: number) => {
    setIndex((i) => {
      if (target === i) return i;
      setDirection(target > i ? 1 : -1);
      return Math.max(0, Math.min(slides.length - 1, target));
    });
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const action = resolveKeyAction(e.key);
      if (!action) return;
      if (action.kind === "next") {
        e.preventDefault();
        next();
      } else if (action.kind === "prev") {
        e.preventDefault();
        prev();
      } else if (action.kind === "fullscreen") {
        toggleFullscreen();
      } else {
        goTo(action.target);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev, toggleFullscreen, goTo]);

  useEffect(() => {
    const onChange = () => setIsFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const Slide = slides[index];

  return (
    <div
      ref={containerRef}
      className="relative h-screen w-screen overflow-hidden bg-surface-subtle text-ink"
      onClick={(e) => {
        // Edge-tap navigation: clicks on the far left/right of the screen
        // advance/rewind. Anywhere else is a no-op so demo content can be
        // interacted with later.
        const t = e.target as HTMLElement;
        if (t.closest("[data-no-tap]")) return;
        const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
        const x = e.clientX - rect.left;
        const w = rect.width;
        if (x < w * 0.18) prev();
        else if (x > w * 0.82) next();
      }}
    >
      {/* Slide stage */}
      <div
        key={index}
        className="relative h-full w-full"
        style={{
          animation: `slide-${direction === 1 ? "in-right" : "in-left"} 520ms cubic-bezier(0.22, 1, 0.36, 1) both`,
        }}
      >
        <Slide />
      </div>

      {/* HUD: progress bar */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 z-30 h-[3px] bg-line/40"
      >
        <div
          className="h-full bg-brand-600 transition-[width] duration-500 ease-out"
          style={{ width: `${((index + 1) / slides.length) * 100}%` }}
        />
      </div>

      {/* HUD: controls */}
      <div
        data-no-tap
        className="absolute bottom-5 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full bg-surface px-3 py-1.5 text-[0.8125rem] text-ink-muted shadow-float"
      >
        <button
          onClick={prev}
          disabled={index === 0}
          className="rounded-full p-2 transition-[background-color,scale] hover:bg-surface-muted active:scale-[0.96] disabled:opacity-30"
          aria-label="Previous slide"
        >
          <CaretLeft size={14} weight="bold" />
        </button>
        <span className="type-data">
          {index + 1} <span className="text-ink-faint">/</span> {slides.length}
        </span>
        <button
          onClick={next}
          disabled={index === slides.length - 1}
          className="rounded-full p-2 transition-[background-color,scale] hover:bg-surface-muted active:scale-[0.96] disabled:opacity-30"
          aria-label="Next slide"
        >
          <CaretRight size={14} weight="bold" />
        </button>
        <span aria-hidden className="mx-1 h-4 w-px bg-line" />
        <button
          onClick={toggleFullscreen}
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 transition-[background-color,scale] hover:bg-surface-muted active:scale-[0.96]"
          aria-label="Toggle fullscreen"
        >
          {isFs ? <ArrowsIn size={12} weight="bold" /> : <ArrowsOut size={12} weight="bold" />}
          <span className="hidden sm:inline">{isFs ? "Exit" : "Full screen"}</span>
        </button>
        <span className="hidden text-[0.8125rem] text-ink-subtle sm:inline">
          Keys: F, arrows, space
        </span>
      </div>
    </div>
  );
}
