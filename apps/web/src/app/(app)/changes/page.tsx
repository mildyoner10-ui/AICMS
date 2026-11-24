"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  EmptyState,
  EnvTag,
  ErrorState,
  Notice,
  Page,
  PageHeader,
  RiskBadge,
  Skeleton,
  StatusBadge,
  fmtDateTime,
  useMe,
} from "@/components/ui";
import { STATUS, categoryLabel, environmentLabel } from "@/lib/labels";

interface Change {
  id: string;
  change_number: string;
  title: string;
  category: string;
  change_type: string;
  environment: string;
  status: string;
  risk_level?: string | null;
  requester_name: string | null;
  reviewer_name: string | null;
  approver_name: string | null;
  created_at: string;
  updated_at: string;
}

interface ChangeListData {
  total: number;
  page: number;
  page_size: number;
  items: Change[];
}

const PROTECTED = ["APPROVED", "SCHEDULED", "IN_PROGRESS", "VALIDATION", "COMPLETED", "CLOSED"];
const canDeleteThis = (status: string) => !PROTECTED.includes(status);

const FILTERS = ["", ...Object.keys(STATUS)];

export default function ChangesPage() {
  const { me } = useMe();
  const router = useRouter();
  const [changes, setChanges] = useState<ChangeListData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [notice, setNotice] = useState<{ kind: "info" | "success" | "danger" | "warning"; text: string } | null>(null);
  const [reload, setReload] = useState(0);

  const canDelete = !!me && (me.roles.includes("ADMIN") || me.roles.includes("MANAGER"));

  const load = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token) return;
    setLoading(true);
    const params = new URLSearchParams({ page: String(page) });
    if (search) params.set("search", search);
    if (statusFilter) params.set("status", statusFilter);
    if (fromDate) params.set("from_date", fromDate);
    if (toDate) params.set("to_date", toDate);
    try {
      const res = await fetch(`/api/v1/changes?${params}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Daftar perubahan gagal dimuat. Periksa koneksi lalu coba lagi.");
      const data: ChangeListData = await res.json();
      setChanges(data);
      setSelected((prev) => new Set([...prev].filter((id) => data.items.some((c) => c.id === id))));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Terjadi kesalahan saat memuat data.");
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter, fromDate, toDate]);

  useEffect(() => {
    void load();
  }, [load, reload]);

  const callApi = async (path: string, body?: unknown) => {
    const token = localStorage.getItem("token");
    const res = await fetch(`/api/v1/changes${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.detail || "Permintaan hapus gagal.");
    return data;
  };

  const reportResult = (data: { deleted?: string[]; refused?: { change_number?: string; id: string; reason: string }[] }) => {
    const parts: string[] = [];
    if (data.deleted?.length) parts.push(`${data.deleted.length} perubahan dihapus.`);
    if (data.refused?.length) {
      const list = data.refused.map((r) => `${r.change_number || r.id} (${r.reason})`).join(", ");
      parts.push(`${data.refused.length} ditolak: ${list}.`);
    }
    setNotice({ kind: data.refused?.length ? "warning" : "success", text: parts.join(" ") || "Tidak ada yang dihapus." });
  };

  const deleteOne = async (change: Change) => {
    if (!window.confirm(`Hapus ${change.change_number}? Riwayat audit tetap tersimpan.`)) return;
    const token = localStorage.getItem("token");
    setDeleting(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/v1/changes/${change.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.detail || "Gagal menghapus perubahan.");
      setNotice({ kind: "success", text: `${change.change_number} dihapus.` });
      setReload((n) => n + 1);
    } catch (e) {
      setNotice({ kind: "danger", text: e instanceof Error ? e.message : "Gagal menghapus perubahan." });
    } finally {
      setDeleting(false);
    }
  };

  const deleteSelected = async () => {
    if (selected.size === 0) return;
    if (!window.confirm(`Hapus ${selected.size} perubahan terpilih?`)) return;
    setDeleting(true);
    setNotice(null);
    try {
      reportResult(await callApi("/bulk-delete", { change_ids: [...selected] }));
      setSelected(new Set());
      setReload((n) => n + 1);
    } catch (e) {
      setNotice({ kind: "danger", text: e instanceof Error ? e.message : "Gagal menghapus perubahan." });
    } finally {
      setDeleting(false);
    }
  };

  const deleteAll = async () => {
    if (!window.confirm("Hapus SEMUA perubahan yang belum dieksekusi? Tindakan ini tidak bisa dibatalkan dari UI.")) return;
    setDeleting(true);
    setNotice(null);
    try {
      reportResult(await callApi("/bulk-delete-all"));
      setSelected(new Set());
      setReload((n) => n + 1);
    } catch (e) {
      setNotice({ kind: "danger", text: e instanceof Error ? e.message : "Gagal menghapus perubahan." });
    } finally {
      setDeleting(false);
    }
  };

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const exportCSV = async () => {
    const token = localStorage.getItem("token");
    const params = new URLSearchParams({ page: "1" });
    if (search) params.set("search", search);
    if (statusFilter) params.set("status", statusFilter);
    if (fromDate) params.set("from_date", fromDate);
    if (toDate) params.set("to_date", toDate);
    const res = await fetch(`/api/v1/changes/export?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) { setNotice({ kind: "danger", text: "Ekspor CSV gagal." }); return; }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "laporan-perubahan.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const pageItems = changes?.items ?? [];
  const pageDeletable = pageItems.filter((c) => canDeleteThis(c.status));
  const allSelected = pageItems.length > 0 && pageItems.every((c) => selected.has(c.id));

  return (
    <>
      <PageHeader
        title="Permohonan Perubahan"
        description="Semua CRF beserta status, risiko, dan pemiliknya. Klik baris untuk membuka detail."
        actions={
          <>
            <button onClick={exportCSV} className="btn-secondary">
              📄 Export CSV
            </button>
            {canDelete && pageItems.length > 0 && (
              <>
                <button onClick={deleteSelected} disabled={deleting || selected.size === 0} className="btn-danger">
                  Hapus Terpilih ({selected.size})
                </button>
                <button
                  onClick={deleteAll}
                  disabled={deleting || pageDeletable.length === 0}
                  title={pageDeletable.length === 0 ? "Tidak ada perubahan yang bisa dihapus di halaman ini" : undefined}
                  className="btn-secondary"
                >
                  Hapus Semua
                </button>
              </>
            )}
            <button onClick={() => router.push("/changes/new")} className="btn-primary">
              + Buat CRF Baru
            </button>
          </>
        }
      />

      <Page wide>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label htmlFor="search" className="label">
              Cari
            </label>
            <input
              id="search"
              type="search"
              placeholder="Change ID atau judul…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="field"
            />
          </div>
          <div className="sm:w-64">
            <label htmlFor="status" className="label">
              Status
            </label>
            <select
              id="status"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="field"
            >
              {FILTERS.map((s) => (
                <option key={s || "all"} value={s}>
                  {s ? STATUS[s]?.label : "Semua status"}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:w-40">
            <label htmlFor="from_date" className="label">
              Dari tanggal
            </label>
            <input
              id="from_date"
              type="date"
              value={fromDate}
              onChange={(e) => {
                setFromDate(e.target.value);
                setPage(1);
              }}
              className="field"
            />
          </div>
          <div className="sm:w-40">
            <label htmlFor="to_date" className="label">
              Sampai tanggal
            </label>
            <input
              id="to_date"
              type="date"
              value={toDate}
              onChange={(e) => {
                setToDate(e.target.value);
                setPage(1);
              }}
              className="field"
            />
          </div>
        </div>

        {notice && (
          <Notice kind={notice.kind} onDismiss={() => setNotice(null)}>
            {notice.text}
          </Notice>
        )}

        {loading && <Skeleton rows={5} />}

        {!loading && error && <ErrorState message={error} onRetry={() => setReload((n) => n + 1)} />}

        {!loading && !error && pageItems.length === 0 && (
          <Card>
            <EmptyState
              title="Belum ada perubahan"
              description="Buat permohonan perubahan pertama untuk mulai mencatat dampak, risiko, dan rencana rollback."
              action={
                <button onClick={() => router.push("/changes/new")} className="btn-primary">
                  + Buat CRF Baru
                </button>
              }
            />
          </Card>
        )}

        {!loading && !error && pageItems.length > 0 && (
          <Card className="overflow-hidden [&>div]:p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px]">
                <thead className="border-b border-border bg-surface-muted">
                  <tr>
                    {canDelete && (
                      <th className="w-10 px-4 py-3">
                        <input
                          type="checkbox"
                          aria-label="Pilih semua perubahan di halaman ini"
                          checked={allSelected}
                          onChange={(e) =>
                            setSelected(
                              e.target.checked
                                ? new Set([...selected, ...pageItems.map((c) => c.id)])
                                : new Set([...selected].filter((id) => !pageItems.some((c) => c.id === id))),
                            )
                          }
                          className="h-4 w-4 rounded border-border-strong"
                        />
                      </th>
                    )}
                    <th className="th">Change ID</th>
                    <th className="th">Judul</th>
                    <th className="th">Status</th>
                    <th className="th">Risiko</th>
                    <th className="th">Kategori</th>
                    <th className="th">Lingkungan</th>
                    <th className="th">Peninjau</th>
                    <th className="th">Persetujuan</th>
                    <th className="th">Diperbarui</th>
                    {canDelete && <th className="th text-right">Aksi</th>}
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((change) => (
                    <tr
                      key={change.id}
                      onClick={() => router.push(`/changes/${change.id}`)}
                      className="cursor-pointer border-b border-border last:border-0 hover:bg-surface-muted"
                    >
                      {canDelete && (
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            aria-label={`Pilih ${change.change_number}`}
                            checked={selected.has(change.id)}
                            onChange={() => toggle(change.id)}
                            className="h-4 w-4 rounded border-border-strong"
                          />
                        </td>
                      )}
                      <td className="td whitespace-nowrap font-mono text-brand">{change.change_number}</td>
                      <td className="td max-w-[280px] font-medium">{change.title}</td>
                      <td className="td">
                        <StatusBadge status={change.status} />
                      </td>
                      <td className="td">
                        <RiskBadge risk={change.risk_level ?? null} />
                      </td>
                      <td className="td text-foreground-muted">{categoryLabel(change.category)}</td>
                      <td className="td">
                        <EnvTag env={environmentLabel(change.environment)} />
                      </td>
                      <td className="td text-foreground-muted">{change.reviewer_name ?? "—"}</td>
                      <td className="td text-foreground-muted">{change.approver_name ?? "—"}</td>
                      <td className="td whitespace-nowrap text-foreground-muted">{fmtDateTime(change.updated_at)}</td>
                      {canDelete && (
                        <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => void deleteOne(change)}
                            disabled={deleting || !canDeleteThis(change.status)}
                            title={
                              canDeleteThis(change.status)
                                ? "Hapus perubahan"
                                : "Perubahan yang sudah disetujui atau dieksekusi tidak bisa dihapus"
                            }
                            className="btn-danger btn-sm"
                          >
                            Hapus
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-surface-muted px-4 py-3">
              <p className="text-meta text-foreground-muted">
                Menampilkan {pageItems.length} dari {changes?.total ?? 0} perubahan
              </p>
              <div className="flex gap-2">
                <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1} className="btn-secondary btn-sm">
                  ← Sebelumnya
                </button>
                <button
                  onClick={() => setPage(page + 1)}
                  disabled={(changes?.page_size ?? 20) * page >= (changes?.total ?? 0)}
                  className="btn-secondary btn-sm"
                >
                  Selanjutnya →
                </button>
              </div>
            </div>
          </Card>
        )}
      </Page>
    </>
  );
}