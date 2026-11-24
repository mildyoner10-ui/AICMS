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
    <div className="flex min-h-screen items-center justify-center px-4 bg-canvas">
      <div className="w-full max-w-[400px]">
        {/* Logo parallelogram */}
        <div className="mb-6 flex items-center gap-3">
          <div
            className="relative flex h-12 w-20 items-center justify-center overflow-hidden rounded-sm bg-cream border-2 border-teal-dark"
            style={{ transform: "skewX(-6deg)" }}
          >
            <span className="text-sm font-extrabold text-teal-dark tracking-wider" style={{ transform: "skewX(6deg)" }}>AICMS</span>
          </div>
          <div>
            <h1 className="text-xl font-extrabold tracking-wide text-text">Manajemen Perubahan</h1>
            <p className="text-meta text-text-muted">AI Change Management System</p>
          </div>
        </div>

        <div className="card p-6">
          <h2 className="text-section font-extrabold text-text">Masuk</h2>
          <p className="mt-1 text-sm text-text-muted">Gunakan kredensial organisasi Anda.</p>

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <div>
              <label htmlFor="username" className="label">
                Nama pengguna
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="field"
                placeholder="admin"
                required
                autoComplete="username"
              />
            </div>

            <div>
              <label htmlFor="password" className="label">
                Kata sandi
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="field"
                placeholder="••••••••"
                required
                autoComplete="current-password"
              />
            </div>

            {error && (
              <div className="rounded-md bg-coral/10 px-3 py-2 text-sm text-coral-dark font-bold border border-coral/30" role="alert">
                {error}
              </div>
            )}

            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? "Memproses…" : "Masuk"}
            </button>
          </form>
        </div>

        <p className="mt-4 flex items-start gap-2 rounded-md bg-warning/10 px-3 py-2 text-meta text-coral-dark border border-coral/20">
          <span aria-hidden className="font-bold">
            !
          </span>
          Mode pengembangan — login lokal aktif. Jangan gunakan data nyata.
        </p>
      </div>
    </div>
  );
}
