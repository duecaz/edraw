type Props = {
  room: string | null;
  username: string;
  onClose: () => void;
  onChangeName: () => void;
};

export function ShareDialog({ room, username, onClose, onChangeName }: Props) {
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
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        zIndex: 9998,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "white",
          width: "min(420px, 92vw)",
          borderRadius: 12,
          padding: "20px 22px",
          boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 12,
          }}
        >
          <div style={{ fontSize: 16, fontWeight: 700, color: "#1a1a2e" }}>
            Compartir sala
          </div>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              fontSize: 22,
              color: "#666",
              cursor: "pointer",
              lineHeight: 1,
            }}
            aria-label="Cerrar"
          >
            ×
          </button>
        </div>

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
                fontSize: 13,
                padding: 8,
                border: "1px solid #e5e7eb",
                borderRadius: 6,
                boxSizing: "border-box",
                fontFamily: "monospace",
              }}
              onFocus={(e) => e.currentTarget.select()}
            />
            <button
              onClick={copy}
              style={{
                marginTop: 10,
                width: "100%",
                padding: "8px 12px",
                background: "#6965db",
                color: "white",
                border: "none",
                borderRadius: 6,
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              Copiar enlace
            </button>
            {username && (
              <>
                <hr style={{ margin: "16px 0", border: "none", borderTop: "1px solid #eee" }} />
                <div style={{ fontSize: 13, color: "#374151", marginBottom: 8 }}>
                  Conectado como <strong>{username}</strong>
                </div>
                <button
                  onClick={() => {
                    onClose();
                    onChangeName();
                  }}
                  style={{
                    width: "100%",
                    padding: "7px 12px",
                    background: "#f3f4f6",
                    color: "#374151",
                    border: "1px solid #e5e7eb",
                    borderRadius: 6,
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
            <div style={{ fontSize: 13, color: "#374151", marginBottom: 12, lineHeight: 1.5 }}>
              Iniciá una sala para colaborar en tiempo real con otras personas.
              Cualquiera con el enlace podrá ver y editar el dibujo.
            </div>
            <button
              onClick={startCollab}
              style={{
                width: "100%",
                padding: "10px 12px",
                background: "#6965db",
                color: "white",
                border: "none",
                borderRadius: 6,
                cursor: "pointer",
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              Iniciar colaboración
            </button>
          </>
        )}
      </div>
    </div>
  );
}
