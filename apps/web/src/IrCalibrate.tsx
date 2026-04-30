import { useEffect, useMemo, useRef, useState } from "react";
import { PenDetector, type PenEvent, type Thresholds } from "@edraw/pen";

const DEFAULT_THR: Thresholds = {
  penThin: { min: 0, max: 1.2 },
  penThick: { min: 1.2, max: 2.5 },
  eraser: { min: 10, max: 30 },
};

const COLORS = { penThin: "#4cc9f0", penThick: "#f8961e" };
const TOOL_COLOR: Record<string, string> = {
  penThin: "#0077b6",
  penThick: "#f8961e",
  eraser: "#f72585",
  none: "#444",
};

const STORAGE_KEY = "edraw-pen-thresholds";

function loadThresholds(): Thresholds {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const d = JSON.parse(raw);
      if (d?.penThin && d?.penThick && d?.eraser) return d;
    }
  } catch {
    /* ignore */
  }
  return JSON.parse(JSON.stringify(DEFAULT_THR));
}

function saveThresholds(thr: Thresholds) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(thr));
  } catch {
    /* ignore */
  }
}

type CalPhase = "idle" | "reading" | "stopped";

type StrokePoint = { x: number; y: number; r: number };

export function IrCalibrate() {
  const drawCanvasRef = useRef<HTMLCanvasElement>(null);
  const liveCanvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const detectorRef = useRef<PenDetector | null>(null);

  const [thr, setThr] = useState<Thresholds>(() => loadThresholds());
  const [radMult, setRadMult] = useState(8);
  const [smXY, setSmXY] = useState(0.2);
  const [smP, setSmP] = useState(0.6);
  const [debug, setDebug] = useState<PenEvent | null>(null);

  const [calTool, setCalTool] = useState<keyof Thresholds | null>(null);
  const [calPhase, setCalPhase] = useState<CalPhase>("idle");
  const calStateRef = useRef({ min: Infinity, max: -Infinity, count: 0 });
  const [calLive, setCalLive] = useState<Record<string, string>>({});

  const strokePtsRef = useRef<StrokePoint[]>([]);
  const strokeToolRef = useRef<keyof typeof COLORS | null>(null);
  const erasePrevRef = useRef<{ x: number; y: number } | null>(null);

  const exitCalibrate = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete("ir-calibrate");
    window.location.href = url.toString();
  };

  // Resize canvases
  useEffect(() => {
    const resize = () => {
      const wrap = wrapRef.current;
      const dc = drawCanvasRef.current;
      const cc = liveCanvasRef.current;
      if (!wrap || !dc || !cc) return;
      const dpr = window.devicePixelRatio || 1;
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      [dc, cc].forEach((c) => {
        c.width = w * dpr;
        c.height = h * dpr;
        c.style.width = `${w}px`;
        c.style.height = `${h}px`;
        const ctx = c.getContext("2d");
        ctx?.scale(dpr, dpr);
      });
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  // Wire detector
  useEffect(() => {
    const dc = drawCanvasRef.current;
    if (!dc) return;
    const det = new PenDetector({
      element: dc,
      thresholds: thr,
      smooth: { xy: smXY, pressure: smP },
    });
    detectorRef.current = det;

    const cctx = liveCanvasRef.current?.getContext("2d");
    const dctx = dc.getContext("2d");
    if (!cctx || !dctx) return;

    const lineWidth = (pts: StrokePoint[]) => {
      const s = pts.slice(0, 8);
      return Math.max(
        1,
        (s.reduce((a, p) => a + p.r, 0) / s.length) * radMult || 2,
      );
    };

    const catmullRom = (
      ctx: CanvasRenderingContext2D,
      pts: StrokePoint[],
      color: string,
      lw: number,
    ) => {
      if (pts.length < 2) return;
      ctx.save();
      ctx.beginPath();
      ctx.lineWidth = lw;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = color;
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[Math.max(0, i - 1)];
        const p1 = pts[i];
        const p2 = pts[i + 1];
        const p3 = pts[Math.min(pts.length - 1, i + 2)];
        ctx.bezierCurveTo(
          p1.x + (p2.x - p0.x) / 6,
          p1.y + (p2.y - p0.y) / 6,
          p2.x - (p3.x - p1.x) / 6,
          p2.y - (p3.y - p1.y) / 6,
          p2.x,
          p2.y,
        );
      }
      ctx.stroke();
      ctx.restore();
    };

    const redrawActive = () => {
      const dpr = window.devicePixelRatio || 1;
      dctx.clearRect(0, 0, dc.width / dpr, dc.height / dpr);
      const tool = strokeToolRef.current;
      if (!tool) return;
      catmullRom(dctx, strokePtsRef.current, COLORS[tool], lineWidth(strokePtsRef.current));
    };

    const commitStroke = () => {
      const tool = strokeToolRef.current;
      if (!tool) return;
      catmullRom(cctx, strokePtsRef.current, COLORS[tool], lineWidth(strokePtsRef.current));
      const dpr = window.devicePixelRatio || 1;
      dctx.clearRect(0, 0, dc.width / dpr, dc.height / dpr);
    };

    const eraseSegment = (
      from: { x: number; y: number },
      to: { x: number; y: number },
    ) => {
      [cctx, dctx].forEach((ctx) => {
        ctx.save();
        ctx.globalCompositeOperation = "destination-out";
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.lineWidth = 50;
        ctx.lineCap = "round";
        ctx.strokeStyle = "rgba(0,0,0,1)";
        ctx.stroke();
        ctx.restore();
      });
    };

    const recordCal = (e: PenEvent | Record<string, never>) => {
      if (!calTool || calPhase !== "reading") return;
      const evt = e as PenEvent;
      const s = calStateRef.current;
      if (evt.metric < s.min) s.min = evt.metric;
      if (evt.metric > s.max) s.max = evt.metric;
      s.count++;
      const TOL = 0.15;
      const minV = Math.max(0, s.min - TOL);
      const maxV = s.max + TOL;
      setCalLive((prev) => ({
        ...prev,
        [calTool]:
          `actual: ${evt.metric.toFixed(3)}\nrango:  ${minV.toFixed(2)} – ${maxV.toFixed(2)}\n(${s.count} lecturas)`,
      }));
      // Update threshold inputs in real time
      setThr((cur) => ({
        ...cur,
        [calTool]: { min: minV, max: maxV },
      }));
    };

    det.on("pendown", (e) => {
      const evt = e as PenEvent;
      setDebug(evt);
      recordCal(evt);
      if (evt.tool === "eraser") {
        erasePrevRef.current = { x: evt.x, y: evt.y };
        return;
      }
      if (evt.tool === "none") return;
      strokePtsRef.current = [{ x: evt.x, y: evt.y, r: evt.radiusMag || 0 }];
      strokeToolRef.current = evt.tool;
    });

    det.on("penmove", (e) => {
      const evt = e as PenEvent;
      setDebug(evt);
      recordCal(evt);
      if (evt.tool === "eraser") {
        const prev = erasePrevRef.current;
        if (prev) eraseSegment(prev, evt);
        erasePrevRef.current = { x: evt.x, y: evt.y };
        return;
      }
      if (!strokeToolRef.current) return;
      strokePtsRef.current.push({ x: evt.x, y: evt.y, r: evt.radiusMag || 0 });
      redrawActive();
    });

    det.on("penup", () => {
      if (strokePtsRef.current.length > 1 && strokeToolRef.current) commitStroke();
      strokePtsRef.current = [];
      strokeToolRef.current = null;
      erasePrevRef.current = null;
      setDebug(null);
    });

    return () => {
      det.destroy();
      detectorRef.current = null;
    };
  }, [thr, smXY, smP, radMult, calPhase, calTool]);

  const handleStartCal = (tool: keyof Thresholds) => {
    if (calPhase === "idle") {
      calStateRef.current = { min: Infinity, max: -Infinity, count: 0 };
      setCalLive((p) => ({ ...p, [tool]: "Toca con el instrumento..." }));
      setCalTool(tool);
      setCalPhase("reading");
    } else if (calPhase === "reading" && calTool === tool) {
      const s = calStateRef.current;
      setCalLive((p) => ({
        ...p,
        [tool]:
          s.count > 0
            ? `Capturado: ${s.min.toFixed(2)} – ${s.max.toFixed(2)}\nEdita si necesitas.`
            : "Sin lecturas — edita manualmente",
      }));
      setCalPhase("stopped");
    } else if (calPhase === "stopped" && calTool === tool) {
      saveThresholds(thr);
      setCalLive((p) => ({
        ...p,
        [tool]: `Guardado: ${thr[tool].min.toFixed(2)} – ${thr[tool].max.toFixed(2)}`,
      }));
      setCalPhase("idle");
      setCalTool(null);
    }
  };

  const handleCancelCal = (tool: keyof Thresholds) => {
    setCalLive((p) => ({ ...p, [tool]: "Cancelado" }));
    setCalPhase("idle");
    setCalTool(null);
  };

  const handleClear = () => {
    const dc = drawCanvasRef.current;
    const cc = liveCanvasRef.current;
    if (!dc || !cc) return;
    const dpr = window.devicePixelRatio || 1;
    dc.getContext("2d")?.clearRect(0, 0, dc.width / dpr, dc.height / dpr);
    cc.getContext("2d")?.clearRect(0, 0, cc.width / dpr, cc.height / dpr);
  };

  const handleReset = () => {
    setThr(JSON.parse(JSON.stringify(DEFAULT_THR)));
    saveThresholds(DEFAULT_THR);
  };

  const handleSave = () => {
    saveThresholds(thr);
  };

  const updateThr = (
    tool: keyof Thresholds,
    bound: "min" | "max",
    value: number,
  ) => {
    setThr((cur) => ({
      ...cur,
      [tool]: { ...cur[tool], [bound]: value },
    }));
  };

  const toolLabel = useMemo(() => debug?.tool ?? "Ninguno", [debug]);
  const toolBg = TOOL_COLOR[toolLabel] || "#222";

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "#111",
        color: "#eee",
        fontFamily: "monospace",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Top bar */}
      <div
        style={{
          background: "#1a1a2e",
          padding: "8px 12px",
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
          borderBottom: "2px solid #0f3460",
          minHeight: 48,
        }}
      >
        <button
          onClick={exitCalibrate}
          style={{
            padding: "4px 10px",
            background: "#222",
            color: "#aaa",
            border: "1px solid #333",
            borderRadius: 6,
            cursor: "pointer",
            fontSize: 12,
            fontFamily: "monospace",
          }}
        >
          ← Volver
        </button>
        <div
          style={{
            padding: "3px 12px",
            borderRadius: 20,
            fontSize: 13,
            fontWeight: "bold",
            background: toolBg,
            color: toolLabel === "penThick" ? "#000" : "#fff",
            minWidth: 90,
            textAlign: "center",
          }}
        >
          {toolLabel}
        </div>
        <div style={{ fontSize: 10, color: "#666", lineHeight: 1.6 }}>
          pts:{debug?.pointCount ?? "—"} &nbsp;
          metric:{debug?.metric.toFixed(2) ?? "—"} &nbsp;
          rX:{debug?.radiusX.toFixed(2) ?? "—"} &nbsp;
          rY:{debug?.radiusY.toFixed(2) ?? "—"} &nbsp;
          √:{debug?.radiusMag.toFixed(2) ?? "—"}
          <br />
          bbox:{debug ? `${Math.round(debug.bboxW)}×${Math.round(debug.bboxH)}` : "—"} &nbsp;
          area:{debug ? Math.round(debug.bboxArea) : "—"}px² &nbsp;
          <span style={{ color: "#4cc9f0" }}>
            grosor:{debug ? ((debug.radiusMag || 0) * radMult).toFixed(1) : "—"}px
          </span>
        </div>
        <button onClick={handleClear} style={topBtnStyle}>Limpiar</button>
        <label style={inlineLabel}>
          ×rad
          <input
            type="number"
            value={radMult}
            min={1}
            max={200}
            onChange={(e) => setRadMult(Math.max(1, Number(e.target.value) || 1))}
            style={{
              width: 50,
              background: "#0a1525",
              border: "1px solid #1a3a5a",
              color: "#4cc9f0",
              fontFamily: "monospace",
              fontSize: 13,
              padding: "2px 5px",
              borderRadius: 4,
            }}
          />
        </label>
        <label style={inlineLabel}>
          sm-xy
          <input
            type="range"
            min={0}
            max={0.95}
            step={0.05}
            value={smXY}
            onChange={(e) => setSmXY(Number(e.target.value))}
            style={{ width: 60, accentColor: "#4cc9f0" }}
          />
          <span style={{ color: "#4cc9f0", minWidth: 28 }}>{smXY.toFixed(2)}</span>
        </label>
        <label style={inlineLabel}>
          sm-P
          <input
            type="range"
            min={0}
            max={0.95}
            step={0.05}
            value={smP}
            onChange={(e) => setSmP(Number(e.target.value))}
            style={{ width: 60, accentColor: "#f8961e" }}
          />
          <span style={{ color: "#f8961e", minWidth: 28 }}>{smP.toFixed(2)}</span>
        </label>
        <button onClick={handleSave} style={{ ...topBtnStyle, background: "#2d6a4f", color: "#fff", borderColor: "#2d6a4f" }}>
          ✓ Guardar umbrales
        </button>
        <span style={{ fontSize: 10, color: "#444", marginLeft: "auto" }}>v2.0 · IR</span>
      </div>

      {/* Canvas area + side panel */}
      <div ref={wrapRef} style={{ flex: 1, position: "relative" }}>
        <canvas
          ref={liveCanvasRef}
          style={{ position: "absolute", inset: 0, background: "#1a1a2e" }}
        />
        <canvas
          ref={drawCanvasRef}
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 1,
            touchAction: "none",
          }}
        />

        {/* Side calibration panel */}
        <div
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            bottom: 0,
            width: 250,
            background: "#16213e",
            borderLeft: "2px solid #0f3460",
            padding: 12,
            display: "flex",
            flexDirection: "column",
            gap: 10,
            overflowY: "auto",
            zIndex: 5,
          }}
        >
          <div style={{ fontSize: 12, color: "#aaa", borderBottom: "1px solid #0f3460", paddingBottom: 6 }}>
            Umbrales IR (radio px)
          </div>

          {(["penThin", "penThick", "eraser"] as const).map((tool) => {
            const active = calTool === tool;
            const phase = active ? calPhase : "idle";
            const labelMap = { penThin: "Lápiz fino", penThick: "Lápiz grueso", eraser: "Palma / Borrador" };
            const colorMap = { penThin: "#4cc9f0", penThick: "#f8961e", eraser: "#f72585" };
            return (
              <div
                key={tool}
                style={{
                  background: "#0d1b2a",
                  borderRadius: 6,
                  padding: 8,
                  display: "flex",
                  flexDirection: "column",
                  gap: 5,
                  border: `2px solid ${active ? "#f72585" : "transparent"}`,
                }}
              >
                <div style={{ fontSize: 11, fontWeight: "bold", color: colorMap[tool] }}>
                  ● {labelMap[tool]}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <label style={smallLabel}>
                    min
                    <input
                      type="number"
                      step={0.01}
                      value={thr[tool].min}
                      onChange={(e) => updateThr(tool, "min", Number(e.target.value))}
                      style={smallInput}
                    />
                  </label>
                  <label style={smallLabel}>
                    max
                    <input
                      type="number"
                      step={0.01}
                      value={thr[tool].max}
                      onChange={(e) => updateThr(tool, "max", Number(e.target.value))}
                      style={smallInput}
                    />
                  </label>
                </div>
                <div style={{ display: "flex", gap: 5 }}>
                  <button
                    onClick={() => handleStartCal(tool)}
                    style={{
                      flex: 1,
                      padding: "4px 6px",
                      border: "none",
                      borderRadius: 5,
                      background: phase === "reading" ? "#f72585" : phase === "stopped" ? "#2d6a4f" : "#1a3a5a",
                      color: "#fff",
                      cursor: "pointer",
                      fontFamily: "monospace",
                      fontSize: 11,
                    }}
                  >
                    {phase === "reading" ? "■ Parar" : phase === "stopped" ? "✓ Guardar" : "▶ Leer"}
                  </button>
                  {phase !== "idle" && (
                    <button
                      onClick={() => handleCancelCal(tool)}
                      style={{
                        padding: "4px 8px",
                        border: "none",
                        borderRadius: 5,
                        background: "#3a1020",
                        color: "#f72585",
                        cursor: "pointer",
                        fontFamily: "monospace",
                        fontSize: 11,
                      }}
                    >
                      ✕
                    </button>
                  )}
                </div>
                <div
                  style={{
                    fontSize: 10,
                    color: "#4cc9f0",
                    whiteSpace: "pre-line",
                    minHeight: 28,
                  }}
                >
                  {calLive[tool] || ""}
                </div>
              </div>
            );
          })}

          <div style={{ fontSize: 9, color: "#444", lineHeight: 1.5 }}>
            dedo ~2.5–10 = ninguno
          </div>
          <button
            onClick={handleReset}
            style={{
              marginTop: "auto",
              padding: 5,
              background: "#2a1010",
              color: "#f72585",
              border: "1px solid #f7258533",
              borderRadius: 5,
              cursor: "pointer",
              fontSize: 11,
              fontFamily: "monospace",
            }}
          >
            ↺ Defaults
          </button>
        </div>
      </div>
    </div>
  );
}

const topBtnStyle: React.CSSProperties = {
  padding: "4px 10px",
  background: "#222",
  color: "#aaa",
  border: "1px solid #333",
  borderRadius: 6,
  cursor: "pointer",
  fontFamily: "monospace",
  fontSize: 12,
};

const inlineLabel: React.CSSProperties = {
  fontSize: 11,
  color: "#aaa",
  display: "flex",
  alignItems: "center",
  gap: 4,
  whiteSpace: "nowrap",
};

const smallLabel: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
  fontSize: 9,
  color: "#666",
};

const smallInput: React.CSSProperties = {
  width: "100%",
  minWidth: 0,
  background: "#0a1525",
  border: "1px solid #1a3a5a",
  color: "#eee",
  fontFamily: "monospace",
  fontSize: 12,
  padding: "3px 4px",
  borderRadius: 4,
  boxSizing: "border-box",
};
