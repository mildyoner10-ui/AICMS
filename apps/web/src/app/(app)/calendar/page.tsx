"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DISPLAY_TZ,
  Card,
  EmptyState,
  ErrorState,
  EnvTag,
  Page,
  PageHeader,
  Skeleton,
  StatusBadge,
  fmtDateTime,
} from "@/components/ui";
import { CATEGORY, ENVIRONMENT, STATUS, categoryLabel, environmentLabel } from "@/lib/labels";

interface CalendarItem {
  id: string;
  change_number: string;
  title: string;
  status: string;
  implementation_start: string | null;
  implementation_end: string | null;
  category: string;
  environment: string;
  affected_devices: string[];
  affected_services: string[];
}

interface Conflicts {
  verdict: "CONFLICT" | "NO_CONFLICT" | "INDETERMINATE";
  conflicts: Array<{
    changes: string[];
    shared_devices: string[];
    shared_services: string[];
    overlap_start: string;
    overlap_end: string | null;
  }>;
  changes_without_dependency_data: string[];
  note: string;
}

const STATUSES = ["APPROVED", "SCHEDULED", "IN_PROGRESS", "VALIDATION"];

const VERDICT_UI: Record<Conflicts["verdict"], { mark: string; label: string; cls: string }> = {
  CONFLICT: { mark: "▲", label: "Jadwal bentrok terdeteksi", cls: "bg-coral bg-opacity-10 text-coral-dark" },
  INDETERMINATE: { mark: "◑", label: "Konflik tidak dapat dipastikan", cls: "bg-gold bg-opacity-20 text-gold-dark" },
  NO_CONFLICT: { mark: "●", label: "Tidak ada bentrok pada data yang tersedia", cls: "bg-teal bg-opacity-15 text-teal-dark" },
};

function toDateInput(d: Date): string {
  // Filter dates are WIB calendar days, not UTC days.
  return new Intl.DateTimeFormat("en-CA", { timeZone: DISPLAY_TZ }).format(d);
}

// WIB is a fixed UTC+7 offset (no DST), so a bare ISO offset is exact.
function wibBound(day: string, end: boolean): string {
  return `${day}T${end ? "23:59:59" : "00:00:00"}+07:00`;
}

export default function CalendarPage() {
  const router = useRouter();
  const today = new Date();
  const [from, setFrom] = useState(toDateInput(today));
  const [to, setTo] = useState(toDateInput(new Date(today.getTime() + 30 * 86400000)));
  const [status, setStatus] = useState("");
  const [category, setCategory] = useState("");
  const [environment, setEnvironment] = useState("");

  const [items, setItems] = useState<CalendarItem[]>([]);
  const [conflicts, setConflicts] = useState<Conflicts | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/login");
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams({ from: wibBound(from, false), to: wibBound(to, true) });
      if (status) params.set("status", status);
      if (category) params.set("category", category);
      if (environment) params.set("environment", environment);

      const [listRes, conflictRes] = await Promise.all([
        fetch(`/api/v1/calendar/changes?${params}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`/api/v1/calendar/conflicts?${params}`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (!listRes.ok) throw new Error("Kalender perubahan gagal dimuat.");
      setItems((await listRes.json()).items ?? []);
      setConflicts(conflictRes.ok ? await conflictRes.json() : null);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Terjadi kesalahan.");
    } finally {
      setLoading(false);
    }
  }, [from, to, status, category, environment, router]);

  useEffect(() => {
    void load();
  }, [load]);

  const verdict = conflicts ? VERDICT_UI[conflicts.verdict] : null;

  return (
    <>
      <PageHeader
        title="Kalender Perubahan"
        description="Jendela implementasi yang disetujui atau dijadwalkan. Waktu ditampilkan dalam WIB (UTC+7)."
      />

      <Page>
        <div className="mb-3">
          <Card title="Filter" description="Rentang dan atribut perubahan">
            <div className="row g-3">
              <div className="col-12 col-sm-6 col-lg">
                <label htmlFor="from" className="form-label">
                  Dari
                </label>
                <input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="form-control" />
              </div>
              <div className="col-12 col-sm-6 col-lg">
                <label htmlFor="to" className="form-label">
                  Sampai
                </label>
                <input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="form-control" />
              </div>
              <div className="col-12 col-sm-6 col-lg">
                <label htmlFor="status" className="form-label">
                  Status
                </label>
                <select id="status" value={status} onChange={(e) => setStatus(e.target.value)} className="form-control">
                  <option value="">Semua</option>
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {STATUS[s]?.label ?? s}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-12 col-sm-6 col-lg">
                <label htmlFor="category" className="form-label">
                  Kategori
                </label>
                <select id="category" value={category} onChange={(e) => setCategory(e.target.value)} className="form-control">
                  <option value="">Semua</option>
                  {Object.keys(CATEGORY).map((c) => (
                    <option key={c} value={c}>
                      {categoryLabel(c)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-12 col-sm-6 col-lg">
                <label htmlFor="environment" className="form-label">
                  Lingkungan
                </label>
                <select id="environment" value={environment} onChange={(e) => setEnvironment(e.target.value)} className="form-control">
                  <option value="">Semua</option>
                  {Object.keys(ENVIRONMENT).map((e) => (
                    <option key={e} value={e}>
                      {environmentLabel(e)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </Card>

          {conflicts && verdict && (
            <div className={`rounded-card p-4 ${verdict.cls}`} aria-live="polite">
              <p className="d-flex align-items-center gap-2 small fw-bold">
                <span aria-hidden>{verdict.mark}</span>
                {verdict.label}
              </p>
              <p className="mt-2 small opacity-90">{conflicts.note}</p>
              {conflicts.conflicts.length > 0 && (
                <ul className="mt-2 space-y-1 small">
                  {conflicts.conflicts.map((c) => (
                    <li key={`${c.changes.join("-")}-${c.overlap_start}`}>
                      <span className="font-monospace">{c.changes.join(" ↔ ")}</span> ·{" "}
                      {[...c.shared_devices, ...c.shared_services].join(", ")} · {fmtDateTime(c.overlap_start)}
                      {c.overlap_end ? ` – ${fmtDateTime(c.overlap_end)}` : ""}
                    </li>
                  ))}
                </ul>
              )}
              {conflicts.changes_without_dependency_data.length > 0 && (
                <p className="mt-2 text-meta opacity-90">
                  Tanpa data dependensi: <span className="font-monospace">{conflicts.changes_without_dependency_data.join(", ")}</span>. Konflik
                  tidak diklaim untuk perubahan ini.
                </p>
              )}
            </div>
          )}

          {loading && <Skeleton rows={3} />}

          {!loading && error && <ErrorState message={error} onRetry={() => void load()} />}

          {!loading && !error && items.length === 0 && (
            <Card>
              <EmptyState
                title="Tidak ada perubahan pada rentang ini"
                description="Perlebar rentang tanggal atau longgarkan filter untuk melihat jendela implementasi lain."
              />
            </Card>
          )}

          {!loading && !error && items.length > 0 && (
            <ul className="space-y-3">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    onClick={() => router.push(`/changes/${item.id}`)}
                    className="card w-100 p-4 text-start d-block mb-3 border-0"
                    style={{
                      borderColor: "var(--app-border)",
                      backgroundColor: "var(--app-surface)",
                      transition: "border-color 150ms ease",
                      borderRadius: "var(--app-radius)",
                      cursor: "pointer",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--app-primary)")}
                    onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--app-border)")}
                  >
                    <div className="d-flex flex-wrap align-items-start justify-content-between gap-3">
                      <div className="min-w-0">
                        <p className="font-monospace small text-primary">{item.change_number}</p>
                        <p className="small fw-semibold" style={{ color: "var(--app-text)" }}>{item.title}</p>
                        <p className="mt-1 small text-muted">
                          {fmtDateTime(item.implementation_start)} – {fmtDateTime(item.implementation_end)} ·{" "}
                          {categoryLabel(item.category)}
                        </p>
                        {(item.affected_devices.length > 0 || item.affected_services.length > 0) && (
                          <p className="mt-1 font-monospace small text-muted">
                            {[...item.affected_devices, ...item.affected_services].join(", ")}
                          </p>
                        )}
                      </div>
                      <div className="d-flex flex-wrap align-items-center gap-2">
                        <EnvTag env={environmentLabel(item.environment)} />
                        <StatusBadge status={item.status} />
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Page>
    </>
  );
}
