"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sun, Moon, Menu, X } from "lucide-react";
import { useTheme } from "@/components/ThemeProvider";
import { useState, useCallback, useEffect } from "react";

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/explorer", label: "Event Explorer" },
  { href: "/search", label: "Search" },
  { href: "/governance", label: "Governance" },
];

export default function Nav() {
  const path = usePathname();
  const { theme, toggle } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  useEffect(() => {
    setMenuOpen(false);
  }, [path]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && menuOpen) setMenuOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  return (
    <nav className="nav-bar" role="navigation" aria-label="Main navigation">
      <Link href="/" className="nav-brand">
        🔍 AuditLedger
      </Link>

      <button
        className="nav-toggle"
        onClick={() => setMenuOpen((o) => !o)}
        aria-expanded={menuOpen}
        aria-controls="mobile-menu"
        aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
      >
        {menuOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      <div
        className={`nav-overlay ${menuOpen ? "visible" : ""}`}
        onClick={closeMenu}
        aria-hidden="true"
      />

      <div
        id="mobile-menu"
        className={`nav-links ${menuOpen ? "open" : ""}`}
        role="menu"
      >
        {NAV.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            role="menuitem"
            style={{
              color: path === href ? "var(--accent)" : "var(--text-muted)",
              fontWeight: path === href ? 600 : 400,
              fontSize: 14,
            }}
            onClick={closeMenu}
          >
            {label}
          </Link>
        ))}
        <button
          onClick={() => { toggle(); closeMenu(); }}
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          className="secondary"
          role="menuitem"
          style={{ marginLeft: "auto", padding: "6px 10px", display: "flex", alignItems: "center" }}
        >
          {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </div>
    </nav>
  );
}
