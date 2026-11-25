"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, EmptyState, ErrorState, Page, PageHeader, RiskBadge, Skeleton } from "@/components/ui";

interface InboxTask {
  id: string;
  step_code: string;
  step_order: number;
  role_name: string | null;
  status: string;
  due_at: string | null;
  actionable: boolean;
  change: {
    id: string;
    change_number: string;
    title: string;
    status: string;
    risk_level: string | null;
  } | null;
}

interface Inbox {
  pending_count: number;
  tasks: InboxTask[];
}

export default function ApprovalsPage() {
  const router = useRouter();
  const [inbox, setInbox] = useState<Inbox | null>(null);
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
      const res = await fetch("/api/v1/approvals/inbox", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Inbox persetujuan gagal dimuat.");
      setInbox(await res.json());
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Terjadi kesalahan.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  const actionable = inbox?.tasks.filter((t) => t.actionable).length ?? 0;
  const waiting = (inbox?.tasks.length ?? 0) - actionable;

  return (
    <>
      <PageHeader
        title="Persetujuan"
        description="Tugas persetujuan untuk peran Anda. Langkah berurutan: tugas hanya dapat diputuskan setelah langkah sebelumnya disetujui."
      />

      <Page>
        {loading && <Skeleton rows={4} />}

        {!loading && error && <ErrorState message={error} onRetry={() => void load()} />}

        {!loading && !error && inbox && (
          <div>
            <div className="row g-3">
              <div className="col-md-4">
                <div className="card card-body p-3">
                  <p className="text-kpi tabular-nums text-warning mb-0">{actionable}</p>
                  <p className="mt-1 text-[13px] fw-semibold mb-0">Dapat diputuskan</p>
                  <p className="text-meta mb-0">Menunggu tindakan Anda</p>
                </div>
              </div>
              <div className="col-md-4">
                <div className="card card-body p-3">
                  <p className="text-kpi tabular-nums text-body mb-0">{waiting}</p>
                  <p className="mt-1 text-[13px] fw-semibold mb-0">Menunggu langkah sebelumnya</p>
                  <p className="text-meta mb-0">Bukan tugas Anda saat ini</p>
                </div>
              </div>
              <div className="col-md-4">
                <div className="card card-body p-3">
                  <p className="text-kpi tabular-nums text-body mb-0">{inbox.tasks.length}</p>
                  <p className="mt-1 text-[13px] fw-semibold mb-0">Total tugas aktif</p>
                  <p className="text-meta mb-0">Di seluruh alur</p>
                </div>
              </div>
            </div>

            {inbox.tasks.length === 0 ? (
              <Card>
                <EmptyState
                  title="Tidak ada tugas persetujuan"
                  description="Tugas baru muncul di sini saat sebuah perubahan membutuhkan keputusan dari peran Anda."
                />
              </Card>
            ) : (
              <div className="d-flex flex-column gap-3">
                {inbox.tasks.map((task) => (
                  <button
                    key={task.id}
                    onClick={() => task.change && router.push(`/approvals/${task.id}`)}
                    className="card w-100 text-start p-3 transition-colors duration-ui"
                    style={{ cursor: "pointer", border: "1px solid var(--app-border)" }}
                    onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--app-primary)")}
                    onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--app-border)")}
                  >
                    <div className="d-flex flex-wrap align-items-start justify-content-between gap-3">
                      <div style={{ minWidth: 0 }}>
                        <p className="font-monospace text-meta text-brand mb-0">{task.change?.change_number ?? "—"}</p>
                        <p className="text-truncate text-sm fw-semibold mb-0" style={{ fontSize: "14px" }}>
                          {task.change?.title ?? "Perubahan tidak ditemukan"}
                        </p>
                        <p className="text-meta mt-1 mb-0">
                          Langkah {task.step_order} · {task.role_name ?? task.step_code}
                        </p>
                      </div>
                      <div className="d-flex flex-wrap align-items-center gap-2">
                        <RiskBadge risk={task.change?.risk_level ?? null} />
                        <span
                          className={`chip ${
                            task.actionable
                              ? "bg-success-soft ring-1 ring-inset"
                              : "bg-warning-soft ring-1 ring-inset"
                          }`}
                          style={{
                            borderColor: task.actionable
                              ? "color-mix(in srgb, var(--app-success) 25%, transparent)"
                              : "color-mix(in srgb, var(--app-warning) 25%, transparent)",
                          }}
                        >
                          <span aria-hidden>{task.actionable ? "●" : "◑"}</span>
                          {task.actionable ? "Dapat diputuskan" : "Menunggu langkah sebelumnya"}
                        </span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </Page>
    </>
  );
}
