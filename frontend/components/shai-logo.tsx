import Image from "next/image";
import { cn } from "@/lib/utils";

interface ShaiLogoProps {
  variant?: "glyph" | "horizontal" | "vertical" | "wordmark" | "complete";
  size?: "xs" | "sm" | "md" | "default" | "lg" | "xl";
  className?: string;
  glyphClassName?: string;
  showSubline?: boolean;
}

export function ShaiLogo({
  variant = "horizontal",
  size = "default",
  className,
  glyphClassName,
}: ShaiLogoProps) {
  // Height configurations for Andrew's logos
  const sizeConfig = {
    xs: { glyphH: "h-6 w-auto", wordmarkH: "h-3.5 w-auto", completeH: "h-14 w-auto", container: "px-2 py-1 gap-1.5 rounded-lg" },
    sm: { glyphH: "h-7 w-auto", wordmarkH: "h-4 w-auto", completeH: "h-20 w-auto", container: "px-2.5 py-1.5 gap-2 rounded-xl" },
    md: { glyphH: "h-8 w-auto", wordmarkH: "h-5 w-auto", completeH: "h-24 w-auto", container: "px-3 py-2 gap-2.5 rounded-xl" },
    default: { glyphH: "h-9 w-auto", wordmarkH: "h-5.5 w-auto", completeH: "h-28 w-auto", container: "px-3.5 py-2 gap-3 rounded-2xl" },
    lg: { glyphH: "h-12 w-auto", wordmarkH: "h-7 w-auto", completeH: "h-40 w-auto", container: "px-4 py-2.5 gap-3.5 rounded-2xl" },
    xl: { glyphH: "h-16 w-auto", wordmarkH: "h-9 w-auto", completeH: "h-52 w-auto", container: "px-5 py-3 gap-4 rounded-3xl" },
  }[size] ?? {
    glyphH: "h-9 w-auto",
    wordmarkH: "h-5.5 w-auto",
    completeH: "h-28 w-auto",
    container: "px-3.5 py-2 gap-3 rounded-2xl",
  };

  // 1. Exact Glyph: Hexagonal neural wireframe emblem created by Andrew
  const glyphElement = (
    <Image
      src="/shai-logo-glyph.png"
      alt="SHAI Emblem"
      width={1024}
      height={812}
      priority
      className={cn(
        "object-contain shrink-0 drop-shadow-[0_0_8px_rgba(0,240,255,0.4)] transition-transform duration-200 group-hover:scale-105",
        sizeConfig.glyphH,
        glyphClassName
      )}
    />
  );

  // 2. Exact Wordmark: Neural mesh typography "SHAI" created by Andrew
  const wordmarkElement = (
    <Image
      src="/shai-wordmark.png"
      alt="SHAI"
      width={1024}
      height={402}
      priority
      className={cn(
        "object-contain drop-shadow-[0_0_8px_rgba(0,240,255,0.3)]",
        sizeConfig.wordmarkH
      )}
    />
  );

  // 3. Exact Complete Logo: Glyph + "SHAI" + "Smart Hospital AI" + "Intelligent Care, Unmatched Precision"
  const completeElement = (
    <Image
      src="/shai-logo-complete.png"
      alt="SHAI — Smart Hospital AI"
      width={1024}
      height={794}
      priority
      className={cn(
        "object-contain drop-shadow-[0_0_12px_rgba(0,240,255,0.4)]",
        sizeConfig.completeH
      )}
    />
  );

  // Render Variant: Glyph Only
  if (variant === "glyph") {
    return (
      <div
        className={cn(
          "inline-flex items-center justify-center bg-[#0B0F19] p-2 rounded-2xl border border-[#6C5CE7]/30 shadow-xs shadow-[#6C5CE7]/15",
          className
        )}
      >
        {glyphElement}
      </div>
    );
  }

  // Render Variant: Wordmark Only
  if (variant === "wordmark") {
    return (
      <div
        className={cn(
          "inline-flex items-center justify-center bg-[#0B0F19] px-3.5 py-1.5 rounded-2xl border border-[#6C5CE7]/30 shadow-xs shadow-[#6C5CE7]/15",
          className
        )}
      >
        {wordmarkElement}
      </div>
    );
  }

  // Render Variant: Complete Full Branding (Glyph + SHAI + Subtitles)
  if (variant === "complete" || variant === "vertical") {
    return (
      <div
        className={cn(
          "inline-flex flex-col items-center justify-center bg-[#0B0F19] p-4 rounded-3xl border border-[#6C5CE7]/30 shadow-md shadow-[#6C5CE7]/15 text-center",
          className
        )}
      >
        {completeElement}
      </div>
    );
  }

  // Render Variant: Horizontal Lockup (Glyph + Wordmark)
  return (
    <div
      className={cn(
        "group inline-flex items-center bg-[#0B0F19] border border-[#6C5CE7]/30 shadow-xs shadow-[#6C5CE7]/15 transition-all hover:border-[#6C5CE7]/50",
        sizeConfig.container,
        className
      )}
    >
      {glyphElement}
      {wordmarkElement}
    </div>
  );
}
