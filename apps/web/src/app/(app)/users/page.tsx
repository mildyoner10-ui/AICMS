"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Notice, Page, PageHeader, Skeleton } from "@/components/ui";
import { roleLabel } from "@/lib/labels";

interface UserRow {
  id: string;
  username: string;
  email: string;
  display_name: string | null;
  is_active: boolean;
  auth_provider: string;
  roles: string[];
  created_at: string | null;
}

interface RoleRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
}

const EMPTY_FORM = { username: "", email: "", display_name: "", password: "", role_codes: [] as string[] };

export default function UsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [me, setMe] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [draftRoles, setDraftRoles] = useState<string[]>([]);

  const token = () => localStorage.getItem("token");

  const load = useCallback(async () => {
    const t = token();
    if (!t) {
      router.push("/login");
      return;
    }
    try {
      const meRes = await fetch("/api/v1/auth/me", { headers: { Authorization: `Bearer ${t}` } });
      const meData = await meRes.json();
      if (!meRes.ok || !(meData.roles ?? []).includes("ADMIN")) {
        router.push("/dashboard");
        return;
      }
      setMe(meData.id);
      const [uRes, rRes] = await Promise.all([
        fetch("/api/v1/users?page_size=200", { headers: { Authorization: `Bearer ${t}` } }),
        fetch("/api/v1/users/roles", { headers: { Authorization: `Bearer ${t}` } }),
      ]);
      if (!uRes.ok) throw new Error((await uRes.json().catch(() => ({})))?.detail || "Daftar pengguna gagal dimuat.");
      setUsers((await uRes.json()).items);
      setRoles(rRes.ok ? await rRes.json() : []);
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

  const call = async (url: string, method: string, body?: unknown) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.detail || "Permintaan gagal.");
      return data;
    } finally {
      setBusy(false);
    }
  };

  const createUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await call("/api/v1/users", "POST", form);
      setNotice(`Pengguna ${form.username} dibuat.`);
      setForm(EMPTY_FORM);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Pengguna gagal dibuat.");
    }
  };

  const saveRoles = async (id: string) => {
    try {
      await call(`/api/v1/users/${id}/roles`, "PUT", { role_codes: draftRoles });
      setNotice("Peran diperbarui.");
      setEditing(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Peran gagal disimpan.");
    }
  };

  const toggleActive = async (u: UserRow) => {
    if (u.is_active && !window.confirm(`Nonaktifkan ${u.username}? Akun tidak bisa login sampai diaktifkan kembali.`)) return;
    try {
      if (u.is_active) await call(`/api/v1/users/${u.id}`, "DELETE");
      else await call(`/api/v1/users/${u.id}`, "PATCH", { is_active: true });
      setNotice(u.is_active ? `${u.username} dinonaktifkan.` : `${u.username} diaktifkan.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Status gagal diubah.");
    }
  };

  const active = users.filter((u) => u.is_active).length;

  return (
    <>
      <PageHeader
        title="Pengguna & Peran"
        description="Kelola akun dan peran (RBAC). Perubahan peran berlaku pada permintaan berikutnya; akun nonaktif tidak dapat login."
      />

      <Page wide>
        {error && (
          <Notice kind="danger" onDismiss={() => setError("")}>
            {error}
          </Notice>
        )}
        {notice && (
          <Notice kind="success" onDismiss={() => setNotice("")}>
            {notice}
          </Notice>
        )}

        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="card p-4">
              <p className="text-kpi tabular-nums">{users.length}</p>
              <p className="mt-1 text-[13px] font-semibold">Total akun</p>
            </div>
            <div className="card p-4">
              <p className="text-kpi tabular-nums text-success">{active}</p>
              <p className="mt-1 text-[13px] font-semibold">Aktif</p>
            </div>
            <div className="card p-4">
              <p className="text-kpi tabular-nums text-foreground-muted">{users.length - active}</p>
              <p className="mt-1 text-[13px] font-semibold">Nonaktif</p>
            </div>
          </div>

          <Card title="Pengguna" description="Ubah peran atau aktif/nonaktifkan akun" className="[&>div]:p-0">
            {loading ? (
              <div className="p-5">
                <Skeleton rows={5} />
              </div>
            ) : users.length === 0 ? (
              <p className="p-5 text-sm text-foreground-muted">Belum ada pengguna.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[860px]">
                  <thead className="border-b border-border bg-cream">
                    <tr>
                      <th className="th">Nama</th>
                      <th className="th">Username</th>
                      <th className="th">Email</th>
                      <th className="th">Peran</th>
                      <th className="th">Status</th>
                      <th className="th text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id} className={`border-b border-border last:border-0 ${u.is_active ? "" : "bg-cream/60 text-text-muted"}`}>
                        <td className="td font-medium">{u.display_name || u.username}</td>
                        <td className="td font-mono text-meta">{u.username}</td>
                        <td className="td text-meta text-foreground-muted">{u.email}</td>
                        <td className="td">
                          {editing === u.id ? (
                            <div className="flex max-w-xs flex-wrap gap-2">
                              {roles.map((r) => (
                                <label key={r.code} className="flex items-center gap-1.5 text-meta">
                                  <input
                                    type="checkbox"
                                    checked={draftRoles.includes(r.code)}
                                    onChange={(e) =>
                                      setDraftRoles((cur) => (e.target.checked ? [...cur, r.code] : cur.filter((c) => c !== r.code)))
                                    }
                                    className="h-3.5 w-3.5 rounded border-border-strong"
                                  />
                                  {roleLabel(r.code)}
                                </label>
                              ))}
                            </div>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {u.roles.length === 0 ? (
                                <span className="text-meta text-foreground-muted">—</span>
                              ) : (
                                u.roles.map((r) => (
                                  <span key={r} className="chip whitespace-nowrap bg-teal bg-opacity-15 text-teal-dark" title={r}>
                                    {roleLabel(r)}
                                  </span>
                                ))
                              )}
                            </div>
                          )}
                        </td>
                        <td className="td">
                          <span
                            className={`chip ${
                              u.is_active
                                ? "bg-success-soft text-success ring-1 ring-inset ring-success/25"
                                : "bg-cream text-text-muted ring-1 ring-inset ring-border-strong"
                            }`}
                          >
                            <span aria-hidden>{u.is_active ? "●" : "○"}</span>
                            {u.is_active ? "Aktif" : "Nonaktif"}
                          </span>
                        </td>
                        <td className="td text-right">
                          <div className="flex justify-end gap-1">
                            {editing === u.id ? (
                              <>
                                <button onClick={() => void saveRoles(u.id)} disabled={busy} className="btn-primary btn-sm">
                                  Simpan
                                </button>
                                <button onClick={() => setEditing(null)} className="btn-ghost btn-sm">
                                  Batal
                                </button>
                              </>
                            ) : (
                              <button
                                onClick={() => {
                                  setEditing(u.id);
                                  setDraftRoles(u.roles);
                                }}
                                className="btn-secondary btn-sm"
                              >
                                Ubah peran
                              </button>
                            )}
                            {u.id !== me && (
                              <button onClick={() => void toggleActive(u)} disabled={busy} className="btn-ghost btn-sm">
                                {u.is_active ? "Nonaktifkan" : "Aktifkan"}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
            <Card title="Tambah pengguna" description="Akun lokal dengan kata sandi awal" className="lg:col-span-3">
              <form onSubmit={createUser} className="grid gap-4 md:grid-cols-2">
                <div>
                  <label htmlFor="username" className="label">
                    Username
                  </label>
                  <input
                    id="username"
                    required
                    minLength={3}
                    value={form.username}
                    onChange={(e) => setForm({ ...form, username: e.target.value })}
                    className="field"
                    autoComplete="off"
                  />
                </div>
                <div>
                  <label htmlFor="email" className="label">
                    Email
                  </label>
                  <input
                    id="email"
                    required
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="field"
                    autoComplete="off"
                  />
                </div>
                <div>
                  <label htmlFor="display_name" className="label">
                    Nama tampilan
                  </label>
                  <input
                    id="display_name"
                    value={form.display_name}
                    onChange={(e) => setForm({ ...form, display_name: e.target.value })}
                    className="field"
                  />
                </div>
                <div>
                  <label htmlFor="password" className="label">
                    Kata sandi <span className="text-foreground-muted">(min. 8 karakter)</span>
                  </label>
                  <input
                    id="password"
                    required
                    minLength={8}
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    className="field"
                    autoComplete="new-password"
                  />
                </div>
                <fieldset className="md:col-span-2">
                  <legend className="label">Peran</legend>
                  <div className="flex flex-wrap gap-3">
                    {roles.map((r) => (
                      <label key={r.code} className="flex items-center gap-2 text-sm" title={r.description ?? undefined}>
                        <input
                          type="checkbox"
                          checked={form.role_codes.includes(r.code)}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              role_codes: e.target.checked ? [...f.role_codes, r.code] : f.role_codes.filter((c) => c !== r.code),
                            }))
                          }
                          className="h-4 w-4 rounded border-border-strong"
                        />
                        {roleLabel(r.code)}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <div className="md:col-span-2">
                  <button type="submit" disabled={busy} className="btn-primary">
                    {busy ? "Menyimpan…" : "Buat pengguna"}
                  </button>
                </div>
              </form>
            </Card>

            <Card title="Daftar peran (RBAC)" description="Peran menentukan langkah persetujuan dan menu" className="lg:col-span-2">
              <ul className="flex flex-wrap gap-2">
                {roles.map((r) => (
                  <li key={r.code}>
                    <span className="chip bg-cream text-text-muted ring-1 ring-inset ring-border-strong">{roleLabel(r.code)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </div>
      </Page>
    </>
  );
}