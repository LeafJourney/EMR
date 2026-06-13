"use client";

// MASTER-prompt G3 — the shared "type-ahead with the top page-specific
// matches" field for /ops. Every search bar / dropdown / searchable input is
// meant to surface up to 7 of *this page's own* options as you type (the
// directive is explicit that it's site-specific, not a global search — that's
// G4). Pages pass their own `options`; ranking is delegated to the pure
// rankAutocomplete() core so behavior is identical and testable everywhere.
//
// Accessibility: implements the ARIA 1.2 combobox-with-listbox pattern —
// role="combobox" input, aria-expanded / aria-controls / aria-activedescendant,
// a role="listbox" popup with role="option" rows, full keyboard nav
// (↑/↓ to move, Enter to choose, Esc to close), and click-outside dismissal.

import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils/cn";
import {
  rankAutocomplete,
  AUTOCOMPLETE_DEFAULT_LIMIT,
  type AutocompleteOption,
} from "@/lib/ui/autocomplete-match";

export type { AutocompleteOption } from "@/lib/ui/autocomplete-match";

export interface AutocompleteInputProps
  extends Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    "value" | "defaultValue" | "onChange" | "onSelect"
  > {
  /** This page's own options — the directive's "page-specific" set. */
  options: readonly AutocompleteOption[];
  /** Fired when the user commits an option (click or Enter on a row). */
  onSelect: (option: AutocompleteOption) => void;
  /** Controlled query text. Omit for uncontrolled. */
  value?: string;
  /** Initial query text when uncontrolled. */
  defaultValue?: string;
  /** Notified on every keystroke (controlled or not). */
  onValueChange?: (text: string) => void;
  /** When set, Enter with no highlighted row commits the typed text as its own
   *  option ({ value, label } both = the raw text). For free-form fields. */
  allowFreeText?: boolean;
  /** Max rows to show. Defaults to the MASTER-prompt count of 7. */
  limit?: number;
  /** Shown when the query matches nothing. Hidden if omitted. */
  emptyMessage?: string;
  /** Custom row renderer; defaults to label + dimmed sublabel. */
  renderOption?: (option: AutocompleteOption, active: boolean) => React.ReactNode;
  /** Extra classes on the wrapping element. */
  className?: string;
  /** Extra classes on the <input>. */
  inputClassName?: string;
}

export const AutocompleteInput = forwardRef<
  HTMLInputElement,
  AutocompleteInputProps
>(function AutocompleteInput(
  {
    options,
    onSelect,
    value,
    defaultValue = "",
    onValueChange,
    allowFreeText = false,
    limit = AUTOCOMPLETE_DEFAULT_LIMIT,
    emptyMessage,
    renderOption,
    className,
    inputClassName,
    onFocus,
    onBlur,
    onKeyDown,
    disabled,
    ...inputProps
  },
  ref,
) {
  const reactId = useId();
  const listboxId = `${reactId}-listbox`;
  const optionId = (i: number) => `${reactId}-opt-${i}`;

  const isControlled = value !== undefined;
  const [innerText, setInnerText] = useState(defaultValue);
  const text = isControlled ? value : innerText;

  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const matches = useMemo(
    () => rankAutocomplete(options, text, limit),
    [options, text, limit],
  );

  // First non-disabled row, used as the keyboard landing spot on open.
  const firstEnabled = useMemo(
    () => matches.findIndex((m) => !m.disabled),
    [matches],
  );

  const setText = useCallback(
    (next: string) => {
      if (!isControlled) setInnerText(next);
      onValueChange?.(next);
    },
    [isControlled, onValueChange],
  );

  const close = useCallback(() => {
    setOpen(false);
    setActiveIndex(-1);
  }, []);

  const commit = useCallback(
    (option: AutocompleteOption) => {
      if (option.disabled) return;
      onSelect(option);
      setText(option.label);
      close();
    },
    [onSelect, setText, close],
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setText(e.target.value);
    setOpen(true);
    setActiveIndex(-1);
  };

  const moveActive = useCallback(
    (dir: 1 | -1) => {
      if (matches.length === 0) return;
      setActiveIndex((prev) => {
        let i = prev;
        for (let step = 0; step < matches.length; step++) {
          i = (i + dir + matches.length) % matches.length;
          if (!matches[i]?.disabled) return i;
        }
        return prev;
      });
    },
    [matches],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    onKeyDown?.(e);
    if (e.defaultPrevented) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        if (!open) {
          setOpen(true);
          setActiveIndex(firstEnabled);
        } else {
          moveActive(1);
        }
        break;
      case "ArrowUp":
        e.preventDefault();
        if (open) moveActive(-1);
        break;
      case "Enter": {
        const picked = activeIndex >= 0 ? matches[activeIndex] : undefined;
        if (picked) {
          e.preventDefault();
          commit(picked);
        } else if (allowFreeText && text.trim()) {
          e.preventDefault();
          const raw = text.trim();
          onSelect({ value: raw, label: raw });
          close();
        }
        break;
      }
      case "Escape":
        if (open) {
          e.preventDefault();
          close();
        }
        break;
      case "Tab":
        close();
        break;
    }
  };

  // Keep the active row scrolled into view.
  useEffect(() => {
    if (!open || activeIndex < 0) return;
    const el = listRef.current?.querySelector<HTMLElement>(
      `#${CSS.escape(optionId(activeIndex))}`,
    );
    el?.scrollIntoView({ block: "nearest" });
    // optionId is stable per render; activeIndex/open drive this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activeIndex]);

  // Click / focus outside closes the popup.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) close();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, close]);

  const showList = open && (matches.length > 0 || !!emptyMessage);

  return (
    <div ref={wrapperRef} className={cn("relative", className)}>
      <Input
        ref={ref}
        type="text"
        role="combobox"
        aria-expanded={showList}
        aria-controls={showList ? listboxId : undefined}
        aria-autocomplete="list"
        aria-activedescendant={
          open && activeIndex >= 0 ? optionId(activeIndex) : undefined
        }
        autoComplete="off"
        value={text}
        disabled={disabled}
        onChange={handleChange}
        onFocus={(e) => {
          setOpen(true);
          onFocus?.(e);
        }}
        onBlur={onBlur}
        onKeyDown={handleKeyDown}
        className={inputClassName}
        {...inputProps}
      />

      {showList && (
        <ul
          ref={listRef}
          id={listboxId}
          role="listbox"
          className={cn(
            "absolute z-50 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-border-strong",
            "bg-surface py-1 shadow-lg shadow-black/5",
          )}
        >
          {matches.length === 0 && emptyMessage ? (
            <li
              role="presentation"
              className="px-3 py-2 text-sm text-text-muted"
            >
              {emptyMessage}
            </li>
          ) : (
            matches.map((option, i) => {
              const active = i === activeIndex;
              return (
                <li
                  key={`${option.value}-${i}`}
                  id={optionId(i)}
                  role="option"
                  aria-selected={active}
                  aria-disabled={option.disabled || undefined}
                  // onMouseDown (not onClick) so the pick lands before the
                  // input's blur tears the popup down.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    commit(option);
                  }}
                  onMouseEnter={() => !option.disabled && setActiveIndex(i)}
                  className={cn(
                    "flex cursor-pointer flex-col px-3 py-2 text-sm",
                    option.disabled && "cursor-not-allowed opacity-50",
                    active && !option.disabled && "bg-accent/10",
                  )}
                >
                  {renderOption ? (
                    renderOption(option, active)
                  ) : (
                    <>
                      <span className="truncate text-text">{option.label}</span>
                      {option.sublabel && (
                        <span className="truncate text-xs text-text-muted">
                          {option.sublabel}
                        </span>
                      )}
                    </>
                  )}
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
});
