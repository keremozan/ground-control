"use client";
import { useRef, useEffect } from "react";
import { ListChecks, Play, X } from "lucide-react";
import { charColor } from "@/lib/char-icons";
import type { CharacterInfo } from "@/types";

interface TaskPanelProps {
  taskInput: string;
  onTaskInputChange: (v: string) => void;
  taskChar: string;
  onTaskCharChange: (v: string) => void;
  characters: CharacterInfo[];
  defaultChar: string;
  onExtract: () => void;
  onGo: () => void;
  onCancel: () => void;
}

export default function TaskPanel({
  taskInput,
  onTaskInputChange,
  taskChar,
  onTaskCharChange,
  characters,
  defaultChar,
  onExtract,
  onGo,
  onCancel,
}: TaskPanelProps) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => ref.current?.focus(), 50);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div style={{
      borderTop: "1px solid var(--border)", background: "var(--surface-2)",
      padding: "8px 12px", display: "flex", flexDirection: "column", gap: 6,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{
          fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-3)",
          textTransform: "uppercase", letterSpacing: "0.05em",
        }}>
          Task from email
        </span>
        <button className="item-action-btn" data-tip="Cancel" onClick={onCancel} style={{ cursor: "pointer" }}>
          <X size={10} strokeWidth={1.5} />
        </button>
      </div>

      <input
        ref={ref}
        value={taskInput}
        onChange={e => onTaskInputChange(e.target.value)}
        onKeyDown={e => {
          if (e.key === "Enter") onGo();
          if (e.key === "Escape") onCancel();
        }}
        placeholder="What to do... (optional, defaults to: do the work + log)"
        style={{
          fontFamily: "var(--font-body)", fontSize: 11,
          background: "var(--surface)", border: "1px solid var(--border)",
          borderRadius: 4, padding: "5px 8px", color: "var(--text)",
          outline: "none", width: "100%",
        }}
      />

      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <select
          value={taskChar}
          onChange={e => onTaskCharChange(e.target.value)}
          style={{
            fontFamily: "var(--font-mono)", fontSize: 10,
            background: "var(--surface)", border: "1px solid var(--border)",
            borderRadius: 4, padding: "3px 6px", color: "var(--text)",
            outline: "none",
            borderLeft: `3px solid ${charColor[taskChar.toLowerCase()] || "var(--text-3)"}`,
          }}
        >
          {(characters.length > 0 ? characters : [{ id: defaultChar, name: defaultChar } as CharacterInfo]).map(c => (
            <option key={c.id} value={c.name}>{c.name}</option>
          ))}
        </select>

        <button
          className="item-action-btn item-action-btn-green"
          data-tip="Extract tasks automatically (Postman)"
          onClick={onExtract}
          style={{
            cursor: "pointer", display: "flex", alignItems: "center", gap: 3,
            width: "auto", padding: "0 6px",
            fontFamily: "var(--font-mono)", fontSize: 9,
          }}
        >
          <ListChecks size={10} strokeWidth={1.5} />
          Extract
        </button>

        <button
          className="item-action-btn item-action-btn-blue"
          data-tip="Work on this email, then log it"
          onClick={onGo}
          style={{
            cursor: "pointer", display: "flex", alignItems: "center", gap: 3,
            width: "auto", padding: "0 6px",
            fontFamily: "var(--font-mono)", fontSize: 9,
          }}
        >
          <Play size={10} strokeWidth={1.5} />
          Go
        </button>
      </div>
    </div>
  );
}
