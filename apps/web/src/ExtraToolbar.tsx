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

type ToolDef = {
  id: string;
  title: string;
  icon: React.ReactNode;
  onActivate: (api: NonNullable<Props["excalidrawAPI"]>) => void;
  isActive?: (toolType: string) => boolean;
};

const TOOLS: ToolDef[] = [
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

export function ExtraToolbar({ excalidrawAPI, anchorBottom }: Props) {
  const [activeTool, setActiveToolState] = useState<string>("");

  useEffect(() => {
    if (!excalidrawAPI) return;
    // Excalidraw exposes onChange via the component prop. We listen via
    // polling — cheaper than re-wiring onChange and only needs to be
    // accurate for visual highlight, not for behaviour.
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
      style={{
        position: "fixed",
        bottom: anchorBottom ? 16 : "auto",
        top: anchorBottom ? "auto" : 12,
        right: 16,
        zIndex: 4,
        display: "flex",
        gap: 2,
        background: "var(--island-bg-color, #ffffff)",
        borderRadius: 12,
        padding: 6,
        boxShadow:
          "var(--shadow-island, 0 0 0 1px rgba(0,0,0,0.05), 0 2px 4px 0 rgba(0,0,0,0.04))",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      {TOOLS.map((tool) => {
        const active = tool.isActive ? tool.isActive(activeTool) : false;
        return (
          <button
            key={tool.id}
            onClick={() => tool.onActivate(excalidrawAPI)}
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
      })}
    </div>
  );
}
