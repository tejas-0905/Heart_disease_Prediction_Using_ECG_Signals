import { CalendarDays, MapPin, Search } from "lucide-react";
import type { HistoryRecord } from "../types/diagnosis";

type HistoryPanelProps = {
  records: HistoryRecord[];
  search: string;
  onSearchChange: (value: string) => void;
};

export function HistoryPanel({ records, search, onSearchChange }: HistoryPanelProps) {
  const filtered = records.filter((record) =>
    record.patient.fullName.toLowerCase().includes(search.trim().toLowerCase()),
  );

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-panel">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">Patient History</h2>
          <p className="text-sm text-slate-500">Search records by patient name.</p>
        </div>
        <label className="relative block w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            className="w-full rounded-md border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm outline-none ring-teal-500 focus:ring-2"
            placeholder="Search patient name"
          />
        </label>
      </div>

      <div className="mt-5 space-y-3">
        {filtered.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
            No history records found.
          </div>
        ) : (
          filtered.map((record) => (
            <article key={record.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-slate-950">{record.patient.fullName}</h3>
                    <span
                      className={
                        record.diagnosis === "Normal"
                          ? "rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-700"
                          : "rounded-full bg-rose-100 px-2 py-1 text-xs font-semibold text-rose-700"
                      }
                    >
                      {record.diagnosis}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-slate-500">{record.fileName}</p>
                </div>
                <div className="text-sm text-slate-500">
                  <div className="flex items-center gap-2">
                    <CalendarDays className="h-4 w-4" />
                    {new Date(record.createdAt).toLocaleString()}
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    {[record.patient.city, record.patient.state].filter(Boolean).join(", ") || "Location not added"}
                  </div>
                </div>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
