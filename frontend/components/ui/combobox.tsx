"use client";

import * as React from "react";
import { Check, ChevronsUpDown, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ComboboxOption {
  value: string;
  label: string;
  subLabel?: string;
  badge?: string;
  disabled?: boolean;
}

export interface ComboboxProps {
  options: ComboboxOption[];
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  error?: boolean;
  className?: string;
  allowClear?: boolean;
}

export function Combobox({
  options,
  value,
  onChange,
  placeholder = "Select option...",
  searchPlaceholder = "Search...",
  disabled = false,
  error = false,
  className,
  allowClear = false,
}: ComboboxProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [highlightedIndex, setHighlightedIndex] = React.useState(0);

  const containerRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLUListElement>(null);

  const selectedOption = options.find((o) => o.value === value);

  const filteredOptions = React.useMemo(() => {
    if (!search.trim()) return options;
    const term = search.toLowerCase();
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(term) ||
        (o.subLabel && o.subLabel.toLowerCase().includes(term))
    );
  }, [options, search]);

  // Click outside listener
  React.useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  // Scroll active item into view
  React.useEffect(() => {
    if (isOpen && listRef.current) {
      const activeEl = listRef.current.children[highlightedIndex] as HTMLElement;
      if (activeEl) {
        activeEl.scrollIntoView({ block: "nearest" });
      }
    }
  }, [highlightedIndex, isOpen]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;

    if (!isOpen) {
      if (["Enter", " ", "ArrowDown", "ArrowUp"].includes(e.key)) {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev < filteredOptions.length - 1 ? prev + 1 : 0
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev > 0 ? prev - 1 : filteredOptions.length - 1
        );
        break;
      case "Enter":
        e.preventDefault();
        if (filteredOptions[highlightedIndex] && !filteredOptions[highlightedIndex].disabled) {
          onChange(filteredOptions[highlightedIndex].value);
          setIsOpen(false);
          setSearch("");
        }
        break;
      case "Escape":
        e.preventDefault();
        setIsOpen(false);
        break;
      case "Tab":
        setIsOpen(false);
        break;
    }
  };

  const highlightMatch = (text: string, query: string) => {
    if (!query.trim()) return text;
    const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"));
    return (
      <>
        {parts.map((part, i) =>
          part.toLowerCase() === query.toLowerCase() ? (
            <span key={i} className="font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 rounded-sm px-0.5">
              {part}
            </span>
          ) : (
            part
          )
        )}
      </>
    );
  };

  return (
    <div
      ref={containerRef}
      className={cn("relative w-full", className)}
      onKeyDown={handleKeyDown}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (!disabled) {
            setIsOpen(!isOpen);
            if (!isOpen) {
              setTimeout(() => inputRef.current?.focus(), 50);
            }
          }
        }}
        className={cn(
          "flex h-10 w-full items-center justify-between rounded-lg border bg-background px-3 py-2 text-sm ring-offset-background transition-colors outline-none",
          "hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:border-emerald-500",
          error ? "border-destructive ring-destructive/20" : "border-input",
          disabled && "cursor-not-allowed opacity-50 bg-muted/40",
          isOpen && "ring-2 ring-emerald-500/20 border-emerald-500"
        )}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <span className={cn("truncate text-left", !selectedOption && "text-muted-foreground")}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <div className="flex items-center gap-1.5 ml-2 shrink-0">
          {allowClear && selectedOption && !disabled && (
            <span
              role="button"
              tabIndex={-1}
              onClick={(e) => {
                e.stopPropagation();
                onChange("");
              }}
              className="text-muted-foreground hover:text-foreground p-0.5 rounded transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </span>
          )}
          <ChevronsUpDown className="h-4 w-4 text-muted-foreground" />
        </div>
      </button>

      {isOpen && (
        <div className="absolute top-[calc(100%+4px)] left-0 z-50 w-full rounded-lg border border-border bg-popover text-popover-foreground shadow-lg animate-in fade-in-0 zoom-in-95 duration-100 overflow-hidden">
          <div className="flex items-center border-b border-border px-3 py-2 bg-secondary/30">
            <Search className="h-4 w-4 text-muted-foreground shrink-0 mr-2" />
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>

          <ul
            ref={listRef}
            role="listbox"
            className="max-h-60 overflow-y-auto p-1 text-sm focus:outline-none"
          >
            {filteredOptions.length === 0 ? (
              <li className="px-3 py-4 text-center text-xs text-muted-foreground select-none">
                No matches found
              </li>
            ) : (
              filteredOptions.map((opt, idx) => {
                const isSelected = opt.value === value;
                const isHighlighted = idx === highlightedIndex;

                return (
                  <li
                    key={opt.value}
                    role="option"
                    aria-selected={isSelected}
                    aria-disabled={opt.disabled}
                    onClick={() => {
                      if (!opt.disabled) {
                        onChange(opt.value);
                        setIsOpen(false);
                        setSearch("");
                      }
                    }}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                    className={cn(
                      "relative flex cursor-pointer select-none items-center justify-between rounded-md px-3 py-2 text-sm transition-colors",
                      isHighlighted && "bg-accent text-accent-foreground",
                      isSelected && "font-medium text-emerald-600 dark:text-emerald-400",
                      opt.disabled && "cursor-not-allowed opacity-50"
                    )}
                  >
                    <div className="flex flex-col min-w-0 pr-2">
                      <span className="truncate">
                        {highlightMatch(opt.label, search)}
                      </span>
                      {opt.subLabel && (
                        <span className="text-xs text-muted-foreground truncate">
                          {highlightMatch(opt.subLabel, search)}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {opt.badge && (
                        <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground">
                          {opt.badge}
                        </span>
                      )}
                      {isSelected && (
                        <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                      )}
                    </div>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
