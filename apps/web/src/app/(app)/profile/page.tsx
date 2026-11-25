"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Card,
  ErrorState,
  Page,
  PageHeader,
  Notice,
  useMe,
} from "@/components/ui";

export default function ProfilePage() {
  const { me } = useMe();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [authProvider, setAuthProvider] = useState("local");

  const load = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token) return;
    try {
      const res = await fetch("/api/v1/auth/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Gagal memuat profil.");
      const u = await res.json();
      setDisplayName(u.display_name ?? "");
      setEmail(u.email);
      setAuthProvider(u.auth_provider ?? "local");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Terjadi kesalahan.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const onSave = async () => {
    setError("");
    setNotice("");
    const token = localStorage.getItem("token");
    if (!token) return;

    const body: Record<string, string | undefined> = {};
    if (displayName !== (me?.display_name ?? "")) {
      body.display_name = displayName;
    }
    if (email !== (me?.email ?? "")) {
      body.email = email;
    }
    if (newPassword) {
      body.old_password = oldPassword;
      body.new_password = newPassword;
      if (newPassword !== confirmPassword) {
        setError("Konfirmasi password tidak cocok.");
        return;
      }
    }

    if (!Object.keys(body).length) {
      setNotice("Tidak ada perubahan.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/v1/auth/me", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.detail ?? "Gagal menyimpan profil.");
        return;
      }
      setNotice("Profil berhasil diperbarui.");
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Terjadi kesalahan.");
    } finally {
      setSaving(false);
    }
  };

  if (!me) return null;
  if (loading) return null;

  return (
    <>
      <PageHeader
        title="Profil"
        description="Kelola nama, email, dan kata sandi akun Anda."
      />

      <Page>
        <div className="mx-auto" style={{ maxWidth: "576px" }}>
        <Card className="">
          <div className="d-flex flex-column gap-3">
            <div>
              <label htmlFor="displayName" className="form-label">Nama Tampilan</label>
              <input
                id="displayName"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="form-control"
              />
            </div>

            <div>
              <label htmlFor="email" className="form-label">Email</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="form-control"
              />
            </div>

            <div>
              <label className="form-label">Nama Pengguna</label>
              <input
                id="username"
                type="text"
                value={me.username}
                disabled
                className="form-control cursor-not-allowed opacity-60"
                aria-describedby="username-help"
              />
              <p id="username-help" className="form-text mt-1 mb-0">
                Nama pengguna tidak dapat diubah.
              </p>
            </div>

            {authProvider === "local" && (
              <>
                <div>
                  <label htmlFor="oldPassword" className="form-label">Password Lama</label>
                  <input
                    id="oldPassword"
                    type="password"
                    value={oldPassword}
                    onChange={(e) => setOldPassword(e.target.value)}
                    placeholder="Diperlukan jika mengubah password"
                    className="form-control"
                  />
                </div>

                <div>
                  <label htmlFor="newPassword" className="form-label">Password Baru</label>
                  <input
                    id="newPassword"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="form-control"
                  />
                </div>

                <div>
                  <label htmlFor="confirmPassword" className="form-label">Konfirmasi Password Baru</label>
                  <input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="form-control"
                  />
                </div>
              </>
            )}

            <div className="d-flex align-items-center gap-3 pt-2">
              {notice && (
                <p className="small text-success mb-0">{notice}</p>
              )}
            </div>

            {error && <p className="small text-danger mb-0">{error}</p>}

            <div className="pt-2">
              <button onClick={onSave} disabled={saving} className="btn btn-primary">
                {saving ? "Menyimpan..." : "Simpan Perubahan"}
              </button>
            </div>
          </div>
        </Card>
        </div>
      </Page>
    </>
  );
}
