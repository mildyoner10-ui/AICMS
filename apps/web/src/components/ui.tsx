"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { statusLabel, riskLabel, riskTone, statusTone, toneClass, toneMark } from "@/lib/labels";

export function StatusBadge({ status, className = "" }: { status: string; className?: string }) {
  const tone = statusTone(status);
  return (
    <span className={`chip ${toneClass(tone)} ${className}`}>
      <span aria-hidden>{toneMark(tone)}</span>
      {statusLabel(status)}
    </span>
  );
}

export function RiskBadge({ risk, className = "" }: { risk: string | null | undefined; className?: string }) {
  const tone = riskTone(risk);
  return (
    <span className={`chip ${toneClass(tone)} ${className}`}>
      <span aria-hidden>{toneMark(tone)}</span>
      Risiko: {riskLabel(risk)}
    </span>
  );
}

export function EnvTag({ env }: { env: string }) {
  return (
    <span className="chip bg-surface-muted text-foreground ring-1 ring-inset ring-border-strong">
      <span aria-hidden>⌂</span>
      {env}
    </span>
  );
}

export function PageHeader({
  title,
  description,
  back,
  actions,
  breadcrumb,
}: {
  title: ReactNode;
  description?: ReactNode;
  back?: { href: string; label: string };
  actions?: ReactNode;
  breadcrumb?: ReactNode;
}) {
  const router = useRouter();
  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto max-w-[1280px] px-6 py-5 md:px-8">
        {back && (
          <button
            onClick={() => router.push(back.href)}
            className="mb-2 -ml-1 inline-flex items-center gap-1 rounded px-1 py-0.5 text-sm text-foreground-muted hover:text-foreground"
          >
            <span aria-hidden>←</span> {back.label}
          </button>
        )}
        {breadcrumb && <nav className="mb-1 text-meta text-foreground-muted">{breadcrumb}</nav>}
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <h1 className="text-[26px] font-bold leading-tight tracking-tight text-foreground md:text-page-title">{title}</h1>
            {description && <p className="mt-1 max-w-3xl text-sm text-foreground-muted">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      </div>
    </header>
  );
}

export function Page({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <main className={`mx-auto ${wide ? "max-w-[1280px]" : "max-w-5xl"} px-6 py-6 md:px-8 md:py-8`}>{children}</main>
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
    <section className={`card ${className}`}>
      {(title || actions) && (
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4 md:px-6">
          <div>
            {title && <h2 className="text-card-title text-foreground">{title}</h2>}
            {description && <p className="mt-0.5 text-meta text-foreground-muted">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className="p-5 md:p-6">{children}</div>
    </section>
  );
}

export function Notice({ kind = "info", children, onDismiss }: {
  kind?: "info" | "success" | "danger" | "warning";
  children: ReactNode;
  onDismiss?: () => void;
}) {
  const cls = {
    info: "bg-info-soft text-info",
    success: "bg-success-soft text-success",
    danger: "bg-danger-soft text-danger",
    warning: "bg-warning-soft text-warning",
  }[kind];
  const mark = { info: "i", success: "✓", danger: "!", warning: "!" }[kind];
  return (
    <div className={`mb-4 flex items-start gap-3 rounded-sm px-4 py-3 text-sm ${cls}`} role={kind === "danger" ? "alert" : "status"}>
      <span aria-hidden className="mt-0.5 font-bold">{mark}</span>
      <div className="flex-1">{children}</div>
      {onDismiss && (
        <button onClick={onDismiss} aria-label="Tutup pemberitahuan" className="opacity-70 hover:opacity-100">
          ✕
        </button>
      )}
    </div>
  );
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className="px-6 py-14 text-center">
      <div aria-hidden className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-surface-muted text-foreground-muted">
        ◌
      </div>
      <p className="font-semibold text-foreground">{title}</p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-foreground-muted">{description}</p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="card border-danger px-6 py-10 text-center" role="alert">
      <p className="font-semibold text-danger">Gagal memuat data</p>
      <p className="mt-1 text-sm text-foreground-muted">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="btn-secondary btn-sm mt-4">
          Coba lagi
        </button>
      )}
    </div>
  );
}

export function Skeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3" role="status" aria-label="Memuat data">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-9 animate-pulse rounded-control bg-surface-muted" />
      ))}
      <span className="sr-only">Memuat…</span>
    </div>
  );
}

export function Spinner({ label = "Memuat…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-foreground-muted" role="status">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-border-strong border-t-brand" aria-hidden />
      <span className="text-sm">{label}</span>
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