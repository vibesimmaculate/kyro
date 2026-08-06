import Link from "next/link";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "secondary" | "quiet" | "danger";
export type ButtonSize = "sm" | "md" | "lg";
export type ButtonTone = "day" | "night";

/**
 * Buttons are rectangles with an 8px radius and a hairline — never pills, never
 * shadowed. Pressed state moves the surface down one pixel, because the whole
 * product is pretending to be a physical pickup point and a press should feel like
 * one.
 */

const BASE =
  "relative inline-flex items-center justify-center gap-2 rounded-[8px] font-medium " +
  "transition-[background-color,border-color,color,transform] duration-[var(--duration-fast)] " +
  "ease-[var(--ease-out-quiet)] active:translate-y-px " +
  "disabled:pointer-events-none disabled:opacity-45 " +
  "aria-disabled:pointer-events-none aria-disabled:opacity-45";

const SIZES: Record<ButtonSize, string> = {
  sm: "min-h-9 px-3 text-small",
  md: "min-h-11 px-4 text-[0.9375rem]",
  lg: "min-h-[3.25rem] px-5 text-[1rem]",
};

const DAY: Record<ButtonVariant, string> = {
  primary: "bg-blue text-paper border border-blue hover:bg-blue-press hover:border-blue-press",
  secondary:
    "bg-surface text-ink border border-rule-strong hover:bg-paper-sunk hover:border-ink/40",
  quiet:
    "bg-transparent text-ink border border-transparent hover:bg-paper-sunk hover:border-rule",
  danger: "bg-red text-paper border border-red hover:brightness-95",
};

const NIGHT: Record<ButtonVariant, string> = {
  primary:
    "bg-night-blue text-night-sunk border border-night-blue hover:brightness-110 font-semibold",
  secondary:
    "bg-night-raised text-night-text border border-night-rule-strong hover:border-night-muted",
  quiet:
    "bg-transparent text-night-text border border-transparent hover:bg-night-raised hover:border-night-rule",
  danger: "bg-night-red text-night-sunk border border-night-red hover:brightness-110",
};

interface CommonProps {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  readonly tone?: ButtonTone;
  readonly full?: boolean;
  readonly className?: string;
  readonly children: ReactNode;
}

function classes({ variant = "primary", size = "md", tone = "day", full, className }: CommonProps) {
  return cn(
    BASE,
    SIZES[size],
    tone === "night" ? NIGHT[variant] : DAY[variant],
    full && "w-full",
    className,
  );
}

export type ButtonProps = CommonProps &
  Omit<ComponentPropsWithoutRef<"button">, "className" | "children">;

export function Button({ variant, size, tone, full, className, children, ...rest }: ButtonProps) {
  return (
    <button className={classes({ variant, size, tone, full, className, children })} {...rest}>
      {children}
    </button>
  );
}

export type ButtonLinkProps = CommonProps &
  Omit<ComponentPropsWithoutRef<typeof Link>, "className" | "children">;

export function ButtonLink({
  variant,
  size,
  tone,
  full,
  className,
  children,
  ...rest
}: ButtonLinkProps) {
  return (
    <Link className={classes({ variant, size, tone, full, className, children })} {...rest}>
      {children}
    </Link>
  );
}
