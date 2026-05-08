"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/lib/actions/auth";
import { cn } from "@/lib/utils";

const workspace = [
  { label: "Shipments", href: "/shipments" },
  { label: "Drafts", href: "/drafts" },
  { label: "Archive", href: "/archive" },
  { label: "Tax exposure", href: "/exposure" },
  { label: "Inbox", href: "/inbox" },
];

const reference = [
  { label: "VAT Registrations", href: "/reference/vat" },
  { label: "Hauliers", href: "/reference/hauliers" },
  { label: "Suppliers", href: "/reference/suppliers" },
  { label: "IORs", href: "/reference/iors" },
  { label: "Incoterms", href: "/reference/incoterms" },
  { label: "Commodity Codes", href: "/reference/commodity" },
];

export function Sidebar({ userEmail }: { userEmail: string | null }) {
  const pathname = usePathname();
  const initial = userEmail?.[0]?.toUpperCase() ?? "?";

  return (
    <aside
      className="sticky top-0 h-screen border-r p-7 flex flex-col gap-7"
      style={{
        background: "var(--color-paper-warm)",
        borderColor: "var(--color-line)",
      }}
    >
      <Link href="/shipments" className="flex items-baseline gap-2 pb-5 border-b" style={{ borderColor: "var(--color-line)" }}>
        <span className="font-serif italic text-[26px] tracking-tight">Meridian</span>
        <span
          className="inline-block w-1.5 h-1.5 rounded-full -translate-y-1.5"
          style={{ background: "var(--color-accent)" }}
        />
      </Link>

      <NavSection label="Workspace" items={workspace} pathname={pathname} />
      <NavSection label="Reference" items={reference} pathname={pathname} />

      <div className="mt-auto pt-5 border-t" style={{ borderColor: "var(--color-line)" }}>
        <div className="flex items-center gap-3 mb-3">
          <div
            className="w-8 h-8 rounded-full grid place-items-center font-serif text-[14px]"
            style={{ background: "var(--color-ink)", color: "var(--color-paper)" }}
          >
            {initial}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[12.5px] font-medium truncate">{userEmail ?? "Signed in"}</div>
            <div className="text-[11px] text-[color:var(--color-ink-faint)]">Operations</div>
          </div>
        </div>
        <form action={signOut}>
          <button
            type="submit"
            className="w-full text-left text-[11px] font-mono uppercase tracking-widest text-[color:var(--color-ink-faint)] hover:text-[color:var(--color-accent)] transition-colors"
          >
            Sign out →
          </button>
        </form>
      </div>
    </aside>
  );
}

function NavSection({
  label,
  items,
  pathname,
}: {
  label: string;
  items: { label: string; href: string }[];
  pathname: string;
}) {
  return (
    <nav>
      <div className="font-mono text-[10px] uppercase tracking-widest text-[color:var(--color-ink-faint)] mb-2.5 px-2.5">
        {label}
      </div>
      <div className="flex flex-col gap-0.5">
        {items.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[13.5px] font-medium transition-colors",
                active
                  ? "bg-[color:var(--color-ink)] text-[color:var(--color-paper)]"
                  : "text-[color:var(--color-ink-soft)] hover:bg-black/5 hover:text-[color:var(--color-ink)]"
              )}
            >
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{
                  background: active ? "var(--color-accent)" : "var(--color-ink-faint)",
                }}
              />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
