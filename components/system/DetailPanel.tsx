"use client";
import { useEffect, useState } from "react";
import { X } from "lucide-react";

type DetailData = Record<string, unknown>;

export default function DetailPanel({
  nodeId,
  onClose,
}: {
  nodeId: string | null;
  onClose: () => void;
}) {
  const [data, setData] = useState<DetailData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!nodeId) { setData(null); return; }
    setLoading(true);
    setError(null);
    fetch(`/api/system/graph/detail?id=${encodeURIComponent(nodeId)}`)
      .then((r) => r.json())
      .then((resp) => {
        const inner = resp?.data ?? resp;
        setData(inner);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [nodeId]);

  if (!nodeId) return null;

  const type = data?.type as string || nodeId.split(":")[0];

  return (
    <div style={{
      position: "absolute",
      top: 0,
      right: 0,
      width: 360,
      height: "100%",
      background: "var(--surface)",
      borderLeft: "1px solid var(--border)",
      zIndex: 10,
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        padding: "10px 12px",
        borderBottom: "1px solid var(--border)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <span style={{
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          fontWeight: 600,
          color: "var(--text)",
        }}>
          {nodeId}
        </span>
        <button
          onClick={onClose}
          style={{
            background: "none", border: "none", cursor: "pointer",
            color: "var(--text-3)", padding: 2,
          }}
        >
          <X size={14} />
        </button>
      </div>

      {/* Body */}
      <div style={{
        flex: 1,
        overflowY: "auto",
        padding: "12px",
        fontSize: 11,
        color: "var(--text-2)",
        fontFamily: "var(--font-body)",
        lineHeight: 1.5,
      }}>
        {loading && (
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-3)" }}>
            Loading...
          </span>
        )}
        {error && (
          <span style={{ color: "#ef4444", fontFamily: "var(--font-mono)", fontSize: 10 }}>
            {error}
          </span>
        )}
        {data && type === "skill" && <SkillDetail data={data} />}
        {data && type === "character" && <CharacterDetail data={data} />}
        {data && type === "knowledge" && <KnowledgeDetail data={data} />}
        {data && type === "schedule" && <ScheduleDetail data={data} />}
      </div>
    </div>
  );
}

// ── Sub-components ──

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{
        fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 600,
        color: "var(--text-3)", textTransform: "uppercase", marginBottom: 4,
        letterSpacing: "0.5px",
      }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function Badge({ label, color }: { label: string; color?: string }) {
  return (
    <span style={{
      fontFamily: "var(--font-mono)", fontSize: 9,
      background: color ? `${color}18` : "var(--bg)",
      color: color || "var(--text-3)",
      borderRadius: 3, padding: "1px 5px",
      border: `1px solid ${color ? `${color}30` : "var(--border)"}`,
    }}>
      {label}
    </span>
  );
}

function SkillDetail({ data }: { data: DetailData }) {
  const steps = (data.steps || []) as Array<{ step: string; title: string; content: string }>;
  const boundaries = data.boundaries as string || "";

  return (
    <>
      <Section title="Info">
        <div><strong>{data.name as string}</strong></div>
        <div style={{ color: "var(--text-3)", marginTop: 2 }}>{data.description as string}</div>
        <div style={{ marginTop: 4, display: "flex", gap: 4 }}>
          <Badge label={`character: ${data.character}`} />
        </div>
      </Section>

      {steps.length > 0 && (
        <Section title="Procedure">
          {steps.map((s, i) => (
            <div key={i} style={{ marginBottom: 8 }}>
              <div style={{
                fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 600,
                color: "var(--text)",
              }}>
                {s.step}. {s.title}
              </div>
              <div style={{
                fontSize: 10, color: "var(--text-3)", marginTop: 2,
                whiteSpace: "pre-wrap", lineHeight: 1.4,
              }}>
                {s.content.slice(0, 300)}{s.content.length > 300 ? "..." : ""}
              </div>
            </div>
          ))}
        </Section>
      )}

      {boundaries && (
        <Section title="Boundaries">
          <div style={{
            fontSize: 10, color: "var(--text-3)", whiteSpace: "pre-wrap", lineHeight: 1.4,
          }}>
            {boundaries.slice(0, 500)}
          </div>
        </Section>
      )}
    </>
  );
}

function CharacterDetail({ data }: { data: DetailData }) {
  const skills = (data.skills || []) as string[];
  const knowledge = (data.sharedKnowledge || []) as string[];
  const actions = (data.actions || []) as Array<{ label: string; description: string }>;

  return (
    <>
      <Section title="Info">
        <div><strong>{data.name as string}</strong></div>
        <div style={{ marginTop: 4, display: "flex", gap: 4, flexWrap: "wrap" }}>
          <Badge label={data.tier as string} />
          <Badge label={data.domain as string || "no domain"} />
          <Badge label={`model: ${data.defaultModel || data.model || "sonnet"}`} />
        </div>
      </Section>

      <Section title={`Skills (${skills.length})`}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
          {skills.map((s) => (
            <Badge key={s} label={s} />
          ))}
        </div>
      </Section>

      <Section title={`Knowledge (${knowledge.length})`}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
          {knowledge.map((k) => (
            <Badge key={k} label={k} />
          ))}
        </div>
      </Section>

      {actions.length > 0 && (
        <Section title="Actions">
          {actions.map((a, i) => (
            <div key={i} style={{ marginBottom: 3 }}>
              <span style={{ fontWeight: 600 }}>{a.label}</span>
              <span style={{ color: "var(--text-3)", marginLeft: 6 }}>{a.description}</span>
            </div>
          ))}
        </Section>
      )}
    </>
  );
}

function KnowledgeDetail({ data }: { data: DetailData }) {
  return (
    <>
      <Section title="Info">
        <div><strong>{data.filename as string}</strong></div>
        <div style={{ marginTop: 4, display: "flex", gap: 4 }}>
          <Badge label={`${data.lineCount} lines`} />
        </div>
      </Section>

      {data.preview && (
        <Section title="Preview">
          <div style={{
            fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--text-3)",
            whiteSpace: "pre-wrap", lineHeight: 1.4,
            background: "var(--bg)", borderRadius: 4, padding: 8,
            border: "1px solid var(--border)",
          }}>
            {data.preview as string}
          </div>
        </Section>
      )}
    </>
  );
}

function ScheduleDetail({ data }: { data: DetailData }) {
  const lastRun = data.lastRun as { timestamp?: string; response?: string; durationMs?: number } | null;

  return (
    <>
      <Section title="Info">
        <div><strong>{data.jobId as string}</strong></div>
      </Section>

      {lastRun && (
        <Section title="Last Run">
          <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
            <Badge label={new Date(lastRun.timestamp || "").toLocaleString("en-GB", {
              day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
            })} />
            {lastRun.durationMs && (
              <Badge label={`${Math.round(lastRun.durationMs / 1000)}s`} />
            )}
          </div>
          {lastRun.response && (
            <div style={{
              fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--text-3)",
              whiteSpace: "pre-wrap", lineHeight: 1.4,
              background: "var(--bg)", borderRadius: 4, padding: 8,
              border: "1px solid var(--border)",
              maxHeight: 200, overflowY: "auto",
            }}>
              {lastRun.response}
            </div>
          )}
        </Section>
      )}

      {!lastRun && (
        <Section title="Last Run">
          <span style={{ color: "var(--text-3)", fontFamily: "var(--font-mono)", fontSize: 10 }}>
            No run data available
          </span>
        </Section>
      )}
    </>
  );
}
