"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Search } from "lucide-react";

import { cn } from "@/lib/utils";
import { MessagesDrawer } from "@/components/messages-drawer";
import { NotificationsMenu } from "@/components/notifications-menu";
import { SearchPalette } from "@/components/search-palette";

// Global action bar shown on every screen inside the app shell: search (⌘K),
// notifications, messages and the primary "New appointment" action.
export function TopBar({ className, compact = false }: { className?: string; compact?: boolean }) {
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      {compact ? (
        <button
          type="button"
          aria-label="Search"
          onClick={() => setSearchOpen(true)}
          className="flex size-10 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-xs hover:bg-muted"
        >
          <Search className="size-4" />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="flex h-10 w-full max-w-sm items-center gap-2.5 rounded-full border border-border bg-card px-4 text-xs text-muted-foreground shadow-xs transition-colors hover:bg-muted"
        >
          <Search className="size-4" />
          <span className="flex-1 text-left">Search patients, phone, pages…</span>
          <kbd className="rounded border border-border px-1.5 py-0.5 text-[10px]">⌘K</kbd>
        </button>
      )}

      <div className="ml-auto flex items-center gap-2.5">
        <MessagesDrawer />
        <NotificationsMenu />
        <Link
          href="/new"
          className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#8B7CF6] to-[#5B7CFA] px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-[#8B7CF6]/25 transition-all hover:opacity-95 active:scale-[0.98]"
        >
          <Plus className="size-4 stroke-[2.5]" />
          <span className={compact ? "sr-only" : undefined}>New appointment</span>
        </Link>
      </div>

      <SearchPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
