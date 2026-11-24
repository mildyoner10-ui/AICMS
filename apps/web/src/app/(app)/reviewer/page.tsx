"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  EmptyState,
  ErrorState,
  Page,
  PageHeader,
  RiskBadge,
  Skeleton,
  StatusBadge,
  fmtDateTime,
  useMe,
} from "@/components/ui";
import { STATUS, categoryLabel } from "@/lib/labels";

interface ReviewItem {
  id: string;
  change_number: string;
  title: string;
  status: string;
  risk_level: string | null;
  category: string;
  reviewer_name: string | null;
  updated_at: string;
  ai_completed: boolean;
  decision: string | null;
}

interface ReviewList {
  total: number;
  items: ReviewItem[];
}

export default function ReviewerPage() {
  const { me } = useMe();
  const router = useRouter();
  const [data, setData] = useState<ReviewList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token) return;
    setLoading(true);
    const params = new URLSearchParams({ page: "1" });
    if (search) params.set("search", search);
    try {
      const res = await fetch(`/api/v1/changes?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Gagal memuat data tinjauan.");
      const json = await res.json();
      // Filter: changes with completed AI review that need reviewer action
      const items = (json.items ?? []).filter(
        (c: ReviewItem) =>
          ["AI_REVIEW", "REVISION_REQUIRED", "PENDING_APPROVAL"].includes(c.status),
      );
      setData({ total: json.total, items });
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Terjadi kesalahan.");
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!me) return null;

  return (
    <>
      <PageHeader
        title="Peninjau"
        description="Perubahan yang perlu ditinjau secara manual oleh reviewer. Klik baris untuk membuka detail CRF."
      />

      <Page wide>
        <div className="mb-4">
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
            }}
            className="field"
          />
        </div>

        {loading && <Skeleton rows={4} />}

        {!loading && error && <ErrorState message={error} onRetry={() => void load()} />}

        {!loading && !error && (!data || data.items.length === 0) && (
          <Card>
            <EmptyState
              title="Tidak ada tugas peninjauan"
              description="Semua perubahan yang telah ditinjau AI telah diputuskan, atau belum ada AI review yang selesai."
            />
          </Card>
        )}

        {!loading && !error && data && data.items.length > 0 && (
          <Card className="overflow-hidden [&>div]:p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px]">
                <thead className="border-b border-border bg-cream">
                  <tr>
                    <th className="th">Change ID</th>
                    <th className="th">Judul</th>
                    <th className="th">Status</th>
                    <th className="th">Risiko</th>
                    <th className="th">Kategori</th>
                    <th className="th">Peninjau</th>
                    <th className="th">Diperbarui</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((item) => (
                    <tr
                      key={item.id}
                      onClick={() => router.push(`/changes/${item.id}`)}
                      className="cursor-pointer border-b border-border last:border-0 hover:bg-cream"
                    >
                      <td className="td whitespace-nowrap font-mono text-brand">{item.change_number}</td>
                      <td className="td max-w-[300px] truncate font-medium">{item.title}</td>
                      <td className="td">
                        <StatusBadge status={item.status} />
                      </td>
                      <td className="td">
                        <RiskBadge risk={item.risk_level ?? null} />
                      </td>
                      <td className="td text-foreground-muted">{categoryLabel(item.category)}</td>
                      <td className="td text-foreground-muted">{item.reviewer_name ?? "—"}</td>
                      <td className="td whitespace-nowrap text-foreground-muted">{fmtDateTime(item.updated_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        <p className="mt-3 text-meta text-foreground-muted">
          Ditampilkan {data?.items.length ?? 0} dari {data?.total ?? 0} perubahan.
        </p>
      </Page>
    </>
  );
}
