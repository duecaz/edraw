import { useEffect, useRef } from "react";
import { flushSync } from "react-dom";
import type { Tool, Thresholds, SmoothOptions, PenEvent } from "./PenDetector";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ExcalidrawAPI = any;

export type ExcalidrawPenOptions = {
  excalidrawAPI: ExcalidrawAPI | null;
  enabled: boolean;
  container?: HTMLElement | null;
  thresholds?: Partial<Thresholds>;
  smooth?: SmoothOptions;
  onPenEvent?: (kind: "down" | "move" | "up", evt: PenEvent | null) => void;
};

const TOOL_FOR: Record<Tool, "freedraw" | "line" | "eraser" | null> = {
  penThin: "freedraw",
  penThick: "line",
  eraser: "eraser",
  none: null,
};

const STROKE_WIDTH_FOR: Partial<Record<Tool, number>> = {
  penThin: 1,
  penThick: 2,
};

const STROKE_COLOR_FOR: Partial<Record<Tool, string>> = {
  penThin: "#1e1e1e",
  penThick: "#1e1e1e",
};

const DEFAULT_THR: Thresholds = {
  penThin: { min: 0, max: 1.2 },
  penThick: { min: 1.2, max: 2.5 },
  eraser: { min: 10, max: 30 },
};

function findExcalidrawRoot(): HTMLElement | null {
  return (
    (document.querySelector(".excalidraw-container") as HTMLElement | null) ??
    (document.querySelector(".excalidraw") as HTMLElement | null) ??
    (document.querySelector(".excalidraw__canvas.interactive")
      ?.parentElement as HTMLElement | null)
  );
}

function classify(metric: number, thr: Thresholds): Tool {
  if (metric >= thr.penThin.min && metric <= thr.penThin.max) return "penThin";
  if (metric >= thr.penThick.min && metric <= thr.penThick.max) return "penThick";
  if (metric >= thr.eraser.min && metric <= thr.eraser.max) return "eraser";
  return "none";
}

/**
 * Wires IR pen tool-switching to Excalidraw using POINTER events in
 * capture phase. This is critical: in Chromium, pointerdown fires before
 * touchstart, so a touch-based detector runs *after* Excalidraw has
 * already started handling the gesture with the old tool. By intercepting
 * pointerdown in capture phase and committing the tool change with
 * flushSync, Excalidraw's own pointerdown handler then reads the new
 * tool synchronously.
 *
 * pointer.width/height are the contact dimensions in CSS px (diameter),
 * so (width + height) / 4 gives the same "metric" as the touch-based
 * detector's (radiusX + radiusY) / 2. The thresholds calibrated via
 * /?ir-calibrate=1 work unchanged.
 */
export function useExcalidrawPen({
  excalidrawAPI,
  enabled,
  container,
  thresholds,
  onPenEvent,
}: ExcalidrawPenOptions) {
  const onPenEventRef = useRef(onPenEvent);
  onPenEventRef.current = onPenEvent;

  useEffect(() => {
    if (!enabled || !excalidrawAPI) return;

    const thr: Thresholds = {
      penThin: { ...DEFAULT_THR.penThin, ...thresholds?.penThin },
      penThick: { ...DEFAULT_THR.penThick, ...thresholds?.penThick },
      eraser: { ...DEFAULT_THR.eraser, ...thresholds?.eraser },
    };

    let cleanup: (() => void) | null = null;
    let cancelled = false;

    const attach = (el: HTMLElement) => {
      // Track active stroke so we don't reclassify mid-stroke.
      let activePointerId: number | null = null;
      let activeTool: Tool = "none";

      const setExcalidrawTool = (tool: Tool) => {
        const target = TOOL_FOR[tool];
        if (!target) return;
        const sw = STROKE_WIDTH_FOR[tool];
        const sc = STROKE_COLOR_FOR[tool];
        // flushSync forces the React state update to commit before the
        // event continues bubbling to Excalidraw's own pointerdown listener.
        try {
          flushSync(() => {
            excalidrawAPI.setActiveTool({ type: target });
            if (sw !== undefined || sc !== undefined) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const appState: any = {};
              if (sw !== undefined) appState.currentItemStrokeWidth = sw;
              if (sc !== undefined) appState.currentItemStrokeColor = sc;
              excalidrawAPI.updateScene?.({ appState });
            }
          });
        } catch {
          /* fall back to async if flushSync isn't available */
          excalidrawAPI.setActiveTool({ type: target });
        }
      };

      const buildPenEvent = (e: PointerEvent, tool: Tool): PenEvent => {
        const w = e.width || 0;
        const h = e.height || 0;
        const rect = el.getBoundingClientRect();
        return {
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
          tool,
          pressure: e.pressure || 0.5,
          velocity: 0,
          metric: (w + h) / 4,
          pointCount: 1,
          radiusX: w / 2,
          radiusY: h / 2,
          radiusMag: Math.sqrt((w / 2) ** 2 + (h / 2) ** 2),
          bboxW: w,
          bboxH: h,
          bboxArea: w * h,
        };
      };

      const onPointerDown = (e: PointerEvent) => {
        // Skip mouse — only pen / touch input matters for IR boards.
        if (e.pointerType === "mouse") return;
        // Ignore if another pointer is already active (palm rejection).
        if (activePointerId !== null && activePointerId !== e.pointerId) return;

        const metric = ((e.width || 0) + (e.height || 0)) / 4;
        const tool = classify(metric, thr);
        if (tool === "none") return;

        activePointerId = e.pointerId;
        activeTool = tool;

        // Critical: flushSync inside capture phase BEFORE Excalidraw's
        // own pointerdown listener handles this event.
        setExcalidrawTool(tool);

        onPenEventRef.current?.("down", buildPenEvent(e, tool));
      };

      const onPointerMove = (e: PointerEvent) => {
        if (e.pointerType === "mouse") return;
        if (activePointerId !== e.pointerId) return;
        onPenEventRef.current?.("move", buildPenEvent(e, activeTool));
      };

      const onPointerUp = (e: PointerEvent) => {
        if (e.pointerType === "mouse") return;
        if (activePointerId !== e.pointerId) return;
        activePointerId = null;
        activeTool = "none";
        onPenEventRef.current?.("up", null);
      };

      // Capture phase + window-level listener so we beat Excalidraw's
      // listener on the canvas, regardless of where in the DOM it is.
      window.addEventListener("pointerdown", onPointerDown, { capture: true });
      window.addEventListener("pointermove", onPointerMove, { capture: true });
      window.addEventListener("pointerup", onPointerUp, { capture: true });
      window.addEventListener("pointercancel", onPointerUp, { capture: true });

      cleanup = () => {
        window.removeEventListener("pointerdown", onPointerDown, { capture: true });
        window.removeEventListener("pointermove", onPointerMove, { capture: true });
        window.removeEventListener("pointerup", onPointerUp, { capture: true });
        window.removeEventListener("pointercancel", onPointerUp, { capture: true });
      };
    };

    const tryAttach = () => {
      if (cancelled || cleanup) return;
      const el = container ?? findExcalidrawRoot();
      if (el) attach(el);
    };
    tryAttach();

    let tries = 0;
    const interval = window.setInterval(() => {
      if (cancelled || cleanup || tries++ > 30) {
        window.clearInterval(interval);
        return;
      }
      tryAttach();
    }, 100);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      cleanup?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, excalidrawAPI, container, thresholds]);
}
