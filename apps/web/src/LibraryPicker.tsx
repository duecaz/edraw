import { useEffect, useMemo, useState } from "react";

type Category = { id: string; name: string };
type Item = {
  id: string;
  name: string;
  description?: string;
  category: string;
  file: string;
};
type Catalog = { version: number; categories: Category[]; items: Item[] };

type Props = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  excalidrawAPI: any | null;
  onClose: () => void;
};

export function LibraryPicker({ excalidrawAPI, onClose }: Props) {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeCat, setActiveCat] = useState<string>("");
  const [importingId, setImportingId] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch("/libraries/catalog.json")
      .then((r) => {
        if (!r.ok) throw new Error("No se pudo cargar el catálogo");
        return r.json() as Promise<Catalog>;
      })
      .then((c) => {
        setCatalog(c);
        setActiveCat(c.categories[0]?.id || "");
      })
      .catch((e) => setError(e.message));
  }, []);

  const visibleItems = useMemo(() => {
    if (!catalog) return [];
    return catalog.items.filter((i) => i.category === activeCat);
  }, [catalog, activeCat]);

  const importLibrary = async (item: Item) => {
    if (!excalidrawAPI) {
      setStatusMsg("El editor todavía no está listo.");
      return;
    }
    setImportingId(item.id);
    setStatusMsg(null);
    try {
      const res = await fetch(`/libraries/${item.file}`);
      if (!res.ok) throw new Error("No se pudo descargar la librería");
      const data = await res.json();
      const libraryItems = data.libraryItems || [];
      await excalidrawAPI.updateLibrary({
        libraryItems,
        prependItems: true,
        openLibraryMenu: true,
      });
      setStatusMsg(`Añadida: ${item.name}`);
    } catch (e) {
      setStatusMsg(e instanceof Error ? e.message : "Error al importar");
    } finally {
      setImportingId(null);
    }
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
          width: "min(820px, 92vw)",
          height: "min(560px, 84vh)",
          borderRadius: 12,
          boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 20px",
            borderBottom: "1px solid #eee",
          }}
        >
          <div style={{ fontSize: 16, fontWeight: 700, color: "#1a1a2e" }}>
            Catálogo educativo
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

        {!catalog && !error && (
          <div style={{ padding: 24, color: "#666" }}>Cargando catálogo...</div>
        )}
        {error && (
          <div style={{ padding: 24, color: "#991b1b" }}>Error: {error}</div>
        )}

        {catalog && (
          <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
            <nav
              style={{
                width: 180,
                borderRight: "1px solid #eee",
                padding: 8,
                overflowY: "auto",
                background: "#fafafa",
              }}
            >
              {catalog.categories.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setActiveCat(c.id)}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    padding: "8px 12px",
                    margin: "2px 0",
                    background: activeCat === c.id ? "#6965db" : "transparent",
                    color: activeCat === c.id ? "white" : "#374151",
                    border: "none",
                    borderRadius: 6,
                    cursor: "pointer",
                    fontSize: 13,
                  }}
                >
                  {c.name}
                </button>
              ))}
            </nav>

            <div style={{ flex: 1, padding: 16, overflowY: "auto" }}>
              {visibleItems.length === 0 && (
                <div style={{ color: "#666", fontSize: 14 }}>
                  Sin librerías en esta categoría todavía.
                </div>
              )}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                  gap: 12,
                }}
              >
                {visibleItems.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      border: "1px solid #e5e7eb",
                      borderRadius: 10,
                      padding: 14,
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                      background: "white",
                    }}
                  >
                    <div style={{ fontWeight: 600, color: "#1a1a2e" }}>
                      {item.name}
                    </div>
                    {item.description && (
                      <div style={{ fontSize: 12, color: "#6b7280", flex: 1 }}>
                        {item.description}
                      </div>
                    )}
                    <button
                      onClick={() => importLibrary(item)}
                      disabled={importingId === item.id}
                      style={{
                        marginTop: "auto",
                        padding: "6px 10px",
                        background: importingId === item.id ? "#c4c3f0" : "#6965db",
                        color: "white",
                        border: "none",
                        borderRadius: 6,
                        cursor: importingId === item.id ? "default" : "pointer",
                        fontSize: 13,
                      }}
                    >
                      {importingId === item.id ? "Añadiendo..." : "Añadir"}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {statusMsg && (
          <div
            style={{
              padding: "8px 20px",
              borderTop: "1px solid #eee",
              fontSize: 13,
              color: "#374151",
              background: "#f9fafb",
            }}
          >
            {statusMsg}
          </div>
        )}
      </div>
    </div>
  );
}
