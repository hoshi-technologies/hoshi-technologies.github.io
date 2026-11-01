import { useState } from "react";

/**
 * Histogramme simple (une série) : points gagnés par jour.
 * Barres fines à coins arrondis, espacement de 2px, info-bulle au survol.
 */
export function DailyBars({
  data,
  unit,
}: {
  data: { date: string; points: number }[];
  unit: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.points));
  const height = 140;
  const total = data.reduce((s, d) => s + d.points, 0);
  const fmtDay = (iso: string) =>
    new Date(`${iso}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  const labels = [0, Math.floor((data.length - 1) / 2), data.length - 1];

  return (
    <div className="viz-root" style={{ position: "relative" }}>
      <style>{`
        .viz-root { --series-1: #2a78d6; --text-secondary: #52514e; --grid: #e3e3e0; }
      `}</style>
      <div
        role="img"
        aria-label={`${total} ${unit} gagnés sur les 30 derniers jours`}
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: 2,
          height,
          borderBottom: "1px solid var(--grid)",
        }}
        onMouseLeave={() => setHover(null)}
      >
        {data.map((d, i) => (
          <div
            key={d.date}
            onMouseEnter={() => setHover(i)}
            style={{ flex: 1, height: "100%", display: "flex", alignItems: "flex-end", cursor: "default" }}
          >
            <div
              style={{
                width: "100%",
                height: d.points ? Math.max(3, (d.points / max) * (height - 8)) : 0,
                background: "var(--series-1)",
                opacity: hover === null || hover === i ? 1 : 0.45,
                borderRadius: "4px 4px 0 0",
                transition: "opacity 0.15s",
              }}
            />
          </div>
        ))}
      </div>
      <div style={{ position: "relative", height: 18, marginTop: 4, color: "var(--text-secondary)", fontSize: 12 }}>
        {labels.map((i) => (
          <span
            key={i}
            style={{
              position: "absolute",
              left: `${((i + 0.5) / data.length) * 100}%`,
              transform: i === 0 ? "translateX(-15%)" : i === data.length - 1 ? "translateX(-85%)" : "translateX(-50%)",
              whiteSpace: "nowrap",
            }}
          >
            {fmtDay(data[i].date)}
          </span>
        ))}
      </div>
      {hover !== null && (
        <div
          style={{
            position: "absolute",
            // Au-dessus de la barre survolée
            top: Math.max(-12, height - (data[hover].points ? Math.max(3, (data[hover].points / max) * (height - 8)) : 0) - 52),
            left: `${((hover + 0.5) / data.length) * 100}%`,
            transform: "translateX(-50%)",
            background: "#1f2140",
            color: "#fff",
            padding: "6px 10px",
            borderRadius: 8,
            fontSize: 12,
            whiteSpace: "nowrap",
            pointerEvents: "none",
          }}
        >
          <div style={{ opacity: 0.8 }}>{fmtDay(data[hover].date)}</div>
          <strong>
            {new Intl.NumberFormat("fr-FR").format(data[hover].points)} {unit}
          </strong>
        </div>
      )}
    </div>
  );
}
