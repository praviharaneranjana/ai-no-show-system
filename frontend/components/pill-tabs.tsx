import { cn } from "@/lib/utils";

interface PillTabsProps<T extends string = string> {
  tabs: { id: T; label: string }[];
  activeTab: T;
  onChange: (tab: T) => void;
  size?: "sm" | "default";
  className?: string;
}

export function PillTabs<T extends string = string>({
  tabs,
  activeTab,
  onChange,
  size = "default",
  className,
}: PillTabsProps<T>) {
  return (
    <div
      role="tablist"
      className={cn(
        "inline-flex items-center rounded-full bg-[#F3F3F7] p-1 text-xs font-semibold text-[#8C8CA1] dark:bg-[#181826]",
        className
      )}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.id)}
            className={cn(
              "rounded-full transition-all text-center",
              size === "sm" ? "px-2.5 py-1 text-[11px]" : "px-3.5 py-1.5 text-xs",
              isActive
                ? "bg-[#171725] text-white shadow-xs dark:bg-white dark:text-[#171725]"
                : "hover:text-[#171725] dark:hover:text-white"
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
