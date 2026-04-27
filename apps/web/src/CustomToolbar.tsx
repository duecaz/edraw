import { useState } from "react";

type Props = {
  room: string;
  username: string;
  onChangeName: () => void;
};

export function CustomToolbar({ room, username, onChangeName }: Props) {
  const [open, setOpen] = useState(false);
  const shareUrl = `${window.location.origin}${window.location.pathname}?room=${room}`;

  const copy = async () => {
    await navigator.clipboard.writeText(shareUrl);
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
        fontFamily: "system-ui, sans-serif",
      }}
    >
      {open && (
        <div
          style={{
            background: "white",
            border: "1px solid #ddd",
            borderRadius: 8,
            padding: 12,
            boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
            width: 280,
          }}
        >
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
          <hr style={{ margin: "10px 0", border: "none", borderTop: "1px solid #eee" }} />
          <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>
            Conectado como <strong>{username}</strong>
          </div>
          <button
            onClick={() => { setOpen(false); onChangeName(); }}
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
        </div>
      )}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Compartir sala"
        style={{
          padding: "8px 12px",
          background: "#6965db",
          color: "white",
          border: "none",
          borderRadius: 8,
          cursor: "pointer",
          boxShadow: "0 2px 6px rgba(0,0,0,0.12)",
          fontSize: 13,
        }}
      >
        {open ? "Cerrar" : "Compartir"}
      </button>
    </div>
  );
}
