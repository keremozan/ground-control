"use client";
import { useEffect, useRef, type ReactNode } from "react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  width?: number;
  children: ReactNode;
}

export function Modal({ open, onClose, title, width = 480, children }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || !dialogRef.current) return;
    const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length) focusable[0].focus();
  }, [open]);

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 300,
        background: "rgba(0,0,0,0.4)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg, 6px)",
          boxShadow: "var(--shadow-xl, 0 4px 20px rgba(0,0,0,0.1))",
          width, maxWidth: "90vw", maxHeight: "80vh",
          display: "flex", flexDirection: "column",
          overflow: "hidden",
          animation: "enter 0.2s ease-out",
        }}
      >
        {title && (
          <div style={{
            padding: "12px 16px",
            borderBottom: "1px solid var(--border)",
            fontWeight: 600, fontSize: "13px",
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <span>{title}</span>
            <button
              onClick={onClose}
              style={{
                background: "none", border: "none", cursor: "pointer",
                color: "var(--text-3)", fontSize: "16px",
                padding: 0, lineHeight: 1,
              }}
              aria-label="Close"
            >
              x
            </button>
          </div>
        )}
        <div style={{ overflow: "auto", flex: 1 }}>
          {children}
        </div>
      </div>
    </div>
  );
}
