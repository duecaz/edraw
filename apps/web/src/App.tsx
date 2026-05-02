import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  Excalidraw,
  MainMenu,
  Sidebar,
  DefaultSidebar,
  useHandleLibrary,
} from "@excalidraw/excalidraw";
import { io, Socket } from "socket.io-client";
import { useExcalidrawPen } from "@edraw/pen/excalidraw";
import type { PenEvent, Thresholds } from "@edraw/pen";
import { NamePrompt } from "./NamePrompt";
import { LibraryCatalogPanel } from "./LibraryCatalogPanel";
import { IrCalibrate } from "./IrCalibrate";
import { ShareDialog } from "./ShareDialog";

// Bump on every user-visible fix so deployed builds are easy to confirm.
const APP_VERSION = "0.2.7";

// Diagnostic flag: when true, the IR pen hook is force-disabled and no
// pointer listeners are attached.
const IR_HOOK_DISABLED = false;

const CATALOG_TAB = "edraw-catalog";

const PEN_THRESHOLDS_KEY = "edraw-pen-thresholds";

function loadSavedThresholds(): Thresholds | undefined {
  try {
    const raw = localStorage.getItem(PEN_THRESHOLDS_KEY);
    if (raw) {
      const d = JSON.parse(raw);
      if (d?.penThin && d?.penThick && d?.eraser) return d;
    }
  } catch {
    /* ignore */
  }
  return undefined;
}

const ROOM_SERVER_URL =
  (import.meta.env.VITE_ROOM_SERVER as string | undefined) ||
  "http://localhost:3002";

const COLORS = [
  "#FFADAD", "#FFD6A5", "#CAFFBF", "#9BF6FF",
  "#A0C4FF", "#BDB2FF", "#FFC6FF",
];

function readRoomFromUrl(): string | null {
  const url = new URL(window.location.href);
  const fromQuery = url.searchParams.get("room");
  if (fromQuery) return fromQuery;
  const hashParams = new URLSearchParams(url.hash.slice(1));
  const fromHash = hashParams.get("room");
  if (fromHash) {
    // Migrate to query string and strip from hash
    hashParams.delete("room");
    url.hash = hashParams.toString() ? `#${hashParams}` : "";
    url.searchParams.set("room", fromHash);
    window.history.replaceState(null, "", url.toString());
    return fromHash;
  }
  return null;
}

function randomId(len = 8): string {
  return Math.random().toString(36).slice(2, 2 + len);
}

function getSavedName(): string {
  return localStorage.getItem("edraw-username") || "";
}

const iconStyle: React.CSSProperties = {
  width: 16,
  height: 16,
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

const IrIcon = (
  <svg viewBox="0 0 24 24" style={iconStyle}>
    <rect x="3" y="4" width="18" height="13" rx="2" />
    <path d="M8 21h8M12 17v4" />
    <path d="M9 8.5a4 4 0 016 0M11 11a1.5 1.5 0 012 0" />
  </svg>
);

const CalibrateIcon = (
  <svg viewBox="0 0 24 24" style={iconStyle}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" />
  </svg>
);

// Used in the sidebar tab trigger — graduation-cap shape suggests "education".
const CatalogIcon = (
  <svg viewBox="0 0 24 24" style={{ ...iconStyle, width: 20, height: 20 }}>
    <path d="M3 9l9-4 9 4-9 4-9-4z" />
    <path d="M7 11v4c0 1.5 2.5 3 5 3s5-1.5 5-3v-4" />
    <path d="M21 9v5" />
  </svg>
);

const ZoomResetIcon = (
  <svg viewBox="0 0 24 24" style={iconStyle}>
    <circle cx="11" cy="11" r="7" />
    <path d="M21 21l-4.3-4.3" />
    <path d="M9 11h4" />
  </svg>
);

const ShareIcon = (
  <svg viewBox="0 0 24 24" style={iconStyle}>
    <circle cx="6" cy="12" r="2.2" />
    <circle cx="18" cy="6" r="2.2" />
    <circle cx="18" cy="18" r="2.2" />
    <path d="M8 11l8-4M8 13l8 4" />
  </svg>
);

const FullscreenIcon = (
  <svg viewBox="0 0 24 24" style={iconStyle}>
    <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
  </svg>
);

const ToolbarBottomIcon = (
  <svg viewBox="0 0 24 24" style={iconStyle}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M3 16h18" />
    <circle cx="8" cy="18" r="0.6" fill="currentColor" />
    <circle cx="12" cy="18" r="0.6" fill="currentColor" />
    <circle cx="16" cy="18" r="0.6" fill="currentColor" />
  </svg>
);

export default function App() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [api, setApi] = useState<any>(null);
  const [connected, setConnected] = useState(false);
  const [peers, setPeers] = useState(0);
  const [username, setUsername] = useState<string>(getSavedName);
  const [irMode, setIrMode] = useState<boolean>(
    () => localStorage.getItem("edraw-ir-mode") === "1",
  );
  const [isFullscreen, setIsFullscreen] = useState<boolean>(
    () => typeof document !== "undefined" && !!document.fullscreenElement,
  );
  const [toolbarBottom, setToolbarBottom] = useState<boolean>(() => {
    const saved = localStorage.getItem("edraw-toolbar-bottom");
    // Default = bottom. Only false if the user explicitly toggled it.
    return saved === null ? true : saved === "1";
  });
  const [shareOpen, setShareOpen] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const applyingRemoteRef = useRef(false);
  const lastSentVersionRef = useRef(0);
  const lastRemoteVersionRef = useRef(0);

  // Room is null when the user is solo (no ?room= in URL).
  const room = useMemo(() => readRoomFromUrl(), []);
  const inCollab = room !== null;

  const me = useMemo(
    () => ({
      id: randomId(),
      name: username || "Yo",
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
    }),
    [username],
  );

  const libraryReturnUrl = useMemo(() => {
    const url = new URL(window.location.href);
    url.hash = "";
    return url.toString();
  }, []);

  // Stable reference for Excalidraw memoised props.
  const initialData = useMemo(
    () => ({ appState: { viewBackgroundColor: "#fafafa" } }),
    [],
  );
  const uiOptions = useMemo(
    () => ({ canvasActions: { saveToActiveFile: false } }),
    [],
  );

  // Handles #addLibrary= from libraries.excalidraw.com when used as fallback.
  useHandleLibrary({ excalidrawAPI: api });

  // IR pen detector — wires the canvas to swap tools (pen / eraser) by radius.
  // Reads any thresholds the user calibrated via /?ir-calibrate=1.
  const penThresholds = useMemo(() => loadSavedThresholds(), [irMode]);
  const [penDebug, setPenDebug] = useState<PenEvent | null>(null);
  useExcalidrawPen({
    excalidrawAPI: api,
    // Diagnostic: force-disable while we isolate whether the hook is
    // responsible for the touch-only line endpoint drag bug.
    enabled: irMode && !IR_HOOK_DISABLED,
    thresholds: penThresholds,
    onPenEvent: (kind, evt) => {
      if (kind === "down") setPenDebug(evt);
      else if (kind === "up") setPenDebug(null);
    },
  });

  // Socket connection — only if we're in a room.
  useEffect(() => {
    if (!api || !inCollab || !room) return;
    if (!username) return; // wait for the name prompt

    const socket = io(ROOM_SERVER_URL, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: Infinity,
      timeout: 10000,
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      socket.emit("join-room", { room, user: me });
    });
    socket.on("disconnect", () => {
      setConnected(false);
      setPeers(0);
    });
    socket.on("joined", ({ peers: p }: { room: string; peers: number }) => {
      setPeers(p);
    });
    socket.on("user-joined", () => setPeers((n) => n + 1));
    socket.on("user-left", () => setPeers((n) => Math.max(0, n - 1)));

    socket.on(
      "scene-update",
      (payload: { elements: unknown[]; from: string }) => {
        if (payload.from === socket.id) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const els = payload.elements as any[];
        const vs = els.reduce((acc, el) => acc + (el.version || 0), 0);
        lastRemoteVersionRef.current = vs;
        applyingRemoteRef.current = true;
        api.updateScene({ elements: els });
        requestAnimationFrame(() => {
          applyingRemoteRef.current = false;
        });
      },
    );

    socket.on(
      "pointer-update",
      (payload: {
        from: string;
        user: { id: string; name: string; color: string };
        pointer: { x: number; y: number };
        button: "down" | "up";
      }) => {
        if (payload.from === socket.id) return;
        const collaborators = new Map();
        const current = api.getAppState().collaborators as
          | Map<string, unknown>
          | undefined;
        if (current) {
          for (const [k, v] of current.entries()) collaborators.set(k, v);
        }
        collaborators.set(payload.user.id, {
          username: payload.user.name,
          pointer: payload.pointer,
          button: payload.button,
          color: { background: payload.user.color, stroke: payload.user.color },
        });
        api.updateScene({ collaborators });
      },
    );

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [api, inCollab, room, me, username]);

  // Keep these stable across renders so Excalidraw's React.memo / areEqual
  // doesn't keep tearing down internal handlers mid-gesture.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleChange = useCallback((elements: readonly any[]) => {
    if (applyingRemoteRef.current) return;
    const socket = socketRef.current;
    if (!socket || !socket.connected) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vs = (elements as any[]).reduce((acc, el) => acc + (el.version || 0), 0);
    if (vs === lastSentVersionRef.current || vs === lastRemoteVersionRef.current) return;
    lastSentVersionRef.current = vs;
    socket.emit("scene-update", { room, elements });
  }, [room]);

  const handlePointerUpdate = useCallback((payload: {
    pointer: { x: number; y: number };
    button: "down" | "up";
  }) => {
    const socket = socketRef.current;
    if (!socket || !socket.connected) return;
    socket.emit("pointer-update", { room, user: me, pointer: payload.pointer, button: payload.button });
  }, [room, me]);

  const handleApi = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (a: any) => setApi(a),
    [],
  );

  const handleNameConfirm = (name: string) => {
    localStorage.setItem("edraw-username", name);
    setUsername(name);
  };

  const handleToggleIr = () => {
    const next = !irMode;
    setIrMode(next);
    localStorage.setItem("edraw-ir-mode", next ? "1" : "0");
  };

  const handleCalibrateIr = () => {
    const url = new URL(window.location.href);
    url.searchParams.set("ir-calibrate", "1");
    window.location.href = url.toString();
  };

  const handleToggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      /* user denied / not supported */
    }
  };

  // Track external fullscreen changes (Esc, F11, etc.)
  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // Mirror the toolbar-bottom flag onto <body> so our CSS rules reach
  // Radix-portaled toolbar dropdowns (which render at body level, not
  // inside our wrapper).
  useEffect(() => {
    document.body.classList.toggle("edraw-toolbar-bottom", toolbarBottom);
    return () => document.body.classList.remove("edraw-toolbar-bottom");
  }, [toolbarBottom]);

  // When the toolbar is at the bottom, Radix's avoidCollisions doesn't
  // always flip the "more tools" dropdown upward (its trigger lives
  // inside our position:fixed translateX(-50%) container, which confuses
  // some popper-based collision detectors). The dropdown then opens
  // downward and gets clipped off-screen.
  //
  // This effect watches the body for any [data-radix-popper-content-wrapper]
  // that contains a toolbar dropdown, and if it has been positioned below
  // the trigger we override its inline transform to place it above instead.
  useEffect(() => {
    if (!toolbarBottom) return;

    const reposition = (wrapper: HTMLElement) => {
      const dropdown = wrapper.querySelector<HTMLElement>(
        ".App-toolbar__extra-tools-dropdown",
      );
      if (!dropdown) return;
      const trigger = document.querySelector<HTMLElement>(
        ".App-toolbar__extra-tools-trigger",
      );
      if (!trigger) return;
      const wRect = wrapper.getBoundingClientRect();
      const tRect = trigger.getBoundingClientRect();
      // Only intervene if Radix put the popup at/below the trigger top.
      if (wRect.top < tRect.top - 4) return;
      const targetTop = Math.max(8, tRect.top - wRect.height - 8);
      const targetLeft = Math.max(
        8,
        Math.min(window.innerWidth - wRect.width - 8, tRect.right - wRect.width),
      );
      wrapper.style.transform = "none";
      wrapper.style.top = `${targetTop}px`;
      wrapper.style.left = `${targetLeft}px`;
      dropdown.setAttribute("data-side", "top");
    };

    const handle = (node: Node) => {
      if (!(node instanceof HTMLElement)) return;
      if (node.matches?.("[data-radix-popper-content-wrapper]")) {
        // Defer one frame so Radix has applied its initial transform.
        requestAnimationFrame(() => reposition(node));
      }
      const inner = node.querySelector?.<HTMLElement>(
        "[data-radix-popper-content-wrapper]",
      );
      if (inner) requestAnimationFrame(() => reposition(inner));
    };

    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        m.addedNodes.forEach(handle);
      }
    });
    observer.observe(document.body, { childList: true, subtree: false });
    return () => observer.disconnect();
  }, [toolbarBottom]);

  // Workaround for an Excalidraw 0.18.1 npm bug (fixed in upstream master
  // by commit 7da176ff but never released). Touch-dragging an endpoint of
  // a straight 2-point line/arrow goes through a bbox-resize code path
  // (App.tsx around the points.length === 2 special-case) whose cached
  // resize.offset gets desynced on touch, sending the dragged point to a
  // wildly wrong position — as if the other endpoint were far away. Once
  // the line has 3+ points, Excalidraw uses LinearElementEditor's
  // per-point math, which works correctly. The user already observed
  // this: bending the midpoint "cures" the line.
  //
  // We mimic the upstream fix by silently inserting a collinear midpoint
  // into any 2-point line/arrow as soon as it gets selected. Visually
  // identical (the midpoint sits exactly between the endpoints) and
  // Excalidraw routes endpoint drags through the safe path.
  useEffect(() => {
    if (!api) return;
    const tick = () => {
      const state = api.getAppState();
      const selected = state.selectedElementIds || {};
      const ids = Object.keys(selected).filter((k: string) => selected[k]);
      if (ids.length === 0) return;
      const elements = api.getSceneElements();
      let mutated = false;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const next = elements.map((el: any) => {
        if (
          ids.includes(el.id) &&
          (el.type === "line" || el.type === "arrow") &&
          Array.isArray(el.points) &&
          el.points.length === 2
        ) {
          const [p0, p1] = el.points;
          const mid: [number, number] = [
            (p0[0] + p1[0]) / 2,
            (p0[1] + p1[1]) / 2,
          ];
          mutated = true;
          return {
            ...el,
            points: [p0, mid, p1],
            version: (el.version || 0) + 1,
            versionNonce: Math.floor(Math.random() * 2 ** 31),
          };
        }
        return el;
      });
      if (mutated) {
        api.updateScene({ elements: next });
      }
    };
    const interval = window.setInterval(tick, 250);
    return () => window.clearInterval(interval);
  }, [api]);

  const handleToggleToolbarBottom = () => {
    const next = !toolbarBottom;
    setToolbarBottom(next);
    localStorage.setItem("edraw-toolbar-bottom", next ? "1" : "0");
  };

  // Zoom helpers — call api.updateScene with a new zoom value, preserving
  // viewport center by also adjusting scrollX/scrollY.
  const setZoom = (nextZoom: number) => {
    if (!api) return;
    const state = api.getAppState();
    const cur = state.zoom?.value ?? 1;
    const z = Math.max(0.1, Math.min(30, nextZoom));
    if (z === cur) return;
    const w = state.width ?? window.innerWidth;
    const h = state.height ?? window.innerHeight;
    const cx = state.scrollX + w / cur / 2;
    const cy = state.scrollY + h / cur / 2;
    api.updateScene({
      appState: {
        zoom: { value: z },
        scrollX: cx - w / z / 2,
        scrollY: cy - h / z / 2,
      },
    });
  };

  const handleZoomReset = () => setZoom(1);

  // Calibration page: shown when the URL has ?ir-calibrate=1.
  // Standalone full-screen UI for tuning IR pen thresholds.
  const calibrateMode = useMemo(
    () => new URLSearchParams(window.location.search).get("ir-calibrate") === "1",
    [],
  );
  if (calibrateMode) {
    return <IrCalibrate />;
  }

  // Minimal mode (?minimal=1): renders a bare Excalidraw with NO custom
  // children, NO CSS overrides, NO MainMenu/Sidebar customisations, NO
  // collab, NO IR hook. Used to confirm whether the touch vertex-drag
  // bug exists in stock @excalidraw/excalidraw 0.18.1 or only with our
  // customisations on top.
  const minimalMode = useMemo(
    () => new URLSearchParams(window.location.search).get("minimal") === "1",
    [],
  );
  if (minimalMode) {
    return (
      <div style={{ height: "100vh", width: "100vw" }}>
        <Excalidraw />
        <div
          style={{
            position: "fixed",
            top: 8,
            left: 8,
            zIndex: 9999,
            background: "rgba(0,0,0,0.78)",
            color: "#4cc9f0",
            fontFamily: "monospace",
            fontSize: 11,
            padding: "4px 8px",
            borderRadius: 6,
            pointerEvents: "none",
          }}
        >
          MINIMAL · Excalidraw 0.18.1 vanilla · v{APP_VERSION}
        </div>
      </div>
    );
  }

  // Only ask for a name when the user is joining a collaboration room.
  if (inCollab && !username) {
    return <NamePrompt onConfirm={handleNameConfirm} />;
  }

  return (
    <div
      className={toolbarBottom ? "edraw-toolbar-bottom" : undefined}
      style={{ height: "100vh", width: "100vw", position: "relative" }}
    >
      {inCollab && (
        <div
          style={{
            position: "absolute",
            top: 8,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 10,
            background: connected ? "#d1fae5" : "#fee2e2",
            color: connected ? "#065f46" : "#991b1b",
            border: `1px solid ${connected ? "#6ee7b7" : "#fca5a5"}`,
            borderRadius: 6,
            padding: "3px 10px",
            fontSize: 12,
            fontFamily: "system-ui, sans-serif",
            pointerEvents: "none",
          }}
        >
          {connected
            ? peers > 0
              ? `${username} · ${peers} colaborador${peers > 1 ? "es" : ""}`
              : `${username} · solo`
            : "Conectando..."}
        </div>
      )}

      {irMode && (
        <div
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            zIndex: 10,
            display: "flex",
            flexDirection: "column",
            gap: 4,
            alignItems: "flex-end",
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              background: IR_HOOK_DISABLED ? "#fee2e2" : "#fef3c7",
              color: IR_HOOK_DISABLED ? "#991b1b" : "#78350f",
              border: `1px solid ${IR_HOOK_DISABLED ? "#fca5a5" : "#fde68a"}`,
              borderRadius: 6,
              padding: "3px 10px",
              fontSize: 12,
              fontFamily: "system-ui, sans-serif",
            }}
          >
            {IR_HOOK_DISABLED
              ? "Pizarra IR · DIAG (hook apagado)"
              : `Pizarra IR · ${penDebug ? penDebug.tool : "esperando..."}`}
          </div>
          {penDebug && (
            <div
              style={{
                background: "rgba(0,0,0,0.78)",
                color: "#4cc9f0",
                fontFamily: "monospace",
                fontSize: 11,
                padding: "4px 8px",
                borderRadius: 6,
                lineHeight: 1.5,
              }}
            >
              rX:{penDebug.radiusX.toFixed(2)} rY:{penDebug.radiusY.toFixed(2)}
              {" · "}metric:{penDebug.metric.toFixed(2)}
              <br />
              pts:{penDebug.pointCount} · area:{Math.round(penDebug.bboxArea)}px²
            </div>
          )}
        </div>
      )}

      <Excalidraw
        excalidrawAPI={handleApi}
        onChange={handleChange}
        onPointerUpdate={handlePointerUpdate}
        libraryReturnUrl={libraryReturnUrl}
        langCode="es-ES"
        initialData={initialData}
        UIOptions={uiOptions}
      >
        <MainMenu>
          <MainMenu.DefaultItems.LoadScene />
          <MainMenu.DefaultItems.SaveAsImage />
          <MainMenu.DefaultItems.Export />
          <MainMenu.Separator />
          <MainMenu.Item onSelect={() => setShareOpen(true)} icon={ShareIcon}>
            Compartir sala
          </MainMenu.Item>
          <MainMenu.Item
            onSelect={handleToggleFullscreen}
            icon={FullscreenIcon}
            selected={isFullscreen}
          >
            {isFullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
          </MainMenu.Item>
          <MainMenu.Item onSelect={handleZoomReset} icon={ZoomResetIcon} shortcut="Ctrl+0">
            Restablecer zoom
          </MainMenu.Item>
          <MainMenu.Separator />
          <MainMenu.Item onSelect={handleToggleIr} icon={IrIcon} selected={irMode}>
            {irMode ? "Pizarra IR (activa)" : "Pizarra IR"}
          </MainMenu.Item>
          <MainMenu.Item onSelect={handleCalibrateIr} icon={CalibrateIcon}>
            Calibrar IR
          </MainMenu.Item>
          <MainMenu.Separator />
          <MainMenu.Item
            onSelect={handleToggleToolbarBottom}
            icon={ToolbarBottomIcon}
            selected={toolbarBottom}
          >
            {toolbarBottom ? "Barra arriba" : "Barra abajo"}
          </MainMenu.Item>
          <MainMenu.DefaultItems.Help />
          <MainMenu.Separator />
          <MainMenu.DefaultItems.ClearCanvas />
          <MainMenu.DefaultItems.ToggleTheme />
          <MainMenu.DefaultItems.ChangeCanvasBackground />
          <MainMenu.Separator />
          <MainMenu.ItemCustom>
            <div
              style={{
                padding: "4px 12px",
                fontSize: 11,
                color: "var(--color-text-muted, #9ca3af)",
                fontFamily: "monospace",
                userSelect: "text",
              }}
            >
              edraw v{APP_VERSION}
            </div>
          </MainMenu.ItemCustom>
        </MainMenu>

        <DefaultSidebar>
          <DefaultSidebar.TabTriggers>
            <Sidebar.TabTrigger tab={CATALOG_TAB}>{CatalogIcon}</Sidebar.TabTrigger>
          </DefaultSidebar.TabTriggers>
          <Sidebar.Tab tab={CATALOG_TAB}>
            <LibraryCatalogPanel excalidrawAPI={api} />
          </Sidebar.Tab>
        </DefaultSidebar>
      </Excalidraw>

      {shareOpen && (
        <ShareDialog
          room={room}
          username={username}
          onClose={() => setShareOpen(false)}
          onChangeName={() => {
            localStorage.removeItem("edraw-username");
            setUsername("");
          }}
        />
      )}
    </div>
  );
}
