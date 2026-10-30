import { CalendarCheck2, MessageSquareText, UserRound } from "lucide-react";

import { cn } from "@/lib/utils";

const DOT_COUNT = 40;
const ACTIVE_DOTS = 27;
const CENTER = 160;
const RING_RADIUS = 84;

const dots = Array.from({ length: DOT_COUNT }, (_, i) => {
  const angle = ((i / DOT_COUNT) * 360 - 90) * (Math.PI / 180);
  return {
    x: CENTER + RING_RADIUS * Math.cos(angle),
    y: CENTER + RING_RADIUS * Math.sin(angle),
    active: i < ACTIVE_DOTS,
  };
});

function FloatingChip({
  className,
  delay = 0,
  children,
}: {
  className?: string;
  delay?: number;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "shai-float absolute flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1.5 text-[11px] font-semibold text-foreground bento-card-shadow",
        className
      )}
      style={{ animationDelay: `${delay}s` }}
    >
      {children}
    </div>
  );
}

/**
 * Flat, token-colored login illustration: a patient's appointment surrounded by
 * the risk signals SHAI scores. All colors come from theme variables so it
 * follows light / dark mode.
 */
export function LoginHero({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "relative aspect-square w-full max-w-[320px] overflow-hidden rounded-[28px] border border-border bg-card bento-card-shadow",
        className
      )}
      role="img"
      aria-label="Illustration: an upcoming appointment surrounded by no-show risk signals"
    >
      {/* Soft brand glow behind the ring */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 size-56 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/15 blur-3xl" />

      <svg viewBox="0 0 320 320" className="absolute inset-0 size-full" aria-hidden="true">
        <defs>
          <linearGradient id="login-hero-dot" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" style={{ stopColor: "var(--primary)" }} />
            <stop offset="100%" style={{ stopColor: "var(--primary-end)" }} />
          </linearGradient>
        </defs>

        <circle
          cx={CENTER}
          cy={CENTER}
          r={112}
          fill="none"
          strokeWidth={1}
          strokeDasharray="2 6"
          strokeLinecap="round"
          className="shai-spin"
          style={{ stroke: "var(--border)", transformOrigin: "160px 160px" }}
        />
        <circle
          cx={CENTER}
          cy={CENTER}
          r={62}
          style={{ fill: "var(--accent)", opacity: 0.6 }}
        />

        {dots.map((d, i) => (
          <circle
            key={i}
            cx={d.x}
            cy={d.y}
            r={d.active ? 3.6 : 2.6}
            style={{
              fill: d.active ? "url(#login-hero-dot)" : "var(--input)",
            }}
          />
        ))}
      </svg>

      {/* Center: appointment tile */}
      <div className="absolute left-1/2 top-1/2 flex size-[88px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-3xl border border-border bg-card bento-card-shadow">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary-end text-primary-foreground">
          <CalendarCheck2 className="size-7" strokeWidth={2} />
        </div>
      </div>

      {/* Floating risk signals */}
      <FloatingChip className="left-4 top-6 text-risk-low" delay={0}>
        <span className="size-2 rounded-full bg-risk-low" />
        Low risk
      </FloatingChip>

      <FloatingChip className="right-4 top-6" delay={1.4}>
        <span className="flex size-5 items-center justify-center rounded-full bg-accent text-accent-foreground">
          <MessageSquareText className="size-3" />
        </span>
        Reminder sent
      </FloatingChip>

      <FloatingChip className="bottom-[68px] left-4 text-risk-high" delay={2.8}>
        <span className="flex size-5 items-center justify-center rounded-full bg-risk-high-bg">
          <UserRound className="size-3" />
        </span>
        High risk
      </FloatingChip>

      <div
        className="shai-float absolute bottom-4 right-4 w-[136px] rounded-2xl border border-border bg-card px-3 py-2 bento-card-shadow"
        style={{ animationDelay: "4.2s" }}
      >
        <div className="text-[10px] font-medium text-muted-foreground">Attendance trend</div>
        <svg viewBox="0 0 104 30" className="mt-1 h-7 w-full" aria-hidden="true">
          <path
            d="M2 24 C14 22 18 10 32 13 S52 26 66 16 S88 4 102 6"
            fill="none"
            strokeWidth={2.5}
            strokeLinecap="round"
            style={{ stroke: "var(--primary)" }}
          />
          <circle cx="102" cy="6" r="3" style={{ fill: "var(--primary-end)" }} />
        </svg>
      </div>
    </div>
  );
}
