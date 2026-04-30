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
};

/**
 * Renders inside a Sidebar.Tab — kept narrow (~280px). Layout:
 *   [course select] → [topic pills] → [items list]
 */
export function LibraryCatalogPanel({ excalidrawAPI }: Props) {
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
        const first = c.courses[0];
        if (first) {
          setActiveCourse(first.id);
          setActiveTopic(first.topics[0]?.id ?? "");
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
    const next = catalog?.courses.find((c) => c.id === courseId);
    setActiveTopic(next?.topics[0]?.id ?? "");
  };

  const importLibrary = async (item: Item) => {
    if (!excalidrawAPI) {
      setStatusMsg("El editor no está listo.");
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
        openLibraryMenu: false,
      });
      setStatusMsg(`Añadida: ${item.name}`);
    } catch (e) {
      setStatusMsg(e instanceof Error ? e.message : "Error al importar");
    } finally {
      setImportingId(null);
    }
  };

  if (error) {
    return (
      <div style={{ padding: 14, color: "#991b1b", fontSize: 13 }}>
        Error: {error}
      </div>
    );
  }
  if (!catalog) {
    return (
      <div style={{ padding: 14, color: "#666", fontSize: 13 }}>
        Cargando catálogo...
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        fontFamily: "system-ui, sans-serif",
        fontSize: 13,
      }}
    >
      <div style={{ padding: "10px 12px 6px", fontWeight: 700, color: "var(--color-text)" }}>
        Catálogo educativo
      </div>

      {/* Course dropdown — compact for the narrow sidebar */}
      <div style={{ padding: "0 12px 8px" }}>
        <select
          value={activeCourse}
          onChange={(e) => handleCourseChange(e.target.value)}
          style={{
            width: "100%",
            padding: "6px 8px",
            border: "1px solid var(--default-border-color, #d1d5db)",
            borderRadius: 6,
            background: "var(--input-bg-color, white)",
            color: "var(--color-text, #1a1a2e)",
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          {catalog.courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {/* Topic pills */}
      {course && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 4,
            padding: "0 12px 8px",
          }}
        >
          {course.topics.map((t) => {
            const active = t.id === activeTopic;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTopic(t.id)}
                style={{
                  padding: "4px 10px",
                  background: active ? "#6965db" : "transparent",
                  color: active ? "white" : "var(--color-text, #374151)",
                  border: `1px solid ${active ? "#6965db" : "var(--default-border-color, #d1d5db)"}`,
                  borderRadius: 14,
                  cursor: "pointer",
                  fontSize: 11,
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

      {/* Items list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "4px 12px 12px" }}>
        {!topic || topic.items.length === 0 ? (
          <div
            style={{
              color: "var(--color-text-muted, #9ca3af)",
              fontSize: 12,
              textAlign: "center",
              padding: "32px 0",
            }}
          >
            Aún no hay recursos en este tema.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {topic.items.map((item) => (
              <div
                key={item.id}
                style={{
                  border: "1px solid var(--default-border-color, #e5e7eb)",
                  borderRadius: 8,
                  padding: 10,
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                  background: "var(--island-bg-color, white)",
                }}
              >
                <div style={{ fontWeight: 600, color: "var(--color-text, #1a1a2e)", fontSize: 13 }}>
                  {item.name}
                </div>
                {item.description && (
                  <div style={{ fontSize: 11, color: "var(--color-text-muted, #6b7280)" }}>
                    {item.description}
                  </div>
                )}
                <button
                  onClick={() => importLibrary(item)}
                  disabled={importingId === item.id}
                  style={{
                    padding: "5px 8px",
                    background: importingId === item.id ? "#c4c3f0" : "#6965db",
                    color: "white",
                    border: "none",
                    borderRadius: 5,
                    cursor: importingId === item.id ? "default" : "pointer",
                    fontSize: 12,
                    fontWeight: 500,
                  }}
                >
                  {importingId === item.id ? "Añadiendo..." : "Añadir a mi librería"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {statusMsg && (
        <div
          style={{
            padding: "6px 12px",
            borderTop: "1px solid var(--default-border-color, #eee)",
            fontSize: 11,
            color: "var(--color-text, #374151)",
            background: "var(--button-gray-1, #f9fafb)",
          }}
        >
          {statusMsg}
        </div>
      )}
    </div>
  );
}
