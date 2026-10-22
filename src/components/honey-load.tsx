import { useEffect } from "react";

type Cell = { x: number; y: number; ring: number; fill: boolean };

function honeycomb(maxRing: number, size: number): Cell[] {
  const dirs = [
    [1, 0],
    [0, 1],
    [-1, 1],
    [-1, 0],
    [0, -1],
    [1, -1],
  ] as const;
  const axial: { q: number; r: number; ring: number }[] = [{ q: 0, r: 0, ring: 0 }];
  for (let ring = 1; ring <= maxRing; ring += 1) {
    let q = dirs[4][0] * ring;
    let r = dirs[4][1] * ring;
    for (let side = 0; side < 6; side += 1) {
      for (let step = 0; step < ring; step += 1) {
        axial.push({ q, r, ring });
        q += dirs[side][0];
        r += dirs[side][1];
      }
    }
  }
  return axial.map(({ q, r, ring }) => ({
    ring,
    fill: ring === 0 || (q + r) % 2 === 0,
    x: size * (Math.sqrt(3) * q + (Math.sqrt(3) / 2) * r),
    y: size * (1.5 * r),
  }));
}

const CELLS = honeycomb(3, 22);

function hexPoints(cx: number, cy: number, radius: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 6; i += 1) {
    const angle = (Math.PI / 180) * (60 * i - 30);
    pts.push(`${(cx + radius * Math.cos(angle)).toFixed(2)},${(cy + radius * Math.sin(angle)).toFixed(2)}`);
  }
  return pts.join(" ");
}

export function HoneyLoad({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(onDone, reduce ? 320 : 1680);
    return () => window.clearTimeout(timer);
  }, [onDone]);

  return (
    <div className="flex h-dvh flex-col items-center justify-center bg-bg text-fg">
      <div className="relative h-80 w-80">
        <svg viewBox="0 0 400 400" className="h-full w-full" aria-hidden="true">
          {CELLS.map((cell) => (
            <polygon
              key={`${cell.x}:${cell.y}`}
              points={hexPoints(200 + cell.x, 200 + cell.y, 12)}
              className="burst-cell"
              fill={cell.fill ? "var(--color-honey)" : "transparent"}
              stroke="var(--color-honey)"
              strokeWidth={cell.fill ? 0 : 1.4}
              style={{
                ["--x" as string]: `${cell.x}px`,
                ["--y" as string]: `${cell.y}px`,
                animationDelay: `${cell.ring * 110}ms`,
              }}
            />
          ))}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <p className="font-display text-3xl tracking-wide text-fg">LARGO-CHAT</p>
          <p className="mt-2 text-sm text-muted">部屋を開けている</p>
        </div>
      </div>
    </div>
  );
}
