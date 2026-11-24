"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { roleLabel } from "@/lib/labels";

interface NavLink {
  href: string;
  label: string;
  icon: string;
  adminOnly?: boolean;
  group: string;
}

const LINKS: NavLink[] = [
  { href: "/dashboard", label: "Ringkasan", icon: "▦", group: "Operasional" },
  { href: "/changes", label: "Permohonan Perubahan", icon: "☰", group: "Operasional" },
  { href: "/reviewer", label: "Peninjau", icon: "◈", group: "Peninjau" },
  { href: "/approvals", label: "Persetujuan", icon: "✓", group: "Persetujuan" },
  { href: "/calendar", label: "Kalender", icon: "▤", group: "Operasional" },
  { href: "/audit", label: "Audit", icon: "◉", group: "Tata Kelola" },
  { href: "/reports", label: "Laporan", icon: "◫", group: "Tata Kelola" },
  { href: "/users", label: "Pengguna", icon: "◍", group: "Tata Kelola", adminOnly: true },
  { href: "/profile", label: "Profil", icon: "◉", group: "Akun" },
];

export default function GlobalNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [who, setWho] = useState<string | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [aiLabel, setAiLabel] = useState<string | null>(null);
  const [aiMock, setAiMock] = useState(false);
  const [open, setOpen] = useState(false);

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

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  if (!ready) return null;

  const isAdmin = roles.includes("ADMIN");
  const visible = LINKS.filter((l) => !l.adminOnly || isAdmin);
  const groups = [...new Set(visible.map((l) => l.group))];

  const logout = () => {
    localStorage.removeItem("token");
    router.push("/login");
  };

  const isActive = (href: string) => pathname === href || (href !== "/dashboard" && pathname?.startsWith(href));

  const navBody = (
    <>
      <Link href="/dashboard" className="flex items-center gap-2.5 px-2 py-1">
        {/* Logo parallelogram */}
        <div className="relative flex h-10 w-20 items-center justify-center overflow-hidden rounded-sm bg-cream border-2 border-teal-dark" style={{ transform: "skewX(-6deg)" }}>
          <span className="text-xs font-extrabold text-teal-dark tracking-widest" style={{ transform: "skewX(6deg)" }}>AICMS</span>
        </div>
        <span className="leading-tight">
          <span className="block text-xs font-extrabold tracking-tight text-white">Manajemen Perubahan</span>
        </span>
      </Link>

      <nav aria-label="Navigasi utama" className="mt-6 flex-1 space-y-6 overflow-y-auto">
        {groups.map((group) => (
          <div key={group}>
            <p className="px-3 pb-1.5 text-[10px] font-extrabold uppercase tracking-widest text-white/30">{group}</p>
            <ul className="space-y-1">
              {visible
                .filter((l) => l.group === group)
                .map((link) => {
                  const active = isActive(link.href);
                  return (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        aria-current={active ? "page" : undefined}
                        className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-bold transition-all duration-ui ${
                          active
                            ? "bg-teal bg-opacity-20 text-gold"
                            : "text-white/65 hover:bg-white/10 hover:text-white"
                        }`}
                      >
                        <span aria-hidden className="w-4 text-center text-[15px] opacity-70">
                          {link.icon}
                        </span>
                        {link.label}
                      </Link>
                    </li>
                  );
                })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="mt-4 border-t border-white/10 pt-4">
        {aiLabel && (
          <p
            className={`mx-1 mb-3 flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[10px] font-extrabold uppercase tracking-wide ${
              aiMock ? "text-coral" : "text-white/50"
            }`}
            title="Provider tinjauan AI aktif. AI hanya memberi rekomendasi; persetujuan tetap oleh manusia."
          >
            <span aria-hidden>✦</span>
            <span className="truncate">{aiLabel}</span>
          </p>
        )}
        {who && (
          <p className="px-2 text-xs text-white/40">
            Masuk sebagai <span className="font-bold text-white/60">{who}</span>
          </p>
        )}
        {roles.length > 0 && (
          <p className="px-2 pt-0.5 text-[10px] text-white/30">{roles.map(roleLabel).join(" · ")}</p>
        )}
        <button
          onClick={logout}
          className="mt-3 flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-bold text-white/55 transition-colors duration-ui hover:bg-white/10 hover:text-white"
        >
          <span aria-hidden className="w-4 text-center">⏻</span>
          Keluar
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop rail — teal surface, subtle glow */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col bg-teal-dark px-3 py-4 shadow-teal-glow md:flex">{navBody}</aside>

      {/* Mobile top bar */}
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-white/15 bg-teal-dark px-4 py-3 md:hidden">
        <Link href="/dashboard" className="flex items-center gap-2 text-sm font-extrabold text-white">
          <div className="relative flex h-8 w-14 items-center justify-center overflow-hidden rounded-sm bg-cream border border-teal-dark" style={{ transform: "skewX(-6deg)" }}>
            <span className="text-[10px] font-extrabold text-teal-dark tracking-wider" style={{ transform: "skewX(6deg)" }}>AICMS</span>
          </div>
        </Link>
        <button
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="mobile-nav"
          aria-label={open ? "Tutup menu navigasi" : "Buka menu navigasi"}
          className="rounded-sm border border-white/20 px-3 py-1.5 text-sm font-bold text-white"
        >
          {open ? "Tutup" : "Menu"}
        </button>
      </div>

      {open && (
        <div id="mobile-nav" className="fixed inset-0 z-40 flex md:hidden">
          <div className="flex w-[280px] max-w-[85vw] flex-col bg-teal-dark px-3 py-4 shadow-lg">{navBody}</div>
          <button className="flex-1 bg-black/40" onClick={() => setOpen(false)} aria-label="Tutup menu navigasi" />
        </div>
      )}
    </>
  );
}
