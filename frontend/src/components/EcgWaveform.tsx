type EcgWaveformProps = {
  values: number[];
};

export function EcgWaveform({ values }: EcgWaveformProps) {
  const points = values.slice(0, 500);

  if (!points.length) {
    return (
      <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white/70 text-xs text-slate-500">
        ECG waveform preview appears after selecting a TXT or CSV file.
      </div>
    );
  }

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const width = 900;
  const height = 260;
  const path = points
    .map((value, index) => {
      const x = (index / Math.max(points.length - 1, 1)) * width;
      const y = height - ((value - min) / range) * height;
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-48 w-full overflow-hidden rounded-md bg-ecg-grid">
        <path d={path} fill="none" stroke="#dc2626" strokeLinecap="round" strokeWidth="2.5" />
      </svg>
      <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] text-slate-500">
        <span className="truncate">{points.length} samples</span>
        <span className="truncate">Min {min.toFixed(3)}</span>
        <span className="truncate">Max {max.toFixed(3)}</span>
      </div>
    </div>
  );
}
