import { useState } from "react";

type Props = { room: string };

// Lightweight QR generator using a public quickchart-style endpoint would
// require a network call. To keep this fully offline-capable we render the
// share URL as text and a copy button. Swap in any QR library later.
export function CustomToolbar({ room }: Props) {
  const [open, setOpen] = useState(false);
  const shareUrl = `${window.location.origin}${window.location.pathname}#room=${room}`;

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
            maxWidth: 320,
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
            }}
          >
            Copiar enlace
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
        }}
      >
        {open ? "Cerrar" : "Compartir"}
      </button>
    </div>
  );
}
