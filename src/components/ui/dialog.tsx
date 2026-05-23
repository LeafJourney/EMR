"use client";

import {
  createContext,
  isValidElement,
  cloneElement,
  useContext,
  useEffect,
  useId,
  useState,
  useRef,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type MouseEventHandler,
  type ReactElement,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils/cn";

type DialogContextValue = {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  titleId: string;
};

const DialogContext = createContext<DialogContextValue | null>(null);

function useDialogContext(component: string) {
  const ctx = useContext(DialogContext);
  if (!ctx) {
    throw new Error(`${component} must be used inside <Dialog>.`);
  }
  return ctx;
}

export interface DialogProps {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  children: ReactNode;
}

export function Dialog({ open, onOpenChange, children }: DialogProps) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  return (
    <DialogContext.Provider value={{ open, onOpenChange, titleId }}>
      {children}
    </DialogContext.Provider>
  );
}

export interface DialogTriggerProps {
  asChild?: boolean;
  children: ReactNode;
}

export function DialogTrigger({ asChild, children }: DialogTriggerProps) {
  const { onOpenChange } = useDialogContext("DialogTrigger");

  if (asChild && isValidElement(children)) {
    const child = children as ReactElement<{ onClick?: MouseEventHandler }>;
    const childOnClick = child.props.onClick;
    return cloneElement(child, {
      onClick: (event: Parameters<NonNullable<MouseEventHandler>>[0]) => {
        childOnClick?.(event);
        if (!event.defaultPrevented) onOpenChange(true);
      },
    });
  }

  return (
    <button type="button" onClick={() => onOpenChange(true)}>
      {children}
    </button>
  );
}

export type DialogContentProps = HTMLAttributes<HTMLDivElement>;

// a11y: collect focusable descendants once per Tab, so we can wrap focus
// inside the dialog (WCAG 2.4.3 Focus Order + 2.1.2 No Keyboard Trap —
// allowing Esc as the documented exit satisfies "no trap").
const FOCUSABLE_SELECTOR =
  'a[href], area[href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), iframe, object, embed, [tabindex]:not([tabindex="-1"]), [contenteditable]:not([contenteditable="false"])';

export function DialogContent({ className, children, ...props }: DialogContentProps) {
  const { open, onOpenChange, titleId } = useDialogContext("DialogContent");
  const [showConfirm, setShowConfirm] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  // Remember whatever had focus before the dialog opened so we can return
  // focus to it on close — keyboard / screen-reader users otherwise get
  // dropped at document body.
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  const handleCloseAttempt = () => {
    let isDirty = false;
    if (dialogRef.current) {
      const inputs = dialogRef.current.querySelectorAll("input, textarea, select");
      for (const input of Array.from(inputs)) {
        if (input instanceof HTMLInputElement) {
          if (input.type === "checkbox" || input.type === "radio") {
            if (input.checked !== input.defaultChecked) isDirty = true;
          } else if (input.value !== input.defaultValue) {
            isDirty = true;
          }
        } else if (input instanceof HTMLTextAreaElement) {
          if (input.value !== input.defaultValue) isDirty = true;
        } else if (input instanceof HTMLSelectElement) {
          const defaultSelected = Array.from(input.options).find(opt => opt.defaultSelected);
          const defaultIndex = defaultSelected ? defaultSelected.index : 0;
          if (input.selectedIndex !== defaultIndex) isDirty = true;
        }
      }
    }

    if (isDirty) {
      setShowConfirm(true);
    } else {
      onOpenChange(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    // Snapshot the previously focused element so we can restore it on close.
    previouslyFocusedRef.current =
      typeof document !== "undefined"
        ? (document.activeElement as HTMLElement | null)
        : null;

    // Move focus into the dialog — first focusable, else the dialog itself.
    const focusInitial = () => {
      const node = dialogRef.current;
      if (!node) return;
      const focusable = node.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      // Skip the close button (first match) when there's a more meaningful
      // control inside — otherwise the dialog opens with focus parked on "X"
      // which is awkward for keyboard users.
      const target = focusable[1] ?? focusable[0] ?? node;
      target.focus();
    };
    focusInitial();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        handleCloseAttempt();
        return;
      }
      if (e.key !== "Tab") return;
      const node = dialogRef.current;
      if (!node) return;
      const focusable = Array.from(
        node.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((el) => !el.hasAttribute("disabled"));
      if (focusable.length === 0) {
        e.preventDefault();
        node.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && (active === first || !node.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      // Restore focus to the trigger element when the dialog unmounts.
      const prev = previouslyFocusedRef.current;
      if (prev && typeof prev.focus === "function") {
        // Defer so React finishes unmounting before we restore focus.
        queueMicrotask(() => prev.focus());
      }
    };
    // handleCloseAttempt is intentionally not in the dep array — including it
    // would re-attach the listener on every render and break the previously-
    // focused snapshot. Same pattern as pre-existing code in this file.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={handleCloseAttempt}
        aria-hidden
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          "relative z-10 w-full max-w-lg rounded-lg border border-border bg-surface p-6 shadow-xl overflow-hidden",
          "focus:outline-none focus-visible:outline-none",
          className,
        )}
        {...props}
      >
        <button
          type="button"
          onClick={handleCloseAttempt}
          className="absolute right-4 top-4 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 disabled:pointer-events-none cursor-pointer"
          aria-label="Close"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 15 15"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4 text-text-subtle"
          >
            <path
              d="M11.7816 4.03157C12.0062 3.8069 12.0062 3.44295 11.7816 3.21828C11.5569 2.99361 11.1929 2.99361 10.9683 3.21828L7.50005 6.68653L4.03182 3.21828C3.80715 2.99361 3.4432 2.99361 3.21853 3.21828C2.99386 3.44295 2.99386 3.8069 3.21853 4.03157L6.68676 7.49982L3.21853 10.9681C2.99386 11.1927 2.99386 11.5567 3.21853 11.7814C3.4432 12.006 3.80715 12.006 4.03182 11.7814L7.50005 8.31311L10.9683 11.7814C11.1929 12.006 11.5569 12.006 11.7816 11.7814C12.0062 11.5567 12.0062 11.1927 11.7816 10.9681L8.31333 7.49982L11.7816 4.03157Z"
              fill="currentColor"
              fillRule="evenodd"
              clipRule="evenodd"
            />
          </svg>
        </button>
        {children}
        {showConfirm && (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-surface/95 backdrop-blur-sm p-6 text-center">
            <h3 className="text-lg font-semibold text-text">Are you sure you want to leave?</h3>
            <p className="text-sm text-text-muted mt-2">Your changes will be lost.</p>
            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={() => setShowConfirm(false)}
                className="px-4 py-2 rounded-md border border-border bg-surface text-sm font-medium text-text hover:bg-surface-muted transition-colors cursor-pointer select-none"
              >
                Stay
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowConfirm(false);
                  onOpenChange(false);
                }}
                className="px-4 py-2 rounded-md bg-danger text-white text-sm font-medium hover:bg-danger-hover transition-colors cursor-pointer select-none"
              >
                Leave
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export type DialogHeaderProps = HTMLAttributes<HTMLDivElement>;

export function DialogHeader({ className, ...props }: DialogHeaderProps) {
  return <div className={cn("mb-4 flex flex-col gap-1", className)} {...props} />;
}

export type DialogTitleProps = HTMLAttributes<HTMLHeadingElement>;

export function DialogTitle({ className, ...props }: DialogTitleProps) {
  const { titleId } = useDialogContext("DialogTitle");
  return <h2 id={titleId} className={cn("text-lg font-semibold text-text", className)} {...props} />;
}

export type DialogCloseProps = ButtonHTMLAttributes<HTMLButtonElement>;

export function DialogClose({ onClick, ...props }: DialogCloseProps) {
  const { onOpenChange } = useDialogContext("DialogClose");
  return (
    <button
      type="button"
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) onOpenChange(false);
      }}
      {...props}
    />
  );
}
