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
  USER: { label: "Manusia", cls: "bg-teal bg-opacity-15 text-teal-dark ring-1 ring-inset ring-teal/30" },
  HUMAN: { label: "Manusia", cls: "bg-teal bg-opacity-15 text-teal-dark ring-1 ring-inset ring-teal/30" },
  AI: { label: "AI", cls: "bg-gold bg-opacity-20 text-gold-dark ring-1 ring-inset ring-gold/30" },
  SYSTEM: { label: "Sistem", cls: "bg-cream text-text-muted ring-1 ring-inset ring-border" },
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
        <div className="mb-3 row g-3">
          <div className="col-12 col-sm-8">
            <label htmlFor="action-filter" className="form-label">
              Cari aksi
            </label>
            <input
              id="action-filter"
              type="search"
              placeholder="mis. diajukan, diunggah, disetujui…"
              value={action}
              onChange={(e) => setAction(e.target.value)}
              className="form-control"
            />
          </div>
          <div className="col-12 col-sm-4">
            <label htmlFor="object-filter" className="form-label">
              Jenis objek
            </label>
            <select id="object-filter" value={objectType} onChange={(e) => setObjectType(e.target.value)} className="form-control">
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
            <div className="overflow-auto border rounded" style={{ borderColor: "var(--app-border)", borderRadius: "var(--app-radius)" }}>
              <table className="w-100 table table-hover mb-0" style={{ minWidth: "820px" }}>
                <thead className="border-bottom" style={{ borderBottom: `1px solid var(--app-border)`, backgroundColor: "var(--app-surface-secondary)" }}>
                  <tr>
                    <th className="text-nowrap py-2 px-3 fw-semibold small">Waktu (WIB)</th>
                    <th className="text-nowrap py-2 px-3 fw-semibold small">Pelaku</th>
                    <th className="text-nowrap py-2 px-3 fw-semibold small">Aksi</th>
                    <th className="text-nowrap py-2 px-3 fw-semibold small">Objek</th>
                    <th className="text-nowrap py-2 px-3 fw-semibold small">Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((e) => {
                    const actor = ACTOR_UI[e.actor_type] ?? ACTOR_UI.SYSTEM;
                    const isOpen = open === e.id;
                    return (
                      <tr key={e.id} className="border-bottom align-top last-row:border-0" style={{ borderBottom: `1px solid var(--app-border)` }}>
                        <td className="py-2 px-3 text-muted small text-nowrap">{fmtDateTime(e.occurred_at)}</td>
                        <td className="py-2 px-3">
                          <span className={`chip ${actor.cls}`}>{actor.label}</span>
                          {e.actor_username && (
                            <span className="mt-1 d-block text-[11px] text-muted">{e.actor_username}</span>
                          )}
                        </td>
                        <td className="py-2 px-3 fw-semibold">{auditActionLabel(e.action)}</td>
                        <td className="py-2 px-3 text-muted">
                          {objectLabel(e.object_type)}
                          {e.object_label && <span className="d-block fw-medium" style={{ color: "var(--app-text)" }}>{e.object_label}</span>}
                        </td>
                        <td className="py-2 px-3">
                          {e.event_data && Object.keys(e.event_data).length > 0 ? (
                            <>
                              <button onClick={() => setOpen(isOpen ? null : e.id)} className="btn btn-sm btn-link text-decoration-none p-0">
                                {isOpen ? "Sembunyikan" : "Lihat"}
                              </button>
                              {isOpen && (
                                <pre className="mt-2 max-w-[380px] overflow-x-auto rounded bg-light p-2.5 font-monospace text-[11px] text-muted" style={{ borderRadius: "var(--app-radius)", backgroundColor: "var(--app-surface-secondary)" }}>
                                  {JSON.stringify(e.event_data, null, 2)}
                                </pre>
                              )}
                            </>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 border-top px-4 py-3 small text-muted" style={{ borderTop: `1px solid var(--app-border)`, backgroundColor: "var(--app-surface-secondary)" }}>
              <span>
                {total === 0
                  ? "Tidak ada peristiwa."
                  : `Menampilkan ${page * PAGE_SIZE + 1}–${page * PAGE_SIZE + visible.length} dari ${total} peristiwa. Catatan tidak dapat diubah atau dihapus.`}
              </span>
              <div className="d-flex gap-2">
                <button className="btn btn-sm btn-outline-secondary" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                  Sebelumnya
                </button>
                <button
                  className="btn btn-sm btn-outline-secondary"
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
