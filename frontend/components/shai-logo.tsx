import Image from "next/image";
import { cn } from "@/lib/utils";

interface ShaiLogoProps {
  /** "wordmark" is the full SHAI text logo; "glyph" is the standalone S emblem. */
  variant?: "wordmark" | "glyph" | "horizontal";
  size?: "xs" | "sm" | "md" | "default" | "lg" | "xl";
  /**
   * "auto" follows the light/dark theme; "dark" forces the light-on-dark art
   * for surfaces that are always dark (e.g. the login hero).
   */
  tone?: "auto" | "dark";
  className?: string;
}

const WORDMARK = { width: 1100, height: 308 };
const GLYPH = { width: 512, height: 512 };

const HEIGHTS = {
  wordmark: { xs: "h-4", sm: "h-5", md: "h-6", default: "h-7", lg: "h-10", xl: "h-14" },
  glyph: { xs: "h-6", sm: "h-7", md: "h-8", default: "h-9", lg: "h-12", xl: "h-16" },
} as const;

export function ShaiLogo({
  variant = "wordmark",
  size = "default",
  tone = "auto",
  className,
}: ShaiLogoProps) {
  const isGlyph = variant === "glyph";
  const dims = isGlyph ? GLYPH : WORDMARK;
  const name = isGlyph ? "glyph" : "wordmark";
  const heightClass = HEIGHTS[isGlyph ? "glyph" : "wordmark"][size];
  const alt = isGlyph ? "SHAI emblem" : "SHAI";

  const img = (theme: "light" | "dark", extra?: string) => (
    <Image
      src={`/shai-${name}-${theme}.png`}
      alt={theme === "light" || tone === "dark" ? alt : ""}
      aria-hidden={theme === "dark" && tone === "auto" ? true : undefined}
      width={dims.width}
      height={dims.height}
      priority
      unoptimized
      className={cn("w-auto shrink-0 object-contain", heightClass, extra, className)}
    />
  );

  if (tone === "dark") return img("dark");

  return (
    <>
      {img("light", "dark:hidden")}
      {img("dark", "hidden dark:block")}
    </>
  );
}
