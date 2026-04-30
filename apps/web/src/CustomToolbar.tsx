import { useState } from "react";

type Props = {
  room: string | null;
  username: string;
  irMode: boolean;
  onToggleIr: () => void;
  onOpenLibrary: () => void;
  onCalibrateIr: () => void;
  onChangeName: () => void;
};

const btn = (active: boolean): React.CSSProperties => ({
  padding: "8px 12px",
  background: active ? "#6965db" : "white",
  color: active ? "white" : "#374151",
  border: `1px solid ${active ? "#6965db" : "#e5e7eb"}`,
  borderRadius: 8,
  cursor: "pointer",
  boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
  fontSize: 13,
  fontFamily: "system-ui, sans-serif",
  whiteSpace: "nowrap",
});

export function CustomToolbar({
  room,
  username,
  irMode,
  onToggleIr,
  onOpenLibrary,
  onCalibrateIr,
  onChangeName,
}: Props) {
  const [shareOpen, setShareOpen] = useState(false);

  const startCollab = () => {
    const id = Math.random().toString(36).slice(2, 10);
    const url = new URL(window.location.href);
    url.searchParams.set("room", id);
    window.location.href = url.toString();
  };

  const shareUrl = room
    ? `${window.location.origin}${window.location.pathname}?room=${room}`
    : "";

  const copy = async () => {
    if (shareUrl) await navigator.clipboard.writeText(shareUrl);
  };

  return (
    <div
      style={{
        position: "absolute",
        right: 12,
        bottom: 80,
        zIndex: 5,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: 8,
      }}
    >
      {shareOpen && (
        <div
          style={{
            background: "white",
            border: "1px solid #ddd",
            borderRadius: 8,
            padding: 12,
            boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
            width: 280,
            fontFamily: "system-ui, sans-serif",
          }}
        >
          {room ? (
            <>
              <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>
                Sala: <code>{room}</code>
              </div>
              <input
                readOnly
                value={shareUrl}
                style={{
                  width: "100%",
                  fontSize: 12,
                  padding: 6,
                  border: "1px solid #eee",
                  borderRadius: 4,
                  boxSizing: "border-box",
                }}
                onFocus={(e) => e.currentTarget.select()}
              />
              <button
                onClick={copy}
                style={{
                  marginTop: 8,
                  width: "100%",
                  padding: "6px 10px",
                  background: "#6965db",
                  color: "white",
                  border: "none",
                  borderRadius: 4,
                  cursor: "pointer",
                  fontSize: 13,
                }}
              >
                Copiar enlace
              </button>
              {username && (
                <>
                  <hr style={{ margin: "10px 0", border: "none", borderTop: "1px solid #eee" }} />
                  <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>
                    Conectado como <strong>{username}</strong>
                  </div>
                  <button
                    onClick={() => { setShareOpen(false); onChangeName(); }}
                    style={{
                      width: "100%",
                      padding: "6px 10px",
                      background: "#f3f4f6",
                      color: "#374151",
                      border: "1px solid #e5e7eb",
                      borderRadius: 4,
                      cursor: "pointer",
                      fontSize: 13,
                    }}
                  >
                    Cambiar nombre
                  </button>
                </>
              )}
            </>
          ) : (
            <>
              <div style={{ fontSize: 13, color: "#374151", marginBottom: 8 }}>
                Trabajando en solo. Iniciá una sala para colaborar en tiempo real.
              </div>
              <button
                onClick={startCollab}
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  background: "#6965db",
                  color: "white",
                  border: "none",
                  borderRadius: 4,
                  cursor: "pointer",
                  fontSize: 13,
                }}
              >
                Iniciar colaboración
              </button>
            </>
          )}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
        <button onClick={onOpenLibrary} style={btn(false)} title="Catálogo educativo">
          Librerías
        </button>
        <button
          onClick={onCalibrateIr}
          style={btn(false)}
          title="Calibrar umbrales del lápiz IR"
        >
          Calibrar IR
        </button>
        <button
          onClick={onToggleIr}
          style={btn(irMode)}
          title={irMode ? "Desactivar pizarra IR" : "Activar pizarra IR"}
        >
          {irMode ? "Pizarra IR ON" : "Pizarra IR"}
        </button>
        <button onClick={() => setShareOpen((v) => !v)} style={btn(false)}>
          {room ? (shareOpen ? "Cerrar" : "Compartir") : "Sala"}
        </button>
      </div>
    </div>
  );
}
