import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { formatScore } from '../scoring';

const COLORS = [
  '#FFD54F', '#4ade80', '#60a5fa', '#f87171', '#a78bfa',
  '#fb923c', '#2dd4bf', '#f472b6', '#fbbf24', '#818cf8',
  '#34d399', '#e879f9', '#38bdf8', '#f97316', '#a3e635',
  '#c084fc', '#22d3ee',
];

const ROUND_WINDOWS = [
  { label: 'R1', start: new Date('2026-04-10T12:00:00Z').getTime(), end: new Date('2026-04-10T23:30:00Z').getTime() },
  { label: 'R2', start: new Date('2026-04-11T12:00:00Z').getTime(), end: new Date('2026-04-11T23:30:00Z').getTime() },
  { label: 'R3', start: new Date('2026-04-12T14:00:00Z').getTime(), end: new Date('2026-04-13T01:30:00Z').getTime() },
  { label: 'R4', start: new Date('2026-04-13T14:00:00Z').getTime(), end: new Date('2026-04-14T01:30:00Z').getTime() },
];

const RANGES = [
  { key: 'all', label: 'All' },
  { key: 'today', label: 'Today' },
  { key: '3h', label: '3h' },
  { key: '1h', label: '1h' },
  { key: 'round', label: 'Round' },
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

function clamp(val, min, max) { return Math.min(max, Math.max(min, val)); }

/**
 * Build a compressed timeline that removes dead gaps between rounds.
 * Returns { toCompressed(t), toReal(c), segments, totalDuration }
 * Each segment = { start, end, label, cStart, cEnd } where c* are compressed coords.
 */
function buildCompressedTimeline(history) {
  if (!history.length) return null;
  const tMin = history[0].t;
  const tMax = history[history.length - 1].t;

  // Find which round windows overlap with our data
  const activeSegments = [];
  for (const rw of ROUND_WINDOWS) {
    const segStart = Math.max(rw.start, tMin);
    const segEnd = Math.min(rw.end, tMax);
    if (segStart < segEnd) {
      activeSegments.push({ start: segStart, end: segEnd, label: rw.label });
    }
  }

  // If no segments match (data outside round windows), treat as one continuous block
  if (activeSegments.length === 0) {
    const seg = { start: tMin, end: tMax, label: '', cStart: 0, cEnd: tMax - tMin };
    return {
      segments: [seg],
      totalDuration: tMax - tMin,
      toCompressed: (t) => clamp(t - tMin, 0, tMax - tMin),
      toReal: (c) => tMin + c,
    };
  }

  // Assign compressed coordinates (no gaps between segments)
  let cumulative = 0;
  for (const seg of activeSegments) {
    seg.cStart = cumulative;
    seg.cEnd = cumulative + (seg.end - seg.start);
    cumulative = seg.cEnd;
  }
  const totalDuration = cumulative;

  function toCompressed(t) {
    // Before first segment
    if (t <= activeSegments[0].start) return activeSegments[0].cStart;
    // After last segment
    const last = activeSegments[activeSegments.length - 1];
    if (t >= last.end) return last.cEnd;
    // Find which segment (or gap)
    for (let i = 0; i < activeSegments.length; i++) {
      const seg = activeSegments[i];
      if (t >= seg.start && t <= seg.end) {
        return seg.cStart + (t - seg.start);
      }
      // In gap between this segment and next
      if (i < activeSegments.length - 1 && t > seg.end && t < activeSegments[i + 1].start) {
        return seg.cEnd; // snap to end of previous segment
      }
    }
    return last.cEnd;
  }

  function toReal(c) {
    for (const seg of activeSegments) {
      if (c >= seg.cStart && c <= seg.cEnd) {
        return seg.start + (c - seg.cStart);
      }
    }
    const last = activeSegments[activeSegments.length - 1];
    return last.end;
  }

  return { segments: activeSegments, totalDuration, toCompressed, toReal };
}

function smoothPath(points, xFn, yFn) {
  if (points.length === 0) return '';
  if (points.length === 1) return `M${xFn(points[0]).toFixed(1)},${yFn(points[0]).toFixed(1)}`;
  if (points.length === 2) {
    return `M${xFn(points[0]).toFixed(1)},${yFn(points[0]).toFixed(1)}L${xFn(points[1]).toFixed(1)},${yFn(points[1]).toFixed(1)}`;
  }
  const xs = points.map(xFn);
  const ys = points.map(yFn);
  const n = points.length;
  const deltas = [];
  const ms = [];
  for (let i = 0; i < n - 1; i++) {
    const dx = xs[i + 1] - xs[i];
    deltas.push(dx === 0 ? 0 : (ys[i + 1] - ys[i]) / dx);
  }
  ms.push(deltas[0]);
  for (let i = 1; i < n - 1; i++) {
    ms.push(deltas[i - 1] * deltas[i] <= 0 ? 0 : (deltas[i - 1] + deltas[i]) / 2);
  }
  ms.push(deltas[n - 2]);
  let d = `M${xs[0].toFixed(1)},${ys[0].toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const dx = (xs[i + 1] - xs[i]) / 3;
    d += `C${(xs[i]+dx).toFixed(1)},${(ys[i]+ms[i]*dx).toFixed(1)},${(xs[i+1]-dx).toFixed(1)},${(ys[i+1]-ms[i+1]*dx).toFixed(1)},${xs[i+1].toFixed(1)},${ys[i+1].toFixed(1)}`;
  }
  return d;
}

export default function WinHistoryChart({ history, scoredEntries, onClose }) {
  const [hiddenEntries, setHiddenEntries] = useState(() => new Set());
  const [activeRange, setActiveRange] = useState('3h');
  const [viewBox, setViewBox] = useState(null);
  const svgRef = useRef(null);
  const gestureRef = useRef({ isPanning: false, startX: 0, startViewBox: null, pinchStartDist: 0, pinchStartViewBox: null, lastTap: 0 });

  // Build compressed timeline and entry data
  const timeline = useMemo(() => buildCompressedTimeline(history), [history]);

  const { entries, fullTimeRange } = useMemo(() => {
    if (!history.length || !scoredEntries.length || !timeline) return { entries: [], fullTimeRange: [0, 1] };

    const entryMap = {};
    scoredEntries.forEach((e, i) => {
      entryMap[e.id] = { id: e.id, name: e.name, color: COLORS[i % COLORS.length], points: [] };
    });

    for (const snap of history) {
      const data = snap.s || snap.p;
      if (!data) continue;
      const ct = timeline.toCompressed(snap.t);
      for (const [id, val] of Object.entries(data)) {
        if (entryMap[id]) {
          entryMap[id].points.push({ t: ct, v: val, realT: snap.t });
        }
      }
    }

    const entries = Object.values(entryMap).filter(e => e.points.length > 0);
    return { entries, fullTimeRange: [0, timeline.totalDuration] };
  }, [history, scoredEntries, timeline]);

  // Sorted by latest score (lowest/best first)
  const sortedEntries = useMemo(() => {
    return [...entries].sort((a, b) => {
      const aLast = a.points[a.points.length - 1]?.v ?? 0;
      const bLast = b.points[b.points.length - 1]?.v ?? 0;
      return aLast - bLast;
    });
  }, [entries]);

  // Compute Y bounds from data
  const { dataYMin, dataYMax } = useMemo(() => {
    let lo = 0, hi = 0;
    for (const e of entries) {
      if (hiddenEntries.has(e.id)) continue;
      for (const p of e.points) {
        if (p.v < lo) lo = p.v;
        if (p.v > hi) hi = p.v;
      }
    }
    return { dataYMin: Math.floor(lo / 2) * 2 - 2, dataYMax: Math.ceil(hi / 2) * 2 + 2 };
  }, [entries, hiddenEntries]);

  const rangeTimeBounds = useMemo(() => {
    const [cMin, cMax] = fullTimeRange;
    if (!timeline) return [cMin, cMax];
    const now = cMax;
    switch (activeRange) {
      case 'today': {
        // Find start of current day's round segment
        const realNow = timeline.toReal(now);
        const d = new Date(realNow); d.setUTCHours(0,0,0,0);
        const dayStartReal = d.getTime();
        return [timeline.toCompressed(dayStartReal), now];
      }
      case '3h': return [Math.max(cMin, now - 3*3600*1000), now];
      case '1h': return [Math.max(cMin, now - 1*3600*1000), now];
      case 'round': {
        // Find the start of the current round segment
        const segs = timeline.segments;
        let roundCStart = cMin;
        for (const seg of segs) { if (seg.cStart <= now) roundCStart = seg.cStart; }
        return [roundCStart, now];
      }
      default: return [cMin, cMax];
    }
  }, [activeRange, fullTimeRange, timeline]);

  const effectiveView = useMemo(() => {
    if (viewBox) return viewBox;
    return { xMin: rangeTimeBounds[0], xMax: rangeTimeBounds[1], yMin: dataYMin, yMax: dataYMax };
  }, [viewBox, rangeTimeBounds, dataYMin, dataYMax]);

  const handleRangeChange = useCallback((key) => { setActiveRange(key); setViewBox(null); }, []);
  const handleDoubleReset = useCallback(() => { setViewBox(null); setActiveRange('all'); }, []);
  const toggleEntry = useCallback((id) => {
    setHiddenEntries(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }, []);

  // SVG layout
  const W = 1000, H = 600;
  const PAD = { top: 30, right: 110, bottom: 36, left: 48 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const { xMin, xMax, yMin, yMax } = effectiveView;
  const tRange = xMax - xMin || 1;
  const vRange = yMax - yMin || 1;

  // NOTE: Y is inverted for golf — lower score = higher on chart
  const xScale = (t) => PAD.left + ((t - xMin) / tRange) * plotW;
  const yScale = (v) => PAD.top + ((v - yMin) / vRange) * plotH;

  const getSvgX = useCallback((clientX) => {
    const svg = svgRef.current;
    if (!svg) return 0;
    const rect = svg.getBoundingClientRect();
    return ((clientX - rect.left) / rect.width) * W;
  }, []);

  // Wheel zoom
  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 1.15 : 0.87;
    const svgX = getSvgX(e.clientX);
    const pivot = xMin + ((svgX - PAD.left) / plotW) * tRange;
    const newXMin = pivot - (pivot - xMin) * factor;
    const newXMax = pivot + (xMax - pivot) * factor;
    const [cMin, cMax] = fullTimeRange;
    setViewBox(prev => ({
      ...(prev || effectiveView),
      xMin: Math.max(cMin, newXMin),
      xMax: Math.min(cMax, newXMax),
    }));
  }, [xMin, xMax, tRange, plotW, getSvgX, fullTimeRange, effectiveView]);

  // Mouse pan
  const handleMouseDown = useCallback((e) => {
    if (e.button !== 0) return;
    const g = gestureRef.current;
    const now = Date.now();
    if (now - g.lastTap < 350) { handleDoubleReset(); g.lastTap = 0; return; }
    g.lastTap = now;
    g.isPanning = true; g.startX = e.clientX; g.startViewBox = { ...effectiveView };
    const move = (me) => {
      if (!g.isPanning) return;
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;
      const dx = me.clientX - g.startX;
      const td = -(dx / rect.width) * (g.startViewBox.xMax - g.startViewBox.xMin);
      const [fMin, fMax] = fullTimeRange;
      const span = g.startViewBox.xMax - g.startViewBox.xMin;
      let nMin = g.startViewBox.xMin + td, nMax = g.startViewBox.xMax + td;
      if (nMin < fMin) { nMin = fMin; nMax = fMin + span; }
      if (nMax > fMax) { nMax = fMax; nMin = fMax - span; }
      setViewBox(prev => ({ ...(prev || g.startViewBox), xMin: nMin, xMax: nMax }));
    };
    const up = () => { g.isPanning = false; window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }, [effectiveView, fullTimeRange, handleDoubleReset]);

  // Touch
  const handleTouchStart = useCallback((e) => {
    const g = gestureRef.current;
    if (e.touches.length === 1) {
      const now = Date.now();
      if (now - g.lastTap < 350) { handleDoubleReset(); g.lastTap = 0; return; }
      g.lastTap = now;
      g.isPanning = true; g.startX = e.touches[0].clientX; g.startViewBox = { ...effectiveView };
    } else if (e.touches.length === 2) {
      g.isPanning = false;
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      g.pinchStartDist = Math.sqrt(dx*dx + dy*dy);
      g.pinchStartViewBox = { ...effectiveView };
    }
  }, [effectiveView, handleDoubleReset]);

  const handleTouchMove = useCallback((e) => {
    e.preventDefault();
    const g = gestureRef.current;
    if (e.touches.length === 1 && g.isPanning && g.startViewBox) {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;
      const dx = e.touches[0].clientX - g.startX;
      const td = -(dx / rect.width) * (g.startViewBox.xMax - g.startViewBox.xMin);
      const [fMin, fMax] = fullTimeRange;
      const span = g.startViewBox.xMax - g.startViewBox.xMin;
      let nMin = g.startViewBox.xMin + td, nMax = g.startViewBox.xMax + td;
      if (nMin < fMin) { nMin = fMin; nMax = fMin + span; }
      if (nMax > fMax) { nMax = fMax; nMin = fMax - span; }
      setViewBox(prev => ({ ...(prev || g.startViewBox), xMin: nMin, xMax: nMax }));
    } else if (e.touches.length === 2 && g.pinchStartViewBox) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx*dx + dy*dy);
      const scale = g.pinchStartDist / dist;
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;
      const pivotFrac = ((e.touches[0].clientX + e.touches[1].clientX)/2 - rect.left) / rect.width;
      const pivotTime = g.pinchStartViewBox.xMin + pivotFrac * (g.pinchStartViewBox.xMax - g.pinchStartViewBox.xMin);
      const oldSpan = g.pinchStartViewBox.xMax - g.pinchStartViewBox.xMin;
      const [cMin, cMax] = fullTimeRange;
      const cs = clamp(oldSpan * scale, (cMax - cMin) * 0.02, cMax - cMin);
      let nMin = pivotTime - pivotFrac * cs, nMax = pivotTime + (1 - pivotFrac) * cs;
      if (nMin < fMin) { nMin = fMin; nMax = fMin + cs; }
      if (nMax > fMax) { nMax = fMax; nMin = fMax - cs; }
      setViewBox({ xMin: nMin, xMax: nMax, yMin: g.pinchStartViewBox.yMin, yMax: g.pinchStartViewBox.yMax });
    }
  }, [fullTimeRange]);

  const handleTouchEnd = useCallback(() => { gestureRef.current.isPanning = false; }, []);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    svg.addEventListener('wheel', handleWheel, { passive: false });
    return () => svg.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  if (entries.length === 0 || history.length < 2) {
    return (
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
        <div className="relative w-full max-w-lg mx-auto bg-bg-card border border-augusta/12 rounded-t-2xl sm:rounded-2xl shadow-2xl px-6 py-10 text-center"
          style={{ animation: 'sheetUp 0.25s ease-out' }} onClick={e => e.stopPropagation()}>
          <button onClick={onClose} className="absolute top-4 right-4 text-text-secondary/30 hover:text-text-primary transition-colors">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M1 1l12 12M13 1L1 13" /></svg>
          </button>
          <p className="text-text-secondary/40 text-[11px]">Not enough data yet. Check back after a few score updates.</p>
        </div>
      </div>
    );
  }

  const fullTMin = timeline ? timeline.segments[0]?.start : 0;
  const fullTMax = timeline ? timeline.segments[timeline.segments.length - 1]?.end : 0;

  // Y-axis ticks (score values — lower is better, shown top to bottom)
  const yTicks = [];
  const yStep = vRange <= 10 ? 1 : vRange <= 20 ? 2 : vRange <= 40 ? 5 : 10;
  for (let v = Math.ceil(yMin / yStep) * yStep; v <= yMax; v += yStep) yTicks.push(v);

  // X-axis labels (convert compressed coords back to real time for display)
  const xLabels = [];
  if (timeline) {
    const labelCount = Math.min(8, Math.max(3, Math.floor(plotW / 120)));
    for (let i = 0; i <= labelCount; i++) {
      const c = xMin + (i / labelCount) * tRange;
      xLabels.push({ c, realT: timeline.toReal(c) });
    }
  }

  // Round markers at segment starts, plus boundary lines between segments
  const visibleRounds = timeline ? timeline.segments
    .filter(seg => seg.cStart >= xMin - tRange * 0.05 && seg.cStart <= xMax)
    .map(seg => ({ label: seg.label, c: seg.cStart })) : [];
  // Boundaries between segments (where gaps are compressed)
  const segmentBoundaries = timeline && timeline.segments.length > 1 ? timeline.segments.slice(1)
    .filter(seg => seg.cStart >= xMin && seg.cStart <= xMax)
    .map(seg => seg.cStart) : [];
  const visibleEntries = sortedEntries.filter(e => !hiddenEntries.has(e.id));
  const renderEntries = [...visibleEntries].reverse();

  // Even par line position
  const evenParY = yScale(0);
  const showEvenPar = yMin <= 0 && yMax >= 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-4xl mx-auto bg-bg-card border border-augusta/12 rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col"
        style={{ animation: 'sheetUp 0.25s ease-out', height: 'calc(100dvh - 2rem)', maxHeight: '95dvh' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="w-8 h-0.5 rounded-full bg-text-secondary/15 mx-auto mt-2 sm:hidden flex-shrink-0" />

        {/* Header */}
        <div className="px-5 pt-4 pb-2 flex items-start justify-between flex-shrink-0">
          <div>
            <h3 className="font-[Playfair_Display] text-lg text-text-primary leading-tight">Score Tracker</h3>
            <p className="text-[10px] text-text-secondary/35 mt-0.5 tracking-wide">
              Best 4 of 6 &middot; {history.length} snapshots &middot; {formatDate(fullTMin)} {formatTime(fullTMin)} — {formatDate(fullTMax)} {formatTime(fullTMax)}
            </p>
          </div>
          <button onClick={onClose} className="text-text-secondary/30 hover:text-text-primary transition-colors p-1 -mr-1 -mt-1">
            <svg width="16" height="16" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M1 1l12 12M13 1L1 13" /></svg>
          </button>
        </div>

        {/* Range pills */}
        <div className="px-5 pb-1.5 flex gap-1.5 flex-shrink-0">
          {RANGES.map(r => (
            <button key={r.key} onClick={() => handleRangeChange(r.key)}
              className={`px-3 py-1 rounded-full text-[10px] font-medium tracking-wide transition-all ${
                activeRange === r.key ? 'bg-augusta/20 text-augusta-light' : 'bg-white/5 text-text-secondary/40 hover:bg-white/8 hover:text-text-secondary/60'
              }`}>{r.label}</button>
          ))}
        </div>

        {/* Chart */}
        <div className="flex-1 min-h-0 px-2 sm:px-4 pb-1 select-none">
          <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="w-full h-full"
            preserveAspectRatio="xMidYMid meet" onMouseDown={handleMouseDown}
            onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}
            style={{ touchAction: 'none', cursor: 'grab' }}>
            <defs>
              <clipPath id="plot-clip"><rect x={PAD.left} y={PAD.top} width={plotW} height={plotH} /></clipPath>
            </defs>

            <rect x={PAD.left} y={PAD.top} width={plotW} height={plotH} fill="white" opacity="0.015" rx="2" />

            {/* Even par line */}
            {showEvenPar && (
              <line x1={PAD.left} y1={evenParY} x2={PAD.left + plotW} y2={evenParY}
                stroke="#4ade80" opacity="0.2" strokeWidth="1" strokeDasharray="6 4" />
            )}

            {/* Y grid + labels */}
            {yTicks.map(v => {
              const yPos = yScale(v);
              if (yPos < PAD.top - 1 || yPos > PAD.top + plotH + 1) return null;
              return (
                <g key={`y-${v}`}>
                  <line x1={PAD.left} y1={yPos} x2={PAD.left + plotW} y2={yPos}
                    stroke="white" opacity="0.06" strokeWidth="0.5" />
                  <text x={PAD.left - 6} y={yPos + 3.5} fill={v < 0 ? '#60a5fa' : v > 0 ? '#f87171' : '#888'}
                    opacity="0.45" fontSize="10" textAnchor="end" fontFamily="monospace">
                    {formatScore(v)}
                  </text>
                </g>
              );
            })}

            {/* X labels */}
            {xLabels.map((xl, i) => (
              <text key={`x-${i}`} x={xScale(xl.c)} y={PAD.top + plotH + 18}
                fill="white" opacity="0.28" fontSize="9" textAnchor="middle" fontFamily="monospace">
                {formatTime(xl.realT)}
              </text>
            ))}

            {/* Round markers */}
            {visibleRounds.map(rm => {
              const rx = xScale(rm.c);
              return (
                <g key={rm.label}>
                  <line x1={rx} y1={PAD.top} x2={rx} y2={PAD.top + plotH}
                    stroke="white" opacity="0.12" strokeWidth="0.8" strokeDasharray="4 3" />
                  <text x={rx} y={PAD.top - 6} fill="white" opacity="0.35" fontSize="9"
                    textAnchor="middle" fontWeight="600" fontFamily="monospace">{rm.label}</text>
                </g>
              );
            })}

            {/* Segment boundaries (compressed gap indicators) */}
            {segmentBoundaries.map((c, i) => {
              const bx = xScale(c);
              return (
                <line key={`boundary-${i}`} x1={bx} y1={PAD.top} x2={bx} y2={PAD.top + plotH}
                  stroke="#FFD54F" opacity="0.15" strokeWidth="2" />
              );
            })}

            {/* Lines */}
            <g clipPath="url(#plot-clip)">
              {renderEntries.map(entry => {
                const allPts = entry.points;
                let startIdx = allPts.findIndex(p => p.t >= xMin);
                let endIdx = allPts.findIndex(p => p.t > xMax);
                if (startIdx > 0) startIdx--;
                if (endIdx === -1) endIdx = allPts.length;
                else endIdx = Math.min(endIdx + 1, allPts.length);
                const visPts = allPts.slice(Math.max(0, startIdx), endIdx);
                if (visPts.length === 0) return null;
                return (
                  <path key={entry.id}
                    d={smoothPath(visPts, p => xScale(p.t), p => yScale(p.v))}
                    fill="none" stroke={entry.color} strokeWidth="2.5"
                    strokeLinecap="round" strokeLinejoin="round" opacity="0.85" />
                );
              })}

              {/* End dots */}
              {visibleEntries.map(entry => {
                const last = entry.points[entry.points.length - 1];
                if (!last || last.t < xMin || last.t > xMax) return null;
                return <circle key={`dot-${entry.id}`} cx={xScale(last.t)} cy={yScale(last.v)} r="4" fill={entry.color} opacity="0.95" />;
              })}
            </g>

            {/* Inline labels */}
            {visibleEntries.map(entry => {
              let lp = null;
              for (let i = entry.points.length - 1; i >= 0; i--) {
                if (entry.points[i].t <= xMax && entry.points[i].t >= xMin) { lp = entry.points[i]; break; }
              }
              if (!lp) return null;
              const lx = xScale(lp.t);
              if (lx <= PAD.left + plotW - 10) return null;
              const ly = yScale(lp.v);
              const name = entry.name.length > 8 ? entry.name.slice(0, 8) + '..' : entry.name;
              return (
                <g key={`label-${entry.id}`}>
                  <text x={PAD.left + plotW + 6} y={ly + 3} fill={entry.color}
                    opacity="0.85" fontSize="9.5" fontWeight="600" fontFamily="system-ui, sans-serif">{name}</text>
                  <text x={PAD.left + plotW + 6} y={ly + 13} fill={entry.color}
                    opacity="0.5" fontSize="8" fontFamily="monospace">{formatScore(Math.round(lp.v))}</text>
                </g>
              );
            })}

            {/* Axes */}
            <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + plotH} stroke="white" opacity="0.08" strokeWidth="1" />
            <line x1={PAD.left} y1={PAD.top + plotH} x2={PAD.left + plotW} y2={PAD.top + plotH} stroke="white" opacity="0.08" strokeWidth="1" />
          </svg>
        </div>

        {/* Legend */}
        <div className="px-4 pb-4 pt-1 flex-shrink-0 overflow-y-auto" style={{ maxHeight: '30%' }}>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-0.5">
            {sortedEntries.map(entry => {
              const lastV = entry.points[entry.points.length - 1]?.v ?? 0;
              const isHidden = hiddenEntries.has(entry.id);
              return (
                <button key={entry.id}
                  className={`flex items-center gap-1.5 py-1 px-1.5 rounded text-left transition-all ${
                    isHidden ? 'opacity-25' : 'opacity-90'
                  } hover:bg-white/5 active:bg-white/8`}
                  onClick={() => toggleEntry(entry.id)}>
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: isHidden ? '#555' : entry.color }} />
                  <span className="text-[10px] text-text-primary truncate flex-1 leading-tight">{entry.name}</span>
                  <span className={`text-[9px] font-mono flex-shrink-0 tabular-nums ${
                    lastV < 0 ? 'text-active-blue/70' : lastV > 0 ? 'text-mc-red/60' : 'text-text-secondary/50'
                  }`}>
                    {formatScore(Math.round(lastV))}
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
