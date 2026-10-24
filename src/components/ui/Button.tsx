"use client";

import type { ComponentProps, ReactNode } from "react";
import { Tooltip } from "./Tooltip";

export type ButtonVariant = "ghost" | "outline" | "primary";
export type ButtonSize = "xs" | "sm" | "md" | "lg";

const BASE =
  "inline-flex items-center justify-center gap-1 rounded whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:cursor-not-allowed [&_svg]:shrink-0";

const NEUTRAL = "text-zinc-700 hover:bg-zinc-100 active:bg-zinc-200";
const DANGER = "text-red-600 hover:bg-red-50 active:bg-red-100";

const VARIANTS: Record<ButtonVariant, (danger: boolean) => string> = {
  ghost: (danger) => `${danger ? DANGER : NEUTRAL} disabled:text-zinc-300 disabled:hover:bg-transparent`,
  outline: (danger) =>
    `border border-chrome-border bg-white ${danger ? DANGER : NEUTRAL} disabled:text-zinc-300 disabled:hover:bg-white`,
  primary: () => "bg-accent font-medium text-white hover:bg-accent/90 active:bg-accent/80 disabled:opacity-40 disabled:hover:bg-accent",
};

const SIZES: Record<ButtonSize, string> = {
  xs: "px-1.5 py-0.5 text-xs [&_svg]:size-3",
  sm: "px-2 py-1 text-xs [&_svg]:size-3.5",
  md: "px-2.5 py-1 text-sm [&_svg]:size-4",
  lg: "px-4 py-2 text-sm [&_svg]:size-4",
};

const ICON_SIZES: Record<ButtonSize, string> = {
  xs: "p-0.5 [&_svg]:size-3.5",
  sm: "p-1 [&_svg]:size-4",
  md: "p-1.5 [&_svg]:size-4",
  lg: "p-2 [&_svg]:size-5",
};

export function buttonClass({
  variant = "ghost",
  size = "sm",
  danger = false,
  iconOnly = false,
}: { variant?: ButtonVariant; size?: ButtonSize; danger?: boolean; iconOnly?: boolean } = {}): string {
  return `${BASE} ${VARIANTS[variant](danger)} ${iconOnly ? ICON_SIZES[size] : SIZES[size]}`;
}

export type ButtonProps = ComponentProps<"button"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  danger?: boolean;
  iconOnly?: boolean;
  tooltip?: ReactNode;
  shortcut?: string;
};

export function Button({
  variant,
  size,
  danger,
  iconOnly,
  tooltip,
  shortcut,
  className,
  type = "button",
  ...props
}: ButtonProps) {
  const button = (
    <button
      type={type}
      className={[buttonClass({ variant, size, danger, iconOnly }), className].filter(Boolean).join(" ")}
      {...props}
    />
  );
  if (!tooltip) return button;
  return (
    <Tooltip content={tooltip} shortcut={shortcut} disabled={props.disabled}>
      {button}
    </Tooltip>
  );
}
