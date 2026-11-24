"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, EmptyState, ErrorState, Page, PageHeader, Skeleton, fmtDateTime } from "@/components/ui";
import { auditActionLabel } from "@/lib/labels";

interface AuditEvent {
  id: string;
  actor_user_id: string | null;
  actor_username: string | null;
  object_label: string | null;
  actor_type: string;
  action: string;
  object_type: string;
  object_id: string;
  event_data: Record<string, unknown> | null;
  occurred_at: string | null;
}

const ACTOR_UI: Record<string, { label: string; cls: string }> = {
  USER: { label: "Manusia", cls: "bg-brand-soft text-brand ring-1 ring-inset ring-brand/20" },
  HUMAN: { label: "Manusia", cls: "bg-brand-soft text-brand ring-1 ring-inset ring-brand/20" },
  AI: { label: "AI", cls: "bg-warning-soft text-warning ring-1 ring-inset ring-warning/25" },
  SYSTEM: { label: "Sistem", cls: "bg-surface-muted text-foreground-muted ring-1 ring-inset ring-border-strong" },
};

const OBJECT_LABEL: Record<string, string> = {
  change: "Perubahan",
  change_request: "Perubahan",
  document: "Dokumen",
  review: "Tinjauan AI",
  review_job: "Tinjauan AI",
  approval: "Persetujuan",
  approval_task: "Tugas persetujuan",
  user: "Pengguna",
  implementation: "Implementasi",
  pir: "Laporan pasca-implementasi",
};

const objectLabel = (t: string) => OBJECT_LABEL[t.toLowerCase()] ?? t.replace(/_/g, " ").toLowerCase();

export default function AuditPage() {
  const router = useRouter();
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [action, setAction] = useState("");
  const [objectType, setObjectType] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const PAGE_SIZE = 50;

  const load = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/login");
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(page * PAGE_SIZE) });
      if (objectType) params.set("object_type", objectType);
      const res = await fetch(`/api/v1/audit-events?${params}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Jejak audit gagal dimuat.");
      const data = await res.json();
      setEvents(data.items ?? []);
      setTotal(data.total ?? 0);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Terjadi kesalahan.");
    } finally {
      setLoading(false);
    }
  }, [router, objectType, page]);

  useEffect(() => {
    setPage(0);
  }, [objectType]);

  useEffect(() => {
    void load();
  }, [load]);

  const needle = action.trim().toLowerCase();
  const visible = needle
    ? events.filter(
        (e) => auditActionLabel(e.action).toLowerCase().includes(needle) || e.action.toLowerCase().includes(needle),
      )
    : events;
  const objectTypes = [...new Set(events.map((e) => e.object_type))].sort();

  return (
    <>
      <PageHeader
        title="Jejak Audit"
        description="Riwayat append-only untuk aksi sensitif: unggah, tinjauan AI, persetujuan, eksekusi, rollback, dan penghapusan. Catatan manusia, AI, dan sistem dibedakan."
      />

      <Page wide>
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <label htmlFor="action-filter" className="label">
              Cari aksi
            </label>
            <input
              id="action-filter"
              type="search"
              placeholder="mis. diajukan, diunggah, disetujui…"
              value={action}
              onChange={(e) => setAction(e.target.value)}
              className="field"
            />
          </div>
          <div>
            <label htmlFor="object-filter" className="label">
              Jenis objek
            </label>
            <select id="object-filter" value={objectType} onChange={(e) => setObjectType(e.target.value)} className="field">
              <option value="">Semua</option>
              {objectTypes.map((t) => (
                <option key={t} value={t}>
                  {objectLabel(t)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {loading && <Skeleton rows={6} />}

        {!loading && error && <ErrorState message={error} onRetry={() => void load()} />}

        {!loading && !error && visible.length === 0 && (
          <Card>
            <EmptyState
              title="Tidak ada peristiwa audit"
              description="Peristiwa muncul otomatis saat CRF dibuat, dokumen diunggah, tinjauan AI berjalan, atau persetujuan diputuskan."
            />
          </Card>
        )}

        {!loading && !error && visible.length > 0 && (
          <Card className="overflow-hidden [&>div]:p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px]">
                <thead className="border-b border-border bg-surface-muted">
                  <tr>
                    <th className="th">Waktu (WIB)</th>
                    <th className="th">Pelaku</th>
                    <th className="th">Aksi</th>
                    <th className="th">Objek</th>
                    <th className="th">Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((e) => {
                    const actor = ACTOR_UI[e.actor_type] ?? ACTOR_UI.SYSTEM;
                    const isOpen = open === e.id;
                    return (
                      <tr key={e.id} className="border-b border-border align-top last:border-0">
                        <td className="td whitespace-nowrap text-foreground-muted">{fmtDateTime(e.occurred_at)}</td>
                        <td className="td">
                          <span className={`chip ${actor.cls}`}>{actor.label}</span>
                          {e.actor_username && (
                            <span className="mt-1 block text-[11px] text-foreground-muted">{e.actor_username}</span>
                          )}
                        </td>
                        <td className="td font-semibold">{auditActionLabel(e.action)}</td>
                        <td className="td text-foreground-muted">
                          {objectLabel(e.object_type)}
                          {e.object_label && <span className="block font-medium text-foreground">{e.object_label}</span>}
                        </td>
                        <td className="td">
                          {e.event_data && Object.keys(e.event_data).length > 0 ? (
                            <>
                              <button onClick={() => setOpen(isOpen ? null : e.id)} className="btn-ghost btn-sm">
                                {isOpen ? "Sembunyikan" : "Lihat"}
                              </button>
                              {isOpen && (
                                <pre className="mt-2 max-w-[380px] overflow-x-auto rounded-control bg-surface-muted p-2.5 font-mono text-[11px] text-foreground">
                                  {JSON.stringify(e.event_data, null, 2)}
                                </pre>
                              )}
                            </>
                          ) : (
                            <span className="text-foreground-muted">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-surface-muted px-4 py-3 text-meta text-foreground-muted">
              <span>
                {total === 0
                  ? "Tidak ada peristiwa."
                  : `Menampilkan ${page * PAGE_SIZE + 1}–${page * PAGE_SIZE + visible.length} dari ${total} peristiwa. Catatan tidak dapat diubah atau dihapus.`}
              </span>
              <div className="flex items-center gap-2">
                <button className="btn-secondary btn-sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                  Sebelumnya
                </button>
                <button
                  className="btn-secondary btn-sm"
                  disabled={page * PAGE_SIZE + visible.length >= total}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Berikutnya
                </button>
              </div>
            </div>
          </Card>
        )}
      </Page>
    </>
  );
}