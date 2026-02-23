"use client";

const actions = ["Scan Mail", "Run Cycle", "Check In"];

export default function QuickActions() {
  return (
    <div className="flex" style={{ gap: 6 }}>
      {actions.map((label) => (
        <button
          key={label}
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 11,
            fontWeight: 500,
            color: "var(--text)",
            background: "transparent",
            border: "1px solid var(--border)",
            borderRadius: 2,
            padding: "6px 14px",
            cursor: "pointer",
            transition: "border-color 0.15s, color 0.15s",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.borderColor = "var(--red)";
            (e.currentTarget as HTMLElement).style.color = "var(--red)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
            (e.currentTarget as HTMLElement).style.color = "var(--text)";
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
