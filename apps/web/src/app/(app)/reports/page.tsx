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
          <div className="d-flex flex-wrap gap-2">
            <button
              onClick={() => handleExport("csv")}
              disabled={exporting || loading}
              className="btn btn-secondary btn-sm"
            >
              ⬇ Export CSV
            </button>
            <button
              onClick={() => handleExport("pdf")}
              disabled={exporting || loading}
              className="btn btn-primary btn-sm"
            >
              {exporting ? "Membuat PDF…" : "⬇ Export PDF"}
            </button>
          </div>
        }
      />

      <Page wide>
        {/* Filters */}
        <Card title="Filter Laporan" className="mb-4">
          <div className="row g-3">
            <div className="col-sm-6 col-lg-3">
              <label className="form-label">Cari</label>
              <input
                type="search"
                placeholder="Change ID atau judul…"
                value={search}
                onChange={(e) => { setSearch(e.target.value); }}
                className="form-control"
              />
            </div>
            <div className="col-sm-6 col-lg-3">
              <label className="form-label">Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value)} className="form-select">
                <option value="">Semua</option>
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>{statusLabel(s)}</option>
                ))}
              </select>
            </div>
            <div className="col-sm-6 col-lg-3">
              <label className="form-label">Kategori</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="form-select">
                <option value="">Semua</option>
                {CATEGORY_OPTIONS.map((c) => (
                  <option key={c} value={c}>{categoryLabel(c)}</option>
                ))}
              </select>
            </div>
            <div className="col-sm-6 col-lg-3">
              <label className="form-label">Tipe</label>
              <select value={changeType} onChange={(e) => setChangeType(e.target.value)} className="form-select">
                <option value="">Semua</option>
                {TYPE_OPTIONS.map((t) => (
                  <option key={t} value={t}>{t === "PLANNED" ? "Terencana" : t === "UNPLANNED" ? "Tidak terencana" : "Darurat"}</option>
                ))}
              </select>
            </div>
            <div className="col-sm-6 col-lg-3">
              <label className="form-label">Lingkungan</label>
              <select value={environment} onChange={(e) => setEnvironment(e.target.value)} className="form-select">
                <option value="">Semua</option>
                {ENV_OPTIONS.map((e) => (
                  <option key={e} value={e}>{e === "PRODUCTION" ? "Produksi" : e === "STAGING" ? "Staging" : e === "DEVELOPMENT" ? "Development" : "Testing"}</option>
                ))}
              </select>
            </div>
            <div className="col-sm-6 col-lg-3">
              <label className="form-label">Dari Tanggal</label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="form-control"
              />
            </div>
            <div className="col-sm-6 col-lg-3">
              <label className="form-label">Sampai Tanggal</label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="form-control"
              />
            </div>
            <div className="col-sm-6 col-lg-3 d-flex align-items-end gap-2">
              <button onClick={fetchData} disabled={loading} className="btn btn-primary btn-sm flex-grow-1">
                {loading ? "Memuat…" : "Terapkan Filter"}
              </button>
              {hasFilters && (
                <button onClick={clearFilters} className="btn btn-link btn-sm text-decoration-none">
                  Reset
                </button>
              )}
            </div>
          </div>
        </Card>

        {error && <Notice kind="danger">{error}</Notice>}

        {loading ? (
          <div className="d-flex flex-column gap-3">
            <Skeleton rows={2} />
            <Skeleton rows={12} />
          </div>
        ) : data ? (
          <>
            {/* KPI summary */}
            <div className="row g-3 mb-4">
              <div className="col-6 col-md-4 col-lg">
                <div className="card p-4">
                  <p className="fs-4 fw-bold mb-0 text-body">{data.total as number}</p>
                  <p className="small text-muted mb-0">Total</p>
                </div>
              </div>
              <div className="col-6 col-md-4 col-lg">
                <div className="card p-4">
                  <p className="fs-4 fw-bold mb-0 text-body">{(data.by_status as Record<string, number>)?.COMPLETED || 0}</p>
                  <p className="small text-muted mb-0">Selesai</p>
                </div>
              </div>
              <div className="col-6 col-md-4 col-lg">
                <div className="card p-4">
                  <p className="fs-4 fw-bold mb-0 text-body">{(data.by_status as Record<string, number>)?.APPROVED || 0}</p>
                  <p className="small text-muted mb-0">Disetujui</p>
                </div>
              </div>
              <div className="col-6 col-md-4 col-lg">
                <div className="card p-4">
                  <p className="fs-4 fw-bold mb-0 text-body">
                    {((data.by_status as Record<string, number>)?.SCHEDULED || 0) + ((data.by_status as Record<string, number>)?.IN_PROGRESS || 0)}
                  </p>
                  <p className="small text-muted mb-0">Aktif</p>
                </div>
              </div>
              {(data as Record<string, number>)?.approval_avg_hours != null && (
                <div className="col-6 col-md-4 col-lg">
                  <div className="card p-4">
                    <p className="fs-4 fw-bold mb-0 text-body">{(data as Record<string, number>).approval_avg_hours}</p>
                    <p className="small text-muted mb-0">Rata-rata Persetujuan (jam)</p>
                  </div>
                </div>
              )}
            </div>

            {/* Distribution tables */}
            <div className="row g-3 mb-4">
              <div className="col-md-6">
                <Card title="Distribusi Status">
                  <table className="table table-sm table-striped mb-0">
                    <thead>
                      <tr>
                        <th className="text-nowrap">Status</th>
                        <th className="text-nowrap text-end">Jumlah</th>
                        <th className="text-nowrap text-end">Persentase</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries((data.by_status as Record<string, number>) || {}).map(([s, c]) => (
                        <tr key={s}>
                          <td className="text-nowrap">{statusLabel(s)}</td>
                          <td className="text-nowrap text-end">{c}</td>
                          <td className="text-nowrap text-end">{pct(c, data.total as number)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>
              </div>

              <div className="col-md-6">
                <Card title="Distribusi Kategori">
                  <table className="table table-sm table-striped mb-0">
                    <thead>
                      <tr>
                        <th className="text-nowrap">Kategori</th>
                        <th className="text-nowrap text-end">Jumlah</th>
                        <th className="text-nowrap text-end">Persentase</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries((data.by_category as Record<string, number>) || {}).map(([c, n]) => (
                        <tr key={c}>
                          <td className="text-nowrap">{categoryLabel(c)}</td>
                          <td className="text-nowrap text-end">{n}</td>
                          <td className="text-nowrap text-end">{pct(n, data.total as number)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>
              </div>
            </div>

            <div className="row g-3 mb-4">
              <div className="col-md-6">
                <Card title="Distribusi Lingkungan">
                  <table className="table table-sm table-striped mb-0">
                    <thead>
                      <tr>
                        <th className="text-nowrap">Lingkungan</th>
                        <th className="text-nowrap text-end">Jumlah</th>
                        <th className="text-nowrap text-end">Persentase</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries((data.by_environment as Record<string, number>) || {}).map(([e, n]) => (
                        <tr key={e}>
                          <td className="text-nowrap">{e}</td>
                          <td className="text-nowrap text-end">{n}</td>
                          <td className="text-nowrap text-end">{pct(n, data.total as number)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>
              </div>

              <div className="col-md-6">
                <Card title="Distribusi Tipe">
                  <table className="table table-sm table-striped mb-0">
                    <thead>
                      <tr>
                        <th className="text-nowrap">Tipe</th>
                        <th className="text-nowrap text-end">Jumlah</th>
                        <th className="text-nowrap text-end">Persentase</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries((data.by_type as Record<string, number>) || {}).map(([t, n]) => (
                        <tr key={t}>
                          <td className="text-nowrap">{t || "-"}</td>
                          <td className="text-nowrap text-end">{n}</td>
                          <td className="text-nowrap text-end">{pct(n, data.total as number)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>
              </div>
            </div>

            {/* Full detail table */}
            <Card
              title="Daftar Lengkap Perubahan"
              description={`${(data.items as Array<unknown>).length} dari ${(data.total as number)} perubahan`}
            >
              <div className="table-responsive">
                <table className="table table-sm table-hover table-striped mb-0">
                  <thead>
                    <tr>
                      <th className="text-nowrap">No. CRF</th>
                      <th className="text-nowrap">Judul</th>
                      <th className="text-nowrap">Status</th>
                      <th className="text-nowrap">Risiko</th>
                      <th className="text-nowrap">Kategori</th>
                      <th className="text-nowrap">Tipe</th>
                      <th className="text-nowrap">Lingkungan</th>
                      <th className="text-nowrap">Pemohon</th>
                      <th className="text-nowrap">Reviewer</th>
                      <th className="text-nowrap">Disetujui Oleh</th>
                      <th className="text-nowrap">Tgl Dibuat</th>
                    </tr>
                  </thead>
                  <tbody>
                    {((data.items as Array<any>) || []).map((item: any, idx: number) => (
                      <tr key={idx}>
                        <td className="text-nowrap fw-bold">{item.change_number}</td>
                        <td className="text-truncate" style={{ maxWidth: "200px" }}>{item.title}</td>
                        <td className="text-nowrap"><StatusBadge status={item.status} /></td>
                        <td className="text-nowrap">{riskLabel(item.risk_level) || "-"}</td>
                        <td className="text-nowrap">{categoryLabel(item.category) || "-"}</td>
                        <td className="text-nowrap">{item.change_type || "-"}</td>
                        <td className="text-nowrap">{item.environment || "-"}</td>
                        <td className="text-nowrap">{item.requester_name || "-"}</td>
                        <td className="text-nowrap">{item.reviewer_name || "-"}</td>
                        <td className="text-nowrap">{item.approved_by_name || "-"}</td>
                        <td className="text-nowrap">{item.created_at ? new Date(item.created_at).toISOString().slice(0, 10) : "-"}</td>
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
