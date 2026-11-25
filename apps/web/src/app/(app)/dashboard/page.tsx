"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, Page, PageHeader, Spinner, StatusBadge, fmtDateTime, useMe } from "@/components/ui";
import { categoryLabel, statusLabel } from "@/lib/labels";

// ── SVG Donut Pie Chart (inline) ────────────────────────────────────────────

/* Vibrant monitoring palette — high contrast, neon feel. */
const CHART_COLORS = {
  success:   "#30D158", // green — approved
  danger:    "#FF453A", // red — rejected, cancelled
  warning:   "#FFD60A", // yellow — pending
  brand:     "#00D4FF", // cyan — scheduled
  info:      "#00D4FF", // cyan — submitted
  purple:    "#BF5AF2", // purple — AI review
  neutral:   "#636366", // muted gray
  teal:      "#5AC8FA", // bright cyan — AI review
};

const PIE_COLORS = [
  CHART_COLORS.success,
  CHART_COLORS.danger,
  CHART_COLORS.warning,
  CHART_COLORS.brand,
  CHART_COLORS.info,
  CHART_COLORS.purple,
  CHART_COLORS.neutral,
  CHART_COLORS.teal,
];

interface PieSlice {
  label: string;
  value: number;
  color?: string;
}

function DonutChart({ data, size = 200, cx = 100, cy = 100, r = 70, thickness = 28 }: { data: PieSlice[]; size?: number; cx?: number; cy?: number; r?: number; thickness?: number }) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const ratio = thickness / (2 * Math.PI * r); // fraction of circumference

  // Build path for each slice using arc commands
  let cumulative = 0;
  const slices = data
    .filter((d) => d.value > 0)
    .map((d, i) => {
      const frac = d.value / total;
      const startAngle = cumulative * 2 * Math.PI - Math.PI / 2;
      cumulative += frac;
      const endAngle = cumulative * 2 * Math.PI - Math.PI / 2;
      const largeArc = frac > 0.5 ? 1 : 0;

      const x1 = cx + r * Math.cos(startAngle);
      const y1 = cy + r * Math.sin(startAngle);
      const x2 = cx + r * Math.cos(endAngle);
      const y2 = cy + r * Math.sin(endAngle);
      const ir = r - thickness; // inner radius

      const ix1 = cx + ir * Math.cos(startAngle);
      const iy1 = cy + ir * Math.sin(startAngle);
      const ix2 = cx + ir * Math.cos(endAngle);
      const iy2 = cy + ir * Math.sin(endAngle);

      const path = `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} L ${ix2} ${iy2} A ${ir} ${ir} 0 ${largeArc} 0 ${ix1} ${iy1} Z`;

      // Label mid-angle
      const midAngle = (startAngle + endAngle) / 2;
      const labelR = r - thickness / 2;
      const lx = cx + labelR * Math.cos(midAngle);
      const ly = cy + labelR * Math.sin(midAngle);

      return { path, label: d.label, value: d.value, frac, color: d.color ?? PIE_COLORS[i % PIE_COLORS.length], lx, ly };
    });

  return (
    <div className="d-flex flex-column align-items-center gap-3">
      <svg viewBox={`0 0 ${size} ${size}`} style={{ width: size, height: size }} role="img" aria-label="Grafik donat">
        {slices.map((s, i) => (
          <path
            key={i}
            d={s.path}
            fill={s.color}
            stroke="var(--app-surface)"
            strokeWidth={2}
            style={{ opacity: 0.85 }}
          />
        ))}
        {/* Center text */}
        <text x={cx} y={cy - 6} textAnchor="middle" style={{ fill: "var(--app-text)", fontSize: 22, fontWeight: 700 }}>
          {total}
        </text>
        <text x={cx} y={cy + 12} textAnchor="middle" style={{ fill: "var(--app-text-muted)", fontSize: 11 }}>
          Total
        </text>
      </svg>
      {/* Legend */}
      <div className="d-flex flex-wrap justify-content-center gap-2">
        {slices.map((s, i) => (
          <span key={i} className="d-flex align-items-center gap-1 small text-muted">
            <span className="d-inline-block" style={{ width: "10px", height: "10px", borderRadius: "2px", backgroundColor: s.color || CHART_COLORS.brand }} />
            <span>{s.label} ({s.value})</span>
          </span>
        ))}
      </div>
    </div>
  );
}

interface DashboardData {
  total_changes: number;
  by_status: Record<string, number>;
  by_category: Record<string, number>;
  by_type: Record<string, number>;
  pending_approvals: number;
  ai_review_pending: number;
  ai_review_flagged: number;
  upcoming_changes: number;
  completed: number;
  failed: number;
  rolled_back: number;
  weekly_counts: Array<{ label: string; value: number }>;
  kpi: {
    total_active: number;
    approval_avg_hours: number | null;
    acceptance_rate: number;
  };
}

interface RecentChange {
  id: string;
  change_number: string;
  title: string;
  status: string;
  updated_at: string;
}

const OPEN_STATUSES = [
  "SUBMITTED",
  "DOCUMENT_VALIDATION",
  "AI_REVIEW",
  "PENDING_APPROVAL",
  "REVISION_REQUIRED",
  "APPROVED",
  "SCHEDULED",
  "IN_PROGRESS",
  "VALIDATION",
];

// ── Weekly bar chart (SVG, inline) ──────────────────────────────────────────

const CHART_H = 180;
const CHART_PAD = { top: 20, right: 16, bottom: 36, left: 44 };
const CHART_W = 500;
const BAR_W = 48;
const GAP = (CHART_W - CHART_PAD.left - CHART_PAD.right - BAR_W * 4) / 5;

function WeeklyChart({ data }: { data: DashboardData["weekly_counts"] }) {
  const maxVal = Math.max(1, ...data.map((d) => d.value));
  const steps = [0, 0.25, 0.5, 0.75, 1].map((f) => maxVal * f);
  const tickH = CHART_H - CHART_PAD.top - CHART_PAD.bottom;

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        style={{ height: 180, width: "100%", minWidth: 320 }}
        role="img"
        aria-label="Grafik jumlah request per minggu"
      >
        {/* Y grid + ticks */}
        {steps.map((v, i) => {
          const y = CHART_PAD.top + tickH - (v / maxVal) * tickH;
          return (
            <g key={i}>
              <line x1={CHART_PAD.left} y1={y} x2={CHART_W - CHART_PAD.right} y2={y} stroke="var(--app-border)" strokeDasharray="4 3" />
              <text x={CHART_PAD.left - 6} y={y + 4} textAnchor="end" style={{ fill: "var(--app-text-muted)", fontSize: 11 }}>
                {v}
              </text>
            </g>
          );
        })}
        {/* Bars */}
        {data.map((d, i) => {
          const x = CHART_PAD.left + i * (BAR_W + GAP) + GAP / 2;
          const barH = (d.value / maxVal) * tickH;
          const y = CHART_PAD.top + tickH - barH;
          return (
            <g key={i}>
              <rect x={x} y={y} width={BAR_W} height={barH} rx={4} fill="var(--app-primary)" opacity={0.85} />
              <text x={x + BAR_W / 2} y={y - 6} textAnchor="middle" style={{ fill: "var(--app-text)", fontSize: 12, fontWeight: 600 }}>
                {d.value}
              </text>
              <text x={x + BAR_W / 2} y={CHART_PAD.top + tickH + 18} textAnchor="middle" style={{ fill: "var(--app-text-muted)", fontSize: 11 }}>
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ── KPI card ────────────────────────────────────────────────────────────────

const KPI_GRADIENTS: Record<string, { bg: string; glow: string }> = {
  "text-body":     { bg: "linear-gradient(135deg, var(--app-gradient-start), var(--app-gradient-end))", glow: "rgba(0, 212, 255, 0.3)" },
  "text-primary":  { bg: "linear-gradient(135deg, var(--app-gradient-start), var(--app-gradient-end))", glow: "rgba(0, 212, 255, 0.3)" },
  "text-info":     { bg: "linear-gradient(135deg, var(--app-gradient-start), var(--app-gradient-end))", glow: "rgba(0, 212, 255, 0.3)" },
  "text-warning":  { bg: "linear-gradient(135deg, #FFD60A, #FF9F0A)",                                   glow: "rgba(255, 214, 10, 0.35)" },
  "text-success":  { bg: "linear-gradient(135deg, #30D158, #32D74B)",                                   glow: "rgba(48, 209, 88, 0.3)" },
  "text-danger":   { bg: "linear-gradient(135deg, #FF453A, #FF6961)",                                   glow: "rgba(255, 69, 58, 0.3)" },
};

function KpiCard({
  label,
  help,
  value,
  sub,
  href,
  tone = "text-body",
}: {
  label: string;
  help: string;
  value: string | number;
  sub?: string;
  href?: string;
  tone?: string;
}) {
  const gradient = KPI_GRADIENTS[tone] ?? KPI_GRADIENTS["text-body"];
  const wrap = href ? (
    <Link href={href} className="card p-4 kpi-link-card" data-tone={tone} style={{ textDecoration: "none", color: "inherit" }}>
      <p className={`display-6 fw-bold font-mono kpi-value`} style={{ 
        background: gradient.bg,
        WebkitBackgroundClip: "text",
        WebkitTextFillColor: "transparent",
        filter: `drop-shadow(0 0 10px ${gradient.glow})`
      }}>
        {value}
      </p>
      <p className="mt-1 text-[13px] fw-semibold text-body">{label}</p>
      <p className="mt-0.5 small text-muted">{help}</p>
      {sub && <p className="mt-0.5 small text-muted">{sub}</p>}
    </Link>
  ) : (
    <div className="card p-4" data-tone={tone}>
      <p className={`display-6 fw-bold font-mono kpi-value`} style={{
        background: gradient.bg,
        WebkitBackgroundClip: "text",
        WebkitTextFillColor: "transparent",
        filter: `drop-shadow(0 0 10px ${gradient.glow})`
      }}>
        {value}
      </p>
      <p className="mt-1 text-[13px] fw-semibold text-body">{label}</p>
      <p className="mt-0.5 small text-muted">{help}</p>
      {sub && <p className="mt-0.5 small text-muted">{sub}</p>}
    </div>
  );
  return wrap;
}

// ── Main ────────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { me } = useMe();
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [recent, setRecent] = useState<RecentChange[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!me) return;
    const token = localStorage.getItem("token");
    const h = { Authorization: `Bearer ${token}` };
    Promise.all([
      fetch("/api/v1/dashboard/summary", { headers: h }).then((r) => (r.ok ? r.json() : null)),
      fetch("/api/v1/changes?page=1", { headers: h }).then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([summary, list]) => {
        setData(summary);
        setRecent((list?.items ?? []).slice(0, 6));
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [me]);

  if (!me) return <Spinner label="Memuat ringkasan…" />;

  const open = (data?.by_status ? OPEN_STATUSES.reduce((n, s) => n + (data.by_status[s] ?? 0), 0) : 0);

  const statusEntries = Object.entries(data?.by_status ?? {})
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);
  const categoryEntries = Object.entries(data?.by_category ?? {})
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);

  const kpi = data?.kpi ?? { total_active: 0, approval_avg_hours: null, acceptance_rate: 0 };

  return (
    <>
      <PageHeader
        title="Ringkasan"
        description="Kondisi antrean perubahan hari ini. Setiap angka dapat diklik menuju daftar terkait."
        actions={
          <Link href="/changes/new" className="btn btn-primary">
            + Buat CRF Baru
          </Link>
        }
      />

      <Page wide>
        {loading ? (
          <Spinner label="Memuat ringkasan…" />
        ) : (
          <div className="mb-5">
            {/* KPI row */}
            <div className="row g-3">
              <div className="col-6 col-sm-6 col-xl">
                <KpiCard
                  label="Perubahan Aktif"
                  help="Belum sampai selesai atau ditutup"
                  value={kpi.total_active ?? open}
                  href="/changes"
                  tone="text-body"
                />
              </div>
              <div className="col-6 col-sm-6 col-xl">
                <KpiCard
                  label="Menunggu Persetujuan"
                  help="CRF dalam antrian persetujuan"
                  value={data?.by_status?.PENDING_APPROVAL ?? 0}
                  href="/approvals"
                  tone="text-warning"
                />
              </div>
              <div className="col-6 col-sm-6 col-xl">
                <KpiCard
                  label="Tinjauan AI Tertunda"
                  help="Antrean atau berjalan di worker"
                  value={data?.ai_review_pending ?? 0}
                  href="/changes?status=AI_REVIEW"
                  tone="text-info"
                />
              </div>
              <div className="col-6 col-sm-6 col-xl">
                <KpiCard
                  label="Waktu Persetujuan"
                  help="Rata-rata dari submit → disetujui"
                  value={kpi.approval_avg_hours != null ? `${kpi.approval_avg_hours} jam` : "—"}
                  tone="text-primary"
                />
              </div>
              <div className="col-12 col-xl">
                <KpiCard
                  label="Tingkat Penerimaan"
                  help="Disetujui / (disetujui + ditutup)"
                  value={kpi.acceptance_rate ? `${kpi.acceptance_rate}%` : "—"}
                  tone={kpi.acceptance_rate != null && kpi.acceptance_rate >= 80 ? "text-success" : "text-warning"}
                  sub={kpi.acceptance_rate != null ? `${data?.by_status?.APPROVED ?? 0} disetujui, ${data?.by_status?.CLOSED ?? 0} ditutup` : ""}
                />
              </div>
            </div>

            <div className="row g-3 mt-4">
              <div className="col-12 col-xl-8">
                <Card title="Perubahan per Status" description="Distribusi seluruh CRF aktif dan arsip">
                  {statusEntries.length === 0 ? (
                    <p className="small text-muted">Belum ada perubahan tercatat.</p>
                  ) : (
                    <DonutChart
                      data={statusEntries.map(([status, count]) => ({
                        label: statusLabel(status),
                        value: count,
                        color: {
                          SUBMITTED: CHART_COLORS.info,
                          DOCUMENT_VALIDATION: CHART_COLORS.teal,
                          AI_REVIEW: CHART_COLORS.teal,
                          PENDING_APPROVAL: CHART_COLORS.warning,
                          REVISION_REQUIRED: CHART_COLORS.danger,
                          APPROVED: CHART_COLORS.success,
                          SCHEDULED: CHART_COLORS.brand,
                          IN_PROGRESS: CHART_COLORS.brand,
                          VALIDATION: CHART_COLORS.purple,
                          CLOSED: CHART_COLORS.neutral,
                          CANCELLED: CHART_COLORS.danger,
                        }[status],
                      }))}
                    />
                  )}
                </Card>
              </div>

              <div className="col-12 col-xl-4">
                <div className="mb-4">
                  <Card title="Perubahan per Kategori" description="Sumber daya yang terdampak">
                    {categoryEntries.length === 0 ? (
                      <p className="small text-muted">Belum ada data kategori.</p>
                    ) : (
                      <DonutChart
                        data={categoryEntries.map(([cat, count], i) => ({
                          label: categoryLabel(cat),
                          value: count,
                        }))}
                        size={180}
                      />
                    )}
                  </Card>
                </div>

                <Card title="Tinjauan AI" description="AI memberi rekomendasi; keputusan tetap pada manusia">
                  <dl className="row g-3 text-sm">
                    <div className="col-6 rounded p-3 bg-body-secondary">
                      <dt className="small text-muted mb-1">Tertunda</dt>
                      <dd className="fs-5 fw-bold">{data?.ai_review_pending ?? 0}</dd>
                    </div>
                    <div className="col-6 rounded p-3 bg-body-secondary">
                      <dt className="small text-muted mb-1">Ditandai risiko</dt>
                      <dd className="fs-5 fw-bold text-warning">{data?.ai_review_flagged ?? 0}</dd>
                    </div>
                  </dl>
                  <p className="mt-3 small text-muted">
                    Skor AI yang tinggi tidak menjamin perubahan aman, dan AI tidak pernah menyetujui.
                  </p>
                </Card>
              </div>
            </div>

            {/* Weekly bar chart */}
            <Card title="Jumlah Request per Minggu" description="4 minggu terakhir (non-dihapus)">
              {data?.weekly_counts.length === 0 ? (
                <p className="small text-muted">Belum ada data request dalam 4 minggu terakhir.</p>
              ) : (
                <WeeklyChart data={data!.weekly_counts} />
              )}
            </Card>

            <Card
              title="Perubahan Terbaru"
              description="Diurutkan berdasarkan pembaruan terakhir"
              actions={
                <Link href="/changes" className="btn btn-sm btn-link text-decoration-none">
                  Lihat semua →
                </Link>
              }
            >
              {recent.length === 0 ? (
                <p className="small text-muted">Belum ada perubahan. Mulai dengan membuat CRF baru.</p>
              ) : (
                <div className="table-responsive">
                  <table className="table table-hover table-striped align-middle mb-0" style={{ minWidth: 560 }}>
                    <thead className="border-bottom" style={{ backgroundColor: "var(--app-surface-secondary)" }}>
                      <tr>
                        <th className="text-nowrap">Change ID</th>
                        <th className="text-nowrap">Judul</th>
                        <th className="text-nowrap">Status</th>
                        <th className="text-nowrap">Diperbarui</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recent.map((c) => (
                        <tr
                          key={c.id}
                          onClick={() => router.push(`/changes/${c.id}`)}
                          className="cursor-pointer border-bottom"
                          style={{ cursor: "pointer", borderBottom: `1px solid var(--app-border)` }}
                        >
                          <td className="text-nowrap" style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", color: "var(--app-primary)" }}>{c.change_number}</td>
                          <td className="text-truncate" style={{ maxWidth: 240 }}>{c.title}</td>
                          <td>
                            <StatusBadge status={c.status} />
                          </td>
                          <td className="text-muted text-nowrap">{fmtDateTime(c.updated_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            <p className="small text-muted">
              Ringkasan dibuat dari {data?.total_changes ?? 0} perubahan (tidak termasuk yang dihapus). Status terbanyak:{" "}
              {statusEntries[0] ? statusLabel(statusEntries[0][0]) : "—"}.
            </p>
          </div>
        )}
      </Page>
    </>
  );
}
