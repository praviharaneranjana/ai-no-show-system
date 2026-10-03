"use client";

import { useState, type ReactNode } from "react";
import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { AppSidebar } from "@/components/app-sidebar";
import { ShaiLogo } from "@/components/shai-logo";
import { SyntheticDataStrip } from "@/components/synthetic-data-strip";
import { TopBar } from "@/components/top-bar";
import { Button } from "@/components/ui/button";

export function AppLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Unauthenticated screens (login, setup) render without the dashboard shell
  if (pathname === "/login" || pathname === "/setup") {
    return <main className="min-h-screen w-full bg-background text-foreground">{children}</main>;
  }

  return (
    // Full-window desktop shell: the window never scrolls, only <main> does, so the
    // sidebar (logo top, model card + profile bottom) always matches the viewport height.
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground transition-colors duration-300">
      {/* Desktop Sidebar (lg+) */}
      <div className="hidden h-full lg:flex lg:w-64 lg:shrink-0">
        <AppSidebar className="h-full w-full" />
      </div>

      {/* Mobile Drawer Backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs transition-opacity lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile Drawer (Sliding) */}
      <div
        className={`fixed inset-y-0 left-0 z-50 w-72 transform bg-white shadow-2xl transition-transform duration-300 ease-in-out dark:bg-[#171722] lg:hidden ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="absolute right-3 top-4 z-10">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setMobileOpen(false)}
            className="text-[#8C8CA1] hover:text-[#171725] dark:hover:text-white"
          >
            <X className="size-5" />
            <span className="sr-only">Close sidebar</span>
          </Button>
        </div>
        <AppSidebar onItemClick={() => setMobileOpen(false)} className="h-full w-full" />
      </div>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col bg-surface transition-colors duration-300">
        {/* Mobile header */}
        <header className="z-30 flex h-14 shrink-0 items-center justify-between gap-2 border-b border-[#F0F0F5] bg-white/90 px-4 backdrop-blur-md dark:border-[#272738] dark:bg-[#181824]/90 lg:hidden">
          <div className="flex items-center gap-2.5">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setMobileOpen(true)}
              className="text-[#171725] dark:text-white"
            >
              <Menu className="size-5" />
              <span className="sr-only">Open navigation</span>
            </Button>

            <Link href="/">
              <ShaiLogo variant="glyph" size="md" />
            </Link>
          </div>

          <TopBar compact />
        </header>

        {/* Desktop action bar */}
        <TopBar className="hidden shrink-0 border-b border-border/60 px-6 py-3 lg:flex lg:px-8" />

        <SyntheticDataStrip />

        {/* The only scrolling region */}
        <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
