import { useEffect, useState } from "react";

type Props = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  excalidrawAPI: any | null;
  /** Anchor at bottom (true) or top (false) of viewport. */
  anchorBottom: boolean;
};

const ICON_SIZE = 18;

const iconStyle: React.CSSProperties = {
  width: ICON_SIZE,
  height: ICON_SIZE,
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

const UndoIcon = (
  <svg viewBox="0 0 24 24" style={iconStyle}>
    <path d="M9 13l-4-4 4-4" />
    <path d="M5 9h9a5 5 0 010 10h-3" />
  </svg>
);

const RedoIcon = (
  <svg viewBox="0 0 24 24" style={iconStyle}>
    <path d="M15 13l4-4-4-4" />
    <path d="M19 9h-9a5 5 0 100 10h3" />
  </svg>
);

const LibraryIcon = (
  <svg viewBox="0 0 24 24" style={iconStyle}>
    <path d="M4 4h6v16H4zM10 4h6v16h-6z" />
    <path d="M16 4l4 1v15l-4-1" />
  </svg>
);

const FrameIcon = (
  <svg viewBox="0 0 24 24" style={iconStyle}>
    <path d="M4 4h4M4 4v4M16 4h4M20 4v4M4 16v4M4 20h4M16 20h4M20 16v4" />
    <rect x="7" y="7" width="10" height="10" rx="1" />
  </svg>
);

const LaserIcon = (
  <svg viewBox="0 0 24 24" style={iconStyle}>
    <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
    <path d="M12 4v3M12 17v3M4 12h3M17 12h3M6.5 6.5l2.1 2.1M15.4 15.4l2.1 2.1M6.5 17.5l2.1-2.1M15.4 8.6l2.1-2.1" />
  </svg>
);

const MermaidIcon = (
  <svg viewBox="0 0 24 24" style={iconStyle}>
    <rect x="3" y="3" width="6" height="4" rx="1" />
    <rect x="15" y="3" width="6" height="4" rx="1" />
    <rect x="9" y="17" width="6" height="4" rx="1" />
    <path d="M6 7v3M18 7v3M6 10h12M12 10v7" />
  </svg>
);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Api = any;

type ToolDef = {
  id: string;
  title: string;
  icon: React.ReactNode;
  onActivate: (api: Api) => void;
  isActive?: (toolType: string) => boolean;
};

// Undo/redo trigger the original Excalidraw buttons (kept in the DOM but
// CSS-hidden) — public API doesn't expose history.undo()/redo().
function clickHidden(selector: string) {
  const btn = document.querySelector<HTMLButtonElement>(selector);
  btn?.click();
}

const HISTORY_TOOLS: ToolDef[] = [
  {
    id: "undo",
    title: "Deshacer  (Ctrl+Z)",
    icon: UndoIcon,
    onActivate: () => clickHidden(".undo-button-container button"),
  },
  {
    id: "redo",
    title: "Rehacer  (Ctrl+Y)",
    icon: RedoIcon,
    onActivate: () => clickHidden(".redo-button-container button"),
  },
];

const SIDEBAR_TOOLS: ToolDef[] = [
  {
    id: "library",
    title: "Biblioteca / Catálogo",
    icon: LibraryIcon,
    onActivate: (api) => api.toggleSidebar({ name: "default" }),
  },
];

const SHAPE_TOOLS: ToolDef[] = [
  {
    id: "laser",
    title: "Puntero láser",
    icon: LaserIcon,
    onActivate: (api) => api.setActiveTool({ type: "laser" }),
    isActive: (t) => t === "laser",
  },
  {
    id: "frame",
    title: "Marco / Frame",
    icon: FrameIcon,
    onActivate: (api) => api.setActiveTool({ type: "frame" }),
    isActive: (t) => t === "frame",
  },
  {
    id: "mermaid",
    title: "Mermaid → diagrama",
    icon: MermaidIcon,
    onActivate: (api) =>
      api.updateScene({
        appState: { openDialog: { name: "ttd", tab: "mermaid" } },
      }),
  },
];

const Divider = () => (
  <div
    style={{
      width: 1,
      alignSelf: "stretch",
      margin: "2px 4px",
      background: "var(--default-border-color, #e5e7eb)",
    }}
  />
);

function ToolButton({
  tool,
  active,
  api,
}: {
  tool: ToolDef;
  active: boolean;
  api: Api;
}) {
  return (
    <button
      onClick={() => tool.onActivate(api)}
      title={tool.title}
      aria-label={tool.title}
      style={{
        width: 36,
        height: 36,
        background: active
          ? "var(--color-primary-light, #e0dfff)"
          : "transparent",
        color: active
          ? "var(--color-primary, #6965db)"
          : "var(--icon-fill-color, #1b1b1f)",
        border: "none",
        borderRadius: 6,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "background 0.12s",
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.background =
            "var(--button-hover-bg, #f0f0f5)";
        }
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.background = "transparent";
      }}
    >
      {tool.icon}
    </button>
  );
}

export function ExtraToolbar({ excalidrawAPI, anchorBottom }: Props) {
  const [activeTool, setActiveToolState] = useState<string>("");

  useEffect(() => {
    if (!excalidrawAPI) return;
    const tick = () => {
      const t = excalidrawAPI.getAppState?.()?.activeTool?.type ?? "";
      setActiveToolState(t);
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [excalidrawAPI]);

  if (!excalidrawAPI) return null;

  return (
    <div
      className="edraw-extra-toolbar"
      style={{
        position: "fixed",
        bottom: anchorBottom ? 16 : "auto",
        top: anchorBottom ? "auto" : 12,
        right: 16,
        zIndex: 4,
        display: "flex",
        gap: 2,
        alignItems: "center",
        background: "var(--island-bg-color, #ffffff)",
        borderRadius: 12,
        padding: 6,
        boxShadow:
          "var(--shadow-island, 0 0 0 1px rgba(0,0,0,0.05), 0 2px 4px 0 rgba(0,0,0,0.04))",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      {HISTORY_TOOLS.map((tool) => (
        <ToolButton key={tool.id} tool={tool} active={false} api={excalidrawAPI} />
      ))}
      <Divider />
      {SIDEBAR_TOOLS.map((tool) => (
        <ToolButton key={tool.id} tool={tool} active={false} api={excalidrawAPI} />
      ))}
      <Divider />
      {SHAPE_TOOLS.map((tool) => (
        <ToolButton
          key={tool.id}
          tool={tool}
          active={tool.isActive ? tool.isActive(activeTool) : false}
          api={excalidrawAPI}
        />
      ))}
    </div>
  );
}
