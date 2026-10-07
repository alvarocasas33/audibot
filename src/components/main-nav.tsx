"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const SECTIONS = [
  { href: "/reportes", label: "Reportes" },
  { href: "/rubricas", label: "Rúbricas" },
  { href: "/configuracion", label: "Configuración" },
  { href: "/documentacion", label: "Documentación" },
];

export function MainNav() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 text-sm">
      {SECTIONS.map(({ href, label }) => {
        const active = pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`rounded-md px-3 py-1.5 transition-colors ${
              active ? "bg-page font-medium text-ink" : "text-ink-2 hover:bg-page hover:text-ink"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
