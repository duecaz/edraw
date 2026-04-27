import { useEffect, useMemo, useRef, useState } from "react";
import { Excalidraw, MainMenu, useHandleLibrary } from "@excalidraw/excalidraw";
import { io, Socket } from "socket.io-client";
import { CustomToolbar } from "./CustomToolbar";
import { NamePrompt } from "./NamePrompt";

const ROOM_SERVER_URL =
  (import.meta.env.VITE_ROOM_SERVER as string | undefined) ||
  "http://localhost:3002";

const COLORS = [
  "#FFADAD", "#FFD6A5", "#CAFFBF", "#9BF6FF",
  "#A0C4FF", "#BDB2FF", "#FFC6FF",
];

function getOrCreateRoom(): string {
  const url = new URL(window.location.href);
  let room = url.searchParams.get("room");
  if (!room) {
    // Backwards compat: room was previously stored in hash
    const hashParams = new URLSearchParams(url.hash.slice(1));
    const fromHash = hashParams.get("room");
    if (fromHash) {
      room = fromHash;
      hashParams.delete("room");
      url.hash = hashParams.toString() ? `#${hashParams}` : "";
    }
  }
  if (!room) {
    room = Math.random().toString(36).slice(2, 10);
  }
  if (url.searchParams.get("room") !== room) {
    url.searchParams.set("room", room);
    window.history.replaceState(null, "", url.toString());
  }
  return room;
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
  const socketRef = useRef<Socket | null>(null);
  const applyingRemoteRef = useRef(false);
  const lastSentVersionRef = useRef(0);
  const lastRemoteVersionRef = useRef(0);

  const room = useMemo(() => getOrCreateRoom(), []);

  const me = useMemo(
    () => ({
      id: randomId(),
      name: username || `User-${randomId(4)}`,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
    }),
    [username],
  );

  // libraryReturnUrl: where libraries.excalidraw.com redirects after "Add to Excalidraw".
  // We use the current URL (with ?room= but without any hash) so the room is preserved
  // even when the browser falls back from postMessage to a full redirect.
  const libraryReturnUrl = useMemo(() => {
    const url = new URL(window.location.href);
    url.hash = "";
    return url.toString();
  }, []);

  // Handles #addLibrary= hash set by libraries.excalidraw.com (postMessage + redirect fallback)
  useHandleLibrary({ excalidrawAPI: api });

  useEffect(() => {
    if (!api || !username) return;

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
        // updateScene fires onChange asynchronously after React renders,
        // so clear the flag after the next paint to avoid re-broadcasting.
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
  }, [api, room, me, username]);

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

  if (!username) {
    return <NamePrompt onConfirm={handleNameConfirm} />;
  }

  return (
    <div style={{ height: "100vh", width: "100vw", position: "relative" }}>
      {/* Connection status bar */}
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
      <CustomToolbar room={room} username={username} onChangeName={() => {
        localStorage.removeItem("edraw-username");
        setUsername("");
      }} />
    </div>
  );
}
