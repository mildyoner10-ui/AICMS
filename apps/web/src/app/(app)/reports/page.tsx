"use client";

import { useEffect, useState } from "react";
import { Card, Page, PageHeader, Skeleton, StatusBadge, Notice, useMe } from "@/components/ui";
import { statusLabel, categoryLabel, riskLabel } from "@/lib/labels";

const STATUS_OPTIONS = [
  "DRAFT", "SUBMITTED", "DOCUMENT_VALIDATION", "AI_REVIEW", "REVIEW_FAILED",
  "PENDING_APPROVAL", "REVISION_REQUIRED", "REJECTED", "APPROVED",
  "SCHEDULED", "IN_PROGRESS", "VALIDATION", "COMPLETED", "CLOSED", "CANCELLED", "STALE",
];
const CATEGORY_OPTIONS = ["HEAD_OFFICE", "CHANNEL", "BRANCH_OFFICE", "OTHER"];
const TYPE_OPTIONS = ["PLANNED", "UNPLANNED", "EMERGENCY"];
const ENV_OPTIONS = ["PRODUCTION", "STAGING", "DEVELOPMENT", "TESTING"];

export default function ReportsPage() {
  const { me } = useMe();
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<Record<string, unknown> | null>(null);

  // Filters
  const [status, setStatus] = useState("");
  const [category, setCategory] = useState("");
  const [changeType, setChangeType] = useState("");
  const [environment, setEnvironment] = useState("");
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const filters = { status, category, changeType, environment, search, fromDate, toDate };
  const hasFilters = Object.values(filters).some(Boolean);

  const fetchData = async () => {
    setLoading(true);
    setError("");
    const token = localStorage.getItem("token");
    if (!token) {
      setLoading(false);
      setError("Sesi login berakhir. Silakan masuk ulang.");
      return;
    }

    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (v) params.set(k, v);
    });

    try {
      const res = await fetch(`/api/v1/reports/summary?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Gagal memuat data laporan");
      const json = await res.json();
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Terjadi kesalahan");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleExport = async (format: "pdf" | "csv") => {
    setExporting(true);
    setError("");
    const token = localStorage.getItem("token");
    if (!token) {
      setExporting(false);
      setError("Sesi login berakhir. Silakan masuk ulang.");
      return;
    }

    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (v) params.set(k, v);
    });

    try {
      const res = await fetch(`/api/v1/reports/${format}?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Gagal mengekspor ${format.toUpperCase()}`);
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `laporan-perubahan.${format === "pdf" ? "pdf" : "csv"}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : `Ekspor ${format.toUpperCase()} gagal`);
    } finally {
      setExporting(false);
    }
  };

  const clearFilters = () => {
    setStatus("");
    setCategory("");
    setChangeType("");
    setEnvironment("");
    setSearch("");
    setFromDate("");
    setToDate("");
  };

  const pct = (n: number, total: number) =>
    total > 0 ? `${(n / total * 100).toFixed(1)}%` : "0.0%";

  if (!me) return null;

  return (
    <>
      <PageHeader
        title="Laporan"
        description="Generate laporan lengkap sistem manajemen perubahan dalam format PDF atau CSV."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => handleExport("csv")}
              disabled={exporting || loading}
              className="btn-secondary btn-sm"
            >
              ⬇ Export CSV
            </button>
            <button
              onClick={() => handleExport("pdf")}
              disabled={exporting || loading}
              className="btn-primary btn-sm"
            >
              {exporting ? "Membuat PDF…" : "⬇ Export PDF"}
            </button>
          </div>
        }
      />

      <Page wide>
        {/* Filters */}
        <Card title="Filter Laporan" className="mb-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="label">Cari</label>
              <input
                type="search"
                placeholder="Change ID atau judul…"
                value={search}
                onChange={(e) => { setSearch(e.target.value); }}
                className="field"
              />
            </div>
            <div>
              <label className="label">Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value)} className="field">
                <option value="">Semua</option>
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>{statusLabel(s)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Kategori</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="field">
                <option value="">Semua</option>
                {CATEGORY_OPTIONS.map((c) => (
                  <option key={c} value={c}>{categoryLabel(c)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Tipe</label>
              <select value={changeType} onChange={(e) => setChangeType(e.target.value)} className="field">
                <option value="">Semua</option>
                {TYPE_OPTIONS.map((t) => (
                  <option key={t} value={t}>{t === "PLANNED" ? "Terencana" : t === "UNPLANNED" ? "Tidak terencana" : "Darurat"}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Lingkungan</label>
              <select value={environment} onChange={(e) => setEnvironment(e.target.value)} className="field">
                <option value="">Semua</option>
                {ENV_OPTIONS.map((e) => (
                  <option key={e} value={e}>{e === "PRODUCTION" ? "Produksi" : e === "STAGING" ? "Staging" : e === "DEVELOPMENT" ? "Development" : "Testing"}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Dari Tanggal</label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="field"
              />
            </div>
            <div>
              <label className="label">Sampai Tanggal</label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="field"
              />
            </div>
            <div className="flex items-end gap-2">
              <button onClick={fetchData} disabled={loading} className="btn-primary btn-sm flex-1">
                {loading ? "Memuat…" : "Terapkan Filter"}
              </button>
              {hasFilters && (
                <button onClick={clearFilters} className="btn-ghost btn-sm">
                  Reset
                </button>
              )}
            </div>
          </div>
        </Card>

        {error && <Notice kind="danger">{error}</Notice>}

        {loading ? (
          <div className="space-y-4">
            <Skeleton rows={2} />
            <Skeleton rows={12} />
          </div>
        ) : data ? (
          <>
            {/* KPI summary */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-5 mb-4">
              <div className="card p-4">
                <p className="kpi text-teal-dark">{data.total as number}</p>
                <p className="mt-0.5 text-meta text-text-muted">Total</p>
              </div>
              <div className="card p-4">
                <p className="kpi text-teal-dark">{(data.by_status as Record<string, number>)?.COMPLETED || 0}</p>
                <p className="mt-0.5 text-meta text-text-muted">Selesai</p>
              </div>
              <div className="card p-4">
                <p className="kpi text-teal-dark">{(data.by_status as Record<string, number>)?.APPROVED || 0}</p>
                <p className="mt-0.5 text-meta text-text-muted">Disetujui</p>
              </div>
              <div className="card p-4">
                <p className="kpi text-teal-dark">
                  {((data.by_status as Record<string, number>)?.SCHEDULED || 0) + ((data.by_status as Record<string, number>)?.IN_PROGRESS || 0)}
                </p>
                <p className="mt-0.5 text-meta text-text-muted">Aktif</p>
              </div>
              {(data as Record<string, number>)?.approval_avg_hours != null && (
                <div className="card p-4">
                  <p className="kpi text-teal-dark">{(data as Record<string, number>).approval_avg_hours}</p>
                  <p className="mt-0.5 text-meta text-text-muted">Rata-rata Persetujuan (jam)</p>
                </div>
              )}
            </div>

            {/* Distribution tables */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 mb-4">
              <Card title="Distribusi Status">
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <th className="th">Status</th>
                      <th className="th" style={{ textAlign: "right" }}>Jumlah</th>
                      <th className="th" style={{ textAlign: "right" }}>Persentase</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries((data.by_status as Record<string, number>) || {}).map(([s, c]) => (
                      <tr key={s} className="border-b border-border">
                        <td className="td">{statusLabel(s)}</td>
                        <td className="td" style={{ textAlign: "right" }}>{c}</td>
                        <td className="td" style={{ textAlign: "right" }}>{pct(c, data.total as number)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>

              <Card title="Distribusi Kategori">
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <th className="th">Kategori</th>
                      <th className="th" style={{ textAlign: "right" }}>Jumlah</th>
                      <th className="th" style={{ textAlign: "right" }}>Persentase</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries((data.by_category as Record<string, number>) || {}).map(([c, n]) => (
                      <tr key={c} className="border-b border-border">
                        <td className="td">{categoryLabel(c)}</td>
                        <td className="td" style={{ textAlign: "right" }}>{n}</td>
                        <td className="td" style={{ textAlign: "right" }}>{pct(n, data.total as number)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 mb-4">
              <Card title="Distribusi Lingkungan">
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <th className="th">Lingkungan</th>
                      <th className="th" style={{ textAlign: "right" }}>Jumlah</th>
                      <th className="th" style={{ textAlign: "right" }}>Persentase</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries((data.by_environment as Record<string, number>) || {}).map(([e, n]) => (
                      <tr key={e} className="border-b border-border">
                        <td className="td">{e}</td>
                        <td className="td" style={{ textAlign: "right" }}>{n}</td>
                        <td className="td" style={{ textAlign: "right" }}>{pct(n, data.total as number)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>

              <Card title="Distribusi Tipe">
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <th className="th">Tipe</th>
                      <th className="th" style={{ textAlign: "right" }}>Jumlah</th>
                      <th className="th" style={{ textAlign: "right" }}>Persentase</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries((data.by_type as Record<string, number>) || {}).map(([t, n]) => (
                      <tr key={t} className="border-b border-border">
                        <td className="td">{t || "-"}</td>
                        <td className="td" style={{ textAlign: "right" }}>{n}</td>
                        <td className="td" style={{ textAlign: "right" }}>{pct(n, data.total as number)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </div>

            {/* Full detail table */}
            <Card
              title="Daftar Lengkap Perubahan"
              description={`${(data.items as Array<unknown>).length} dari ${(data.total as number)} perubahan`}
            >
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <th className="th">No. CRF</th>
                      <th className="th">Judul</th>
                      <th className="th">Status</th>
                      <th className="th">Risiko</th>
                      <th className="th">Kategori</th>
                      <th className="th">Tipe</th>
                      <th className="th">Lingkungan</th>
                      <th className="th">Pemohon</th>
                      <th className="th">Reviewer</th>
                      <th className="th">Disetujui Oleh</th>
                      <th className="th">Tgl Dibuat</th>
                    </tr>
                  </thead>
                  <tbody>
                    {((data.items as Array<any>) || []).map((item: any, idx: number) => (
                      <tr key={idx} className="border-b border-border hover:bg-cream/50">
                        <td className="td font-bold">{item.change_number}</td>
                        <td className="td max-w-xs truncate">{item.title}</td>
                        <td className="td"><StatusBadge status={item.status} /></td>
                        <td className="td">{riskLabel(item.risk_level) || "-"}</td>
                        <td className="td">{categoryLabel(item.category) || "-"}</td>
                        <td className="td">{item.change_type || "-"}</td>
                        <td className="td">{item.environment || "-"}</td>
                        <td className="td">{item.requester_name || "-"}</td>
                        <td className="td">{item.reviewer_name || "-"}</td>
                        <td className="td">{item.approved_by_name || "-"}</td>
                        <td className="td">{item.created_at ? new Date(item.created_at).toISOString().slice(0, 10) : "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        ) : null}
      </Page>
    </>
  );
}
