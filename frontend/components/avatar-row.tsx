import Link from "next/link";
import { Phone, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { RiskPill } from "@/components/risk-pill";
import type { RiskCategory } from "@/lib/types";

interface AvatarRowProps {
  name: string;
  meta: string;
  riskCategory: RiskCategory;
  riskScore: number;
  phone?: string | null;
  href?: string;
  isSelected?: boolean;
  onSelect?: () => void;
  className?: string;
}

export function AvatarRow({
  name,
  meta,
  riskCategory,
  riskScore,
  phone,
  href,
  isSelected = false,
  onSelect,
  className,
}: AvatarRowProps) {
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase() || "PT";

  const content = (
    <div
      onClick={onSelect}
      className={cn(
        "group flex items-center justify-between gap-3 rounded-2xl border p-3.5 transition-all duration-150 cursor-pointer",
        isSelected
          ? "border-[#8B7CF6] bg-[#F6F5FF] shadow-xs dark:border-[#8B7CF6]/80 dark:bg-[#252538]"
          : "border-border/80 bg-card hover:border-[#DDD6FE] hover:bg-[#F9F9FC] dark:hover:border-[#4B4870] dark:hover:bg-[#222234]",
        className
      )}
    >
      {/* Left: Avatar + Details */}
      <div className="flex items-center gap-3 min-w-0">
        <div
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-full font-bold text-xs transition-colors",
            riskCategory === "High"
              ? "bg-[#FFE4E6] text-[#E11D48] dark:bg-rose-950/40 dark:text-rose-300"
              : riskCategory === "Medium"
              ? "bg-[#FEF3C7] text-[#D97706] dark:bg-amber-950/40 dark:text-amber-300"
              : "bg-[#EDE9FE] text-[#8B7CF6] dark:bg-[#8B7CF6]/20 dark:text-[#C4B5FD]"
          )}
        >
          {initials}
        </div>

        <div className="flex flex-col min-w-0">
          <span className="truncate text-xs font-bold text-foreground">
            {name}
          </span>
          <span className="truncate text-[11px] text-muted-foreground">
            {meta}
          </span>
          <span className="mt-1 self-start">
            <RiskPill category={riskCategory} score={riskScore} size="sm" />
          </span>
        </div>
      </div>

      {/* Right: Actions (the risk pill sits under the name so long names aren't squeezed out) */}
      <div className="flex items-center gap-2 shrink-0">
        <div className="flex items-center gap-1">
          {phone && (
            <a
              href={`tel:${phone}`}
              onClick={(e) => e.stopPropagation()}
              className="flex size-7 items-center justify-center rounded-full bg-[#F3F3F7] text-muted-foreground transition-colors hover:bg-[#8B7CF6] hover:text-white dark:bg-[#252538] dark:text-[#A0A0B8]"
              title={`Call ${phone}`}
              aria-label={`Call ${name}`}
            >
              <Phone className="size-3.5" />
            </a>
          )}

          {href ? (
            <Link
              href={href}
              onClick={(e) => e.stopPropagation()}
              className="flex size-7 items-center justify-center rounded-full bg-[#F3F3F7] text-muted-foreground transition-colors hover:bg-[#8B7CF6] hover:text-white dark:bg-[#252538] dark:text-[#A0A0B8]"
              title="View appointment record"
              aria-label={`View record for ${name}`}
            >
              <ChevronRight className="size-3.5" />
            </Link>
          ) : (
            <div className="flex size-7 items-center justify-center rounded-full bg-[#F3F3F7] text-muted-foreground dark:bg-[#252538]">
              <ChevronRight className="size-3.5" />
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return content;
}
