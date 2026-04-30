import { useEffect, useRef } from "react";
import { PenDetector, type PenDetectorOptions, type PenEvent, type Tool } from "./PenDetector";

// Minimal subset of the Excalidraw imperative API we use here.
// We accept `any` to avoid pinning a specific Excalidraw version.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ExcalidrawAPI = any;

export type ExcalidrawPenOptions = {
  /** ExcalidrawImperativeAPI from Excalidraw, or null while it boots. */
  excalidrawAPI: ExcalidrawAPI | null;
  /** When false, the detector is not attached. Useful for a UI toggle. */
  enabled: boolean;
  /** Element to listen on. Defaults to the Excalidraw canvas wrapper. */
  container?: HTMLElement | null;
  /** Override classification thresholds. */
  thresholds?: PenDetectorOptions["thresholds"];
  /** Override smoothing. */
  smooth?: PenDetectorOptions["smooth"];
  /** Optional event callback for debugging / on-screen indicators. */
  onPenEvent?: (kind: "down" | "move" | "up", evt: PenEvent | null) => void;
};

const TOOL_FOR: Record<Tool, "freedraw" | "eraser" | null> = {
  penThin: "freedraw",
  penThick: "freedraw",
  eraser: "eraser",
  none: null,
};

/**
 * Wires a PenDetector to an Excalidraw instance:
 *  - swaps the active tool to freedraw / eraser based on contact radius
 *  - applies a stronger stroke width for "penThick"
 *  - all the underlying drawing is still done by Excalidraw via pointer events
 *    (the IR board reports them as touch — Excalidraw handles them natively).
 *
 * The detector is mainly used here for *classification*: distinguishing pen
 * from eraser from finger from palm, and bumping pressure/width accordingly.
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

  useEffect(() => {
    if (!enabled || !excalidrawAPI) return;

    const el =
      container ??
      // Excalidraw wraps its canvases inside .excalidraw .excalidraw__canvas-wrapper
      (document.querySelector(
        ".excalidraw .excalidraw__canvas-wrapper",
      ) as HTMLElement | null) ??
      (document.querySelector(".excalidraw") as HTMLElement | null);

    if (!el) return;

    const detector = new PenDetector({
      element: el,
      thresholds,
      smooth,
      // Passive: do NOT preventDefault — Excalidraw needs the touches to
      // produce its own pointer events for drawing. We only read radius
      // info to classify and to switch the active tool.
      passive: true,
    });
    detectorRef.current = detector;

    const previousTool = excalidrawAPI.getAppState?.()?.activeTool;

    const swapTool = (tool: Tool) => {
      const target = TOOL_FOR[tool];
      if (!target) return;
      try {
        excalidrawAPI.setActiveTool({ type: target });
      } catch {
        // older Excalidraw versions
      }
      // Bump default stroke width for penThick
      if (tool === "penThick") {
        excalidrawAPI.updateScene?.({
          appState: { currentItemStrokeWidth: 4 },
        });
      } else if (tool === "penThin") {
        excalidrawAPI.updateScene?.({
          appState: { currentItemStrokeWidth: 1 },
        });
      }
    };

    detector.on("pendown", (e) => {
      const evt = e as PenEvent;
      swapTool(evt.tool);
      onPenEvent?.("down", evt);
    });
    detector.on("penmove", (e) => {
      onPenEvent?.("move", e as PenEvent);
    });
    detector.on("penup", () => {
      onPenEvent?.("up", null);
    });

    return () => {
      detector.destroy();
      detectorRef.current = null;
      // restore the user's last tool when IR mode is turned off
      if (previousTool && excalidrawAPI.setActiveTool) {
        try {
          excalidrawAPI.setActiveTool(previousTool);
        } catch {
          // ignore
        }
      }
    };
  }, [enabled, excalidrawAPI, container, thresholds, smooth, onPenEvent]);

  return detectorRef;
}
