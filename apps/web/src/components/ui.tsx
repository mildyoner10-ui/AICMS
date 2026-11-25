"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { statusLabel, riskLabel, riskTone, statusTone } from "@/lib/labels";

export function StatusBadge({ status, className = "" }: { status: string; className?: string }) {
  const tone = statusTone(status);
  const colorClass = {
    neutral: "bg-secondary",
    info: "bg-info",
    pending: "bg-warning text-dark",
    success: "bg-success",
    danger: "bg-danger",
    done: "bg-secondary",
  }[tone] || "bg-secondary";
  return (
    <span className={`badge ${colorClass} ${className}`} style={{ fontSize: "11px", fontWeight: 500 }}>
      {statusLabel(status)}
    </span>
  );
}

export function RiskBadge({ risk, className = "" }: { risk: string | null | undefined; className?: string }) {
  const tone = riskTone(risk);
  const colorClass = {
    neutral: "bg-secondary",
    info: "bg-info",
    pending: "bg-warning text-dark",
    success: "bg-success",
    danger: "bg-danger",
    done: "bg-secondary",
  }[tone] || "bg-secondary";
  return (
    <span className={`badge ${colorClass} ${className}`} style={{ fontSize: "11px", fontWeight: 500 }}>
      Risiko: {riskLabel(risk)}
    </span>
  );
}

export function EnvTag({ env }: { env: string }) {
  return (
    <span className="badge bg-light text-dark border" style={{ fontSize: "12px" }}>
      {env}
    </span>
  );
}

export function PageHeader({ title, description, back, actions, breadcrumb }: {
  title: ReactNode;
  description?: ReactNode;
  back?: { href: string; label: string };
  actions?: ReactNode;
  breadcrumb?: ReactNode;
}) {
  const router = useRouter();
  return (
    <header style={{ borderBottom: "1px solid var(--app-border)", background: "var(--app-surface)", marginBottom: "20px" }}>
      <div className="container-fluid px-4 py-3">
        {back && (
          <button onClick={() => router.push(back.href)} className="btn btn-link btn-sm text-decoration-none mb-2" style={{ color: "var(--app-primary)" }}>
            <i className="bi bi-arrow-left me-1"></i> {back.label}
          </button>
        )}
        {breadcrumb && <nav className="mb-1 text-muted small">{breadcrumb}</nav>}
        <div className="d-flex flex-wrap align-items-start justify-content-between gap-2">
          <div className="min-w-0">
            <h1 className="h4 mb-0" style={{ fontSize: "22px", fontWeight: 600 }}>{title}</h1>
            {description && <p className="text-muted small mt-1 mb-0">{description}</p>}
          </div>
          {actions && <div className="d-flex flex-wrap gap-2">{actions}</div>}
        </div>
      </div>
    </header>
  );
}

export function Page({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <main className={wide ? "container-fluid px-4 py-4" : "container-fluid px-4 py-4"} style={{ maxWidth: wide ? "1440px" : "none" }}>
      {children}
    </main>
  );
}

export function Card({ title, description, actions, children, className = "" }: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`card mb-4 ${className}`}>
      {(title || actions) && (
        <div className="card-header d-flex flex-wrap align-items-start justify-content-between gap-3" style={{ background: "transparent", borderBottom: "1px dashed var(--app-border)", padding: "16px 20px 4px" }}>
          <div>
            {title && <h2 className="h6 mb-0" style={{ fontSize: "14px", fontWeight: 600 }}>{title}</h2>}
            {description && <p className="text-muted small mb-0 mt-1">{description}</p>}
          </div>
          {actions && <div className="d-flex flex-wrap gap-2">{actions}</div>}
        </div>
      )}
      <div className="card-body p-4">{children}</div>
    </div>
  );
}

export function Notice({ kind = "info", children, onDismiss }: {
  kind?: "info" | "success" | "danger" | "warning";
  children: ReactNode;
  onDismiss?: () => void;
}) {
  const cls = { info: "alert-info", success: "alert-success", danger: "alert-danger", warning: "alert-warning" }[kind];
  const icons = { info: "bi-info-circle", success: "bi-check-circle", danger: "bi-exclamation-circle", warning: "bi-exclamation-triangle" };
  return (
    <div className={`alert ${cls} ${onDismiss ? "alert-dismissible fade show" : ""} d-flex align-items-start gap-2 mb-3`} role={kind === "danger" ? "alert" : "status"}>
      <i className={`bi ${icons[kind]} mt-1`}></i>
      <div className="flex-grow-1">{children}</div>
      {onDismiss && (
        <button type="button" className="btn-close ms-auto" aria-label="Tutup" onClick={onDismiss}></button>
      )}
    </div>
  );
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className="card mb-4">
      <div className="card-body text-center py-5">
        <i className="bi bi-circle text-muted mb-3" style={{ fontSize: "48px", opacity: 0.3 }}></i>
        <p className="h6 mb-2">{title}</p>
        <p className="text-muted small mb-3">{description}</p>
        {action && <div className="d-flex justify-content-center">{action}</div>}
      </div>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="alert alert-danger d-flex align-items-center gap-2 mb-4" role="alert">
      <i className="bi bi-exclamation-triangle"></i>
      <div>
        <strong>Gagal memuat data</strong>
        <p className="mb-0 small text-muted">{message}</p>
      </div>
      {onRetry && <button onClick={onRetry} className="btn btn-sm btn-outline-danger ms-auto">Coba lagi</button>}
    </div>
  );
}

export function Skeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Memuat data">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="placeholder-glow mb-2">
          <div className="placeholder col-12" style={{ height: "36px" }}></div>
        </div>
      ))}
      <span className="visually-hidden">Memuat…</span>
    </div>
  );
}

export function Spinner({ label = "Memuat…" }: { label?: string }) {
  return (
    <div className="d-flex align-items-center justify-content-center gap-3 py-4 text-muted" role="status">
      <div className="spinner-border spinner-border-sm" style={{ borderWidth: "2px" }}></div>
      <span className="small fw-medium">{label}</span>
    </div>
  );
}

// Shared auth guard: every page needs the token and the current user.
export interface Me {
  id: string;
  username: string;
  email: string;
  display_name: string | null;
  roles: string[];
}

export function useMe() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/login");
      return;
    }
    fetch("/api/v1/auth/me", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((u: Me) => setMe(u))
      .catch(() => {
        localStorage.removeItem("token");
        setFailed(true);
        router.push("/login");
      });
  }, [router]);

  return { me, failed };
}

// Timestamps are stored in UTC but shown in the working timezone (WIB, UTC+7).
export const DISPLAY_TZ = "Asia/Jakarta";
export const DISPLAY_TZ_LABEL = "WIB";

export function fmtDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return (
    new Intl.DateTimeFormat("id-ID", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: DISPLAY_TZ,
    }).format(d) + ` ${DISPLAY_TZ_LABEL}`
  );
}

export function fmtDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeZone: DISPLAY_TZ }).format(d);
}

export { usePathname };
