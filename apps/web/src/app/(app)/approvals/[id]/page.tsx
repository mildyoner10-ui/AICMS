"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Card,
  Notice,
  Page,
  PageHeader,
  RiskBadge,
  Spinner,
  StatusBadge,
  fmtDateTime,
} from "@/components/ui";
import { categoryLabel, changeTypeLabel, environmentLabel } from "@/lib/labels";

interface Step {
  id: string;
  step_code: string;
  step_order: number;
  role_name: string | null;
  status: string;
  decision: string | null;
  comment: string | null;
  decided_at: string | null;
}

interface Detail {
  task: {
    id: string;
    step_code: string;
    step_order: number;
    role_name: string | null;
    status: string;
    decision: string | null;
    comment: string | null;
    decided_at: string | null;
    actionable: boolean;
  };
  workflow: { id: string; status: string; current_step: string | null };
  change: {
    id: string;
    change_number: string;
    title: string;
    description: string | null;
    category: string;
    change_type: string;
    environment: string;
    status: string;
    risk_level: string | null;
    business_justification: string | null;
    impact_description: string | null;
    implementation_plan: string | null;
    test_plan: string | null;
    rollback_plan: string | null;
    affected_devices: string[];
    affected_services: string[];
    revision_number: number | null;
    task_is_stale: boolean;
  } | null;
  workflow_steps: Step[];
}

const STEP_TONE: Record<string, string> = {
  APPROVED: "bg-success-soft text-success ring-1 ring-inset ring-success/25",
  PENDING: "bg-warning-soft text-warning ring-1 ring-inset ring-warning/25",
  REJECTED: "bg-danger-soft text-danger ring-1 ring-inset ring-danger/25",
};

const DECISION_LABEL: Record<string, string> = {
  APPROVE: "Disetujui",
  REJECT: "Ditolak",
  REQUEST_REVISION: "Minta revisi",
  APPROVED: "Disetujui",
  REJECTED: "Ditolak",
  REVISION_REQUESTED: "Minta revisi",
};

export default function ApprovalDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const taskId = params?.id;

  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "success" | "danger" | "warning"; text: string } | null>(null);
  const [confirming, setConfirming] = useState<"APPROVE" | "REJECT" | "REQUEST_REVISION" | null>(null);

  const load = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/login");
      return;
    }
    try {
      const res = await fetch(`/api/v1/approvals/tasks/${taskId}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(res.status === 404 ? "Tugas tidak ditemukan." : "Tugas gagal dimuat.");
      setDetail(await res.json());
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Terjadi kesalahan.");
    } finally {
      setLoading(false);
    }
  }, [taskId, router]);

  useEffect(() => {
    void load();
  }, [load]);

  const decide = async (decision: "APPROVE" | "REJECT" | "REQUEST_REVISION") => {
    const label = { APPROVE: "Setujui", REJECT: "Tolak", REQUEST_REVISION: "Minta Revisi" }[decision];
    setBusy(true);
    setConfirming(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/v1/approvals/tasks/${taskId}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("token")}` },
        body: JSON.stringify({ decision, comment: comment || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.detail || `${label} gagal disimpan.`);
      setNotice({ kind: "success", text: `${label} tersimpan. Status perubahan: ${data.change_status}.` });
      setComment("");
      await load();
    } catch (e) {
      setNotice({ kind: "danger", text: e instanceof Error ? e.message : `${label} gagal disimpan.` });
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <Spinner label="Memuat tugas persetujuan…" />;

  if (error || !detail || !detail.change) {
    return (
      <>
        <PageHeader title="Tugas tidak tersedia" back={{ href: "/approvals", label: "Persetujuan" }} />
        <Page>
          <Card>
            <div role="alert">
              <p className="font-semibold text-danger">{error || "Tugas tidak ditemukan."}</p>
              <button onClick={() => router.push("/approvals")} className="btn-secondary btn-sm mt-4">
                Kembali ke inbox
              </button>
            </div>
          </Card>
        </Page>
      </>
    );
  }

  const { task, change, workflow_steps } = detail;
  const decided = task.status !== "PENDING";

  const decisionButtons = [
    {
      key: "APPROVE" as const,
      label: "Setujui",
      className: "btn-primary",
      confirm: "Setujui langkah ini? Keputusan tersimpan permanen di jejak audit.",
    },
    {
      key: "REQUEST_REVISION" as const,
      label: "Minta Revisi",
      className: "btn-secondary",
      confirm: "Minta revisi? Pemohon harus mengirim ulang CRF dan persetujuan ulang dimulai.",
      needsComment: true,
    },
    {
      key: "REJECT" as const,
      label: "Tolak",
      className: "btn-danger",
      confirm: "Tolak perubahan ini? Keputusan tersimpan permanen di jejak audit.",
      needsComment: true,
    },
  ];

  return (
    <>
      <PageHeader
        back={{ href: "/approvals", label: "Persetujuan" }}
        breadcrumb={
          <span>
            <span className="font-mono">{change.change_number}</span> · Langkah {task.step_order} dari{" "}
            {workflow_steps.length}
          </span>
        }
        title={change.title}
        description={`${categoryLabel(change.category)} · ${changeTypeLabel(change.change_type)} · ${environmentLabel(change.environment)} · Revisi ${change.revision_number ?? "—"}`}
        actions={
          <>
            <StatusBadge status={change.status} />
            <RiskBadge risk={change.risk_level} />
          </>
        }
      />

      <Page>
        {notice && (
          <Notice kind={notice.kind} onDismiss={() => setNotice(null)}>
            {notice.text}
          </Notice>
        )}

        {change.task_is_stale && (
          <Notice kind="warning">
            Tugas ini menunjuk revisi yang sudah diganti. Jangan diputuskan; minta pemohon mengirim ulang CRF.
          </Notice>
        )}

        <div className="space-y-6">
          <Card title={`Keputusan Anda — langkah ${task.step_order} (${task.role_name ?? task.step_code})`}>
            {decided ? (
              <div className="rounded-control bg-surface-muted px-4 py-3 text-sm">
                <p className="font-semibold text-foreground">Keputusan tercatat</p>
                <p className="mt-1 text-foreground">
                  {DECISION_LABEL[task.decision ?? task.status] ?? task.decision ?? task.status}
                  {task.decided_at ? ` · ${fmtDateTime(task.decided_at)}` : ""}
                  {task.comment ? (
                    <>
                      <br />
                      <span className="text-foreground-muted">“{task.comment}”</span>
                    </>
                  ) : null}
                </p>
              </div>
            ) : !task.actionable ? (
              <p className="rounded-control bg-warning-soft px-4 py-3 text-sm text-warning">
                Menunggu langkah persetujuan sebelumnya selesai. Anda belum dapat memutuskan.
              </p>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-foreground-muted">
                  Putuskan berdasarkan bukti CRF di halaman ini. Keputusan tidak dapat diubah setelah tersimpan; menolak
                  atau meminta revisi wajib menyertakan alasan.
                </p>
                <div>
                  <label htmlFor="comment" className="label">
                    Komentar <span className="text-foreground-muted">(wajib untuk tolak / minta revisi)</span>
                  </label>
                  <textarea
                    id="comment"
                    rows={3}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    className="field h-auto py-2"
                    placeholder="Dasar keputusan, mis. 3 temuan risiko tinggi belum ditangani."
                  />
                </div>

                {confirming ? (
                  <div className="rounded-control bg-surface-muted p-4" role="alertdialog" aria-label="Konfirmasi keputusan">
                    <p className="text-sm font-medium text-foreground">
                      {decisionButtons.find((b) => b.key === confirming)?.confirm}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        onClick={() => void decide(confirming)}
                        disabled={busy}
                        className={decisionButtons.find((b) => b.key === confirming)?.className}
                      >
                        {busy ? "Menyimpan…" : `Ya, ${decisionButtons.find((b) => b.key === confirming)?.label}`}
                      </button>
                      <button onClick={() => setConfirming(null)} className="btn-ghost">
                        Batal
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-3">
                    {decisionButtons.map((b) => (
                      <button
                        key={b.key}
                        disabled={busy || (b.needsComment && !comment.trim())}
                        title={b.needsComment && !comment.trim() ? "Isi komentar terlebih dahulu" : undefined}
                        onClick={() => setConfirming(b.key)}
                        className={b.className}
                      >
                        {b.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </Card>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
            <Card title="Alur persetujuan" description="Berurutan; setiap langkah harus selesai" className="lg:col-span-2">
              <ol className="space-y-3">
                {workflow_steps.map((step) => (
                  <li key={step.id} className="flex items-start gap-3 text-sm">
                    <span
                      className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold tabular-nums ${
                        STEP_TONE[step.status] ?? "bg-surface-muted text-foreground-muted ring-1 ring-inset ring-border-strong"
                      }`}
                      aria-hidden
                    >
                      {step.step_order}
                    </span>
                    <div className="min-w-0">
                      <p className="font-medium text-foreground">{step.role_name ?? step.step_code}</p>
                      <p className="text-meta text-foreground-muted">
                        {step.status === "APPROVED"
                          ? "Disetujui"
                          : step.status === "PENDING"
                            ? "Menunggu"
                            : step.status === "REJECTED"
                              ? "Ditolak"
                              : step.status.replace(/_/g, " ")}
                        {step.decided_at ? ` · ${fmtDateTime(step.decided_at)}` : ""}
                      </p>
                      {step.comment && <p className="mt-0.5 text-meta italic text-foreground-muted">“{step.comment}”</p>}
                    </div>
                  </li>
                ))}
              </ol>
            </Card>

            <Card title="Detail CRF" description="Cakupan dan kesiapan rollback yang Anda setujui" className="lg:col-span-3">
              <dl className="space-y-4 text-sm">
                {[
                  ["Justifikasi bisnis", change.business_justification],
                  ["Dampak", change.impact_description],
                  ["Rencana implementasi", change.implementation_plan],
                  ["Rencana uji", change.test_plan],
                  ["Rencana rollback", change.rollback_plan],
                ].map(([label, value]) => (
                  <div key={label as string}>
                    <dt className="text-meta font-semibold uppercase tracking-wide text-foreground-muted">{label}</dt>
                    <dd className={`mt-0.5 whitespace-pre-wrap ${label === "Rencana rollback" && !value ? "text-danger" : "text-foreground"}`}>
                      {value || (label === "Rencana rollback" ? "Tidak ada — rollback belum siap" : "—")}
                    </dd>
                  </div>
                ))}
                <div>
                  <dt className="text-meta font-semibold uppercase tracking-wide text-foreground-muted">Perangkat / layanan</dt>
                  <dd className="mt-1 font-mono text-xs text-foreground">
                    {(change.affected_devices || []).join(", ") || "—"}
                    <br />
                    {(change.affected_services || []).join(", ") || "—"}
                  </dd>
                </div>
              </dl>
            </Card>
          </div>
        </div>
      </Page>
    </>
  );
}