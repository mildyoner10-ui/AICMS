"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "Nama pengguna atau kata sandi salah.");
      }

      const data = await res.json();
      localStorage.setItem("token", data.access_token);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login gagal. Coba lagi.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="d-flex align-items-center justify-content-center min-vh-100 py-4" style={{ background: "var(--app-bg)" }}>
      <div className="w-100" style={{ maxWidth: "400px" }}>
        {/* Brand */}
        <div className="text-center mb-4">
          <h4 className="fw-bold mb-1" style={{ color: "var(--app-text)", letterSpacing: "-0.02em" }}>
            AICMS
          </h4>
          <p className="text-muted small mb-0">Manajemen Perubahan</p>
          <p className="text-muted" style={{ fontSize: "12px" }}>AI Change Management System</p>
        </div>

        <div className="card">
          <div className="card-body p-4">
            <h5 className="fw-bold mb-1">Masuk</h5>
            <p className="text-muted small mb-4">Gunakan kredensial organisasi Anda.</p>

            <form onSubmit={handleSubmit} className="mb-0">
              <div className="mb-3">
                <label htmlFor="username" className="form-label">Nama pengguna</label>
                <input
                  id="username"
                  type="text"
                  className="form-control"
                  placeholder="admin"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  autoComplete="username"
                />
              </div>

              <div className="mb-3">
                <label htmlFor="password" className="form-label">Kata sandi</label>
                <input
                  id="password"
                  type="password"
                  className="form-control"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
              </div>

              {error && (
                <div className="alert alert-danger py-2 small mb-3" role="alert">
                  <i className="bi bi-exclamation-circle me-1"></i> {error}
                </div>
              )}

              <button type="submit" disabled={loading} className="btn btn-primary w-100" style={{ height: "36px" }}>
                {loading ? <><span className="spinner-border spinner-border-sm me-2"></span>Memproses…</> : "Masuk"}
              </button>
            </form>
          </div>
        </div>

        <div className="alert alert-info py-2 mt-3 small" role="alert">
          <i className="bi bi-info-circle me-1"></i>
          Mode pengembangan — login lokal aktif. Jangan gunakan data nyata.
        </div>
      </div>
    </div>
  );
}
