"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import { roleLabel } from "@/lib/labels";
import { useTheme } from "@/app/ThemeProvider";

interface NavLink {
  href: string;
  label: string;
  icon: string;
  adminOnly?: boolean;
  group: string;
}

const LINKS: NavLink[] = [
  { href: "/dashboard", label: "Ringkasan", icon: "bi bi-house", group: "Operasional" },
  { href: "/changes", label: "Permohonan Perubahan", icon: "bi bi-diagram-3", group: "Operasional" },
  { href: "/reviewer", label: "Peninjau", icon: "bi bi-search", group: "Peninjau" },
  { href: "/approvals", label: "Persetujuan", icon: "bi bi-clipboard-check", group: "Persetujuan" },
  { href: "/calendar", label: "Kalender", icon: "bi bi-calendar3", group: "Operasional" },
  { href: "/audit", label: "Audit", icon: "bi bi-file-earmark-text", group: "Tata Kelola" },
  { href: "/reports", label: "Laporan", icon: "bi bi-file-earmark-bar-graph", group: "Tata Kelola" },
  { href: "/users", label: "Pengguna", icon: "bi bi-people", group: "Tata Kelola", adminOnly: true },
  { href: "/profile", label: "Profil", icon: "bi bi-person-circle", group: "Akun" },
];

/* ------------------------------------------------------------------ */
/* Shared nav body                                                    */
/* ------------------------------------------------------------------ */

function NavBody({
  who,
  roles,
  isAdmin,
  aiLabel,
  aiMock,
  onLogout,
  isCollapsed,
}: {
  who: string | null;
  roles: string[];
  isAdmin: boolean;
  aiLabel: string | null;
  aiMock: boolean;
  onLogout: () => void;
  isCollapsed?: boolean;
}) {
  const pathname = usePathname();
  const visible = LINKS.filter((l) => !l.adminOnly || isAdmin);
  const groups = [...new Set(visible.map((l) => l.group))];

  const isActive = (href: string) =>
    pathname === href || (href !== "/dashboard" && pathname?.startsWith(href));

  const sidebarWidth = isCollapsed ? "64px" : "240px";

  return (
    <div className="d-flex flex-column h-100" style={{ width: sidebarWidth }}>
      {/* Brand */}
      <Link
        href="/dashboard"
        className="d-flex align-items-center gap-2 px-3 py-3 brand-logo"
        style={{ minHeight: "56px" }}
      >
        {!isCollapsed && (
          <span
            className="fw-bold text-truncate brand-text"
            style={{ color: "var(--app-text)", fontSize: "18px", letterSpacing: "-0.02em", whiteSpace: "nowrap" }}
          >
            AICMS
          </span>
        )}
        {isCollapsed && (
          <span
            className="fw-bold d-flex align-items-center justify-content-center"
            style={{ color: "var(--app-primary)", fontSize: "16px" }}
          >
            A
          </span>
        )}
      </Link>

      {/* Nav body */}
      <nav className="flex-1 sidebar-body overflow-auto px-2 py-1" style={{ flex: 1 }}>
        {isCollapsed
          ? visible.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="nav-link d-flex align-items-center justify-content-center mb-1 rounded py-2 text-center text-decoration-none"
                style={{
                  width: "36px",
                  height: "36px",
                  margin: "0 auto 4px",
                  color: isActive(link.href) ? "var(--app-primary)" : "var(--app-text)",
                  background: isActive(link.href) ? "color-mix(in srgb, var(--app-primary) 12%, transparent)" : "transparent",
                  opacity: isActive(link.href) ? 1 : 0.7,
                }}
                title={link.label}
              >
                <i className={link.icon}></i>
              </Link>
            ))
          : groups.map((group) => (
              <div key={group} className="mb-3">
                <p className="group-header mb-2 px-2 text-[10px] fw-bold text-uppercase opacity-50" style={{ color: "var(--app-text-muted)" }}>
                  {group}
                </p>
                <ul className="list-unstyled d-flex flex-column gap-1">
                  {visible
                    .filter((l) => l.group === group)
                    .map((link) => (
                      <li key={link.href}>
                        <Link
                          href={link.href}
                          className={`nav-link d-flex align-items-center rounded px-3 py-2 text-sm ${isActive(link.href) ? "active" : ""}`}
                          style={{
                            color: isActive(link.href) ? "var(--app-primary)" : "var(--app-text)",
                            background: isActive(link.href) ? "color-mix(in srgb, var(--app-primary) 12%, transparent)" : "transparent",
                            fontWeight: 600,
                            fontSize: "14px",
                            cursor: "pointer",
                            border: "none",
                            width: "100%",
                            textAlign: "left",
                          }}
                        >
                          <i className={`${link.icon} me-2`} style={{ fontSize: "16px", opacity: 0.7, width: "16px" }}></i>
                          <span className="text-truncate">{link.label}</span>
                        </Link>
                      </li>
                    ))}
                </ul>
              </div>
            ))}
      </nav>

      {/* Footer */}
      <div className="pt-3 mt-auto" style={{ borderTop: "1px solid var(--app-text-muted)", opacity: 0.15 }}>
        {aiLabel && !isCollapsed && (
          <p className="mb-2 px-2 py-1 rounded d-flex align-items-center gap-2 text-[10px] fw-bold text-uppercase" style={{ color: aiMock ? "var(--app-danger)" : "var(--app-text-muted)" }} title="AI hanya rekomendasi">
            <i className="bi bi-stars"></i>
            <span className="text-truncate">{aiLabel}</span>
          </p>
        )}
        {who && !isCollapsed && (
          <div className="px-2 mb-1" style={{ color: "var(--app-text-muted)", fontSize: "12px" }}>
            Masuk sebagai{" "}
            <span className="fw-bold" style={{ color: "var(--app-text)", opacity: 0.8 }}>
              {who}
            </span>
          </div>
        )}
        {roles.length > 0 && !isCollapsed && (
          <div className="px-2 mb-2" style={{ color: "var(--app-text-muted)", opacity: 0.5, fontSize: "10px" }}>
            {roles.map(roleLabel).join(" \u00B7 ")}
          </div>
        )}
        <button
          onClick={onLogout}
          className="nav-link w-100 d-flex align-items-center rounded px-3 py-2 text-sm"
          style={{
            color: "var(--app-text)",
            opacity: 0.55,
            background: "transparent",
            fontWeight: 600,
            fontSize: "14px",
            cursor: "pointer",
            border: "none",
            width: "100%",
            textAlign: "left",
          }}
        >
          <i className="bi bi-box-arrow-left me-2"></i>
          <span className="text-truncate">{isCollapsed ? "Keluar" : "Keluar"}</span>
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Desktop sidebar rail                                               */
/* ------------------------------------------------------------------ */

function DesktopSidebar({
  who,
  roles,
  isAdmin,
  aiLabel,
  aiMock,
  onLogout,
  isCollapsed,
  onToggle,
}: {
  who: string | null;
  roles: string[];
  isAdmin: boolean;
  aiLabel: string | null;
  aiMock: boolean;
  onLogout: () => void;
  isCollapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <aside
      className="position-fixed top-0 start-0 h-100 z-30 d-none d-md-block"
      style={{
        width: isCollapsed ? "64px" : "240px",
        backgroundColor: "var(--app-sidebar-bg)",
        borderRight: "1px solid var(--app-border)",
        transition: "width .2s ease",
      }}
    >
      <NavBody who={who} roles={roles} isAdmin={isAdmin} aiLabel={aiLabel} aiMock={aiMock} onLogout={onLogout} isCollapsed={isCollapsed} />
    </aside>
  );
}

/* ------------------------------------------------------------------ */
/* Mobile offcanvas — CSS only, no Bootstrap JS                       */
/* ------------------------------------------------------------------ */

function MobileNav({
  who,
  roles,
  isAdmin,
  aiLabel,
  aiMock,
  open,
  onClose,
  onLogout,
}: {
  who: string | null;
  roles: string[];
  isAdmin: boolean;
  aiLabel: string | null;
  aiMock: boolean;
  open: boolean;
  onClose: () => void;
  onLogout: () => void;
}) {
  return (
    <>
      {/* Overlay */}
      <div
        className="d-md-none"
        style={{
          position: "fixed",
          inset: 0,
          backgroundColor: "rgba(0,0,0,0.5)",
          zIndex: 1040,
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
          transition: "opacity .2s ease",
        }}
        onClick={onClose}
      />
      {/* Drawer */}
      <div
        className="d-md-none position-fixed top-0 start-0 h-100"
        style={{
          width: "280px",
          backgroundColor: "var(--app-sidebar-bg)",
          zIndex: 1045,
          transform: open ? "translateX(0)" : "translateX(-100%)",
          transition: "transform .2s ease",
          borderRight: "1px solid var(--app-border)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div className="d-flex align-items-center justify-content-between px-3 py-3 border-bottom">
          <h5 className="fw-bold m-0" style={{ color: "var(--app-text)", fontSize: "18px" }}>
            Menu
          </h5>
          <button type="button" className="btn-close" aria-label="Tutup" onClick={onClose}></button>
        </div>
        <div className="flex-grow-1 overflow-auto p-0">
          <NavBody who={who} roles={roles} isAdmin={isAdmin} aiLabel={aiLabel} aiMock={aiMock} onLogout={onLogout} />
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Topbar                                                             */
/* ------------------------------------------------------------------ */

function Topbar({
  theme,
  onToggleTheme,
  onToggleSidebar,
}: {
  theme: "light" | "dark";
  onToggleTheme: () => void;
  onToggleSidebar: () => void;
}) {
  return (
    <header className="d-flex align-items-center justify-content-between app-topbar" style={{ height: "56px", zIndex: 1031 }}>
      {/* Mobile hamburger */}
      <button
        className="btn btn-sm p-0 d-md-none"
        style={{ color: "var(--app-text)" }}
        onClick={onToggleSidebar}
        aria-label="Buka menu navigasi"
      >
        <i className="bi bi-list" style={{ fontSize: "22px" }}></i>
      </button>

      {/* Desktop collapse toggle */}
      <button
        className="btn btn-sm p-0 d-none d-md-inline-flex align-items-center justify-content-center"
        style={{ color: "var(--app-text-muted)", width: "28px", height: "28px" }}
        aria-label="Sempitkan sidebar"
        onClick={onToggleSidebar}
      >
        <i className="bi bi-chevron-contract" style={{ fontSize: "16px" }}></i>
      </button>

      {/* Right side */}
      <div className="d-flex align-items-center gap-2">
        <button
          className="btn btn-sm p-0"
          style={{ color: "var(--app-text)", width: "32px", height: "32px" }}
          onClick={onToggleTheme}
          aria-label={`Mode ${theme === "dark" ? "terang" : "gelap"}`}
        >
          {theme === "dark" ? (
            <i className="bi bi-sun" style={{ fontSize: "16px" }}></i>
          ) : (
            <i className="bi bi-moon" style={{ fontSize: "16px" }}></i>
          )}
        </button>
        <Link
          href="/profile"
          className="d-flex align-items-center justify-content-center"
          style={{ width: "32px", height: "32px", borderRadius: "50%", color: "var(--app-text-muted)" }}
          aria-label="Profil"
        >
          <i className="bi bi-person-circle" style={{ fontSize: "20px" }}></i>
        </Link>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* Main component                                                     */
/* ------------------------------------------------------------------ */

export default function GlobalNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [who, setWho] = useState<string | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [aiLabel, setAiLabel] = useState<string | null>(null);
  const [aiMock, setAiMock] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { effectiveTheme = "light", toggleTheme } = useTheme();

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;
    setReady(true);
    fetch("/api/v1/auth/me", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((u) => {
        if (!u) return;
        setWho(u.display_name || u.username);
        setRoles(u.roles ?? []);
      })
      .catch(() => undefined);
    fetch("/api/v1/ai/status")
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => {
        if (!s) return;
        setAiLabel(s.label);
        setAiMock(s.provider === "mock");
      })
      .catch(() => undefined);
  }, [pathname]);

  const isAdmin = roles.includes("ADMIN");

  const logout = useCallback(() => {
    localStorage.removeItem("token");
    router.push("/login");
  }, [router]);

  if (!ready) return null;

  return (
    <>
      <DesktopSidebar
        who={who}
        roles={roles}
        isAdmin={isAdmin}
        aiLabel={aiLabel}
        aiMock={aiMock}
        onLogout={logout}
        isCollapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((v) => !v)}
      />
      <MobileNav
        who={who}
        roles={roles}
        isAdmin={isAdmin}
        aiLabel={aiLabel}
        aiMock={aiMock}
        open={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
        onLogout={logout}
      />
      <Topbar
        theme={effectiveTheme}
        onToggleTheme={() => toggleTheme?.()}
        onToggleSidebar={() => setMobileNavOpen(true)}
      />
    </>
  );
}
