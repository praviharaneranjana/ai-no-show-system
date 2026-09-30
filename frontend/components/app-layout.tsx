"use client";

import { useState, type ReactNode } from "react";
import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { AppSidebar } from "@/components/app-sidebar";
import { ShaiLogo } from "@/components/shai-logo";
import { ThemePill } from "@/components/theme-pill";
import { Button } from "@/components/ui/button";

export function AppLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Unauthenticated screens (login, setup) render without the dashboard shell
  if (pathname === "/login" || pathname === "/setup") {
    return <main className="min-h-screen w-full bg-background text-foreground">{children}</main>;
  }

  return (
    <div className="min-h-screen w-full bg-background p-2 text-foreground sm:p-4 lg:p-6 transition-colors duration-300">
      {/* Floating Bento Shell Container (Dropify & Peymen Reference) */}
      <div className="mx-auto flex min-h-[calc(100vh-2rem)] max-w-[1600px] flex-col overflow-hidden rounded-[28px] border border-white/60 bg-shell shai-shell-shadow transition-colors duration-300 dark:border-[#2D2D40] dark:bg-[#181824] lg:flex-row">
        
        {/* Desktop Sidebar (lg+) */}
        <div className="hidden lg:flex lg:w-64 lg:shrink-0">
          <AppSidebar className="w-full" />
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

        {/* Main Content Area on slightly tinted surface */}
        <div className="flex flex-1 flex-col bg-surface overflow-hidden transition-colors duration-300">
          {/* Mobile Header Bar */}
          <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-[#F0F0F5] bg-white/90 px-4 backdrop-blur-md dark:border-[#272738] dark:bg-[#181824]/90 lg:hidden">
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
                <ShaiLogo variant="horizontal" size="xs" />
              </Link>
            </div>

            <div className="flex items-center gap-1.5">
              <ThemePill size="sm" className="w-28" />
            </div>
          </header>

          {/* Page Content Surface */}
          <main className="flex-1 w-full overflow-y-auto">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
