"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/activity", label: "Activity" },
  { href: "/markets", label: "Markets" },
];

export function NavLinks() {
  return <Links path={usePathname()} />;
}

// Rendered before the pathname is known (Cache Components needs usePathname inside Suspense).
export function NavLinksFallback() {
  return <Links path="" />;
}

function Links({ path }: { path: string }) {
  return (
    <div className="flex items-center gap-5 text-sm">
      {LINKS.map((l) => (
        <Link key={l.href} href={l.href} className={path.startsWith(l.href) ? "font-medium text-text" : "text-muted hover:text-text"}>
          {l.label}
        </Link>
      ))}
    </div>
  );
}
