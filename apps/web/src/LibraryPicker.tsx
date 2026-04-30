import { useEffect, useMemo, useState } from "react";

type Item = {
  id: string;
  name: string;
  description?: string;
  file: string;
};
type Topic = { id: string; name: string; items: Item[] };
type Course = { id: string; name: string; topics: Topic[] };
type Catalog = { version: number; courses: Course[] };

type Props = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  excalidrawAPI: any | null;
  onClose: () => void;
};

export function LibraryPicker({ excalidrawAPI, onClose }: Props) {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeCourse, setActiveCourse] = useState<string>("");
  const [activeTopic, setActiveTopic] = useState<string>("");
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
        const firstCourse = c.courses[0];
        if (firstCourse) {
          setActiveCourse(firstCourse.id);
          setActiveTopic(firstCourse.topics[0]?.id ?? "");
        }
      })
      .catch((e) => setError(e.message));
  }, []);

  const course = useMemo(
    () => catalog?.courses.find((c) => c.id === activeCourse) ?? null,
    [catalog, activeCourse],
  );

  const topic = useMemo(
    () => course?.topics.find((t) => t.id === activeTopic) ?? null,
    [course, activeTopic],
  );

  const handleCourseChange = (courseId: string) => {
    setActiveCourse(courseId);
    const newCourse = catalog?.courses.find((c) => c.id === courseId);
    setActiveTopic(newCourse?.topics[0]?.id ?? "");
  };

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
          width: "min(900px, 94vw)",
          height: "min(620px, 88vh)",
          borderRadius: 12,
          boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
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
          <>
            {/* Course tabs (curso) */}
            <div
              style={{
                display: "flex",
                gap: 4,
                padding: "8px 16px 0",
                borderBottom: "2px solid #eee",
                overflowX: "auto",
              }}
            >
              {catalog.courses.map((c) => {
                const active = c.id === activeCourse;
                return (
                  <button
                    key={c.id}
                    onClick={() => handleCourseChange(c.id)}
                    style={{
                      padding: "10px 16px",
                      background: active ? "white" : "transparent",
                      color: active ? "#6965db" : "#6b7280",
                      border: "none",
                      borderBottom: active ? "3px solid #6965db" : "3px solid transparent",
                      cursor: "pointer",
                      fontSize: 14,
                      fontWeight: active ? 700 : 500,
                      whiteSpace: "nowrap",
                      marginBottom: -2,
                    }}
                  >
                    {c.name}
                  </button>
                );
              })}
            </div>

            {/* Topic subtabs (tema) */}
            {course && (
              <div
                style={{
                  display: "flex",
                  gap: 6,
                  padding: "10px 16px",
                  borderBottom: "1px solid #eee",
                  background: "#fafafa",
                  overflowX: "auto",
                }}
              >
                {course.topics.map((t) => {
                  const active = t.id === activeTopic;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setActiveTopic(t.id)}
                      style={{
                        padding: "5px 12px",
                        background: active ? "#6965db" : "white",
                        color: active ? "white" : "#374151",
                        border: `1px solid ${active ? "#6965db" : "#e5e7eb"}`,
                        borderRadius: 16,
                        cursor: "pointer",
                        fontSize: 12,
                        fontWeight: 500,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {t.name}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Items grid */}
            <div style={{ flex: 1, padding: 16, overflowY: "auto" }}>
              {!topic || topic.items.length === 0 ? (
                <div style={{ color: "#9ca3af", fontSize: 14, textAlign: "center", padding: "40px 0" }}>
                  Aún no hay recursos en este tema.
                </div>
              ) : (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                    gap: 12,
                  }}
                >
                  {topic.items.map((item) => (
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
                        {importingId === item.id ? "Añadiendo..." : "Añadir al editor"}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
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
