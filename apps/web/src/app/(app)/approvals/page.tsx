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
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="card p-4">
                <p className="text-kpi tabular-nums text-warning">{actionable}</p>
                <p className="mt-1 text-[13px] font-semibold">Dapat diputuskan</p>
                <p className="text-meta text-foreground-muted">Menunggu tindakan Anda</p>
              </div>
              <div className="card p-4">
                <p className="text-kpi tabular-nums text-foreground">{waiting}</p>
                <p className="mt-1 text-[13px] font-semibold">Menunggu langkah sebelumnya</p>
                <p className="text-meta text-foreground-muted">Bukan tugas Anda saat ini</p>
              </div>
              <div className="card p-4">
                <p className="text-kpi tabular-nums text-foreground">{inbox.tasks.length}</p>
                <p className="mt-1 text-[13px] font-semibold">Total tugas aktif</p>
                <p className="text-meta text-foreground-muted">Di seluruh alur</p>
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
              <ul className="space-y-3">
                {inbox.tasks.map((task) => (
                  <li key={task.id}>
                    <button
                      onClick={() => task.change && router.push(`/approvals/${task.id}`)}
                      className="card w-full p-4 text-left transition-colors duration-ui hover:border-brand"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="min-w-0">
                          <p className="font-mono text-meta text-brand">{task.change?.change_number ?? "—"}</p>
                          <p className="truncate text-sm font-semibold text-foreground">
                            {task.change?.title ?? "Perubahan tidak ditemukan"}
                          </p>
                          <p className="mt-1 text-meta text-foreground-muted">
                            Langkah {task.step_order} · {task.role_name ?? task.step_code}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <RiskBadge risk={task.change?.risk_level ?? null} />
                          <span
                            className={`chip ${
                              task.actionable
                                ? "bg-success-soft text-success ring-1 ring-inset ring-success/25"
                                : "bg-warning-soft text-warning ring-1 ring-inset ring-warning/25"
                            }`}
                          >
                            <span aria-hidden>{task.actionable ? "●" : "◑"}</span>
                            {task.actionable ? "Dapat diputuskan" : "Menunggu langkah sebelumnya"}
                          </span>
                        </div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Page>
    </>
  );
}