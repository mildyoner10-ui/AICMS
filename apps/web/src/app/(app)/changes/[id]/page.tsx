"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Card,
  EnvTag,
  ErrorState,
  Notice,
  Page,
  PageHeader,
  RiskBadge,
  Spinner,
  StatusBadge,
  fmtDateTime,
  useMe,
} from "@/components/ui";
import { CATEGORY, CHANGE_TYPE, ENVIRONMENT, categoryLabel, changeTypeLabel, environmentLabel, statusLabel } from "@/lib/labels";

interface Change {
  id: string;
  change_number: string;
  title: string;
  description: string | null;
  category: string;
  change_type: string;
  environment: string;
  status: string;
  risk_level?: string | null;
  requester_name: string | null;
  current_revision_number: number | null;
  business_justification: string | null;
  implementation_plan: string | null;
  test_plan: string | null;
  rollback_plan: string | null;
  impact_description: string | null;
  affected_devices: string[];
  affected_services: string[];
  created_at: string;
  updated_at: string;
  submitted_at: string | null;
}

interface History {
  status_history: Array<{
    id: string;
    from_status: string | null;
    to_status: string;
    revision_id: string | null;
    actor_user_id: string | null;
    actor_name: string | null;
    actor_type: string;
    reason: string | null;
    occurred_at: string;
  }>;
  revisions: Array<{
    id: string;
    revision_number: number;
    content_hash: string | null;
    is_current: boolean;
    locked: boolean;
    created_at: string;
  }>;
  events: Array<{
    id: string;
    action: string;
    actor_user_id: string | null;
    actor_name: string | null;
    actor_type: string;
    event_data: Record<string, unknown>;
    occurred_at: string;
  }>;
}

interface Gate {
  ready: boolean;
  blocking_reasons: string[];
}

// Statuses where execution readiness no longer means anything.
const TERMINAL_STATUSES = ["CLOSED", "COMPLETED", "CANCELLED", "REJECTED", "FAILED", "ROLLED_BACK"];

function gateReasonText(reason: string): string {
  const status = /^status (\S+) is not executable$/.exec(reason);
  if (status) return `Status ${statusLabel(status[1])} belum siap dieksekusi.`;
  if (reason === "no approved revision on record") return "Belum ada revisi yang disetujui.";
  if (reason === "current revision differs from the approved revision")
    return "Revisi saat ini berbeda dari revisi yang disetujui; ajukan dan setujui ulang.";
  return reason;
}

interface Evidence {
  document_id?: string | null;
  filename?: string | null;
  field?: string | null;
  page?: number | null;
  line?: number | null;
  section?: string | null;
  snippet?: string | null;
}

interface Finding {
  id: string;
  check_category: string;
  check_name: string;
  status: string;
  severity: string;
  title: string;
  description: string | null;
  evidence: Evidence[];
  remediation: string | null;
  confidence: number | null;
  human_validation_required: boolean;
}

interface ImplementationRecordData {
  id: string;
  actual_start: string | null;
  actual_end: string | null;
  outcome: string | null;
  execution_notes: string | null;
  postcheck: Record<string, unknown> | null;
  rollback_performed: boolean;
}

interface Review {
  id: string;
  status: string;
  provider: string | null;
  model_name: string | null;
  prompt_version: string | null;
  ruleset_version: string | null;
  completed_at: string | null;
  review_error?: string | null;
  result?: {
    recommendation: string | null;
    overall_risk_score: number | null;
    summary: string | null;
    limitations: string[];
    result_json: { provider_label?: string };
    decision?: string | null;
    decision_comment?: string | null;
    decided_at?: string | null;
    decided_by?: string | null;
    findings: Finding[];
  };
}

const FINDING_TONE: Record<string, string> = {
  PASS: "bg-success bg-opacity-10 text-success border border-success/25",
  WARN: "bg-warning bg-opacity-20 text-warning border border-warning/30",
  FAIL: "bg-danger bg-opacity-10 text-danger border border-danger/25",
  NOT_ASSESSED: "bg-body-secondary text-muted border",
};
const FINDING_LABEL: Record<string, string> = {
  PASS: "Lolos",
  WARN: "Perhatian",
  FAIL: "Temuan",
  NOT_ASSESSED: "Tidak dinilai",
};
const SEVERITY_TONE: Record<string, string> = {
  CRITICAL: "bg-danger text-danger bg-opacity-10",
  HIGH: "bg-danger text-danger bg-opacity-10",
  MEDIUM: "bg-warning bg-opacity-20 text-warning",
  LOW: "bg-body-secondary text-muted",
  INFORMATIONAL: "bg-info bg-opacity-10 text-info",
};
const SEVERITY_LABEL: Record<string, string> = {
  CRITICAL: "Kritis",
  HIGH: "Tinggi",
  MEDIUM: "Sedang",
  LOW: "Rendah",
  INFORMATIONAL: "Informasi",
};
const RECOMMENDATION: Record<string, { label: string; note: string; tone: string }> = {
  RECOMMEND_APPROVE: {
    label: "Rekomendasi: setujui",
    note: "Tidak ada temuan penghalang. Persetujuan manusia tetap wajib.",
    tone: "bg-success bg-opacity-10 text-success",
  },
  RECOMMEND_APPROVE_WITH_CONDITIONS: {
    label: "Rekomendasi: setujui dengan syarat",
    note: "Selesaikan syarat di bawah sebelum persetujuan manusia.",
    tone: "bg-warning bg-opacity-20 text-warning",
  },
  RECOMMEND_REJECT: {
    label: "Rekomendasi: tolak",
    note: "Terdapat risiko penghalang atau pelanggaran kebijakan.",
    tone: "bg-danger bg-opacity-10 text-danger",
  },
  UNABLE_TO_CONCLUDE: {
    label: "Tidak dapat menyimpulkan",
    note: "Konteks kurang atau berkas tidak terbaca. Tinjauan manusia diperlukan.",
    tone: "bg-body-secondary text-muted",
  },
};

function evidenceLabel(e: Evidence): string {
  const where = [
    e.filename,
    e.field ? `field: ${e.field}` : null,
    e.section,
    e.line ? `baris ${e.line}` : null,
    e.page ? `hal. ${e.page}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return where || "tanpa rujukan";
}

function ReviewPanel({
  review,
  onRerun,
  busy,
  canRerun,
  canDecide,
  onDecide,
}: {
  review: Review;
  onRerun: () => void;
  busy: boolean;
  canRerun: boolean;
  canDecide: boolean;
  onDecide: (decision: "ACCEPT" | "RETURN_FOR_REVISION", comment: string) => Promise<void>;
}) {
  const result = review.result;
  const running = review.status === "QUEUED" || review.status === "RUNNING";
  const rec = result?.recommendation ? RECOMMENDATION[result.recommendation] : null;
  const findings = result?.findings ?? [];
  const counts = findings.reduce<Record<string, number>>((acc, f) => ({ ...acc, [f.status]: (acc[f.status] ?? 0) + 1 }), {});
  const blockers = findings.filter(
    (f) => f.status === "FAIL" && (f.severity === "HIGH" || f.severity === "CRITICAL"),
  ).length;
  const [deciding, setDeciding] = useState<"ACCEPT" | "RETURN_FOR_REVISION" | null>(null);
  const [comment, setComment] = useState("");
  const showDecision = canDecide && !running && review.status === "COMPLETED" && !!result;

  return (
    <Card
      title="Tinjauan AI"
      description="Saran berbasis bukti. AI tidak pernah menyetujui, menolak, atau mengeksekusi perubahan."
      actions={
        <>
          {result?.result_json?.provider_label && (
            <span className="badge bg-info text-info">{result.result_json.provider_label}</span>
          )}
          <StatusBadge status={running ? "AI_REVIEW" : review.status === "FAILED" ? "REVIEW_FAILED" : "COMPLETED"} />
          {canRerun && (review.status === "FAILED" || !running) && (
            <button type="button" onClick={onRerun} disabled={busy} className="btn btn-secondary btn-sm">
              {review.status === "FAILED" ? "Jalankan ulang tinjauan" : "Tinjau ulang"}
            </button>
          )}
        </>
      }
    >
      {running ? (
        <div className="d-flex align-items-center gap-3 text-sm text-muted" role="status">
          <span className="spinner-border spinner-border-sm" aria-hidden></span>
          Tinjauan sedang diproses oleh worker. Hasil muncul otomatis.
        </div>
      ) : review.status === "FAILED" ? (
        <div role="alert" className="alert alert-danger alert-sm">
          {review.review_error || "Tinjauan AI gagal diproses. Silakan jalankan ulang."}
        </div>
      ) : !result ? (
        <p className="text-sm text-muted">Belum ada hasil tinjauan.</p>
      ) : (
        <div className="d-flex flex-column gap-4">
          {rec && (
            <div className={`p-4 rounded ${rec.tone}`}>
              <p className="small fw-bold mb-1">{rec.label}</p>
              <p className="small mb-0 opacity-75">{rec.note}</p>
            </div>
          )}

          <dl className="row g-3 text-sm">
            {[
              ["Skor risiko", result.overall_risk_score != null ? `${result.overall_risk_score}/100` : "—"],
              ["Provider", review.provider ?? "—"],
              ["Model", review.model_name ?? "—"],
              ["Selesai", fmtDateTime(review.completed_at)],
            ].map(([k, v]) => (
              <div key={k} className="col-6 col-md-3">
                <div className="p-3 rounded bg-body-secondary">
                  <dt className="text-muted small mb-0">{k}</dt>
                  <dd className="mt-1 fw-semibold tabular-nums mb-0">{v}</dd>
                </div>
              </div>
            ))}
          </dl>

          <div className="d-flex flex-wrap gap-2">
            {(["FAIL", "WARN", "PASS", "NOT_ASSESSED"] as const)
              .filter((s) => counts[s])
              .map((s) => (
                <span key={s} className={`badge ${FINDING_TONE[s]}`}>
                  {counts[s]} {FINDING_LABEL[s]}
                </span>
              ))}
          </div>

          {result.summary && <p className="text-sm">{result.summary}</p>}

          <div>
            <h3 className="text-muted small fw-bold text-uppercase mb-2">Temuan</h3>
            {findings.length === 0 ? (
              <p className="text-sm text-muted">Tidak ada temuan. Ini bukan jaminan perubahan aman.</p>
            ) : (
              <ul className="d-flex flex-column gap-3">
                {findings.map((f) => (
                  <li key={f.id} className="border rounded p-4">
                    <div className="d-flex flex-wrap align-items-center gap-2">
                      <span className={`badge ${FINDING_TONE[f.status] ?? FINDING_TONE.NOT_ASSESSED}`}>
                        {FINDING_LABEL[f.status] ?? f.status}
                      </span>
                      <span className={`badge ${SEVERITY_TONE[f.severity] ?? SEVERITY_TONE.LOW}`}>
                        {SEVERITY_LABEL[f.severity] ?? f.severity}
                      </span>
                      <span className="text-sm fw-semibold text-body">{f.title}</span>
                      {f.human_validation_required && (
                        <span className="badge bg-info text-info">perlu validasi manusia</span>
                      )}
                    </div>
                    {f.description && <p className="mt-2 text-sm text-body">{f.description}</p>}
                    {f.evidence.length > 0 ? (
                      <ul className="mt-2 d-flex flex-column gap-1">
                        {f.evidence.map((e, i) => (
                          <li key={i} className="text-muted small">
                            <span className="fw-semibold text-body">Bukti:</span> {evidenceLabel(e)}
                            {e.snippet && (
                              <code className="d-block mt-1 overflow-x-auto text-break rounded bg-body-secondary px-2.5 py-1.5 fw-mono" style={{ fontSize: "12px" }}>
                                {e.snippet}
                              </code>
                            )}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-2 text-muted small fst-italic text-warning">Tanpa bukti rujukan — verifikasi manual.</p>
                    )}
                    {f.remediation && (
                      <p className="mt-2 rounded bg-warning bg-opacity-25 px-2.5 py-1.5 text-muted small text-warning">
                        Saran: {f.remediation}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {result.limitations.length > 0 && (
            <div className="p-3 rounded bg-body-secondary">
              <h3 className="text-muted small fw-bold text-uppercase mb-1">Keterbatasan</h3>
              <ul className="mt-1 list-unstyled mb-0 text-muted small">
                {result.limitations.map((l) => (
                  <li key={l}>• {l}</li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-muted small">
            Prompt {review.prompt_version ?? "—"} · Ruleset {review.ruleset_version ?? "—"}. Skor tinggi tidak menjamin
            perubahan aman.
          </p>

          {result.decision ? (
            <div className="p-4 rounded bg-body-secondary text-sm">
              <p className="fw-semibold text-body mb-1">
                Keputusan reviewer: {result.decision === "ACCEPT" ? "Hasil tinjauan diterima" : "Dikembalikan untuk perbaikan"}
              </p>
              <p className="text-muted small mb-1">
                {result.decided_by ?? "—"} · {fmtDateTime(result.decided_at)}
              </p>
              {result.decision_comment && (
                <p className="text-body mt-2">"{result.decision_comment}"</p>
              )}
            </div>
          ) : showDecision ? (
            <div className="border rounded p-4">
              <h3 className="text-sm fw-semibold text-body">Keputusan reviewer</h3>
              <p className="text-muted small mt-1">
                Periksa bukti tiap temuan. Menerima hasil tinjauan meneruskan CRF ke persetujuan; mengembalikannya membuat
                pemohon memperbaiki dokumen lalu mengirim ulang. Alasan keputusan wajib diisi dan tercatat di audit.
              </p>
              {blockers > 0 && (
                <p className="mt-2 rounded bg-warning bg-opacity-25 px-2.5 py-1.5 text-warning small">
                  {blockers} temuan risiko tinggi/kritis masih terbuka. Anda tetap boleh menerima bila setelah tinjauan
                  manual risikonya dapat diterima — sebutkan alasannya. Temuan AI tidak berubah; persetujuan tetap lewat alur
                  approval.
                </p>
              )}
              <div className="mt-3">
                <label htmlFor="review-comment" className="form-label">
                  Alasan / catatan keputusan <span className="text-danger">*</span>
                </label>
                <textarea
                  id="review-comment"
                  rows={3}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  className="form-control"
                  placeholder="mis. Risiko diterima karena perubahan dijadwalkan di luar jam sibuk dan rollback sudah diuji."
                />
              </div>
              {deciding ? (
                <div className="mt-3 rounded bg-body-secondary p-3" role="alertdialog" aria-label="Konfirmasi keputusan">
                  <p className="text-sm text-body">
                    {deciding === "ACCEPT"
                      ? "Terima hasil tinjauan ini? CRF diteruskan ke persetujuan dan keputusan tercatat di audit."
                      : "Kembalikan CRF untuk perbaikan? Pemohon harus memperbaiki dokumen dan mengirim ulang."}
                  </p>
                  <div className="mt-2 d-flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy || !comment.trim()}
                      onClick={async () => {
                        await onDecide(deciding, comment);
                        setDeciding(null);
                        setComment("");
                      }}
                      className={deciding === "ACCEPT" ? "btn btn-primary btn-sm" : "btn btn-danger btn-sm"}
                    >
                      {busy ? "Menyimpan…" : deciding === "ACCEPT" ? "Ya, terima" : "Ya, kembalikan"}
                    </button>
                    <button type="button" onClick={() => setDeciding(null)} className="btn btn-link btn-sm text-decoration-none">
                      Batal
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-3 d-flex flex-wrap gap-3">
                  <button
                    type="button"
                    disabled={busy || !comment.trim()}
                    title={!comment.trim() ? "Isi alasan keputusan terlebih dahulu" : undefined}
                    onClick={() => setDeciding("ACCEPT")}
                    className="btn btn-primary"
                  >
                    Terima hasil tinjauan
                  </button>
                  <button
                    type="button"
                    disabled={busy || !comment.trim()}
                    title={!comment.trim() ? "Isi alasan keputusan terlebih dahulu" : undefined}
                    onClick={() => setDeciding("RETURN_FOR_REVISION")}
                    className="btn btn-secondary"
                  >
                    Kembalikan ke pemohon
                  </button>
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}
    </Card>
  );
}

interface DocumentItem {
  id: string;
  original_filename: string;
  document_type: string | null;
  version_number: number;
  sha256: string;
  size_bytes: number;
  scan_status: string | null;
  extraction_status: string | null;
  uploaded_at: string | null;
}

const DOC_TYPES = [
  "CRF",
  "MOP",
  "BEFORE_CONFIG",
  "AFTER_CONFIG",
  "ROLLBACK_PLAN",
  "TEST_PLAN",
  "COMMUNICATION_PLAN",
  "IMPACT_ANALYSIS",
  "OTHER",
];
const DOC_TYPE_LABEL: Record<string, string> = {
  CRF: "CRF (Formulir Permohonan)",
  MOP: "MOP (Metode Prosedur)",
  BEFORE_CONFIG: "Konfigurasi sebelum",
  AFTER_CONFIG: "Konfigurasi yang diajukan",
  ROLLBACK_PLAN: "Rencana rollback",
  TEST_PLAN: "Rencana uji",
  COMMUNICATION_PLAN: "Rencana komunikasi",
  IMPACT_ANALYSIS: "Analisis dampak",
  OTHER: "Lainnya",
};
// Uploads are only accepted while the change can still take a new revision.
const UPLOADABLE_STATUSES = ["DRAFT", "SUBMITTED", "DOCUMENT_VALIDATION", "AI_REVIEW", "REVISION_REQUIRED"];
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const EXTRACT_TONE: Record<string, string> = {
  COMPLETED: "bg-success text-success border border-success/25",
  PENDING: "bg-warning text-warning border border-warning/25",
  FAILED: "bg-danger text-danger border border-danger/25",
  ERROR: "bg-danger text-danger border border-danger/25",
};
const EXTRACT_LABEL: Record<string, string> = {
  COMPLETED: "Terbaca AI",
  PENDING: "Diproses",
  FAILED: "Gagal dibaca",
  ERROR: "Gagal dibaca",
};

// The download route needs the bearer token, so fetch it as a blob and open that.
async function openDocument(changeId: string, documentId: string) {
  const token = localStorage.getItem("token");
  const win = window.open("", "_blank");
  try {
    const res = await fetch(`/api/v1/changes/${changeId}/documents/${documentId}/download`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error("Dokumen gagal dibuka.");
    const url = URL.createObjectURL(await res.blob());
    if (win) win.location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (e) {
    win?.close();
    alert(e instanceof Error ? e.message : "Dokumen gagal dibuka.");
  }
}

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function DocumentsPanel({
  changeId,
  status,
  documents,
  onUploaded,
}: {
  changeId: string;
  status: string;
  documents: DocumentItem[];
  onUploaded: () => Promise<void>;
}) {
  const [docType, setDocType] = useState("CRF");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  const canUpload = UPLOADABLE_STATUSES.includes(status);

  const upload = async () => {
    if (!file) return;
    if (file.size > MAX_UPLOAD_BYTES) {
      setMessage("Ukuran berkas melebihi batas 50 MB.");
      setIsError(true);
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const token = localStorage.getItem("token");
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(
        `/api/v1/changes/${changeId}/documents?document_type=${encodeURIComponent(docType)}`,
        { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.detail || "Unggahan gagal.");
      setMessage(`${data.original_filename} v${data.version_number} terunggah.`);
      setIsError(false);
      setFile(null);
      await onUploaded();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Unggahan gagal.");
      setIsError(true);
    } finally {
      setBusy(false);
    }
  };

  const unreadable = documents.filter((d) => ["FAILED", "ERROR"].includes(d.extraction_status ?? "")).length;

  return (
    <Card
      title="Dokumen"
      description="Berkas diperlakukan sebagai input tidak tepercaya; rahasia disamarkan sebelum dikirim ke AI."
      actions={unreadable > 0 ? <span className="badge bg-danger text-danger">{unreadable} gagal dibaca AI</span> : undefined}
    >
      {documents.length === 0 ? (
        <p className="text-sm text-muted">Belum ada dokumen.</p>
      ) : (
        <div className="table-responsive">
          <table className="table table-sm table-striped mb-0">
            <thead className="border-bottom bg-body-secondary">
              <tr>
                <th className="text-nowrap">Nama</th>
                <th className="text-nowrap">Jenis</th>
                <th className="text-nowrap">Versi</th>
                <th className="text-nowrap">Ukuran</th>
                <th className="text-nowrap">Ekstraksi</th>
                <th className="text-nowrap">SHA-256</th>
                <th className="text-nowrap">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((d) => (
                <tr key={d.id} className="border-bottom last:border-0">
                  <td className="text-nowrap fw-medium text-truncate" style={{ maxWidth: "200px" }}>{d.original_filename}</td>
                  <td className="text-nowrap text-muted">{d.document_type ? (DOC_TYPE_LABEL[d.document_type] ?? d.document_type) : "—"}</td>
                  <td className="text-nowrap fw-mono">v{d.version_number}</td>
                  <td className="text-nowrap text-muted">{humanSize(d.size_bytes)}</td>
                  <td className="text-nowrap">
                    <span className={`badge ${EXTRACT_TONE[d.extraction_status ?? ""] ?? "bg-body-secondary text-muted"}`}>
                      {EXTRACT_LABEL[d.extraction_status ?? ""] ?? d.extraction_status ?? "—"}
                    </span>
                  </td>
                  <td className="text-nowrap fw-mono text-muted small">{d.sha256.slice(0, 12)}</td>
                  <td className="text-nowrap">
                    <button onClick={() => void openDocument(changeId, d.id)} className="btn btn-link btn-sm text-decoration-none px-0">
                      Lihat / unduh
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <details className="mb-3 rounded bg-body-secondary p-3 text-muted small">
        <summary className="cursor-pointer fw-semibold text-body">Format dokumen yang bisa dibaca AI</summary>
        <ul className="mt-2 list-unstyled mb-0">
          <li className="mb-1">PDF berbasis teks, DOCX, XLSX, TXT, CFG, YAML, JSON — diekstrak jadi teks lalu dibaca AI.</li>
          <li className="mb-1">
            PNG/JPG dan PDF hasil scan <span className="fw-semibold text-body">tidak terbaca</span> (belum ada
            OCR) — AI menandai "Tidak dinilai".
          </li>
          <li className="mb-1">Simpan sebagai PDF hasil ekspor, bukan scan/foto.</li>
          <li className="mb-1">Sertakan minimum: MOP, konfigurasi sebelum (BEFORE_CONFIG), konfigurasi yang diajukan (AFTER_CONFIG).</li>
          <li className="mb-1">CRF: formulir permohonan perubahan (Word/PDF) yang memuat ringkasan, dampak, jadwal, dan tanda tangan persetujuan awal.</li>
          <li className="mb-1">MOP sebaiknya memuat: tujuan, langkah eksekusi berurutan, verifikasi per langkah, estimasi durasi, rollback, kontak eskalasi.</li>
          <li>Password/community/API key boleh ada — otomatis disamarkan ([REDACTED]) sebelum dikirim ke AI.</li>
        </ul>
      </details>

      {canUpload ? (
        <div className="d-flex flex-wrap align-items-end gap-3 border-top pt-3">
          <div className="flex-grow-1">
            <label htmlFor="doc-type" className="form-label">
              Jenis dokumen
            </label>
            <select id="doc-type" value={docType} onChange={(e) => setDocType(e.target.value)} className="form-select">
              {DOC_TYPES.map((t) => (
                <option key={t} value={t}>
                  {DOC_TYPE_LABEL[t] ?? t}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-grow-1" style={{ minWidth: "240px" }}>
            <label htmlFor="doc-file" className="form-label">
              Berkas <span className="text-muted">(PDF, DOCX, XLSX, TXT, CFG, YAML, JSON · maks 50 MB)</span>
            </label>
            <input
              id="doc-file"
              type="file"
              accept=".pdf,.docx,.xlsx,.txt,.cfg,.yaml,.yml,.json"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="form-control text-sm text-muted"
            />
          </div>
          <button disabled={busy || !file} onClick={upload} className="btn btn-primary">
            {busy ? "Mengunggah…" : "Unggah"}
          </button>
          {message && (
            <p className={`small mb-0 ${isError ? "text-danger" : "text-success"}`} role={isError ? "alert" : "status"}>
              {message}
            </p>
          )}
        </div>
      ) : (
        <p className="border-top pt-3 text-muted small">
          Unggahan hanya dapat dilakukan sebelum perubahan disetujui (status saat ini: {statusLabel(status)}).
        </p>
      )}
    </Card>
  );
}

const OUTCOME_LABEL: Record<string, string> = {
  SUCCESSFUL: "Sukses",
  SUCCESSFUL_WITH_DEVIATION: "Sukses dengan deviasi",
  FAILED: "Gagal",
  ROLLED_BACK: "Rollback",
};

function ImplementationPanel({
  status,
  record,
  onAct,
  busy,
}: {
  status: string;
  record: ImplementationRecordData | null;
  onAct: (path: string, body?: Record<string, unknown>, label?: string) => Promise<void>;
  busy: boolean;
}) {
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [outcome, setOutcome] = useState("SUCCESSFUL");
  const [notes, setNotes] = useState("");
  const [postOk, setPostOk] = useState(true);
  const [evidence, setEvidence] = useState("");
  const [pirNotes, setPirNotes] = useState("");

  const canSchedule = status === "APPROVED";
  const canStart = status === "SCHEDULED";
  const canOutcome = status === "IN_PROGRESS";
  const canPir = status === "VALIDATION";
  const canClose = status === "COMPLETED";

  if (!canSchedule && !canStart && !canOutcome && !canPir && !canClose && !record) return null;

  return (
    <Card title="Implementasi & tinjauan pasca-implementasi" description="Catat eksekusi aktual, hasil, dan bukti validasi">
      {record && (
        <dl className="mb-3 row g-3 text-sm">
          <div className="col-md-4">
            <div className="p-3 rounded bg-body-secondary">
              <dt className="text-muted small mb-0">Mulai aktual</dt>
              <dd className="mt-1 fw-semibold mb-0">{fmtDateTime(record.actual_start)}</dd>
            </div>
          </div>
          <div className="col-md-4">
            <div className="p-3 rounded bg-body-secondary">
              <dt className="text-muted small mb-0">Selesai aktual</dt>
              <dd className="mt-1 fw-semibold mb-0">{fmtDateTime(record.actual_end)}</dd>
            </div>
          </div>
          <div className="col-md-4">
            <div className="p-3 rounded bg-body-secondary">
              <dt className="text-muted small mb-0">Hasil</dt>
              <dd className="mt-1 fw-semibold mb-0">
                {record.outcome ? (OUTCOME_LABEL[record.outcome] ?? record.outcome) : "—"}
              </dd>
            </div>
          </div>
          {record.rollback_performed && (
            <div className="col-12">
              <p className="rounded bg-warning bg-opacity-25 p-3 text-sm text-warning mb-0">
                Rollback tercatat untuk perubahan ini.
              </p>
            </div>
          )}
          {Boolean(record.postcheck?.pir_notes) && (
            <div className="col-md-12">
              <dt className="text-muted small mb-0">Catatan PIR</dt>
              <dd className="text-break mb-0">{String(record.postcheck?.pir_notes)}</dd>
            </div>
          )}
        </dl>
      )}

      {canSchedule && (
        <div className="d-flex flex-wrap align-items-end gap-3 border-top pt-3">
          <div className="flex-grow-1">
            <label htmlFor="sched-start" className="form-label">
              Mulai (WIB)
            </label>
            <input id="sched-start" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} className="form-control" />
          </div>
          <div className="flex-grow-1">
            <label htmlFor="sched-end" className="form-label">
              Selesai (WIB)
            </label>
            <input id="sched-end" type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} className="form-control" />
          </div>
          <button
            disabled={busy || !start || !end}
            onClick={() => onAct("schedule", { start: `${start}:00+07:00`, end: `${end}:00+07:00`, reason: "penjadwalan" }, "Jadwalkan")}
            className="btn btn-primary"
          >
            Jadwalkan
          </button>
        </div>
      )}

      {canStart && (
        <div className="border-top pt-3">
          <button
            disabled={busy}
            onClick={() => onAct("implementation/start", {}, "Mulai implementasi")}
            className="btn btn-primary"
          >
            Mulai implementasi
          </button>
        </div>
      )}

      {canOutcome && (
        <div className="d-flex flex-column gap-3 border-top pt-3">
          <div className="d-flex flex-wrap align-items-end gap-3">
            <div>
              <label htmlFor="outcome" className="form-label">
                Hasil
              </label>
              <select id="outcome" value={outcome} onChange={(e) => setOutcome(e.target.value)} className="form-select">
                <option value="SUCCESSFUL">Sukses</option>
                <option value="SUCCESSFUL_WITH_DEVIATION">Sukses dengan deviasi</option>
                <option value="FAILED">Gagal</option>
                <option value="ROLLED_BACK">Rollback</option>
              </select>
            </div>
            <div className="flex-grow-1" style={{ minWidth: "240px" }}>
              <label htmlFor="exec-notes" className="form-label">
                Catatan eksekusi
              </label>
              <input id="exec-notes" value={notes} onChange={(e) => setNotes(e.target.value)} className="form-control" placeholder="Apa yang terjadi saat eksekusi" />
            </div>
            <div className="d-flex align-items-center gap-2">
              <input type="checkbox" checked={postOk} onChange={(e) => setPostOk(e.target.checked)} className="form-check-input" id="postcheck-ok" />
              <label htmlFor="postcheck-ok" className="text-sm mb-0">Post-check lulus</label>
            </div>
          </div>
          <div>
            <label htmlFor="evidence" className="form-label">
              Bukti validasi layanan
            </label>
            <input id="evidence" value={evidence} onChange={(e) => setEvidence(e.target.value)} className="form-control" placeholder="mis. monitoring hijau, ping 0% loss" />
          </div>
          <button
            disabled={busy}
            onClick={() =>
              onAct(
                "implementation/outcome",
                { outcome, notes: notes || undefined, post_check_passed: postOk, evidence: evidence ? [evidence] : undefined },
                "Catat hasil",
              )
            }
            className="btn btn-primary"
          >
            Catat hasil
          </button>
        </div>
      )}

      {canPir && (
        <div className="d-flex flex-column gap-3 border-top pt-3">
          <div>
            <label htmlFor="pir" className="form-label">
              Catatan PIR <span className="text-danger">*</span>
            </label>
            <textarea
              id="pir"
              value={pirNotes}
              onChange={(e) => setPirNotes(e.target.value)}
              rows={3}
              className="form-control"
              placeholder="Hasil validasi layanan setelah perubahan"
            />
          </div>
          <div className="d-flex flex-wrap align-items-center gap-3">
            <button
              disabled={busy || !pirNotes.trim() || !postOk}
              onClick={() => onAct("implementation/pir", { notes: pirNotes, post_check_passed: postOk }, "Simpan PIR")}
              className="btn btn-primary"
            >
              Simpan PIR & selesaikan
            </button>
            {!postOk && <p className="small text-danger mb-0">Post-check gagal: tandai rollback, bukan selesai.</p>}
          </div>
        </div>
      )}

      {canClose && (
        <div className="border-top pt-3">
          <button disabled={busy} onClick={() => onAct("implementation/close", {}, "Tutup perubahan")} className="btn btn-secondary">
            Tutup perubahan
          </button>
        </div>
      )}
    </Card>
  );
}

const ACTOR_LABEL: Record<string, string> = {
  USER: "Pengguna",
  SYSTEM: "Sistem",
  AI: "AI",
  HUMAN: "Manusia",
};

export default function ChangeDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id;
  const { me } = useMe();

  const [change, setChange] = useState<Change | null>(null);
  const [history, setHistory] = useState<History | null>(null);
  const [gate, setGate] = useState<Gate | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [implementation, setImplementation] = useState<ImplementationRecordData | null>(null);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "info" | "success" | "danger" | "warning"; text: string } | null>(null);
  const [reason, setReason] = useState("");
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState<Record<string, unknown> | null>(null);

  const load = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/login");
      return;
    }
    const h = { Authorization: `Bearer ${token}` };
    try {
      const [cRes, hRes, gRes, rRes, iRes, dRes] = await Promise.all([
        fetch(`/api/v1/changes/${id}`, { headers: h }),
        fetch(`/api/v1/changes/${id}/history`, { headers: h }),
        fetch(`/api/v1/changes/${id}/execution-gate`, { headers: h }),
        fetch(`/api/v1/changes/${id}/reviews`, { headers: h }),
        fetch(`/api/v1/changes/${id}/implementation`, { headers: h }),
        fetch(`/api/v1/changes/${id}/documents`, { headers: h }),
      ]);
      if (!cRes.ok) throw new Error(cRes.status === 404 ? "Perubahan tidak ditemukan atau sudah dihapus." : "Perubahan gagal dimuat.");
      setChange(await cRes.json());
      setHistory(hRes.ok ? await hRes.json() : null);
      setGate(gRes.ok ? await gRes.json() : null);
      setImplementation(iRes.ok ? (await iRes.json()).record : null);
      setDocuments(dRes.ok ? ((await dRes.json()).items ?? []) : []);
      const list = rRes.ok ? (await rRes.json()).items : [];
      const latest = list?.[0];
      setReview(latest ? await (await fetch(`/api/v1/changes/${id}/reviews/${latest.id}`, { headers: h })).json() : null);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Terjadi kesalahan.");
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    void load();
  }, [load]);

  // A queued review finishes on the worker: poll until it settles.
  useEffect(() => {
    if (!review || !["QUEUED", "RUNNING"].includes(review.status)) return;
    const timer = setTimeout(() => void load(), 3000);
    return () => clearTimeout(timer);
  }, [review, load]);

  const act = async (path: string, body?: Record<string, unknown>, label = "Aksi") => {
    const token = localStorage.getItem("token");
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/v1/changes/${id}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.detail || `${label} gagal.`);
      setNotice({ kind: "success", text: `${label} berhasil.` });
      setReason("");
      await load();
    } catch (e) {
      setNotice({ kind: "danger", text: e instanceof Error ? e.message : `${label} gagal.` });
    } finally {
      setBusy(false);
    }
  };

  // POST /reviews parks the change in AI_REVIEW itself, so it bypasses `act`.
  const rerunReview = async () => {
    const token = localStorage.getItem("token");
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/v1/changes/${id}/reviews`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.detail || "Tinjauan AI gagal dimulai.");
      setNotice({
        kind: "info",
        text:
          data.review_mode === "inline"
            ? "Tinjauan AI selesai."
            : "Tinjauan AI dimulai. Hasil muncul otomatis setelah worker selesai.",
      });
      await load();
    } catch (e) {
      setNotice({ kind: "danger", text: e instanceof Error ? e.message : "Tinjauan AI gagal dimulai." });
    } finally {
      setBusy(false);
    }
  };

  // Reviewer verifies the AI result; the AI output itself is never rewritten.
  const decideReview = async (decision: "ACCEPT" | "RETURN_FOR_REVISION", comment: string) => {
    const token = localStorage.getItem("token");
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/v1/changes/${id}/reviews/${review?.id}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ decision, comment: comment || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.detail || "Keputusan gagal disimpan.");
      setNotice({
        kind: "success",
        text:
          data.change_status === "REVISION_REQUIRED"
            ? "CRF dikembalikan ke pemohon untuk perbaikan."
            : "Hasil tinjauan diterima. CRF diteruskan ke persetujuan.",
      });
      await load();
    } catch (e) {
      setNotice({ kind: "danger", text: e instanceof Error ? e.message : "Keputusan gagal disimpan." });
    } finally {
      setBusy(false);
    }
  };

  // Open the edit form; reopens to DRAFT first if still REVISION_REQUIRED.
  const openEdit = async () => {
    if (!change) return;
    setBusy(true);
    setNotice(null);
    try {
      if (change.status === "REVISION_REQUIRED") {
        const res = await fetch(`/api/v1/changes/${id}/reopen`, {
          method: "POST",
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d?.detail || "Buka ulang gagal.");
        }
      }
      await load();
      const c = change;
      if (!c) return;
      setEditDraft({
        title: c.title,
        description: c.description,
        category: c.category,
        change_type: c.change_type,
        environment: c.environment,
        business_justification: c.business_justification,
        impact_description: c.impact_description,
        implementation_plan: c.implementation_plan,
        test_plan: c.test_plan,
        rollback_plan: c.rollback_plan,
        communication_plan: "",
        affected_devices: (c.affected_devices ?? []).join(", "),
        affected_services: (c.affected_services ?? []).join(", "),
      });
      setEditing(true);
    } catch (e) {
      setNotice({ kind: "danger", text: e instanceof Error ? e.message : "Gagal membuka editor." });
    } finally {
      setBusy(false);
    }
  };

  const cancelEdit = () => {
    setEditing(false);
    setEditDraft(null);
  };

  const saveEdit = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const token = localStorage.getItem("token");
      const body: Record<string, unknown> = {};
      const fields = ["title", "description", "category", "change_type", "environment", "business_justification",
        "impact_description", "implementation_plan", "test_plan", "rollback_plan", "communication_plan",
        "affected_devices", "affected_services"];
      for (const f of fields) {
        const v = (editDraft as Record<string, unknown>)[f];
        if (v !== undefined) {
          body[f] = f === "affected_devices" || f === "affected_services"
            ? String(v).split(",").map((s: string) => s.trim()).filter(Boolean)
            : v;
        }
      }
      const res = await fetch(`/api/v1/changes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.detail || "Simpan gagal.");
      setNotice({ kind: "success", text: "Perubahan CRF tersimpan." });
      setEditing(false);
      setEditDraft(null);
      await load();
    } catch (e) {
      setNotice({ kind: "danger", text: e instanceof Error ? e.message : "Simpan gagal." });
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <Spinner label="Memuat perubahan…" />;

  if (error || !change) {
    return (
      <>
        <PageHeader title="Perubahan tidak tersedia" back={{ href: "/changes", label: "Permohonan Perubahan" }} />
        <Page>
          <ErrorState message={error || "Perubahan tidak ditemukan."} onRetry={() => void load()} />
        </Page>
      </>
    );
  }

  const isTechnicalReviewer = me?.roles.some((r) => r === "TECH_REVIEWER" || r === "ADMIN") ?? false;
  const canSubmit = change.status === "DRAFT";
  const canReopen = ["REVISION_REQUIRED", "REJECTED", "STALE"].includes(change.status);
  const canEdit = change.status === "DRAFT" || canReopen;
  const cancellable = !["CANCELLED", "CLOSED", "COMPLETED"].includes(change.status);
  const canRerunReview = ["SUBMITTED", "DOCUMENT_VALIDATION", "AI_REVIEW", "REVISION_REQUIRED", "REVIEW_FAILED"].includes(
    change.status,
  );
  const canDecideReview = me?.roles.some((r) => r === "TECH_REVIEWER" || r === "ADMIN") ?? false;

  return (
    <>
      <PageHeader
        back={{ href: "/changes", label: "Permohonan Perubahan" }}
        breadcrumb={
          <span>
            <span className="fw-mono">{change.change_number}</span> · Revisi {change.current_revision_number ?? "—"} ·
            Pemohon {change.requester_name ?? "—"}
          </span>
        }
        title={change.title}
        description={`${categoryLabel(change.category)} · ${changeTypeLabel(change.change_type)}`}
        actions={
          <>
            <EnvTag env={environmentLabel(change.environment)} />
            <RiskBadge risk={change.risk_level ?? null} />
            <StatusBadge status={change.status} />
          </>
        }
      />

      <Page>
        {notice && (
          <Notice kind={notice.kind} onDismiss={() => setNotice(null)}>
            {notice.text}
          </Notice>
        )}

        <div className="d-flex flex-column gap-4">
          {(canSubmit || canReopen || cancellable) && (
            <Card title="Aksi" description="Setiap aksi dicatat di jejak audit">
              <div className="d-flex flex-wrap align-items-end gap-3">
                {canSubmit && (
                  <button disabled={busy} onClick={() => act("submit", undefined, "Ajukan untuk review")} className="btn btn-primary">
                    Ajukan untuk review
                  </button>
                )}
                {canEdit && (
                  <button disabled={busy} onClick={() => openEdit()} className="btn btn-secondary">
                    Edit CRF
                  </button>
                )}
                {cancellable && (
                  <>
                    <div>
                      <label htmlFor="cancel-reason" className="form-label">
                        Alasan pembatalan <span className="text-danger">*</span>
                      </label>
                      <input
                        id="cancel-reason"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="Wajib diisi"
                        className="form-control"
                        style={{ maxWidth: "300px" }}
                      />
                    </div>
                    <button
                      disabled={busy || !reason.trim()}
                      onClick={() => {
                        if (window.confirm("Batalkan perubahan ini? Status berubah permanen dan tercatat di audit.")) {
                          void act("cancel", { reason }, "Batalkan");
                        }
                      }}
                      className="btn btn-danger"
                    >
                      Batalkan perubahan
                    </button>
                  </>
                )}
              </div>
            </Card>
          )}

          {gate && !TERMINAL_STATUSES.includes(change.status) && (
            <div
              className={`p-4 rounded border ${
                gate.ready ? "border-success bg-success bg-opacity-10" : "border-warning bg-warning bg-opacity-25"
              }`}
              aria-live="polite"
            >
              <p className={`${gate.ready ? "text-success" : "text-warning"} fw-bold`}>
                {gate.ready ? "● Siap dieksekusi" : "◑ Belum siap dieksekusi"}
              </p>
              {gate.ready ? (
                <p className="small text-body mt-1 mb-0">Semua prasyarat terpenuhi. Eksekusi tetap dilakukan manusia.</p>
              ) : (
                <ul className="mt-2 list-unstyled mb-0 text-sm text-body">
                  {gate.blocking_reasons.map((r) => (
                    <li key={r}>• {gateReasonText(r)}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {review ? (
            <ReviewPanel
              review={review}
              onRerun={() => void rerunReview()}
              busy={busy}
              canRerun={canRerunReview}
              canDecide={canDecideReview && ["AI_REVIEW", "REVISION_REQUIRED"].includes(change.status)}
              onDecide={decideReview}
            />
          ) : canRerunReview ? (
            <Card
              title="Tinjauan AI"
              description="Belum ada tinjauan untuk revisi ini."
              actions={
                <button type="button" onClick={() => void rerunReview()} disabled={busy} className="btn btn-primary btn-sm">
                  Jalankan tinjauan AI
                </button>
              }
            >
              <p className="text-sm text-muted">
                AI akan membaca dokumen revisi ini dan memberi rekomendasi beserta bukti. AI tidak menyetujui.
              </p>
            </Card>
          ) : null}

          <ImplementationPanel status={change.status} record={implementation} onAct={act} busy={busy} />

          <DocumentsPanel changeId={change.id} status={change.status} documents={documents} onUploaded={load} />

          <div className="row g-4">
            {editing && editDraft ? (
              <div className="col-md-7">
                <Card title="Edit CRF" description="Isi perubahan pada field yang perlu direvisi">
                  <div className="d-flex flex-column gap-3">
                    <div>
                      <label htmlFor="edit-title" className="form-label">
                        Judul <span className="text-danger">*</span>
                      </label>
                      <input id="edit-title" value={String(editDraft.title ?? "")} onChange={(e) => setEditDraft({ ...editDraft, title: e.target.value })} className="form-control" />
                    </div>
                    <div className="row g-3">
                      <div className="col-md-6">
                        <label htmlFor="edit-category" className="form-label">Kategori</label>
                        <select id="edit-category" value={String(editDraft.category ?? "")} onChange={(e) => setEditDraft({ ...editDraft, category: e.target.value })} className="form-select">
                          {Object.keys(CATEGORY).map((c) => (
                            <option key={c} value={c}>{categoryLabel(c)}</option>
                          ))}
                        </select>
                      </div>
                      <div className="col-md-6">
                        <label htmlFor="edit-type" className="form-label">Tipe perubahan</label>
                        <select id="edit-type" value={String(editDraft.change_type ?? "")} onChange={(e) => setEditDraft({ ...editDraft, change_type: e.target.value })} className="form-select">
                          {Object.keys(CHANGE_TYPE).map((t) => (
                            <option key={t} value={t}>{changeTypeLabel(t)}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="row g-3">
                      <div className="col-md-6">
                        <label htmlFor="edit-env" className="form-label">Lingkungan</label>
                        <select id="edit-env" value={String(editDraft.environment ?? "")} onChange={(e) => setEditDraft({ ...editDraft, environment: e.target.value })} className="form-select">
                          {Object.keys(ENVIRONMENT).map((e) => (
                            <option key={e} value={e}>{environmentLabel(e)}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label htmlFor="edit-description" className="form-label">Deskripsi</label>
                      <textarea id="edit-description" rows={3} value={String(editDraft.description ?? "")} onChange={(e) => setEditDraft({ ...editDraft, description: e.target.value })} className="form-control" />
                    </div>
                    <div>
                      <label htmlFor="edit-justification" className="form-label">Justifikasi bisnis</label>
                      <textarea id="edit-justification" rows={3} value={String(editDraft.business_justification ?? "")} onChange={(e) => setEditDraft({ ...editDraft, business_justification: e.target.value })} className="form-control" placeholder="Mengapa perubahan ini dibutuhkan." />
                    </div>
                    <div>
                      <label htmlFor="edit-impact" className="form-label">Dampak</label>
                      <textarea id="edit-impact" rows={2} value={String(editDraft.impact_description ?? "")} onChange={(e) => setEditDraft({ ...editDraft, impact_description: e.target.value })} className="form-control" placeholder="Layanan, pengguna, atau jendela operasi yang terdampak." />
                    </div>
                    <div>
                      <label htmlFor="edit-implementation" className="form-label">Rencana implementasi <span className="text-danger">*</span></label>
                      <textarea id="edit-implementation" rows={4} value={String(editDraft.implementation_plan ?? "")} onChange={(e) => setEditDraft({ ...editDraft, implementation_plan: e.target.value })} className="form-control" placeholder="Langkah eksekusi berurutan. Jangan sertakan kredensial." />
                    </div>
                    <div>
                      <label htmlFor="edit-test" className="form-label">Rencana uji</label>
                      <textarea id="edit-test" rows={3} value={String(editDraft.test_plan ?? "")} onChange={(e) => setEditDraft({ ...editDraft, test_plan: e.target.value })} className="form-control" />
                    </div>
                    <div>
                      <label htmlFor="edit-rollback" className="form-label">Rencana rollback <span className="text-danger">*</span></label>
                      <textarea id="edit-rollback" rows={3} value={String(editDraft.rollback_plan ?? "")} onChange={(e) => setEditDraft({ ...editDraft, rollback_plan: e.target.value })} className="form-control" placeholder="Langkah mengembalikan ke kondisi awal jika terjadi kegagalan." />
                    </div>
                    <div className="row g-3">
                      <div className="col-md-6">
                        <label htmlFor="edit-devices" className="form-label">Perangkat terdampak</label>
                        <input id="edit-devices" value={String(editDraft.affected_devices ?? "")} onChange={(e) => setEditDraft({ ...editDraft, affected_devices: e.target.value })} className="form-control" placeholder="Komma-separated" />
                      </div>
                      <div className="col-md-6">
                        <label htmlFor="edit-services" className="form-label">Layanan terdampak</label>
                        <input id="edit-services" value={String(editDraft.affected_services ?? "")} onChange={(e) => setEditDraft({ ...editDraft, affected_services: e.target.value })} className="form-control" placeholder="Komma-separated" />
                      </div>
                    </div>
                    <div className="d-flex flex-wrap gap-2 pt-2">
                      <button disabled={busy || !editDraft?.title || !editDraft?.implementation_plan || !editDraft?.rollback_plan} onClick={() => void saveEdit()} className="btn btn-primary">
                        {busy ? "Menyimpan…" : "Simpan perubahan"}
                      </button>
                      <button type="button" onClick={cancelEdit} disabled={busy} className="btn btn-link text-decoration-none">
                        Batal
                      </button>
                    </div>
                  </div>
                </Card>
              </div>
            ) : (
              <div className="col-md-7">
                <Card title="Detail CRF" description="Alasan, dampak, dan kesiapan rollback">
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
                        <dd
                          className={`text-break mt-0 ${
                            label === "Rencana rollback" && !value ? "fw-semibold text-danger" : "text-body"
                          }`}
                        >
                          {value || (label === "Rencana rollback" ? "Tidak ada — rollback belum siap" : "—")}
                        </dd>
                      </div>
                    ))}
                    <div>
                      <dt className="text-muted small fw-bold text-uppercase mb-0">Perangkat terdampak</dt>
                      <dd className="mt-0 fw-mono text-xs mb-0">{(change.affected_devices || []).join(", ") || "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-muted small fw-bold text-uppercase mb-0">Layanan terdampak</dt>
                      <dd className="mt-0 mb-0">{(change.affected_services || []).join(", ") || "—"}</dd>
                    </div>
                  </dl>
                </Card>
              </div>
            )}

            <div className="col-md-5">
              <Card title="Riwayat status" description="Kronologis perubahan state">
                {!history || history.status_history.length === 0 ? (
                  <p className="text-sm text-muted">Belum ada riwayat.</p>
                ) : (
                  <ol className="d-flex flex-column gap-3">
                    {history.status_history.map((t) => (
                      <li key={t.id} className="d-flex align-items-start gap-3 text-sm">
                        <span className="mt-1.5" style={{ minWidth: "8px", width: "8px", height: "8px", borderRadius: "50%", backgroundColor: "var(--app-primary)" }} aria-hidden></span>
                        <div className="min-w-0">
                          <p className="text-body mb-0">
                            {t.from_status && <span className="text-muted">{statusLabel(t.from_status)} → </span>}
                            <span className="fw-medium">{statusLabel(t.to_status)}</span>
                          </p>
                          <p className="text-muted small mb-0">
                            {fmtDateTime(t.occurred_at)} ·{" "}
                            {t.actor_name
                              ? `oleh ${t.actor_name}`
                              : t.actor_type === "USER"
                                ? "otomatis"
                                : ACTOR_LABEL[t.actor_type] ?? t.actor_type}
                            {t.reason ? ` · ${t.reason}` : ""}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </Card>
            </div>
          </div>

          <Card title="Revisi" description="Setiap revisi terkunci setelah disetujui; tinjauan terikat ke hash dokumen">
            {!history || history.revisions.length === 0 ? (
              <p className="text-sm text-muted">Belum ada revisi.</p>
            ) : (
              <div className="table-responsive">
                <table className="table table-sm table-striped mb-0">
                  <thead className="border-bottom bg-body-secondary">
                    <tr>
                      <th className="text-nowrap">Revisi</th>
                      <th className="text-nowrap">Hash</th>
                      <th className="text-nowrap">Status</th>
                      <th className="text-nowrap">Dibuat</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.revisions.map((r) => (
                      <tr key={r.id} className="border-bottom last:border-0">
                        <td className="text-nowrap fw-mono">rev{r.revision_number}</td>
                        <td className="text-nowrap fw-mono text-muted small">{r.content_hash?.slice(0, 12) ?? "—"}</td>
                        <td className="text-nowrap text-muted">
                          {r.is_current ? <span className="fw-bold text-primary">Aktif</span> : "Lampau"}
                          {r.locked ? " · terkunci" : ""}
                        </td>
                        <td className="text-nowrap text-muted">{fmtDateTime(r.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      </Page>
    </>
  );
}
