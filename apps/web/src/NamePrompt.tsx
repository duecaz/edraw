import { useState } from "react";

type Props = { onConfirm: (name: string) => void };

export function NamePrompt({ onConfirm }: Props) {
  const [value, setValue] = useState("");

  const submit = () => {
    const name = value.trim();
    if (name) onConfirm(name);
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <div
        style={{
          background: "white",
          borderRadius: 12,
          padding: "32px 28px",
          width: 320,
          boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <div style={{ fontSize: 22, fontWeight: 700, color: "#1a1a2e" }}>
          edraw
        </div>
        <div style={{ fontSize: 14, color: "#555" }}>
          Como quieres que te vean los demas colaboradores?
        </div>
        <input
          autoFocus
          placeholder="Tu nombre"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          style={{
            padding: "9px 12px",
            fontSize: 15,
            border: "1px solid #ddd",
            borderRadius: 7,
            outline: "none",
          }}
        />
        <button
          onClick={submit}
          disabled={!value.trim()}
          style={{
            padding: "10px",
            background: value.trim() ? "#6965db" : "#c4c3f0",
            color: "white",
            border: "none",
            borderRadius: 7,
            fontSize: 15,
            fontWeight: 600,
            cursor: value.trim() ? "pointer" : "default",
            transition: "background 0.15s",
          }}
        >
          Entrar al canvas
        </button>
      </div>
    </div>
  );
}
