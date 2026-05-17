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

export default function PratoRadar({ stats, media, statoLabel, compact = false }) {
  if (!stats) return null;

  const values = PRATO_STAT_AXES.map(({ key }) => stats[key] ?? 50);
  const gridLevels = [25, 50, 75, 100];
  const size = compact ? 200 : 260;
  const viewBox = "0 0 240 240";

  return (
    <div className={`prato-radar${compact ? " prato-radar--compact" : ""}`}>
      <div className="prato-radar__chart-wrap">
        <svg
          className="prato-radar__svg"
          viewBox={viewBox}
          width={size}
          height={size}
          role="img"
          aria-label={`Stato prato: ${statoLabel}, media ${media}`}
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
              <line
                key={i}
                className="prato-radar__axis"
                x1={CX}
                y1={CY}
                x2={x}
                y2={y}
              />
            );
          })}
          <polygon className="prato-radar__fill" points={polygonPoints(values)} />
          <polygon className="prato-radar__stroke" points={polygonPoints(values)} />
          {values.map((v, i) => {
            const [x, y] = pointAt(i, v);
            return <circle key={i} className="prato-radar__dot" cx={x} cy={y} r={3.5} />;
          })}
          {PRATO_STAT_AXES.map(({ label }, i) => {
            const [x, y] = pointAt(i, 108);
            return (
              <text
                key={label}
                className="prato-radar__label"
                x={x}
                y={y}
                textAnchor="middle"
                dominantBaseline="middle"
              >
                {label.split(" ")[0]}
              </text>
            );
          })}
        </svg>
        <div className="prato-radar__center">
          <span className="prato-radar__media">{media}</span>
          <span className="prato-radar__stato">{statoLabel}</span>
        </div>
      </div>
      <ul className="prato-radar__legend">
        {PRATO_STAT_AXES.map(({ key, label }) => (
          <li key={key} className="prato-radar__legend-item">
            <span className="prato-radar__legend-label">{label}</span>
            <span className="prato-radar__legend-bar" aria-hidden>
              <span
                className="prato-radar__legend-fill"
                style={{ width: `${stats[key]}%` }}
              />
            </span>
            <span className="prato-radar__legend-val">{stats[key]}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
