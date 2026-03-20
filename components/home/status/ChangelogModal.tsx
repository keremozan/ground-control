"use client";
import { Modal } from "@/components/ui/Modal";

/* ── Types ──────────────────────────────────────────────────── */

export type CLItem = {
  type: "new" | "improved" | "fixed" | "sys" | "other";
  text: string;
};

export type CLSection = {
  area: string;
  items: CLItem[];
};

export type CLVersion = {
  heading: string;
  sections: CLSection[];
};

/* ── Constants ──────────────────────────────────────────────── */

export const TYPE_MAP: Record<string, CLItem["type"]> = {
  new: "new", fix: "fixed", fixed: "fixed", improved: "improved", sys: "sys",
};

export const TYPE_DOT: Record<string, string> = {
  new: "var(--green)",
  improved: "var(--blue)",
  fixed: "var(--amber)",
  sys: "var(--purple)",
  other: "var(--accent-muted)",
};

/* ── Parser ──────────────────────────────────────────────────── */

export function parseChangelog(raw: string): CLVersion[] {
  const versions: CLVersion[] = [];
  let cur: CLVersion | null = null;
  let section: CLSection | null = null;

  for (const line of raw.split("\n")) {
    if (line.startsWith("## ")) {
      if (section && cur) cur.sections.push(section);
      if (cur) versions.push(cur);
      cur = { heading: line.replace("## ", ""), sections: [] };
      section = null;
      continue;
    }
    if (line.startsWith("### ") && cur) {
      if (section) cur.sections.push(section);
      section = { area: line.replace("### ", ""), items: [] };
      continue;
    }
    if (line.startsWith("- ") && section) {
      const text = line.slice(2).trim();
      const tag = text.match(/^\[(new|fix|fixed|improved|sys)\]\s*/i);
      if (tag) {
        section.items.push({ type: TYPE_MAP[tag[1].toLowerCase()] || "other", text: text.slice(tag[0].length) });
      } else {
        section.items.push({ type: "other", text });
      }
    }
  }
  if (section && cur) cur.sections.push(section);
  if (cur) versions.push(cur);
  return versions;
}

/* ── Props ───────────────────────────────────────────────────── */

interface ChangelogModalProps {
  open: boolean;
  onClose: () => void;
  changelog: CLVersion[] | null;
}

/* ── Component ───────────────────────────────────────────────── */

export default function ChangelogModal({ open, onClose, changelog }: ChangelogModalProps) {
  return (
    <Modal open={open} onClose={onClose} width={480}>
      <div style={{ padding: "20px 24px" }}>
        <div style={{
          fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600,
          color: "var(--text-3)", letterSpacing: "0.5px", textTransform: "uppercase",
          marginBottom: 16,
        }}>
          Changelog
        </div>
        {changelog ? changelog.map((ver, vi) => {
          const visibleSections = ver.sections;
          if (visibleSections.length === 0) return null;
          return (
            <div key={vi} style={{ marginBottom: vi < changelog.length - 1 ? 20 : 0 }}>
              <div style={{
                fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600,
                color: "var(--text)", marginBottom: 10,
                paddingBottom: 5, borderBottom: "1px solid var(--border)",
              }}>
                {ver.heading}
              </div>
              {visibleSections.map((sec, si) => (
                <div key={si} style={{ marginBottom: 10 }}>
                  <div style={{
                    fontFamily: "var(--font-mono)", fontSize: 9.5, fontWeight: 600,
                    color: "var(--text-2)", marginBottom: 3,
                  }}>
                    {sec.area}
                  </div>
                  {sec.items.map((item, ii) => (
                    <div key={ii} style={{
                      display: "flex", alignItems: "baseline", gap: 6,
                      fontFamily: "var(--font-mono)", fontSize: 10.5,
                      color: "var(--text-3)", lineHeight: 1.7,
                      paddingLeft: 2,
                    }}>
                      <span style={{
                        width: 5, height: 5, borderRadius: "50%", flexShrink: 0,
                        background: TYPE_DOT[item.type] || TYPE_DOT.other,
                        display: "inline-block", position: "relative", top: -1,
                      }} />
                      {item.text}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          );
        }) : (
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-3)" }}>
            Loading...
          </span>
        )}
      </div>
    </Modal>
  );
}
