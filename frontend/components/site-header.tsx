import Link from "next/link";
import { Activity } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";

export function SiteHeader() {
  return (
    <header className="border-b border-border/80 bg-background/80 backdrop-blur-sm">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-3.5">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Activity className="size-4" />
          </div>
          <span className="font-bold tracking-tight text-foreground text-sm">
            PulseNoShow <span className="text-primary">AI</span>
          </span>
        </Link>
        <nav className="flex items-center gap-2">
          <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/">Appointments</Link>} />
          <Button
            variant="ghost"
            size="sm"
            nativeButton={false}
            render={<Link href="/analytics">Analytics</Link>}
          />
          <Button
            variant="default"
            size="sm"
            nativeButton={false}
            render={<Link href="/new">New appointment</Link>}
          />
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
