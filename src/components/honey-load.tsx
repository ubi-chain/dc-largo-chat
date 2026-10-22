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

const FIELD = honeycomb(11, 42);

function hexPoints(cx: number, cy: number, radius: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 6; i += 1) {
    const angle = (Math.PI / 180) * (60 * i - 30);
    pts.push(`${(cx + radius * Math.cos(angle)).toFixed(2)},${(cy + radius * Math.sin(angle)).toFixed(2)}`);
  }
  return pts.join(" ");
}

export function HoneyField({ burst = false }: { burst?: boolean }) {
  return (
    <svg
      viewBox="-780 -520 1560 1040"
      preserveAspectRatio="xMidYMid slice"
      className="pointer-events-none absolute inset-0 h-full w-full"
      aria-hidden="true"
    >
      {FIELD.map((cell) => (
        <polygon
          key={`${cell.x}:${cell.y}`}
          points={hexPoints(cell.x, cell.y, 22)}
          className={burst ? "burst-cell" : undefined}
          fill={cell.fill ? "var(--color-honey)" : "transparent"}
          fillOpacity={burst ? 0.9 : cell.fill ? 0.14 : 0}
          stroke="var(--color-honey)"
          strokeOpacity={burst ? 0.9 : 0.45}
          strokeWidth={cell.fill ? 0 : 1.6}
          style={
            burst
              ? {
                  ["--x" as string]: `${cell.x}px`,
                  ["--y" as string]: `${cell.y}px`,
                  animationDelay: `${cell.ring * 70}ms`,
                }
              : undefined
          }
        />
      ))}
    </svg>
  );
}

export function HoneyLoad({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(onDone, reduce ? 320 : 1680);
    return () => window.clearTimeout(timer);
  }, [onDone]);

  return (
    <div className="relative flex h-dvh flex-col items-center justify-center overflow-hidden bg-bg text-fg">
      <HoneyField burst />
      <div className="relative z-10 flex flex-col items-center">
        <p className="font-display text-3xl tracking-wide text-fg">LARGO-CHAT</p>
        <p className="mt-2 text-sm text-muted">部屋を開けている</p>
      </div>
    </div>
  );
}
