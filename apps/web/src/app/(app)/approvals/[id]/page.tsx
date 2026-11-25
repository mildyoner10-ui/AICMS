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
  APPROVED: "bg-success text-success",
  PENDING: "bg-warning text-warning",
  REJECTED: "bg-danger text-danger",
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
              <p className="fw-bold text-danger">{error || "Tugas tidak ditemukan."}</p>
              <button onClick={() => router.push("/approvals")} className="btn btn-secondary btn-sm mt-3">
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
      className: "btn btn-primary",
      confirm: "Setujui langkah ini? Keputusan tersimpan permanen di jejak audit.",
    },
    {
      key: "REQUEST_REVISION" as const,
      label: "Minta Revisi",
      className: "btn btn-secondary",
      confirm: "Minta revisi? Pemohon harus mengirim ulang CRF dan persetujuan ulang dimulai.",
      needsComment: true,
    },
    {
      key: "REJECT" as const,
      label: "Tolak",
      className: "btn btn-danger",
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
            <span className="fw-mono">{change.change_number}</span> · Langkah {task.step_order} dari{" "}
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

        <div className="d-flex flex-column gap-4">
          <Card title={`Keputusan Anda — langkah ${task.step_order} (${task.role_name ?? task.step_code})`}>
            {decided ? (
              <div className="rounded bg-body-secondary p-3 text-sm border">
                <p className="fw-bold text-body mb-1">Keputusan tercatat</p>
                <p className="text-body mb-0">
                  {DECISION_LABEL[task.decision ?? task.status] ?? task.decision ?? task.status}
                  {task.decided_at ? ` · ${fmtDateTime(task.decided_at)}` : ""}
                  {task.comment ? (
                    <>
                      <br />
                      <span className="text-muted">"{task.comment}"</span>
                    </>
                  ) : null}
                </p>
              </div>
            ) : !task.actionable ? (
              <p className="rounded bg-warning bg-opacity-25 p-3 text-sm text-warning fw-bold border border-warning/25">
                Menunggu langkah persetujuan sebelumnya selesai. Anda belum dapat memutuskan.
              </p>
            ) : (
              <div className="d-flex flex-column gap-3">
                <p className="text-sm text-muted">
                  Putuskan berdasarkan bukti CRF di halaman ini. Keputusan tidak dapat diubah setelah tersimpan; menolak
                  atau meminta revisi wajib menyertakan alasan.
                </p>
                <div>
                  <label htmlFor="comment" className="form-label">
                    Komentar <span className="text-muted">(wajib untuk tolak / minta revisi)</span>
                  </label>
                  <textarea
                    id="comment"
                    rows={3}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    className="form-control"
                    placeholder="Dasar keputusan, mis. 3 temuan risiko tinggi belum ditangani."
                  />
                </div>

                {confirming ? (
                  <div className="rounded bg-body-secondary p-4" role="alertdialog" aria-label="Konfirmasi keputusan">
                    <p className="text-sm fw-medium text-body">
                      {decisionButtons.find((b) => b.key === confirming)?.confirm}
                    </p>
                    <div className="mt-3 d-flex flex-wrap gap-2">
                      <button
                        onClick={() => void decide(confirming)}
                        disabled={busy}
                        className={decisionButtons.find((b) => b.key === confirming)?.className}
                      >
                        {busy ? "Menyimpan…" : `Ya, ${decisionButtons.find((b) => b.key === confirming)?.label}`}
                      </button>
                      <button onClick={() => setConfirming(null)} className="btn btn-link btn-sm text-decoration-none">
                        Batal
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="d-flex flex-wrap gap-2">
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

          <div className="row g-4">
            <div className="col-md-4">
              <Card title="Alur persetujuan" description="Berurutan; setiap langkah harus selesai">
                <ol className="d-flex flex-column gap-3">
                  {workflow_steps.map((step) => (
                    <li key={step.id} className="d-flex align-items-start gap-3 text-sm">
                      <span
                        className={`d-flex flex-shrink-0 align-items-center justify-content-center rounded-circle small fw-bold`}
                        style={{
                          minWidth: "24px",
                          width: "24px",
                          height: "24px",
                          backgroundColor: STEP_TONE[step.status] ? undefined : "var(--app-surface-secondary)",
                          color: STEP_TONE[step.status] ? "var(--app-text)" : "var(--app-text-muted)",
                          border: STEP_TONE[step.status] ? "1px solid" : "1px solid var(--app-border-strong)",
                        }}
                        aria-hidden
                      >
                        {step.step_order}
                      </span>
                      <div className="min-w-0">
                        <p className="fw-medium text-body mb-0">{step.role_name ?? step.step_code}</p>
                        <p className="text-muted small mb-0">
                          {step.status === "APPROVED"
                            ? "Disetujui"
                            : step.status === "PENDING"
                              ? "Menunggu"
                              : step.status === "REJECTED"
                                ? "Ditolak"
                                : step.status.replace(/_/g, " ")}
                          {step.decided_at ? ` · ${fmtDateTime(step.decided_at)}` : ""}
                        </p>
                        {step.comment && <p className="text-muted small fst-italic mb-0">"{step.comment}"</p>}
                      </div>
                    </li>
                  ))}
                </ol>
              </Card>
            </div>

            <div className="col-md-8">
              <Card title="Detail CRF" description="Cakupan dan kesiapan rollback yang Anda setujui">
                <dl className="d-flex flex-column gap-3 text-sm">
                  {[
                    ["Justifikasi bisnis", change.business_justification],
                    ["Dampak", change.impact_description],
                    ["Rencana implementasi", change.implementation_plan],
                    ["Rencana uji", change.test_plan],
                    ["Rencana rollback", change.rollback_plan],
                  ].map(([label, value]) => (
                    <div key={label as string}>
                      <dt className="text-muted small fw-bold text-uppercase mb-0">{label}</dt>
                      <dd className={`text-break mt-0 ${label === "Rencana rollback" && !value ? "text-danger" : "text-body"}`}>
                        {value || (label === "Rencana rollback" ? "Tidak ada — rollback belum siap" : "—")}
                      </dd>
                    </div>
                  ))}
                  <div>
                    <dt className="text-muted small fw-bold text-uppercase mb-0">Perangkat / layanan</dt>
                    <dd className="mt-0 fw-mono text-xs text-body">
                      {(change.affected_devices || []).join(", ") || "—"}
                      <br />
                      {(change.affected_services || []).join(", ") || "—"}
                    </dd>
                  </div>
                </dl>
              </Card>
            </div>
          </div>
        </div>
      </Page>
    </>
  );
}
