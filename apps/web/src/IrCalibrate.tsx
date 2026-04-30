import { useEffect, useMemo, useRef, useState } from "react";
import type { Thresholds } from "@edraw/pen";

const DEFAULT_THR: Thresholds = {
  penThin: { min: 0, max: 3.08 },
  penThick: { min: 3.9, max: 5.0 },
  finger: { min: 5.01, max: 10.0 },
  eraser: { min: 10.01, max: 70.0 },
};

const BAND_ORDER: (keyof Thresholds)[] = ["penThin", "penThick", "finger", "eraser"];

const BAND_META: Record<keyof Thresholds, { name: string; color: string }> = {
  penThin: { name: "Punta fina", color: "#4cc9f0" },
  penThick: { name: "Punta gruesa", color: "#f8961e" },
  finger: { name: "Dedo", color: "#9d4edd" },
  eraser: { name: "Palma", color: "#f72585" },
};

const STORAGE_KEY = "edraw-pen-thresholds";
const GAP = 0.01;

function loadThresholds(): Thresholds {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const d = JSON.parse(raw);
      // Backwards compat: old data without "finger" — patch with default.
      if (d?.penThin && d?.penThick && d?.eraser) {
        return {
          penThin: d.penThin,
          penThick: d.penThick,
          finger: d.finger ?? DEFAULT_THR.finger,
          eraser: d.eraser,
        };
      }
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

/**
 * Enforce that bands appear in ascending, non-overlapping order. When the
 * user edits one bound, push neighbouring bands by GAP so ranges never
 * intersect. Returns a new Thresholds object.
 */
function normalize(
  thr: Thresholds,
  edited?: { band: keyof Thresholds; bound: "min" | "max" },
): Thresholds {
  const out: Thresholds = {
    penThin: { ...thr.penThin },
    penThick: { ...thr.penThick },
    finger: { ...thr.finger },
    eraser: { ...thr.eraser },
  };
  // Pass forward (left-to-right): each band's min ≥ previous band's max + GAP
  for (let i = 1; i < BAND_ORDER.length; i++) {
    const prev = BAND_ORDER[i - 1];
    const cur = BAND_ORDER[i];
    if (out[cur].min < out[prev].max + GAP) {
      if (edited && edited.band === prev) {
        out[cur].min = +(out[prev].max + GAP).toFixed(2);
      } else {
        out[prev].max = +(out[cur].min - GAP).toFixed(2);
      }
    }
    if (out[cur].max < out[cur].min) {
      out[cur].max = +(out[cur].min + 0.5).toFixed(2);
    }
  }
  return out;
}

type SourceInfo = {
  type: string;
  metric: number;
  pressure: number;
  width: number;
  height: number;
};

type StrokePoint = { x: number; y: number; r: number };

export function IrCalibrate() {
  const drawCanvasRef = useRef<HTMLCanvasElement>(null);
  const liveCanvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const strokePtsRef = useRef<StrokePoint[]>([]);

  const [thr, setThr] = useState<Thresholds>(() => loadThresholds());
  const [calBand, setCalBand] = useState<keyof Thresholds | null>(null);
  const calStateRef = useRef({ min: Infinity, max: -Infinity, count: 0 });
  const [source, setSource] = useState<SourceInfo>({
    type: "—",
    metric: 0,
    pressure: 0,
    width: 0,
    height: 0,
  });

  const exitCalibrate = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete("ir-calibrate");
    window.location.href = url.toString();
  };

  // Resize canvases to wrapper size
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

  // Pointer-based capture so the same metric (W+H)/4 is used as in IR mode.
  useEffect(() => {
    const dc = drawCanvasRef.current;
    if (!dc) return;
    const dctx = dc.getContext("2d");
    const cctx = liveCanvasRef.current?.getContext("2d");
    if (!dctx || !cctx) return;

    let activePointerId: number | null = null;
    let activeBand: keyof Thresholds | "none" = "none";

    const classify = (m: number, t: Thresholds): keyof Thresholds | "none" => {
      if (m >= t.penThin.min && m <= t.penThin.max) return "penThin";
      if (m >= t.penThick.min && m <= t.penThick.max) return "penThick";
      if (m >= t.finger.min && m <= t.finger.max) return "finger";
      if (m >= t.eraser.min && m <= t.eraser.max) return "eraser";
      return "none";
    };

    const onPointerDown = (e: PointerEvent) => {
      if (!dc.contains(e.target as Node)) return;
      e.preventDefault();
      activePointerId = e.pointerId;
      const w = e.width || 0;
      const h = e.height || 0;
      const metric = (w + h) / 4;
      const tool = classify(metric, thr);
      activeBand = tool;
      setSource({
        type: e.pointerType || "unknown",
        metric,
        pressure: e.pressure || 0,
        width: w,
        height: h,
      });
      // Calibration capture
      if (calBand) {
        const s = calStateRef.current;
        if (metric < s.min) s.min = metric;
        if (metric > s.max) s.max = metric;
        s.count++;
      }
      const rect = dc.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      strokePtsRef.current = [{ x, y, r: Math.max(w, h) / 2 }];
    };

    const onPointerMove = (e: PointerEvent) => {
      if (activePointerId !== e.pointerId) return;
      const w = e.width || 0;
      const h = e.height || 0;
      const metric = (w + h) / 4;
      setSource({
        type: e.pointerType || "unknown",
        metric,
        pressure: e.pressure || 0,
        width: w,
        height: h,
      });
      if (calBand) {
        const s = calStateRef.current;
        if (metric < s.min) s.min = metric;
        if (metric > s.max) s.max = metric;
        s.count++;
      }
      const rect = dc.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      strokePtsRef.current.push({ x, y, r: Math.max(w, h) / 2 });
      drawActiveStroke();
    };

    const onPointerUp = (e: PointerEvent) => {
      if (activePointerId !== e.pointerId) return;
      activePointerId = null;
      // Erase strokes if the pointer was eraser
      if (activeBand === "eraser") {
        strokePtsRef.current.forEach((p) => eraseAt(p.x, p.y));
      } else if (activeBand !== "none" && strokePtsRef.current.length > 1) {
        commitStroke(activeBand);
      }
      strokePtsRef.current = [];
      activeBand = "none";
    };

    const drawActiveStroke = () => {
      const pts = strokePtsRef.current;
      if (pts.length < 2) return;
      const dpr = window.devicePixelRatio || 1;
      dctx.clearRect(0, 0, dc.width / dpr, dc.height / dpr);
      const color = BAND_META[activeBand as keyof Thresholds]?.color ?? "#666";
      drawCatmull(dctx, pts, color);
    };

    const commitStroke = (band: keyof Thresholds) => {
      const pts = strokePtsRef.current;
      const color = BAND_META[band].color;
      drawCatmull(cctx, pts, color);
      const dpr = window.devicePixelRatio || 1;
      dctx.clearRect(0, 0, dc.width / dpr, dc.height / dpr);
    };

    const eraseAt = (x: number, y: number) => {
      [cctx, dctx].forEach((ctx) => {
        ctx.save();
        ctx.globalCompositeOperation = "destination-out";
        ctx.beginPath();
        ctx.arc(x, y, 25, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });
    };

    dc.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    return () => {
      dc.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
  }, [thr, calBand]);

  const startDetect = (band: keyof Thresholds) => {
    calStateRef.current = { min: Infinity, max: -Infinity, count: 0 };
    setCalBand(band);
  };

  const stopDetect = (band: keyof Thresholds) => {
    const s = calStateRef.current;
    if (s.count > 0) {
      const newRange = {
        min: Math.max(0, +(s.min - 0.05).toFixed(2)),
        max: +(s.max + 0.05).toFixed(2),
      };
      const next = normalize({ ...thr, [band]: newRange }, { band, bound: "max" });
      setThr(next);
      saveThresholds(next);
    }
    setCalBand(null);
  };

  const resetBand = (band: keyof Thresholds) => {
    const next = normalize({ ...thr, [band]: { ...DEFAULT_THR[band] } });
    setThr(next);
    saveThresholds(next);
  };

  const resetAll = () => {
    const def: Thresholds = JSON.parse(JSON.stringify(DEFAULT_THR));
    setThr(def);
    saveThresholds(def);
  };

  const updateBound = (
    band: keyof Thresholds,
    bound: "min" | "max",
    value: number,
  ) => {
    const next = normalize(
      { ...thr, [band]: { ...thr[band], [bound]: value } },
      { band, bound },
    );
    setThr(next);
  };

  const saveProfile = () => {
    saveThresholds(thr);
  };

  const detectedTool = useMemo(() => {
    const m = source.metric;
    for (const b of BAND_ORDER) {
      if (m >= thr[b].min && m <= thr[b].max) return b;
    }
    return "none" as const;
  }, [source.metric, thr]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "#1a1a2e",
        color: "#eee",
        fontFamily: "system-ui, -apple-system, sans-serif",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          background:
            detectedTool !== "none"
              ? BAND_META[detectedTool].color
              : "#16213e",
          padding: "16px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "2px solid #0f3460",
          transition: "background 0.15s",
        }}
      >
        <div>
          <div style={{ fontSize: 28, fontWeight: 800 }}>
            {detectedTool !== "none" ? BAND_META[detectedTool].name : "Sin detectar"}
          </div>
          <div style={{ fontSize: 13, opacity: 0.85, marginTop: 2 }}>
            {source.type} → {detectedTool === "none" ? "—" : detectedTool}
          </div>
        </div>
        <div
          style={{
            fontFamily: "monospace",
            fontSize: 12,
            display: "grid",
            gridTemplateColumns: "auto auto",
            columnGap: 12,
            rowGap: 2,
            textAlign: "right",
          }}
        >
          <span>source</span>
          <strong>{source.type}</strong>
          <span>metric</span>
          <strong>{source.metric.toFixed(2)}</strong>
          <span>pressure</span>
          <strong>{source.pressure.toFixed(2)}</strong>
          <span>size W×H</span>
          <strong>
            {source.width.toFixed(2)}×{source.height.toFixed(2)}
          </strong>
        </div>
      </div>

      {/* Test area + bands panel */}
      <div ref={wrapRef} style={{ flex: 1, position: "relative", minHeight: 200 }}>
        <canvas
          ref={liveCanvasRef}
          style={{ position: "absolute", inset: 0, background: "#0d1b2a" }}
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
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#3a4a6a",
            fontSize: 18,
            pointerEvents: "none",
            userSelect: "none",
          }}
        >
          ÁREA DE PRUEBA — toca/dibuja aquí
        </div>
      </div>

      {/* Bandas */}
      <div style={{ background: "#0d1b2a", borderTop: "2px solid #0f3460", padding: "12px 16px" }}>
        <div style={{ fontSize: 12, color: "#9aa", marginBottom: 8, fontWeight: 600 }}>
          Bandas (métrica = (W+H)/4)
        </div>
        <table style={{ width: "100%", borderSpacing: "0 4px" }}>
          <tbody>
            {BAND_ORDER.map((band) => {
              const meta = BAND_META[band];
              const range = thr[band];
              const detecting = calBand === band;
              return (
                <tr key={band}>
                  <td style={{ width: 130, color: meta.color, fontWeight: 600, fontSize: 13 }}>
                    {meta.name}
                  </td>
                  <td style={{ width: 50, textAlign: "right", color: "#9aa", fontSize: 11, paddingRight: 6 }}>
                    min
                  </td>
                  <td style={{ width: 80 }}>
                    <input
                      type="number"
                      step={0.01}
                      value={range.min}
                      onChange={(e) => updateBound(band, "min", Number(e.target.value))}
                      onBlur={() => saveThresholds(thr)}
                      style={inputStyle}
                    />
                  </td>
                  <td style={{ width: 50, textAlign: "right", color: "#9aa", fontSize: 11, paddingRight: 6 }}>
                    max
                  </td>
                  <td style={{ width: 80 }}>
                    <input
                      type="number"
                      step={0.01}
                      value={range.max}
                      onChange={(e) => updateBound(band, "max", Number(e.target.value))}
                      onBlur={() => saveThresholds(thr)}
                      style={inputStyle}
                    />
                  </td>
                  <td style={{ width: 110, paddingLeft: 8 }}>
                    <button
                      onClick={() => (detecting ? stopDetect(band) : startDetect(band))}
                      disabled={!!calBand && !detecting}
                      style={{
                        ...actionBtn,
                        background: detecting ? meta.color : "#3a5fb0",
                        color: detecting ? "#000" : "#fff",
                        opacity: !!calBand && !detecting ? 0.3 : 1,
                      }}
                    >
                      {detecting ? "TERMINAR" : "DETECTAR"}
                    </button>
                  </td>
                  <td style={{ width: 90, paddingLeft: 4 }}>
                    <button onClick={() => resetBand(band)} style={resetBtn}>
                      Reiniciar
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Footer actions */}
      <div
        style={{
          padding: "10px 16px",
          background: "#0a1525",
          borderTop: "1px solid #0f3460",
          display: "flex",
          gap: 8,
          alignItems: "center",
        }}
      >
        <button
          onClick={saveProfile}
          style={{
            padding: "8px 16px",
            background: "#2d6a4f",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            cursor: "pointer",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          Guardar perfil
        </button>
        <button
          onClick={resetAll}
          style={{
            padding: "8px 16px",
            background: "#3a1020",
            color: "#f72585",
            border: "1px solid #f7258544",
            borderRadius: 6,
            cursor: "pointer",
            fontSize: 13,
          }}
        >
          Reiniciar todo
        </button>
        <div style={{ flex: 1 }} />
        <button
          onClick={exitCalibrate}
          style={{
            padding: "8px 16px",
            background: "#222",
            color: "#aaa",
            border: "1px solid #333",
            borderRadius: 6,
            cursor: "pointer",
            fontSize: 13,
          }}
        >
          ← Volver al editor
        </button>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "#0a1525",
  border: "1px solid #1a3a5a",
  color: "#eee",
  fontFamily: "monospace",
  fontSize: 13,
  padding: "5px 8px",
  borderRadius: 4,
  boxSizing: "border-box",
};

const actionBtn: React.CSSProperties = {
  width: "100%",
  padding: "5px 8px",
  border: "none",
  borderRadius: 4,
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: 0.5,
};

const resetBtn: React.CSSProperties = {
  width: "100%",
  padding: "5px 8px",
  background: "#222",
  color: "#aaa",
  border: "1px solid #333",
  borderRadius: 4,
  cursor: "pointer",
  fontSize: 12,
};

function drawCatmull(
  ctx: CanvasRenderingContext2D,
  pts: StrokePoint[],
  color: string,
) {
  if (pts.length < 2) return;
  const lw = Math.max(1, (pts.slice(0, 8).reduce((a, p) => a + p.r, 0) / Math.min(pts.length, 8)) * 2);
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
}
