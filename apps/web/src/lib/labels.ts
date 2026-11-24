// Single mapping of backend enums to human labels + semantic tones, so no page
// renders a raw code like REVISION_REQUIRED (design.md §10, §11).

type Tone = "neutral" | "info" | "pending" | "success" | "danger" | "done";

const TONE_CLASS: Record<Tone, string> = {
  neutral: "bg-cream text-text-muted ring-1 ring-inset ring-border",
  info: "bg-sky bg-opacity-15 text-sky ring-1 ring-inset ring-sky/30",
  pending: "bg-gold bg-opacity-20 text-gold-dark ring-1 ring-inset ring-gold/30",
  success: "bg-teal bg-opacity-15 text-teal-dark ring-1 ring-inset ring-teal/30",
  danger: "bg-coral bg-opacity-10 text-coral-dark ring-1 ring-inset ring-coral/30",
  done: "bg-teal-dark text-white ring-1 ring-inset ring-white/10",
};

// Small leading glyph keeps state legible without relying on color alone.
const TONE_MARK: Record<Tone, string> = {
  neutral: "○",
  info: "◔",
  pending: "◑",
  success: "●",
  danger: "▲",
  done: "■",
};

export const STATUS: Record<string, { label: string; tone: Tone }> = {
  DRAFT: { label: "Draf", tone: "neutral" },
  SUBMITTED: { label: "Diajukan", tone: "info" },
  DOCUMENT_VALIDATION: { label: "Validasi Dokumen", tone: "pending" },
  AI_REVIEW: { label: "Tinjauan AI", tone: "pending" },
  REVIEW_FAILED: { label: "Tinjauan Gagal", tone: "danger" },
  PENDING_APPROVAL: { label: "Menunggu Persetujuan", tone: "pending" },
  REVISION_REQUIRED: { label: "Perlu Revisi", tone: "danger" },
  REJECTED: { label: "Ditolak", tone: "danger" },
  APPROVED: { label: "Disetujui", tone: "success" },
  SCHEDULED: { label: "Terjadwal", tone: "info" },
  IN_PROGRESS: { label: "Sedang Dieksekusi", tone: "info" },
  VALIDATION: { label: "Validasi Pasca-Eksekusi", tone: "pending" },
  COMPLETED: { label: "Selesai", tone: "success" },
  CLOSED: { label: "Ditutup", tone: "done" },
  CANCELLED: { label: "Dibatalkan", tone: "neutral" },
  STALE: { label: "Kedaluwarsa", tone: "danger" },
};

export const RISK: Record<string, { label: string; tone: Tone }> = {
  CRITICAL: { label: "Kritis", tone: "danger" },
  HIGH: { label: "Tinggi", tone: "danger" },
  MEDIUM: { label: "Sedang", tone: "pending" },
  LOW: { label: "Rendah", tone: "success" },
  UNASSESSED: { label: "Belum Dinilai", tone: "neutral" },
};

export const CATEGORY: Record<string, string> = {
  HEAD_OFFICE: "Head Office",
  CHANNEL: "Channel",
  BRANCH_OFFICE: "Branch Office",
  OTHER: "Lainnya",
};

export const ENVIRONMENT: Record<string, string> = {
  PRODUCTION: "Produksi",
  STAGING: "Staging",
  TEST: "Test",
  DEVELOPMENT: "Development",
  DR: "Disaster Recovery",
};

export const CHANGE_TYPE: Record<string, string> = {
  STANDARD: "Standard",
  NORMAL: "Normal",
  EMERGENCY: "Emergency",
};

// Audit action codes are dot-separated, e.g. change.deleted or
// change.transition.approved. Static entries cover the literal call sites; the
// transition prefix is expanded through STATUS so its label tracks the workflow.
const AUDIT_ACTION: Record<string, string> = {
  "change.created": "RFC dibuat",
  "change.updated": "RFC diperbarui",
  "change.deleted": "RFC dihapus",
  "change.submitted": "RFC diajukan",
  "document.uploaded": "Dokumen diunggah",
  "document.reprocessed": "Dokumen diproses ulang",
  "review.completed": "Tinjauan AI selesai",
  "reviews.marked_stale": "Tinjauan AI ditandai kedaluwarsa",
  "approval.workflow_created": "Alur persetujuan dibuat",
  "approval.decision": "Keputusan persetujuan diambil",
  "approvals.invalidated": "Persetujuan dibatalkan",
  "pir.created": "Laporan pasca-implementasi dibuat",
  "user.created": "Pengguna dibuat",
  "user.updated": "Pengguna diperbarui",
  "user.deleted": "Pengguna dinonaktifkan",
  "user.roles_changed": "Peran pengguna diubah",
};

const TRANSITION_PREFIX = "change.transition.";

export function auditActionLabel(action: string): string {
  if (action in AUDIT_ACTION) return AUDIT_ACTION[action];
  if (action.startsWith(TRANSITION_PREFIX)) {
    const code = action.slice(TRANSITION_PREFIX.length).toUpperCase();
    return `Status menjadi ${statusLabel(code)}`;
  }
  return action.replace(/[._]/g, " ");
}

export const ROLE: Record<string, string> = {
  ADMIN: "Admin",
  REQUESTER: "Pemohon",
  REVIEWER: "Peninjau",
  TECH_REVIEWER: "Peninjau Teknis",
  MANAGER: "Manajer",
  CHANGE_MANAGER: "Manajer Perubahan",
  CAB_MEMBER: "Anggota CAB",
  FINAL_APPROVER: "Penyetuju Akhir",
  AI_ADMIN: "Admin AI",
  ENGINEER: "Insinyur",
  AUDITOR: "Auditor",
};

export const roleLabel = (code: string) => ROLE[code] ?? code.replace(/_/g, " ");

export const statusTone = (status: string): Tone => STATUS[status]?.tone ?? "neutral";
export const statusLabel = (status: string) => STATUS[status]?.label ?? status.replace(/_/g, " ");
export const riskLabel = (risk: string | null | undefined) =>
  risk ? (RISK[risk]?.label ?? risk) : RISK.UNASSESSED.label;
export const riskTone = (risk: string | null | undefined): Tone => (risk && RISK[risk]?.tone) || "neutral";
export const categoryLabel = (c: string) => CATEGORY[c] ?? c;
export const environmentLabel = (e: string) => ENVIRONMENT[e] ?? e;
export const changeTypeLabel = (t: string) => CHANGE_TYPE[t] ?? t;

export const toneClass = (tone: Tone) => TONE_CLASS[tone];
export const toneMark = (tone: Tone) => TONE_MARK[tone];