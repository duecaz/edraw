import { useEffect, useMemo, useRef, useState } from "react";
import { Excalidraw, MainMenu } from "@excalidraw/excalidraw";
import { io, Socket } from "socket.io-client";
import { CustomToolbar } from "./CustomToolbar";

const ROOM_SERVER_URL =
  (import.meta.env.VITE_ROOM_SERVER as string | undefined) ||
  "http://localhost:3002";

const COLORS = [
  "#FFADAD", "#FFD6A5", "#CAFFBF", "#9BF6FF",
  "#A0C4FF", "#BDB2FF", "#FFC6FF",
];

function getOrCreateRoom(): string {
  const params = new URLSearchParams(window.location.hash.slice(1));
  let room = params.get("room");
  if (!room) {
    room = Math.random().toString(36).slice(2, 10);
    params.set("room", room);
    window.location.hash = params.toString();
  }
  return room;
}

function randomId(len = 8): string {
  return Math.random().toString(36).slice(2, 2 + len);
}

export default function App() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [api, setApi] = useState<any>(null);
  const socketRef = useRef<Socket | null>(null);
  const applyingRemoteRef = useRef(false);
  const lastSentVersionRef = useRef(0);

  const me = useMemo(
    () => ({
      id: randomId(),
      name: `User-${randomId(4)}`,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
    }),
    [],
  );

  const room = useMemo(() => getOrCreateRoom(), []);

  // Connect socket and wire up sync
  useEffect(() => {
    if (!api) return;

    const socket = io(ROOM_SERVER_URL, { transports: ["websocket"] });
    socketRef.current = socket;

    socket.on("connect", () => {
      socket.emit("join-room", { room, user: me });
    });

    socket.on(
      "scene-update",
      (payload: { elements: unknown[]; from: string }) => {
        if (payload.from === socket.id) return;
        applyingRemoteRef.current = true;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        api.updateScene({ elements: payload.elements as any });
        applyingRemoteRef.current = false;
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
        // Preserve existing collaborators
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
  }, [api, room, me]);

  // Broadcast scene changes
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleChange = (elements: readonly any[]) => {
    if (applyingRemoteRef.current) return;
    const socket = socketRef.current;
    if (!socket || !socket.connected) return;
    // Cheap dedupe: only send when length or last update changes
    const version = elements.length
      ? elements.length * 1e9 +
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (elements as any[]).reduce((acc, el) => acc + (el.version || 0), 0)
      : 0;
    if (version === lastSentVersionRef.current) return;
    lastSentVersionRef.current = version;
    socket.emit("scene-update", { room, elements });
  };

  const handlePointerUpdate = (payload: {
    pointer: { x: number; y: number };
    button: "down" | "up";
  }) => {
    const socket = socketRef.current;
    if (!socket || !socket.connected) return;
    socket.emit("pointer-update", {
      room,
      user: me,
      pointer: payload.pointer,
      button: payload.button,
    });
  };

  return (
    <div style={{ height: "100vh", width: "100vw", position: "relative" }}>
      <Excalidraw
        excalidrawAPI={(a) => setApi(a)}
        onChange={handleChange}
        onPointerUpdate={handlePointerUpdate}
        initialData={{
          appState: { viewBackgroundColor: "#fafafa" },
        }}
        UIOptions={{
          canvasActions: { saveToActiveFile: false },
        }}
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
      <CustomToolbar room={room} />
    </div>
  );
}
