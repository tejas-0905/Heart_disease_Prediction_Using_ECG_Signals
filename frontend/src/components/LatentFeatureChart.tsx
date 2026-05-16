type LatentFeatureChartProps = {
  values: number[];
};

export function LatentFeatureChart({ values }: LatentFeatureChartProps) {
  const maxAbs = Math.max(...values.map((value) => Math.abs(value)), 1);

  return (
    <div className="space-y-2">
      {values.map((value, index) => {
        const width = Math.max(8, (Math.abs(value) / maxAbs) * 100);
        return (
          <div key={`${index}-${value}`} className="grid grid-cols-[34px_1fr_58px] items-center gap-2 text-xs">
            <span className="font-medium text-slate-500">L{index + 1}</span>
            <div className="h-2.5 rounded-full bg-slate-100">
              <div
                className={value >= 0 ? "h-2.5 rounded-full bg-teal-500" : "h-2.5 rounded-full bg-amber-500"}
                style={{ width: `${width}%` }}
              />
            </div>
            <span className="text-right font-mono text-[11px] text-slate-600">{value.toFixed(3)}</span>
          </div>
        );
      })}
    </div>
  );
}
