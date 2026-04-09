import { useState, useMemo, useRef, useCallback, useEffect } from 'react';

const COLORS = [
  '#FFD54F', '#4ade80', '#60a5fa', '#f87171', '#a78bfa',
  '#fb923c', '#2dd4bf', '#f472b6', '#fbbf24', '#818cf8',
  '#34d399', '#e879f9', '#38bdf8', '#f97316', '#a3e635',
  '#c084fc', '#22d3ee',
];

const ROUND_MARKERS = [
  { label: 'R1', t: new Date('2026-04-10T12:00:00Z').getTime() },
  { label: 'R2', t: new Date('2026-04-11T12:00:00Z').getTime() },
  { label: 'R3', t: new Date('2026-04-12T14:00:00Z').getTime() },
  { label: 'R4', t: new Date('2026-04-13T14:00:00Z').getTime() },
];

const RANGES = [
  { key: 'all', label: 'All' },
  { key: 'today', label: 'Today' },
  { key: '3h', label: '3h' },
  { key: '1h', label: '1h' },
  { key: 'round', label: 'Round' },
];

const Y_SCALES = [
  { key: '100', label: '0-100%', yMax: 100 },
  { key: '50', label: '0-50%', yMax: 50 },
  { key: '25', label: '0-25%', yMax: 25 },
  { key: 'auto', label: 'Auto', yMax: null },
];

function formatTime(ts) {
  const d = new Date(ts);
  const h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? 'p' : 'a';
  const hr = h % 12 || 12;
  return `${hr}:${m.toString().padStart(2, '0')}${ampm}`;
}

function formatDate(ts) {
  const d = new Date(ts);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[d.getMonth()]} ${d.getDate()}`;
}

function clamp(val, min, max) {
  return Math.min(max, Math.max(min, val));
}

/** Attempt monotone cubic interpolation for smooth curves */
function smoothPath(points, xFn, yFn) {
  if (points.length === 0) return '';
  if (points.length === 1) return `M${xFn(points[0]).toFixed(1)},${yFn(points[0]).toFixed(1)}`;
  if (points.length === 2) {
    return `M${xFn(points[0]).toFixed(1)},${yFn(points[0]).toFixed(1)}L${xFn(points[1]).toFixed(1)},${yFn(points[1]).toFixed(1)}`;
  }

  const xs = points.map(xFn);
  const ys = points.map(yFn);
  const n = points.length;

  // Compute tangents using Fritsch-Carlson monotone method
  const deltas = [];
  const ms = [];
  for (let i = 0; i < n - 1; i++) {
    const dx = xs[i + 1] - xs[i];
    deltas.push(dx === 0 ? 0 : (ys[i + 1] - ys[i]) / dx);
  }
  ms.push(deltas[0]);
  for (let i = 1; i < n - 1; i++) {
    if (deltas[i - 1] * deltas[i] <= 0) {
      ms.push(0);
    } else {
      ms.push((deltas[i - 1] + deltas[i]) / 2);
    }
  }
  ms.push(deltas[n - 2]);

  let d = `M${xs[0].toFixed(1)},${ys[0].toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const dx = (xs[i + 1] - xs[i]) / 3;
    const cp1x = xs[i] + dx;
    const cp1y = ys[i] + ms[i] * dx;
    const cp2x = xs[i + 1] - dx;
    const cp2y = ys[i + 1] - ms[i + 1] * dx;
    d += `C${cp1x.toFixed(1)},${cp1y.toFixed(1)},${cp2x.toFixed(1)},${cp2y.toFixed(1)},${xs[i + 1].toFixed(1)},${ys[i + 1].toFixed(1)}`;
  }
  return d;
}

export default function WinHistoryChart({ history, scoredEntries, onClose }) {
  const [hiddenEntries, setHiddenEntries] = useState(() => new Set());
  const [activeRange, setActiveRange] = useState('all');
  const [yScaleKey, setYScaleKey] = useState('100');
  const [viewBox, setViewBox] = useState(null); // null = auto from range
  const svgRef = useRef(null);
  const gestureRef = useRef({
    isPanning: false,
    startX: 0,
    startViewBox: null,
    pinchStartDist: 0,
    pinchStartViewBox: null,
    lastTap: 0,
  });

  // Build entry data
  const { entries, fullTimeRange } = useMemo(() => {
    if (!history.length || !scoredEntries.length) {
      return { entries: [], fullTimeRange: [0, 1] };
    }

    const entryMap = {};
    scoredEntries.forEach((e, i) => {
      entryMap[e.id] = { id: e.id, name: e.name, color: COLORS[i % COLORS.length], points: [] };
    });

    for (const snap of history) {
      for (const [id, pct] of Object.entries(snap.p)) {
        if (entryMap[id]) {
          entryMap[id].points.push({ t: snap.t, pct });
        }
      }
    }

    const entries = Object.values(entryMap).filter(e => e.points.length > 0);
    const tMin = history[0].t;
    const tMax = history[history.length - 1].t;
    return { entries, fullTimeRange: [tMin, tMax] };
  }, [history, scoredEntries]);

  // Sorted entries by latest win% descending
  const sortedEntries = useMemo(() => {
    return [...entries].sort((a, b) => {
      const aLast = a.points[a.points.length - 1]?.pct ?? 0;
      const bLast = b.points[b.points.length - 1]?.pct ?? 0;
      return bLast - aLast;
    });
  }, [entries]);

  // Compute default hidden: entries at 0% current
  useEffect(() => {
    const zeroIds = new Set();
    for (const e of entries) {
      const lastPct = e.points[e.points.length - 1]?.pct ?? 0;
      if (lastPct === 0) zeroIds.add(e.id);
    }
    if (zeroIds.size > 0) setHiddenEntries(zeroIds);
  }, [entries]);

  // Compute range-based time bounds
  const rangeTimeBounds = useMemo(() => {
    const [tMin, tMax] = fullTimeRange;
    const now = tMax; // use latest snapshot as "now"

    switch (activeRange) {
      case 'today': {
        const d = new Date(now);
        d.setHours(0, 0, 0, 0);
        return [d.getTime(), now];
      }
      case '3h':
        return [now - 3 * 3600 * 1000, now];
      case '1h':
        return [now - 1 * 3600 * 1000, now];
      case 'round': {
        // Find current round: last round marker before now
        let roundStart = tMin;
        for (const rm of ROUND_MARKERS) {
          if (rm.t <= now) roundStart = rm.t;
        }
        return [roundStart, now];
      }
      default:
        return [tMin, tMax];
    }
  }, [activeRange, fullTimeRange]);

  // Compute auto Y-max from visible data
  const autoYMax = useMemo(() => {
    let visMax = 0;
    for (const entry of entries) {
      if (hiddenEntries.has(entry.id)) continue;
      for (const p of entry.points) visMax = Math.max(visMax, p.pct);
    }
    return Math.max(10, Math.ceil(visMax / 5) * 5 + 5);
  }, [entries, hiddenEntries]);

  // Effective viewBox
  const effectiveView = useMemo(() => {
    if (viewBox) return viewBox;
    const ySetting = Y_SCALES.find(s => s.key === yScaleKey);
    const yMax = ySetting?.yMax ?? autoYMax;
    return { xMin: rangeTimeBounds[0], xMax: rangeTimeBounds[1], yMin: 0, yMax };
  }, [viewBox, rangeTimeBounds, yScaleKey, autoYMax]);

  // Reset viewBox when range changes
  const handleRangeChange = useCallback((key) => {
    setActiveRange(key);
    setViewBox(null);
  }, []);

  // Double-tap/double-click to reset
  const handleDoubleReset = useCallback(() => {
    setViewBox(null);
    setActiveRange('all');
    setYScaleKey('100');
  }, []);

  // Toggle entry visibility
  const toggleEntry = useCallback((id) => {
    setHiddenEntries(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // SVG layout constants
  const W = 1000;
  const H = 600;
  const PAD = { top: 30, right: 110, bottom: 36, left: 48 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const { xMin, xMax, yMin, yMax } = effectiveView;
  const tRange = xMax - xMin || 1;
  const pRange = yMax - yMin || 1;

  const xScale = (t) => PAD.left + ((t - xMin) / tRange) * plotW;
  const yScale = (pct) => PAD.top + plotH - ((pct - yMin) / pRange) * plotH;

  // --- Gesture handlers ---
  const getSvgX = useCallback((clientX) => {
    const svg = svgRef.current;
    if (!svg) return 0;
    const rect = svg.getBoundingClientRect();
    return ((clientX - rect.left) / rect.width) * W;
  }, []);

  const svgXToTime = useCallback((svgX) => {
    return xMin + ((svgX - PAD.left) / plotW) * tRange;
  }, [xMin, tRange, plotW]);

  // Mouse wheel zoom (X-axis)
  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 1.15 : 0.87;
    const svgX = getSvgX(e.clientX);
    const pivot = xMin + ((svgX - PAD.left) / plotW) * tRange;

    const newXMin = pivot - (pivot - xMin) * factor;
    const newXMax = pivot + (xMax - pivot) * factor;
    const [fullMin, fullMax] = fullTimeRange;

    // Auto Y on zoom
    let autoYMax = 100;
    if (factor < 1) {
      // zooming in — compute visible max
      let visMax = 0;
      for (const entry of entries) {
        if (hiddenEntries.has(entry.id)) continue;
        for (const p of entry.points) {
          if (p.t >= newXMin && p.t <= newXMax && p.pct > visMax) visMax = p.pct;
        }
      }
      autoYMax = Math.max(10, Math.ceil(visMax / 5) * 5 + 5);
    }

    setViewBox({
      xMin: Math.max(fullMin, newXMin),
      xMax: Math.min(fullMax, newXMax),
      yMin: 0,
      yMax: factor < 1 ? autoYMax : 100,
    });
  }, [xMin, xMax, tRange, plotW, getSvgX, fullTimeRange, entries, hiddenEntries]);

  // Mouse drag pan
  const handleMouseDown = useCallback((e) => {
    if (e.button !== 0) return;
    const g = gestureRef.current;

    // Double-click detection
    const now = Date.now();
    if (now - g.lastTap < 350) {
      handleDoubleReset();
      g.lastTap = 0;
      return;
    }
    g.lastTap = now;

    g.isPanning = true;
    g.startX = e.clientX;
    g.startViewBox = { ...effectiveView };

    const handleMouseMove = (me) => {
      if (!g.isPanning) return;
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const dx = me.clientX - g.startX;
      const timeDelta = -(dx / rect.width) * (g.startViewBox.xMax - g.startViewBox.xMin);
      const [fullMin, fullMax] = fullTimeRange;
      const span = g.startViewBox.xMax - g.startViewBox.xMin;

      let newXMin = g.startViewBox.xMin + timeDelta;
      let newXMax = g.startViewBox.xMax + timeDelta;
      if (newXMin < fullMin) { newXMin = fullMin; newXMax = fullMin + span; }
      if (newXMax > fullMax) { newXMax = fullMax; newXMin = fullMax - span; }

      setViewBox(prev => ({
        ...(prev || g.startViewBox),
        xMin: newXMin,
        xMax: newXMax,
      }));
    };

    const handleMouseUp = () => {
      g.isPanning = false;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, [effectiveView, fullTimeRange, handleDoubleReset]);

  // Touch handlers
  const handleTouchStart = useCallback((e) => {
    const g = gestureRef.current;
    if (e.touches.length === 1) {
      // Double-tap detection
      const now = Date.now();
      if (now - g.lastTap < 350) {
        handleDoubleReset();
        g.lastTap = 0;
        return;
      }
      g.lastTap = now;

      g.isPanning = true;
      g.startX = e.touches[0].clientX;
      g.startViewBox = { ...effectiveView };
    } else if (e.touches.length === 2) {
      g.isPanning = false;
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      g.pinchStartDist = Math.sqrt(dx * dx + dy * dy);
      g.pinchStartViewBox = { ...effectiveView };
    }
  }, [effectiveView, handleDoubleReset]);

  const handleTouchMove = useCallback((e) => {
    e.preventDefault();
    const g = gestureRef.current;

    if (e.touches.length === 1 && g.isPanning && g.startViewBox) {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const dx = e.touches[0].clientX - g.startX;
      const timeDelta = -(dx / rect.width) * (g.startViewBox.xMax - g.startViewBox.xMin);
      const [fullMin, fullMax] = fullTimeRange;
      const span = g.startViewBox.xMax - g.startViewBox.xMin;

      let newXMin = g.startViewBox.xMin + timeDelta;
      let newXMax = g.startViewBox.xMax + timeDelta;
      if (newXMin < fullMin) { newXMin = fullMin; newXMax = fullMin + span; }
      if (newXMax > fullMax) { newXMax = fullMax; newXMin = fullMax - span; }

      setViewBox(prev => ({
        ...(prev || g.startViewBox),
        xMin: newXMin,
        xMax: newXMax,
      }));
    } else if (e.touches.length === 2 && g.pinchStartViewBox) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const scale = g.pinchStartDist / dist; // >1 = zoom out, <1 = zoom in

      const midClientX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const pivotFrac = (midClientX - rect.left) / rect.width;
      const pivotTime = g.pinchStartViewBox.xMin + pivotFrac * (g.pinchStartViewBox.xMax - g.pinchStartViewBox.xMin);

      const oldSpan = g.pinchStartViewBox.xMax - g.pinchStartViewBox.xMin;
      const newSpan = oldSpan * scale;
      const [fullMin, fullMax] = fullTimeRange;
      const maxSpan = fullMax - fullMin;

      const clampedSpan = clamp(newSpan, maxSpan * 0.02, maxSpan);
      let newXMin = pivotTime - pivotFrac * clampedSpan;
      let newXMax = pivotTime + (1 - pivotFrac) * clampedSpan;
      if (newXMin < fullMin) { newXMin = fullMin; newXMax = fullMin + clampedSpan; }
      if (newXMax > fullMax) { newXMax = fullMax; newXMin = fullMax - clampedSpan; }

      // Auto Y when zooming in
      let autoYMax = 100;
      if (scale < 1) {
        let visMax = 0;
        for (const entry of entries) {
          if (hiddenEntries.has(entry.id)) continue;
          for (const p of entry.points) {
            if (p.t >= newXMin && p.t <= newXMax && p.pct > visMax) visMax = p.pct;
          }
        }
        autoYMax = Math.max(10, Math.ceil(visMax / 5) * 5 + 5);
      }

      setViewBox({
        xMin: newXMin,
        xMax: newXMax,
        yMin: 0,
        yMax: scale < 1 ? autoYMax : g.pinchStartViewBox.yMax,
      });
    }
  }, [fullTimeRange, entries, hiddenEntries]);

  const handleTouchEnd = useCallback(() => {
    gestureRef.current.isPanning = false;
  }, []);

  // Attach wheel listener with passive:false
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    svg.addEventListener('wheel', handleWheel, { passive: false });
    return () => svg.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  // --- Render ---
  if (entries.length === 0 || history.length < 2) {
    return (
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
        <div
          className="relative w-full max-w-lg mx-auto bg-bg-card border border-augusta/12 rounded-t-2xl sm:rounded-2xl shadow-2xl px-6 py-10 text-center"
          style={{ animation: 'sheetUp 0.25s ease-out' }}
          onClick={e => e.stopPropagation()}
        >
          <button onClick={onClose} className="absolute top-4 right-4 text-text-secondary/30 hover:text-text-primary transition-colors">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M1 1l12 12M13 1L1 13" />
            </svg>
          </button>
          <p className="text-text-secondary/40 text-[11px]">Not enough data yet. Check back after a few score updates.</p>
        </div>
      </div>
    );
  }

  const [fullTMin, fullTMax] = fullTimeRange;

  // Y-axis ticks
  const yTicks = [];
  const yStep = pRange <= 20 ? 2 : pRange <= 50 ? 5 : pRange <= 100 ? 10 : 20;
  for (let v = Math.ceil(yMin / yStep) * yStep; v <= yMax; v += yStep) {
    yTicks.push(v);
  }

  // X-axis time labels (smart: ~6-8 labels max)
  const xLabels = [];
  const labelCount = Math.min(8, Math.max(3, Math.floor(plotW / 120)));
  for (let i = 0; i <= labelCount; i++) {
    const t = xMin + (i / labelCount) * tRange;
    xLabels.push(t);
  }

  // Round markers visible in current view
  const visibleRounds = ROUND_MARKERS.filter(rm => rm.t >= xMin && rm.t <= xMax);

  // Visible entries (not hidden) sorted for rendering (lowest on top so highest paints last)
  const visibleEntries = sortedEntries.filter(e => !hiddenEntries.has(e.id));
  const renderEntries = [...visibleEntries].reverse();

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-4xl mx-auto bg-bg-card border border-augusta/12 rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col"
        style={{
          animation: 'sheetUp 0.25s ease-out',
          height: 'calc(100dvh - 2rem)',
          maxHeight: '95dvh',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Drag handle (mobile) */}
        <div className="w-8 h-0.5 rounded-full bg-text-secondary/15 mx-auto mt-2 sm:hidden flex-shrink-0" />

        {/* Header */}
        <div className="px-5 pt-4 pb-2 flex items-start justify-between flex-shrink-0">
          <div>
            <h3 className="font-[Playfair_Display] text-lg text-text-primary leading-tight">Win % Over Time</h3>
            <p className="text-[10px] text-text-secondary/35 mt-0.5 tracking-wide">
              {history.length} snapshots &middot; {formatDate(fullTMin)} {formatTime(fullTMin)} — {formatDate(fullTMax)} {formatTime(fullTMax)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-text-secondary/30 hover:text-text-primary transition-colors p-1 -mr-1 -mt-1"
          >
            <svg width="16" height="16" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M1 1l12 12M13 1L1 13" />
            </svg>
          </button>
        </div>

        {/* Range pills */}
        <div className="px-5 pb-1.5 flex items-center gap-4 flex-shrink-0 flex-wrap">
          <div className="flex gap-1.5">
            {RANGES.map(r => (
              <button
                key={r.key}
                onClick={() => handleRangeChange(r.key)}
                className={`px-3 py-1 rounded-full text-[10px] font-medium tracking-wide transition-all ${
                  activeRange === r.key
                    ? 'bg-augusta/20 text-augusta-light'
                    : 'bg-white/5 text-text-secondary/40 hover:bg-white/8 hover:text-text-secondary/60'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <div className="h-3 w-px bg-white/8" />
          <div className="flex gap-1.5">
            {Y_SCALES.map(s => (
              <button
                key={s.key}
                onClick={() => { setYScaleKey(s.key); setViewBox(null); }}
                className={`px-2.5 py-1 rounded-full text-[10px] font-medium tracking-wide transition-all ${
                  yScaleKey === s.key
                    ? 'bg-gold/15 text-gold/80'
                    : 'bg-white/5 text-text-secondary/40 hover:bg-white/8 hover:text-text-secondary/60'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Chart area */}
        <div className="flex-1 min-h-0 px-2 sm:px-4 pb-1 select-none">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${W} ${H}`}
            className="w-full h-full"
            preserveAspectRatio="xMidYMid meet"
            onMouseDown={handleMouseDown}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            style={{ touchAction: 'none', cursor: 'grab' }}
          >
            {/* Clip path for plot area */}
            <defs>
              <clipPath id="plot-clip">
                <rect x={PAD.left} y={PAD.top} width={plotW} height={plotH} />
              </clipPath>
            </defs>

            {/* Background */}
            <rect x={PAD.left} y={PAD.top} width={plotW} height={plotH} fill="white" opacity="0.015" rx="2" />

            {/* Y-axis grid + labels */}
            {yTicks.map(v => {
              const yPos = yScale(v);
              if (yPos < PAD.top || yPos > PAD.top + plotH) return null;
              return (
                <g key={`y-${v}`}>
                  <line
                    x1={PAD.left} y1={yPos} x2={PAD.left + plotW} y2={yPos}
                    stroke="white" opacity="0.06" strokeWidth="0.5"
                  />
                  <text
                    x={PAD.left - 6} y={yPos + 3.5}
                    fill="white" opacity="0.3" fontSize="10" textAnchor="end" fontFamily="monospace"
                  >
                    {v}%
                  </text>
                </g>
              );
            })}

            {/* X-axis time labels */}
            {xLabels.map((t, i) => (
              <text
                key={`x-${i}`}
                x={xScale(t)} y={PAD.top + plotH + 18}
                fill="white" opacity="0.28" fontSize="9" textAnchor="middle" fontFamily="monospace"
              >
                {formatTime(t)}
              </text>
            ))}

            {/* Round marker lines */}
            {visibleRounds.map(rm => {
              const rx = xScale(rm.t);
              return (
                <g key={rm.label}>
                  <line
                    x1={rx} y1={PAD.top} x2={rx} y2={PAD.top + plotH}
                    stroke="white" opacity="0.12" strokeWidth="0.8"
                    strokeDasharray="4 3"
                  />
                  <text
                    x={rx} y={PAD.top - 6}
                    fill="white" opacity="0.35" fontSize="9" textAnchor="middle"
                    fontWeight="600" fontFamily="monospace"
                  >
                    {rm.label}
                  </text>
                </g>
              );
            })}

            {/* Data lines (clipped) */}
            <g clipPath="url(#plot-clip)">
              {renderEntries.map(entry => {
                const pts = entry.points.filter(p => p.t >= xMin && p.t <= xMax);
                if (pts.length === 0) return null;

                // Include one point before and after visible range for smooth edge
                const allPts = entry.points;
                let startIdx = allPts.findIndex(p => p.t >= xMin);
                let endIdx = allPts.findIndex(p => p.t > xMax);
                if (startIdx > 0) startIdx--;
                if (endIdx === -1) endIdx = allPts.length;
                else endIdx = Math.min(endIdx + 1, allPts.length);
                const visiblePts = allPts.slice(startIdx < 0 ? 0 : startIdx, endIdx);
                if (visiblePts.length === 0) return null;

                const d = smoothPath(
                  visiblePts,
                  p => xScale(p.t),
                  p => yScale(p.pct),
                );

                return (
                  <path
                    key={entry.id}
                    d={d}
                    fill="none"
                    stroke={entry.color}
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity="0.85"
                  />
                );
              })}

              {/* End dots */}
              {visibleEntries.map(entry => {
                const last = entry.points[entry.points.length - 1];
                if (!last || last.t < xMin || last.t > xMax) return null;
                return (
                  <circle
                    key={`dot-${entry.id}`}
                    cx={xScale(last.t)}
                    cy={yScale(last.pct)}
                    r="4"
                    fill={entry.color}
                    opacity="0.95"
                  />
                );
              })}
            </g>

            {/* Inline labels at rightmost visible point (Bloomberg-style) */}
            {visibleEntries.map(entry => {
              // Find the rightmost point in the visible window
              let labelPoint = null;
              for (let i = entry.points.length - 1; i >= 0; i--) {
                if (entry.points[i].t <= xMax && entry.points[i].t >= xMin) {
                  labelPoint = entry.points[i];
                  break;
                }
              }
              if (!labelPoint) return null;

              const lx = xScale(labelPoint.t);
              const ly = yScale(labelPoint.pct);
              // Only show inline label if there's room on the right
              if (lx > PAD.left + plotW - 10) {
                // Label goes in the right margin
                const lastPct = entry.points[entry.points.length - 1]?.pct ?? 0;
                const name = entry.name.length > 8 ? entry.name.slice(0, 8) + '..' : entry.name;
                return (
                  <g key={`label-${entry.id}`}>
                    <text
                      x={PAD.left + plotW + 6}
                      y={ly + 3}
                      fill={entry.color}
                      opacity="0.85"
                      fontSize="9.5"
                      fontWeight="600"
                      fontFamily="system-ui, sans-serif"
                    >
                      {name}
                    </text>
                    <text
                      x={PAD.left + plotW + 6}
                      y={ly + 13}
                      fill={entry.color}
                      opacity="0.5"
                      fontSize="8"
                      fontFamily="monospace"
                    >
                      {lastPct.toFixed(1)}%
                    </text>
                  </g>
                );
              }
              return null;
            })}

            {/* Axis border lines */}
            <line
              x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + plotH}
              stroke="white" opacity="0.08" strokeWidth="1"
            />
            <line
              x1={PAD.left} y1={PAD.top + plotH} x2={PAD.left + plotW} y2={PAD.top + plotH}
              stroke="white" opacity="0.08" strokeWidth="1"
            />
          </svg>
        </div>

        {/* Legend */}
        <div className="px-4 pb-4 pt-1 flex-shrink-0 overflow-y-auto" style={{ maxHeight: '30%' }}>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-0.5">
            {sortedEntries.map(entry => {
              const lastPct = entry.points[entry.points.length - 1]?.pct ?? 0;
              const isHidden = hiddenEntries.has(entry.id);
              const isEliminated = lastPct === 0;

              return (
                <button
                  key={entry.id}
                  className={`flex items-center gap-1.5 py-1 px-1.5 rounded text-left transition-all ${
                    isHidden ? 'opacity-25' : isEliminated ? 'opacity-35' : 'opacity-90'
                  } hover:bg-white/5 active:bg-white/8`}
                  onClick={() => toggleEntry(entry.id)}
                >
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ background: isHidden ? '#555' : entry.color }}
                  />
                  <span className="text-[10px] text-text-primary truncate flex-1 leading-tight">
                    {entry.name}
                  </span>
                  <span className="text-[9px] font-mono text-text-secondary/50 flex-shrink-0 tabular-nums">
                    {lastPct.toFixed(1)}%
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
