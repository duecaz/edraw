import { useEffect, useRef } from "react";
import { PenDetector, type PenDetectorOptions, type PenEvent, type Tool } from "./PenDetector";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ExcalidrawAPI = any;

export type ExcalidrawPenOptions = {
  /** ExcalidrawImperativeAPI from Excalidraw, or null while it boots. */
  excalidrawAPI: ExcalidrawAPI | null;
  /** When false, the detector is not attached. */
  enabled: boolean;
  /** Element to listen on. Defaults to the Excalidraw root container. */
  container?: HTMLElement | null;
  /** Override classification thresholds. */
  thresholds?: PenDetectorOptions["thresholds"];
  /** Override smoothing. */
  smooth?: PenDetectorOptions["smooth"];
  /** Optional event callback for debugging / on-screen indicators. */
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

/**
 * Locates Excalidraw's root container. Tries a few selectors because
 * class names have changed between versions.
 */
function findExcalidrawRoot(): HTMLElement | null {
  return (
    (document.querySelector(".excalidraw-container") as HTMLElement | null) ??
    (document.querySelector(".excalidraw") as HTMLElement | null) ??
    (document.querySelector(".excalidraw__canvas.interactive")
      ?.parentElement as HTMLElement | null)
  );
}

/**
 * Wires a PenDetector to an Excalidraw instance. The detector is PASSIVE
 * here — it does not preventDefault on touches, so Excalidraw keeps
 * receiving the pointer events it needs to draw. We only use the detector
 * to classify the contact and swap the active tool / stroke width on
 * pendown.
 */
export function useExcalidrawPen({
  excalidrawAPI,
  enabled,
  container,
  thresholds,
  smooth,
  onPenEvent,
}: ExcalidrawPenOptions) {
  const detectorRef = useRef<PenDetector | null>(null);
  // Stable ref so the effect doesn't re-attach on every parent render.
  const onPenEventRef = useRef(onPenEvent);
  onPenEventRef.current = onPenEvent;

  useEffect(() => {
    if (!enabled || !excalidrawAPI) return;

    let cancelled = false;
    let detector: PenDetector | null = null;

    const attach = (el: HTMLElement) => {
      detector = new PenDetector({
        element: el,
        thresholds,
        smooth,
        passive: true,
      });
      detectorRef.current = detector;

      detector.on("pendown", (e) => {
        const evt = e as PenEvent;
        const target = TOOL_FOR[evt.tool];
        if (target) {
          try {
            excalidrawAPI.setActiveTool({ type: target });
          } catch {
            /* older versions */
          }
        }
        const sw = STROKE_WIDTH_FOR[evt.tool];
        const sc = STROKE_COLOR_FOR[evt.tool];
        if (sw !== undefined || sc !== undefined) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const appState: any = {};
            if (sw !== undefined) appState.currentItemStrokeWidth = sw;
            if (sc !== undefined) appState.currentItemStrokeColor = sc;
            excalidrawAPI.updateScene?.({ appState });
          } catch {
            /* ignore */
          }
        }
        onPenEventRef.current?.("down", evt);
      });
      detector.on("penmove", (e) => {
        onPenEventRef.current?.("move", e as PenEvent);
      });
      detector.on("penup", () => {
        onPenEventRef.current?.("up", null);
      });
    };

    // Try immediately, then retry briefly until the editor renders.
    const attempt = () => {
      if (cancelled || detector) return;
      const el = container ?? findExcalidrawRoot();
      if (el) {
        attach(el);
      }
    };
    attempt();

    // Poll for up to 3 seconds — Excalidraw can take a moment on slow devices.
    let tries = 0;
    const interval = window.setInterval(() => {
      if (cancelled || detector || tries++ > 30) {
        window.clearInterval(interval);
        return;
      }
      attempt();
    }, 100);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      detector?.destroy();
      detector = null;
      detectorRef.current = null;
    };
    // onPenEvent is intentionally NOT in the deps — it's accessed via ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, excalidrawAPI, container, thresholds, smooth]);

  return detectorRef;
}
