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

        <div className="mb-4">
          <div className="row g-3">
            <div className="col-12 col-sm-4">
              <div className="card p-4">
                <p className="display-6 fw-bold" style={{ fontSize: "28px" }}>{users.length}</p>
                <p className="mt-1 text-[13px] fw-semibold">Total akun</p>
              </div>
            </div>
            <div className="col-12 col-sm-4">
              <div className="card p-4">
                <p className="display-6 fw-bold text-success" style={{ fontSize: "28px" }}>{active}</p>
                <p className="mt-1 text-[13px] fw-semibold">Aktif</p>
              </div>
            </div>
            <div className="col-12 col-sm-4">
              <div className="card p-4">
                <p className="display-6 fw-bold text-muted" style={{ fontSize: "28px" }}>{users.length - active}</p>
                <p className="mt-1 text-[13px] fw-semibold">Nonaktif</p>
              </div>
            </div>
          </div>

          <Card title="Pengguna" description="Ubah peran atau aktif/nonaktifkan akun" className="[&>div]:p-0">
            {loading ? (
              <div className="p-5">
                <Skeleton rows={5} />
              </div>
            ) : users.length === 0 ? (
              <p className="p-5 small text-muted">Belum ada pengguna.</p>
            ) : (
              <div className="overflow-auto">
                <table className="w-100 table table-hover mb-0" style={{ minWidth: "860px" }}>
                  <thead className="border-bottom" style={{ borderBottom: `1px solid var(--app-border)`, backgroundColor: "var(--app-surface-secondary)" }}>
                    <tr>
                      <th className="text-nowrap py-2 px-3 fw-semibold small">Nama</th>
                      <th className="text-nowrap py-2 px-3 fw-semibold small">Username</th>
                      <th className="text-nowrap py-2 px-3 fw-semibold small">Email</th>
                      <th className="text-nowrap py-2 px-3 fw-semibold small">Peran</th>
                      <th className="text-nowrap py-2 px-3 fw-semibold small">Status</th>
                      <th className="text-nowrap py-2 px-3 fw-semibold small text-end">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id} className="border-bottom" style={{
                        borderBottom: `1px solid var(--app-border)`,
                        backgroundColor: (!u.is_active ? "var(--app-surface-secondary)" : undefined),
                        opacity: (!u.is_active ? 0.6 : undefined),
                      }}>
                        <td className="py-2 px-3 fw-medium">{u.display_name || u.username}</td>
                        <td className="py-2 px-3 font-monospace small text-muted">{u.username}</td>
                        <td className="py-2 px-3 small text-muted">{u.email}</td>
                        <td className="py-2 px-3">
                          {editing === u.id ? (
                            <div className="d-flex flex-wrap gap-2" style={{ maxWidth: "320px" }}>
                              {roles.map((r) => (
                                <label key={r.code} className="d-flex align-items-center gap-1 small text-muted">
                                  <input
                                    type="checkbox"
                                    checked={draftRoles.includes(r.code)}
                                    onChange={(e) =>
                                      setDraftRoles((cur) => (e.target.checked ? [...cur, r.code] : cur.filter((c) => c !== r.code)))
                                    }
                                    className="form-check-input"
                                    style={{ width: "14px", height: "14px", borderRadius: "4px", borderColor: "var(--app-border-strong)" }}
                                  />
                                  {roleLabel(r.code)}
                                </label>
                              ))}
                            </div>
                          ) : (
                            <div className="d-flex flex-wrap gap-1">
                              {u.roles.length === 0 ? (
                                <span className="small text-muted">—</span>
                              ) : (
                                u.roles.map((r) => (
                                  <span key={r} className="badge bg-teal bg-opacity-15 text-teal-dark" title={r} style={{ borderRadius: "999px" }}>
                                    {roleLabel(r)}
                                  </span>
                                ))
                              )}
                            </div>
                          )}
                        </td>
                        <td className="py-2 px-3">
                          <span
                            className={`badge ${
                              u.is_active
                                ? "text-bg-success"
                                : "bg-cream text-text-muted border"
                            }`}
                            style={{
                              borderRadius: "999px",
                              ...(u.is_active ? {} : {
                                backgroundColor: "var(--app-surface-secondary)",
                                color: "var(--app-text-muted)",
                                borderColor: "var(--app-border-strong)",
                              }),
                            }}
                          >
                            <span aria-hidden>{u.is_active ? "●" : "○"}</span>
                            {u.is_active ? "Aktif" : "Nonaktif"}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-end">
                          <div className="d-flex justify-content-end gap-1">
                            {editing === u.id ? (
                              <>
                                <button onClick={() => void saveRoles(u.id)} disabled={busy} className="btn btn-sm btn-primary">
                                  Simpan
                                </button>
                                <button onClick={() => setEditing(null)} className="btn btn-sm btn-link text-decoration-none p-0">
                                  Batal
                                </button>
                              </>
                            ) : (
                              <button
                                onClick={() => {
                                  setEditing(u.id);
                                  setDraftRoles(u.roles);
                                }}
                                className="btn btn-sm btn-outline-secondary"
                              >
                                Ubah peran
                              </button>
                            )}
                            {u.id !== me && (
                              <button onClick={() => void toggleActive(u)} disabled={busy} className="btn btn-sm btn-link text-decoration-none p-0">
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

          <div className="row g-3">
            <div className="col-12 col-lg-7">
              <Card title="Tambah pengguna" description="Akun lokal dengan kata sandi awal">
                <form onSubmit={createUser} className="row g-3">
                  <div className="col-12 col-sm-6">
                    <label htmlFor="username" className="form-label">
                      Username
                    </label>
                    <input
                      id="username"
                      required
                      minLength={3}
                      value={form.username}
                      onChange={(e) => setForm({ ...form, username: e.target.value })}
                      className="form-control"
                      autoComplete="off"
                    />
                  </div>
                  <div className="col-12 col-sm-6">
                    <label htmlFor="email" className="form-label">
                      Email
                    </label>
                    <input
                      id="email"
                      required
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      className="form-control"
                      autoComplete="off"
                    />
                  </div>
                  <div className="col-12 col-sm-6">
                    <label htmlFor="display_name" className="form-label">
                      Nama tampilan
                    </label>
                    <input
                      id="display_name"
                      value={form.display_name}
                      onChange={(e) => setForm({ ...form, display_name: e.target.value })}
                      className="form-control"
                    />
                  </div>
                  <div className="col-12 col-sm-6">
                    <label htmlFor="password" className="form-label">
                      Kata sandi <span className="text-muted">(min. 8 karakter)</span>
                    </label>
                    <input
                      id="password"
                      required
                      minLength={8}
                      type="password"
                      value={form.password}
                      onChange={(e) => setForm({ ...form, password: e.target.value })}
                      className="form-control"
                      autoComplete="new-password"
                    />
                  </div>
                  <div className="col-12">
                    <fieldset className="border-0 p-0 mb-0">
                      <legend className="form-label w-100">Peran</legend>
                      <div className="d-flex flex-wrap gap-3">
                        {roles.map((r) => (
                          <label key={r.code} className="d-flex align-items-center gap-2 small" title={r.description ?? undefined}>
                            <input
                              type="checkbox"
                              checked={form.role_codes.includes(r.code)}
                              onChange={(e) =>
                                setForm((f) => ({
                                  ...f,
                                  role_codes: e.target.checked ? [...f.role_codes, r.code] : f.role_codes.filter((c) => c !== r.code),
                                }))
                              }
                              className="form-check-input"
                              style={{ width: "16px", height: "16px", borderRadius: "4px", borderColor: "var(--app-border-strong)" }}
                            />
                            {roleLabel(r.code)}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  </div>
                  <div className="col-12">
                    <button type="submit" disabled={busy} className="btn btn-primary">
                      {busy ? "Menyimpan…" : "Buat pengguna"}
                    </button>
                  </div>
                </form>
              </Card>
            </div>

            <div className="col-12 col-lg-5">
              <Card title="Daftar peran (RBAC)" description="Peran menentukan langkah persetujuan dan menu">
                <ul className="d-flex flex-wrap gap-2 list-unstyled mb-0">
                  {roles.map((r) => (
                    <li key={r.code}>
                      <span className="badge bg-light text-body border" style={{ borderRadius: "999px" }}>{roleLabel(r.code)}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            </div>
          </div>
        </div>
      </Page>
    </>
  );
}
