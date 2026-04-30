import { useEffect, useMemo, useRef, useState } from "react";
import { Excalidraw, MainMenu, useHandleLibrary } from "@excalidraw/excalidraw";
import { io, Socket } from "socket.io-client";
import { useExcalidrawPen } from "@edraw/pen/excalidraw";
import type { PenEvent, Thresholds } from "@edraw/pen";
import { CustomToolbar } from "./CustomToolbar";
import { NamePrompt } from "./NamePrompt";
import { LibraryPicker } from "./LibraryPicker";
import { IrCalibrate } from "./IrCalibrate";

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

export default function App() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [api, setApi] = useState<any>(null);
  const [connected, setConnected] = useState(false);
  const [peers, setPeers] = useState(0);
  const [username, setUsername] = useState<string>(getSavedName);
  const [irMode, setIrMode] = useState<boolean>(
    () => localStorage.getItem("edraw-ir-mode") === "1",
  );
  const [libraryOpen, setLibraryOpen] = useState(false);
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

  // Handles #addLibrary= from libraries.excalidraw.com when used as fallback.
  useHandleLibrary({ excalidrawAPI: api });

  // IR pen detector — wires the canvas to swap tools (pen / eraser) by radius.
  // Reads any thresholds the user calibrated via /?ir-calibrate=1.
  const penThresholds = useMemo(() => loadSavedThresholds(), [irMode]);
  const [penDebug, setPenDebug] = useState<PenEvent | null>(null);
  useExcalidrawPen({
    excalidrawAPI: api,
    enabled: irMode,
    thresholds: penThresholds,
    onPenEvent: (kind, evt) => {
      if (kind === "up") setPenDebug(null);
      else setPenDebug(evt);
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleChange = (elements: readonly any[]) => {
    if (applyingRemoteRef.current) return;
    const socket = socketRef.current;
    if (!socket || !socket.connected) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vs = (elements as any[]).reduce((acc, el) => acc + (el.version || 0), 0);
    if (vs === lastSentVersionRef.current || vs === lastRemoteVersionRef.current) return;
    lastSentVersionRef.current = vs;
    socket.emit("scene-update", { room, elements });
  };

  const handlePointerUpdate = (payload: {
    pointer: { x: number; y: number };
    button: "down" | "up";
  }) => {
    const socket = socketRef.current;
    if (!socket || !socket.connected) return;
    socket.emit("pointer-update", { room, user: me, pointer: payload.pointer, button: payload.button });
  };

  const handleNameConfirm = (name: string) => {
    localStorage.setItem("edraw-username", name);
    setUsername(name);
  };

  const handleToggleIr = () => {
    const next = !irMode;
    setIrMode(next);
    localStorage.setItem("edraw-ir-mode", next ? "1" : "0");
  };

  // Calibration page: shown when the URL has ?ir-calibrate=1.
  // Standalone full-screen UI for tuning IR pen thresholds.
  const calibrateMode = useMemo(
    () => new URLSearchParams(window.location.search).get("ir-calibrate") === "1",
    [],
  );
  if (calibrateMode) {
    return <IrCalibrate />;
  }

  // Only ask for a name when the user is joining a collaboration room.
  if (inCollab && !username) {
    return <NamePrompt onConfirm={handleNameConfirm} />;
  }

  return (
    <div style={{ height: "100vh", width: "100vw", position: "relative" }}>
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
              background: "#fef3c7",
              color: "#78350f",
              border: "1px solid #fde68a",
              borderRadius: 6,
              padding: "3px 10px",
              fontSize: 12,
              fontFamily: "system-ui, sans-serif",
            }}
          >
            Pizarra IR · {penDebug ? penDebug.tool : "esperando..."}
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
        excalidrawAPI={(a) => setApi(a)}
        onChange={handleChange}
        onPointerUpdate={handlePointerUpdate}
        libraryReturnUrl={libraryReturnUrl}
        initialData={{ appState: { viewBackgroundColor: "#fafafa" } }}
        UIOptions={{ canvasActions: { saveToActiveFile: false } }}
      >
        <MainMenu>
          <MainMenu.DefaultItems.LoadScene />
          <MainMenu.DefaultItems.SaveAsImage />
          <MainMenu.DefaultItems.Export />
          <MainMenu.Separator />
          <MainMenu.DefaultItems.ClearCanvas />
          <MainMenu.DefaultItems.ToggleTheme />
          <MainMenu.DefaultItems.ChangeCanvasBackground />
        </MainMenu>
      </Excalidraw>

      <CustomToolbar
        room={room}
        username={username}
        irMode={irMode}
        onToggleIr={handleToggleIr}
        onOpenLibrary={() => setLibraryOpen(true)}
        onCalibrateIr={() => {
          const url = new URL(window.location.href);
          url.searchParams.set("ir-calibrate", "1");
          window.location.href = url.toString();
        }}
        onChangeName={() => {
          localStorage.removeItem("edraw-username");
          setUsername("");
        }}
      />

      {libraryOpen && (
        <LibraryPicker
          excalidrawAPI={api}
          onClose={() => setLibraryOpen(false)}
        />
      )}
    </div>
  );
}
