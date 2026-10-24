"use client";

import { useRef, useState, type ReactNode } from "react";

const inputClass =
  "w-full rounded border border-chrome-border px-2 py-1 text-sm text-zinc-800 outline-none focus:border-accent disabled:bg-zinc-50 disabled:text-zinc-400";
export const smallButtonClass =
  "rounded border border-chrome-border px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:text-zinc-300 disabled:hover:bg-transparent";

type Change<T> = (value: T, txnId?: string) => void;

/** Edits made while one field keeps focus share a txnId, so they undo as one step. */
export function useEditSession() {
  const txnId = useRef("");
  return {
    begin: () => {
      txnId.current = crypto.randomUUID();
    },
    txnId: () => (txnId.current ||= crypto.randomUUID()),
  };
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-b border-chrome-border px-4 py-4">
      <h3 className="text-xs font-medium tracking-wide text-zinc-500 uppercase">{title}</h3>
      {children}
    </section>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-zinc-500">{label}</span>
      {children}
    </div>
  );
}

export function Hint({ children }: { children: ReactNode }) {
  return <p className="px-4 py-3 text-xs text-zinc-500">{children}</p>;
}

export function TextInput({
  value,
  onChange,
  ariaLabel,
  disabled,
  className = inputClass,
}: {
  value: string;
  onChange: Change<string>;
  ariaLabel: string;
  disabled?: boolean;
  className?: string;
}) {
  const session = useEditSession();
  return (
    <input
      type="text"
      value={value}
      aria-label={ariaLabel}
      disabled={disabled}
      className={className}
      onFocus={session.begin}
      onChange={(event) => onChange(event.target.value, session.txnId())}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
      }}
    />
  );
}

function parseNumber(text: string, min = -Infinity, max = Infinity): number | null {
  if (text.trim() === "") return null;
  const n = Number(text);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

export function NumberInput({
  value,
  onChange,
  ariaLabel,
  min,
  max,
  className = inputClass,
}: {
  value: number;
  onChange: Change<number>;
  ariaLabel: string;
  min?: number;
  max?: number;
  className?: string;
}) {
  const session = useEditSession();
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      type="text"
      inputMode="decimal"
      value={draft ?? String(value)}
      aria-label={ariaLabel}
      className={className}
      onFocus={() => {
        session.begin();
        setDraft(String(value));
      }}
      onChange={(event) => {
        const text = event.target.value;
        setDraft(text);
        const parsed = parseNumber(text, min, max);
        if (parsed !== null && parsed !== value) onChange(parsed, session.txnId());
      }}
      onBlur={() => setDraft(null)}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
      }}
    />
  );
}

function toHex6(color: string): string {
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(color);
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`.toLowerCase();
  return /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : "#000000";
}

export function ColorInput({
  value,
  onChange,
  ariaLabel,
  className = "h-8 w-10",
}: {
  value: string;
  onChange: Change<string>;
  ariaLabel: string;
  className?: string;
}) {
  const session = useEditSession();
  return (
    <input
      type="color"
      value={toHex6(value)}
      aria-label={ariaLabel}
      title={ariaLabel}
      className={`${className} shrink-0 cursor-pointer rounded border border-chrome-border bg-white p-0.5`}
      onFocus={session.begin}
      onChange={(event) => onChange(event.target.value, session.txnId())}
    />
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  ariaLabel: string;
}) {
  return (
    <div role="group" aria-label={ariaLabel} className="flex rounded border border-chrome-border p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          className={`flex-1 rounded px-2 py-1 text-xs ${
            option.value === value ? "bg-accent text-white" : "text-zinc-700 hover:bg-zinc-100"
          }`}
          onClick={() => {
            if (option.value !== value) onChange(option.value);
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
