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
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-[400px]">
        <div className="mb-6 flex items-center gap-3">
          <span aria-hidden className="flex h-10 w-10 items-center justify-center rounded-card bg-nav text-sm font-bold text-white">
            AI
          </span>
          <div>
            <h1 className="text-xl font-bold tracking-tight">AICMS</h1>
            <p className="text-meta text-foreground-muted">AI Change Management System</p>
          </div>
        </div>

        <div className="card p-6">
          <h2 className="text-section">Masuk</h2>
          <p className="mt-1 text-sm text-foreground-muted">Gunakan kredensial organisasi Anda.</p>

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
              <div className="rounded-control bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">
                {error}
              </div>
            )}

            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? "Memproses…" : "Masuk"}
            </button>
          </form>
        </div>

        <p className="mt-4 flex items-start gap-2 rounded-control bg-warning-soft px-3 py-2 text-meta text-warning">
          <span aria-hidden className="font-bold">
            !
          </span>
          Mode pengembangan — login lokal aktif. Jangan gunakan data nyata.
        </p>
      </div>
    </div>
  );
}