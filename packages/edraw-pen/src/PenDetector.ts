// IR touchscreen pen detector.
// Classifies a touch as penThin / penThick / eraser / none from contact radius,
// applies palm rejection (locks the first touch ID), smooths XY and pressure,
// and emits pendown / penmove / penup events.
//
// Adapted from https://github.com/alguiendc/pen (MIT) — TypeScript port.

export const VERSION = "2.0";

export type Tool = "penThin" | "penThick" | "eraser" | "none";

export type ThresholdRange = { min: number; max: number };

export type Thresholds = {
  penThin: ThresholdRange;
  penThick: ThresholdRange;
  eraser: ThresholdRange;
};

export type SmoothOptions = {
  xy?: number;
  pressure?: number;
};

export type PenDetectorOptions = {
  element: HTMLElement;
  thresholds?: Partial<Thresholds>;
  smooth?: SmoothOptions;
  /**
   * When true, do not call preventDefault on touch events. Use this when
   * the detector runs alongside another library that needs the same events
   * (e.g. Excalidraw's pointer-based drawing). Defaults to false.
   */
  passive?: boolean;
};

export type PenEvent = {
  x: number;
  y: number;
  tool: Tool;
  pressure: number;
  velocity: number;
  metric: number;
  pointCount: number;
  radiusX: number;
  radiusY: number;
  radiusMag: number;
  bboxW: number;
  bboxH: number;
  bboxArea: number;
};

type EventName = "pendown" | "penmove" | "penup";
type Listener = (evt: PenEvent | Record<string, never>) => void;

const DEFAULTS: Thresholds = {
  penThin: { min: 0, max: 1.2 },
  penThick: { min: 1.2, max: 2.5 },
  eraser: { min: 10, max: 30 },
  // 2.5–10 = finger → 'none'
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

export class PenDetector {
  private el: HTMLElement;
  private thr: Thresholds;
  private listeners: Partial<Record<EventName, Listener[]>> = {};

  private strokeTool: Tool | null = null;
  private trackId: number | null = null;

  private smXY: number;
  private smP: number;
  private sPos: { x: number; y: number } | null = null;
  private velPos: { x: number; y: number; t: number } | null = null;
  private sP = 0.5;

  private onTouchStart: (e: TouchEvent) => void;
  private onTouchMove: (e: TouchEvent) => void;
  private onTouchEnd: (e: TouchEvent) => void;

  constructor({ element, thresholds, smooth = {}, passive = false }: PenDetectorOptions) {
    if (!element) throw new Error("PenDetector: element required");
    this.el = element;
    this.thr = {
      penThin: { ...DEFAULTS.penThin, ...thresholds?.penThin },
      penThick: { ...DEFAULTS.penThick, ...thresholds?.penThick },
      eraser: { ...DEFAULTS.eraser, ...thresholds?.eraser },
    };
    this.smXY = clamp(smooth.xy ?? 0.2, 0, 0.95);
    this.smP = clamp(smooth.pressure ?? 0.6, 0, 0.95);

    if (!passive) {
      this.el.style.touchAction = "none";
    }

    this.onTouchStart = (e) => {
      if (!passive) e.preventDefault();
      this.handle(e);
    };
    this.onTouchMove = (e) => {
      if (!passive) e.preventDefault();
      this.handle(e);
    };
    this.onTouchEnd = (e) => {
      if (!passive) e.preventDefault();
      const trackedLifted =
        this.trackId !== null &&
        Array.from(e.changedTouches).some((t) => t.identifier === this.trackId);
      if (!e.touches.length || trackedLifted) {
        this.strokeTool = null;
        this.trackId = null;
        this.sPos = null;
        this.velPos = null;
        this.sP = 0.5;
        this.emit("penup", {});
      }
    };

    const opts: AddEventListenerOptions = { passive };
    this.el.addEventListener("touchstart", this.onTouchStart, opts);
    this.el.addEventListener("touchmove", this.onTouchMove, opts);
    this.el.addEventListener("touchend", this.onTouchEnd, opts);
    this.el.addEventListener("touchcancel", this.onTouchEnd, opts);
  }

  on(event: EventName, fn: Listener): this {
    (this.listeners[event] ??= []).push(fn);
    return this;
  }

  off(event: EventName, fn: Listener): this {
    const arr = this.listeners[event];
    if (arr) this.listeners[event] = arr.filter((h) => h !== fn);
    return this;
  }

  private emit(event: EventName, data: PenEvent | Record<string, never>) {
    (this.listeners[event] || []).slice().forEach((fn) => fn(data));
  }

  private handle(e: TouchEvent) {
    const ts = e.touches;
    if (!ts.length) return;
    const rect = this.el.getBoundingClientRect();

    // Full-contact stats for debug / calibration
    let rSum = 0;
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (let i = 0; i < ts.length; i++) {
      const t = ts[i];
      rSum += ((t.radiusX || 0) + (t.radiusY || 0)) / 2;
      const tx = t.clientX - rect.left;
      const ty = t.clientY - rect.top;
      if (tx < minX) minX = tx;
      if (tx > maxX) maxX = tx;
      if (ty < minY) minY = ty;
      if (ty > maxY) maxY = ty;
    }
    const n = ts.length;
    const bboxW = maxX - minX;
    const bboxH = maxY - minY;
    const metric = rSum / n;

    // Classify and lock touch ID only on the very first contact
    const isFirst = e.type === "touchstart" && this.strokeTool === null;
    if (isFirst) {
      this.strokeTool = this.classify(metric);
      this.trackId = ts[0].identifier;
      this.sPos = null;
      this.velPos = null;
      this.sP = 0.5;
    }

    // Palm rejection: follow only the locked touch ID
    let tracked: Touch = ts[0];
    for (let i = 0; i < ts.length; i++) {
      if (ts[i].identifier === this.trackId) {
        tracked = ts[i];
        break;
      }
    }
    const rx = tracked.radiusX || 0;
    const ry = tracked.radiusY || 0;
    const rawX = tracked.clientX - rect.left;
    const rawY = tracked.clientY - rect.top;

    const { x, y } = this.smoothXY(rawX, rawY);
    const { pressure, velocity } = this.velPressure(rawX, rawY);

    this.emit(isFirst ? "pendown" : "penmove", {
      x,
      y,
      tool: this.strokeTool || "none",
      pressure,
      velocity,
      metric,
      pointCount: n,
      radiusX: rx,
      radiusY: ry,
      radiusMag: Math.sqrt(rx * rx + ry * ry),
      bboxW,
      bboxH,
      bboxArea: bboxW * bboxH,
    });
  }

  private smoothXY(x: number, y: number) {
    if (!this.smXY || !this.sPos) {
      this.sPos = { x, y };
      return { x, y };
    }
    this.sPos.x = this.smXY * this.sPos.x + (1 - this.smXY) * x;
    this.sPos.y = this.smXY * this.sPos.y + (1 - this.smXY) * y;
    return { x: this.sPos.x, y: this.sPos.y };
  }

  private velPressure(x: number, y: number) {
    const now = Date.now();
    let velocity = 0;
    if (this.velPos) {
      const dx = x - this.velPos.x;
      const dy = y - this.velPos.y;
      const dt = Math.max(1, now - this.velPos.t);
      velocity = Math.sqrt(dx * dx + dy * dy) / dt;
      const raw = 1 - Math.min(1, velocity / 3);
      this.sP = this.smP * this.sP + (1 - this.smP) * raw;
    }
    this.velPos = { x, y, t: now };
    return { pressure: this.sP, velocity };
  }

  private classify(m: number): Tool {
    const t = this.thr;
    if (m >= t.penThin.min && m <= t.penThin.max) return "penThin";
    if (m >= t.penThick.min && m <= t.penThick.max) return "penThick";
    if (m >= t.eraser.min && m <= t.eraser.max) return "eraser";
    return "none";
  }

  get thresholds(): Thresholds {
    return this.thr;
  }

  setThresholds(thr: Partial<Thresholds>): this {
    if (thr.penThin) Object.assign(this.thr.penThin, thr.penThin);
    if (thr.penThick) Object.assign(this.thr.penThick, thr.penThick);
    if (thr.eraser) Object.assign(this.thr.eraser, thr.eraser);
    return this;
  }

  setSmooth({ xy, pressure }: SmoothOptions = {}): this {
    if (xy !== undefined) this.smXY = clamp(xy, 0, 0.95);
    if (pressure !== undefined) this.smP = clamp(pressure, 0, 0.95);
    return this;
  }

  destroy() {
    this.el.removeEventListener("touchstart", this.onTouchStart);
    this.el.removeEventListener("touchmove", this.onTouchMove);
    this.el.removeEventListener("touchend", this.onTouchEnd);
    this.el.removeEventListener("touchcancel", this.onTouchEnd);
  }
}
