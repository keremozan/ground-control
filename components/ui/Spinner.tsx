"use client";
import { Loader2 } from "lucide-react";

interface SpinnerProps {
  label?: string;
  size?: number;
  inline?: boolean;
}

export function Spinner({ label, size = 16, inline = false }: SpinnerProps) {
  const content = (
    <>
      <Loader2 size={size} style={{ animation: "spin 1s linear infinite" }} />
      {label && <span style={{ fontSize: "11px", color: "var(--text-3)", marginLeft: 6 }}>{label}</span>}
    </>
  );

  if (inline) {
    return <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--text-3)" }}>{content}</span>;
  }

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: 16, color: "var(--text-3)" }}>
      {content}
    </div>
  );
}
