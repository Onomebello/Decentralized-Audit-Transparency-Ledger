"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sun, Moon, Monitor } from "lucide-react";
import { useTheme } from "@/components/ThemeProvider";

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/explorer", label: "Event Explorer" },
  { href: "/search", label: "Search" },
  { href: "/export", label: "Export" },
  { href: "/governance", label: "Governance" },
];

const THEME_ORDER: Array<"dark" | "light" | "system"> = ["dark", "light", "system"];
const THEME_ICONS = { dark: Sun, light: Moon, system: Monitor };
const THEME_LABELS = {
  dark: "Switch to light mode",
  light: "Switch to system mode",
  system: "Switch to dark mode",
};

export default function Nav() {
  const path = usePathname();
  const { preference, setPreference } = useTheme();
  const cycle = () => {
    const idx = THEME_ORDER.indexOf(preference);
    setPreference(THEME_ORDER[(idx + 1) % THEME_ORDER.length]);
  };
  const Icon = THEME_ICONS[preference];
  return (
    <nav
      style={{
        background: "var(--surface)",
        borderBottom: "1px solid var(--border)",
        padding: "0 24px",
        display: "flex",
        alignItems: "center",
        gap: 32,
        height: 56,
      }}
    >
      <span style={{ fontWeight: 700, color: "var(--accent)", fontSize: 16 }}>
        🔍 AuditLedger
      </span>
      {NAV.map(({ href, label }) => (
        <Link
          key={href}
          href={href}
          style={{
            color: path === href ? "var(--accent)" : "var(--text-muted)",
            fontWeight: path === href ? 600 : 400,
            fontSize: 14,
          }}
        >
          {label}
        </Link>
      ))}
      <button
        onClick={cycle}
        aria-label={THEME_LABELS[preference]}
        className="secondary"
        style={{ marginLeft: "auto", padding: "6px 10px", display: "flex", alignItems: "center" }}
        title={`Theme: ${preference}`}
      >
        <Icon size={16} />
      </button>
    </nav>
  );
}
