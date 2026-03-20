"use client";
import { useState, useMemo } from "react";
import {
  openTanaNode, openGmail, LINK_RE, TANA_LINK_RE, GMAIL_LINK_RE,
  emojiInfo, splitEmoji,
} from "./helpers";

// ─── Exported rendering helpers (used by ChatMessage for user content) ──────

export function processLinks(s: string, accent?: string): React.ReactNode[] {
  const parts = s.split(LINK_RE);
  return parts.map((p, j) => {
    const tana = p.match(TANA_LINK_RE);
    if (tana) return <span key={j} onClick={() => openTanaNode(tana[2])} style={{
      color: accent || "var(--blue)", cursor: "pointer", fontWeight: 600,
      borderBottom: `1.5px solid ${accent || "var(--blue)"}40`, paddingBottom: 0.5,
    }}>{tana[1]}</span>;
    const gmail = p.match(GMAIL_LINK_RE);
    if (gmail) return <span key={j} onClick={() => openGmail(gmail[2], gmail[3])} style={{
      color: accent || "var(--blue)", cursor: "pointer", fontWeight: 600,
      borderBottom: `1.5px solid ${accent || "var(--blue)"}40`, paddingBottom: 0.5,
    }}>{gmail[1]}</span>;
    return p;
  });
}

export function expandEmoji(text: string, keyPrefix: string): React.ReactNode[] {
  const parts = splitEmoji(text);
  if (parts.length === 1 && parts[0] === text && !emojiInfo(text)) return [text];
  return parts.map((seg, i) => {
    const em = emojiInfo(seg);
    if (em) return <span key={`${keyPrefix}-e${i}`} style={{
      fontFamily: "var(--font-mono)", fontSize: "0.8em", fontWeight: 600,
      color: em.color, background: em.bg,
      padding: "1px 4px", borderRadius: 3, letterSpacing: 0.5,
      display: "inline-block", lineHeight: 1.4,
    }}>{em.label}</span>;
    return seg ? <span key={`${keyPrefix}-e${i}`}>{seg}</span> : null;
  }).filter(Boolean) as React.ReactNode[];
}

// ─── FormBlock (private) ────────────────────────────────────────────────────

function FormBlock({
  questions, submitLabel, accent, onSubmit,
}: {
  questions: { label: string; options: string[]; freeText: boolean }[];
  submitLabel: string;
  accent?: string;
  onSubmit?: (text: string) => void;
}) {
  const [selected, setSelected] = useState<Record<number, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const allAnswered = questions.every((q, i) => q.freeText ? !!selected[i]?.trim() : selected[i] !== undefined);
  const c = accent || 'var(--text)';
  return (
    <div style={{ margin: '6px 0' }}>
      {questions.map((q, qi) => (
        <div key={qi} style={{ marginBottom: 8 }}>
          <div style={{
            fontSize: 10, fontStyle: 'italic', color: c,
            marginBottom: 4, fontFamily: 'var(--font-mono)',
          }}>
            {qi + 1}. {q.label}
          </div>
          {q.freeText ? (
            <textarea
              disabled={submitted}
              value={selected[qi] || ''}
              onChange={e => setSelected(s => ({ ...s, [qi]: e.target.value }))}
              placeholder="type your answer..."
              rows={2}
              style={{
                width: '100%', fontFamily: 'var(--font-mono)', fontSize: 10,
                background: 'var(--surface)', border: `1px solid ${c}40`,
                borderRadius: 4, padding: '4px 8px', color: c,
                outline: 'none', resize: 'vertical', lineHeight: 1.5,
                boxSizing: 'border-box' as const,
                opacity: submitted ? 0.5 : 1,
              }}
            />
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
              {q.options.map((opt, oi) => (
                <button
                  key={oi}
                  disabled={submitted}
                  onClick={() => !submitted && setSelected(s => ({ ...s, [qi]: opt }))}
                  style={{
                    fontFamily: 'var(--font-mono)', fontSize: 10,
                    padding: '4px 8px', borderRadius: 4, minWidth: 28, textAlign: 'center' as const,
                    border: `1px solid ${selected[qi] === opt ? c : c + '40'}`,
                    background: selected[qi] === opt ? c + '18' : 'transparent',
                    color: selected[qi] === opt ? c : c + 'aa',
                    cursor: submitted ? 'default' : 'pointer',
                    transition: 'background 0.12s, border-color 0.12s',
                    fontWeight: selected[qi] === opt ? 600 : 400,
                    opacity: submitted && selected[qi] !== opt ? 0.3 : 1,
                  }}
                  onMouseEnter={e => { if (!submitted && selected[qi] !== opt) e.currentTarget.style.background = c + '0a'; }}
                  onMouseLeave={e => { if (selected[qi] !== opt) e.currentTarget.style.background = 'transparent'; }}
                >
                  {opt}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
      <button
        disabled={!allAnswered || submitted}
        onClick={() => {
          if (!allAnswered || submitted) return;
          setSubmitted(true);
          const text = questions.map((q, i) => `${q.label.replace(/[?:]+$/, '').trim()}: ${selected[i]}`).join(', ');
          onSubmit?.(text);
        }}
        style={{
          marginTop: 4,
          fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600,
          padding: '4px 12px', borderRadius: 4,
          border: `1px solid ${allAnswered && !submitted ? c : c + '30'}`,
          background: allAnswered && !submitted ? c + '18' : 'transparent',
          color: allAnswered && !submitted ? c : c + '40',
          cursor: allAnswered && !submitted ? 'pointer' : 'default',
          transition: 'background 0.12s, border-color 0.12s',
        }}
      >
        {submitted ? 'Submitted' : submitLabel}
      </button>
    </div>
  );
}

// ─── ChatMarkdown ───────────────────────────────────────────────────────────

type ChatMarkdownProps = {
  text: string;
  accent?: string;
  onQuickReply?: (text: string) => void;
};

export default function ChatMarkdown({ text, accent, onQuickReply }: ChatMarkdownProps) {
  const processInline = (s: string): React.ReactNode[] => {
    const parts = s.split(/(==[^=]+=+=|==\S[^=]*\S==|\*\*[^*]+\*\*|~~[^~\n]+~~|`[^`]+`|_[^_\n]+_|\[[^\]]+\]\((?:tana|gmail):[^)]+\))/g);
    const nodes: React.ReactNode[] = [];
    parts.forEach((p, j) => {
      const tanaMatch = p.match(TANA_LINK_RE);
      if (tanaMatch) {
        nodes.push(<span key={j} onClick={() => openTanaNode(tanaMatch[2])} style={{
          color: accent || 'var(--blue)', cursor: 'pointer', fontWeight: 600,
          borderBottom: `1.5px solid ${accent || 'var(--blue)'}40`, paddingBottom: 0.5,
        }}>{tanaMatch[1]}</span>);
        return;
      }
      const gmailMatch = p.match(GMAIL_LINK_RE);
      if (gmailMatch) {
        nodes.push(<span key={j} onClick={() => openGmail(gmailMatch[2], gmailMatch[3])} style={{
          color: accent || 'var(--blue)', cursor: 'pointer', fontWeight: 600,
          borderBottom: `1.5px solid ${accent || 'var(--blue)'}40`, paddingBottom: 0.5,
        }}>{gmailMatch[1]}</span>);
        return;
      }
      if (p.startsWith('==') && p.endsWith('==')) {
        nodes.push(<mark key={j} style={{
          background: 'linear-gradient(transparent 60%, var(--highlight) 60%)',
          color: 'var(--text)', padding: 0, borderRadius: 0,
        }}>{p.slice(2, -2)}</mark>);
        return;
      }
      if (p.startsWith('**') && p.endsWith('**')) {
        nodes.push(<strong key={j} style={{ color: accent || 'var(--text)' }}>{p.slice(2, -2)}</strong>);
        return;
      }
      if (p.startsWith('`') && p.endsWith('`')) {
        nodes.push(<code key={j} style={{
          fontFamily: 'var(--font-mono)', fontSize: '0.9em',
          background: 'var(--bg-2)', padding: '1px 4px', borderRadius: 3,
          color: accent || 'var(--text)',
        }}>{p.slice(1, -1)}</code>);
        return;
      }
      if (p.startsWith('~~') && p.endsWith('~~')) {
        nodes.push(<s key={j} style={{ color: 'var(--text-3)', textDecoration: 'line-through' }}>{p.slice(2, -2)}</s>);
        return;
      }
      if (p.startsWith('_') && p.endsWith('_')) {
        nodes.push(<em key={j} style={{ fontStyle: 'italic', color: 'var(--text-2)' }}>{p.slice(1, -1)}</em>);
        return;
      }
      nodes.push(...expandEmoji(p, `${j}`));
    });
    return nodes;
  };

  const parseTableCells = (row: string) =>
    row.replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
  const isSeparator = (row: string) => /^\|[\s\-:|]+\|$/.test(row.trim());

  const parsed = useMemo(() => {
    const lines = text.split('\n');
    const blocks: { type: 'line' | 'table' | 'form'; content: string[] }[] = [];
    let i = 0;
    while (i < lines.length) {
      const t = lines[i].trim();
      if (t.startsWith('|') && t.endsWith('|')) {
        const tableLines: string[] = [];
        while (i < lines.length && lines[i].trim().startsWith('|') && lines[i].trim().endsWith('|')) {
          tableLines.push(lines[i].trim());
          i++;
        }
        blocks.push({ type: 'table', content: tableLines });
      } else if (/^\[form(\s|:|])/i.test(t)) {
        const formLines: string[] = [t];
        i++;
        while (i < lines.length && !/^\[\/form\]/i.test(lines[i].trim())) {
          formLines.push(lines[i].trim());
          i++;
        }
        if (i < lines.length) i++;
        blocks.push({ type: 'form', content: formLines });
      } else {
        blocks.push({ type: 'line', content: [lines[i]] });
        i++;
      }
    }
    return blocks;
  }, [text]);

  return (
    <div>
      {parsed.map((block, bi) => {
        if (block.type === 'form') {
          const headerLine = block.content[0];
          const submitLabel = headerLine.match(/"([^"]+)"/)?.[1] || 'Submit';
          const questions = block.content.slice(1).map(line => {
            const parts = line.split('::');
            const label = parts[0].trim();
            const options = (parts[1] || '').split('|').map(o => o.trim()).filter(Boolean);
            return { label, options, freeText: options.length === 0 };
          }).filter(q => q.label);
          if (questions.length === 0) return null;
          return (
            <FormBlock
              key={bi}
              questions={questions}
              submitLabel={submitLabel}
              accent={accent}
              onSubmit={onQuickReply}
            />
          );
        }
        if (block.type === 'table') {
          const rows = block.content.filter(r => !isSeparator(r));
          if (rows.length === 0) return null;
          const header = parseTableCells(rows[0]);
          const body = rows.slice(1).map(r => parseTableCells(r));
          return (
            <table key={bi} style={{
              width: '100%', borderCollapse: 'collapse', margin: '6px 0',
              fontFamily: 'var(--font-mono)', fontSize: '10px',
            }}>
              <thead>
                <tr>
                  {header.map((h, hi) => (
                    <th key={hi} style={{
                      textAlign: 'left', padding: '3px 6px', fontWeight: 600,
                      borderBottom: `1px solid ${accent || 'var(--border)'}`,
                      color: accent || 'var(--text)',
                    }}>{processInline(h)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {body.map((row, ri) => (
                  <tr key={ri}>
                    {row.map((cell, ci) => (
                      <td key={ci} style={{
                        padding: '2px 6px',
                        borderBottom: '1px solid var(--border)',
                        color: 'var(--text-2)',
                      }}>{processInline(cell)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          );
        }

        const line = block.content[0];
        const t = line.trim();
        if (!t) return <div key={bi} style={{ height: 6 }} />;
        if (/^---+$/.test(t))
          return <hr key={bi} style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '6px 0' }} />;
        if (t.startsWith('### '))
          return <div key={bi} style={{ fontWeight: 600, fontSize: 11.5, marginTop: 6, color: accent }}>{processInline(t.slice(4))}</div>;
        if (t.startsWith('## '))
          return <div key={bi} style={{ fontWeight: 600, fontSize: 12, marginTop: 8, color: accent }}>{processInline(t.slice(3))}</div>;
        if (t.startsWith('> '))
          return (
            <div key={bi} style={{
              borderLeft: `2px solid ${accent || 'var(--border)'}`,
              paddingLeft: 8, margin: '2px 0',
              color: 'var(--text-2)', fontStyle: 'italic',
            }}>
              {processInline(t.slice(2))}
            </div>
          );
        if (t.startsWith('- '))
          return (
            <div key={bi} style={{ paddingLeft: 10, position: 'relative' }}>
              <span style={{ position: 'absolute', left: 1, color: accent || 'var(--text-3)' }}>·</span>
              {processInline(t.slice(2))}
            </div>
          );
        if (/^\d+\.\s/.test(t))
          return (
            <div key={bi} style={{ paddingLeft: 10, position: 'relative' }}>
              <span style={{ position: 'absolute', left: 0, color: 'var(--text-3)', fontSize: '0.9em' }}>
                {t.match(/^(\d+\.)/)?.[1]}
              </span>
              <span style={{ paddingLeft: 6 }}>{processInline(t.replace(/^\d+\.\s*/, ''))}</span>
            </div>
          );
        const qrMatch = t.match(/^\[quick-reply:\s*(.+)\]$/);
        if (qrMatch) {
          const options = qrMatch[1].split('|').map(o => o.trim().replace(/^"(.*)"$/, '$1'));
          return (
            <div key={bi} style={{ display: 'flex', flexWrap: 'wrap', gap: 3, margin: '6px 0' }}>
              {options.map((opt, oi) => (
                <button
                  key={oi}
                  onClick={() => onQuickReply?.(opt)}
                  style={{
                    fontFamily: 'var(--font-mono)', fontSize: 10,
                    padding: '4px 8px', borderRadius: 4, minWidth: 28, textAlign: 'center' as const,
                    border: `1px solid ${accent || 'var(--border)'}`,
                    background: 'transparent',
                    color: accent || 'var(--text)',
                    cursor: onQuickReply ? 'pointer' : 'default',
                    transition: 'background 0.12s',
                  }}
                  onMouseEnter={e => { if (onQuickReply) e.currentTarget.style.background = (accent || 'var(--text)') + '12'; }}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  {opt}
                </button>
              ))}
            </div>
          );
        }
        return <div key={bi}>{processInline(t)}</div>;
      })}
    </div>
  );
}
