import { useState } from "react";
import { PRATO_STAT_AXES } from "../lib/pratoStats";

const N = PRATO_STAT_AXES.length;
const CX = 120;
const CY = 120;
const R_MAX = 78;

function pointAt(angleIndex, value, maxR = R_MAX) {
  const angle = (Math.PI * 2 * angleIndex) / N - Math.PI / 2;
  const r = (Math.max(0, Math.min(100, value)) / 100) * maxR;
  return [CX + r * Math.cos(angle), CY + r * Math.sin(angle)];
}

function polygonPoints(values, maxR) {
  return values
    .map((v, i) => pointAt(i, v, maxR).join(","))
    .join(" ");
}

function RadarTooltip({ insight, label, onClose }) {
  if (!insight) return null;
  return (
    <div
      className="prato-radar__tooltip"
      role="tooltip"
      id="radar-tooltip"
      onMouseLeave={onClose}
    >
      <p className="prato-radar__tooltip-title">
        {label} — <strong>{insight.score}/100</strong>
      </p>
      <p className="prato-radar__tooltip-sub">Perché questo punteggio</p>
      <ul>
        {(insight.perche || []).map((t, i) => (
          <li key={`p-${i}`}>{t}</li>
        ))}
      </ul>
      <p className="prato-radar__tooltip-sub">Dove migliorare</p>
      <ul>
        {(insight.migliora || []).map((t, i) => (
          <li key={`m-${i}`}>{t}</li>
        ))}
      </ul>
    </div>
  );
}

export default function PratoRadar({ stats, media, statoLabel, insights, hasVision = true, compact = false }) {
  const [hoverKey, setHoverKey] = useState(null);

  if (!stats) return null;

  const values = hasVision
    ? PRATO_STAT_AXES.map(({ key }) => stats[key] ?? 0)
    : PRATO_STAT_AXES.map(() => 0);
  const gridLevels = [25, 50, 75, 100];
  const size = compact ? 200 : 260;
  const viewBox = "0 0 240 240";
  const active = hoverKey ? PRATO_STAT_AXES.find((a) => a.key === hoverKey) : null;
  const activeInsight = hoverKey && insights ? insights[hoverKey] : null;
  const mediaDisplay = hasVision ? media : "—";

  return (
    <div
      className={`prato-radar${compact ? " prato-radar--compact" : ""}${!hasVision ? " prato-radar--no-data" : ""}`}
    >
      <div className="prato-radar__chart-wrap">
        <svg
          className="prato-radar__svg"
          viewBox={viewBox}
          width={size}
          height={size}
          role="img"
          aria-label={
            hasVision ? `Stato prato: ${statoLabel}, media ${media}` : "Stato prato: dato non disponibile"
          }
        >
          {gridLevels.map((level) => (
            <polygon
              key={level}
              className="prato-radar__grid"
              points={polygonPoints(PRATO_STAT_AXES.map(() => level))}
            />
          ))}
          {PRATO_STAT_AXES.map((_, i) => {
            const [x, y] = pointAt(i, 100);
            return (
              <line key={i} className="prato-radar__axis" x1={CX} y1={CY} x2={x} y2={y} />
            );
          })}
          {hasVision ? (
            <>
              <polygon className="prato-radar__fill" points={polygonPoints(values)} />
              <polygon className="prato-radar__stroke" points={polygonPoints(values)} />
              {values.map((v, i) => {
                const [x, y] = pointAt(i, v);
                return <circle key={i} className="prato-radar__dot" cx={x} cy={y} r={3.5} />;
              })}
            </>
          ) : null}
          {PRATO_STAT_AXES.map(({ key, label }, i) => {
            const [x, y] = pointAt(i, 108);
            const on = hoverKey === key;
            return (
              <text
                key={key}
                className={`prato-radar__label${on ? " prato-radar__label--on" : ""}`}
                x={x}
                y={y}
                textAnchor="middle"
                dominantBaseline="middle"
                onMouseEnter={() => setHoverKey(key)}
                onFocus={() => setHoverKey(key)}
                tabIndex={0}
                role="button"
                aria-describedby={on ? "radar-tooltip" : undefined}
              >
                {label.split(" ")[0]}
              </text>
            );
          })}
        </svg>
        <div className="prato-radar__center">
          <span className="prato-radar__media">{mediaDisplay}</span>
          <span className="prato-radar__stato">{statoLabel}</span>
        </div>
        {activeInsight ? (
          <RadarTooltip
            insight={activeInsight}
            label={active?.label}
            onClose={() => setHoverKey(null)}
          />
        ) : null}
      </div>
      <ul className="prato-radar__legend">
        {PRATO_STAT_AXES.map(({ key, label }) => {
          const insight = insights?.[key];
          const on = hoverKey === key;
          const val = hasVision ? stats[key] : "—";
          return (
            <li
              key={key}
              className={`prato-radar__legend-item${on ? " prato-radar__legend-item--on" : ""}`}
              onMouseEnter={() => setHoverKey(key)}
              onMouseLeave={() => setHoverKey(null)}
              onFocus={() => setHoverKey(key)}
              tabIndex={0}
            >
              <span className="prato-radar__legend-label">{label}</span>
              <span className="prato-radar__legend-bar" aria-hidden>
                <span
                  className="prato-radar__legend-fill"
                  style={{ width: hasVision ? `${stats[key]}%` : "0%" }}
                />
              </span>
              <span className="prato-radar__legend-val">{val}</span>
              {insight && on && hasVision ? (
                <span className="prato-radar__legend-hint">Passa il mouse per dettagli</span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
