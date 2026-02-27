"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { Reply, ListChecks, Calendar, Archive, Trash2, CornerUpRight, User, GraduationCap, RefreshCw, Loader2, ExternalLink, FileText, Send, X, Play } from "lucide-react";
import { useChatTrigger } from "@/lib/chat-store";
import { logAction } from "@/lib/action-log";
import { charColor } from "@/lib/char-icons";

type Email = {
  id: string;
  threadId: string;
  from: string;
  subject: string;
  snippet: string;
  date: string;
  unread: boolean;
  account: "personal" | "school";
  labels: string[];
  threadCount?: number;
  accounts?: string[];
};

const accountStyle: Record<string, { color: string; icon: React.ElementType }> = {
  personal: { color: "var(--blue)",  icon: User           },
  school:   { color: "var(--amber)", icon: GraduationCap  },
};

function buildEmailColor(patterns: Record<string, string>): (from: string, subject: string) => string {
  const compiled = Object.entries(patterns).map(([color, pattern]) => ({
    regex: new RegExp(pattern, 'i'),
    color,
  }));
  return (from: string, subject: string) => {
    const text = `${from} ${subject}`;
    for (const { regex, color } of compiled) {
      if (regex.test(text)) return color;
    }
    return "";
  };
}

const ACCOUNT_BORDER: Record<string, string> = {
  personal: "#4f46e5",  // indigo
  school:   "#db2777",  // pink
};

// Standard labels — user-specific labels added from config
const DEFAULT_LABEL_COLORS: Record<string, { color: string; bg: string }> = {
  "to respond":   { color: "#b45309", bg: "#fef3c7" },
  "needs reply":  { color: "#b45309", bg: "#fef3c7" },
  "to do":        { color: "#dc2626", bg: "#fee2e2" },
  "fyi":          { color: "#6b7280", bg: "#f3f4f6" },
  "waiting":      { color: "#2563eb", bg: "#dbeafe" },
  "important":    { color: "#dc2626", bg: "#fee2e2" },
  "starred":      { color: "#d97706", bg: "#fef3c7" },
};

function buildLabelStyle(extraLabels: Record<string, { color: string; bg: string }>): (lbl: string) => { color: string; bg: string } {
  const merged = { ...DEFAULT_LABEL_COLORS, ...extraLabels };
  return (lbl: string) => {
    const key = lbl.toLowerCase();
    if (merged[key]) return merged[key];
    let hash = 0;
    for (let i = 0; i < key.length; i++) hash = key.charCodeAt(i) + ((hash << 5) - hash);
    const hue = Math.abs(hash) % 360;
    return { color: `hsl(${hue}, 50%, 35%)`, bg: `hsl(${hue}, 40%, 95%)` };
  };
}

// Default character for each inbox action (lowercase ID matching character JSON)
const ACTION_DEFAULTS: Record<string, string> = {
  task: "postman", schedule: "clerk", reply: "postman", summarize: "postman",
};

// AI actions → default character + seed template
const AI_ACTIONS: Record<string, { defaultChar: string; seed: (email: Email) => string }> = {
  task:      { defaultChar: ACTION_DEFAULTS.task,     seed: (e) => `Extract tasks from this email: [${e.subject}](gmail:${e.threadId}:${e.account})` },
  schedule:  { defaultChar: ACTION_DEFAULTS.schedule, seed: (e) => `Create a calendar event from this email: [${e.subject}](gmail:${e.threadId}:${e.account})` },
};

function capitalize(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1); }

const GMAIL_ACCOUNT_INDEX: Record<string, number> = { personal: 0, school: 1 };

function gmailUrl(threadId: string, account: string): string {
  const idx = GMAIL_ACCOUNT_INDEX[account] ?? 0;
  return `https://mail.google.com/mail/u/${idx}/#inbox/${threadId}`;
}

const itemActions = [
  { icon: ExternalLink,  label: "Open",      colorClass: "item-action-btn-blue"  },
  { icon: FileText,      label: "Summarize", colorClass: "item-action-btn-blue"  },
  { icon: Reply,         label: "Reply",     colorClass: "item-action-btn-blue"  },
  { icon: ListChecks, label: "Task",      colorClass: "item-action-btn-green" },
  { icon: Calendar,      label: "Schedule",  colorClass: "item-action-btn-blue"  },
  { icon: Archive,       label: "Archive",   colorClass: "item-action-btn-amber" },
  { icon: Trash2,        label: "Delete",    colorClass: "item-action-btn-red"   },
];

function formatTime(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 86_400_000);
    const emailDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());

    if (emailDay.getTime() === today.getTime()) {
      return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    }
    if (emailDay.getTime() === yesterday.getTime()) return "Yesterday";
    const days = Math.floor((today.getTime() - emailDay.getTime()) / 86_400_000);
    if (days < 7) return `${days}d ago`;
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  } catch { return ""; }
}

export default function InboxWidget() {
  const [emails, setEmails] = useState<Email[]>([]);
  const [unread, setUnread] = useState<{ personal: number; school: number }>({ personal: 0, school: 0 });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [replyEmail, setReplyEmail] = useState<Email | null>(null);
  const [replyInput, setReplyInput] = useState("");
  const [taskEmail, setTaskEmail] = useState<Email | null>(null);
  const [taskInput, setTaskInput] = useState("");
  const [taskChar, setTaskChar] = useState(capitalize(ACTION_DEFAULTS.task));
  const [characters, setCharacters] = useState<{ id: string; name: string }[]>([]);
  const [summaryEmail, setSummaryEmail] = useState<Email | null>(null);
  const [summaryText, setSummaryText] = useState("");
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [labelStyle, setLabelStyle] = useState<(lbl: string) => { color: string; bg: string }>(() => buildLabelStyle({}));
  const replyRef = useRef<HTMLTextAreaElement>(null);
  const taskRef = useRef<HTMLInputElement>(null);
  const { setTrigger } = useChatTrigger();

  const fetchEmails = useCallback(() => {
    setLoading(true);
    fetch("/api/inbox")
      .then(r => r.json())
      .then(d => {
        setEmails(d.emails || []);
        setUnread(d.unread || { personal: 0, school: 0 });
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => { fetchEmails(); }, [fetchEmails]);

  useEffect(() => {
    fetch("/api/characters").then(r => r.json())
      .then((d: { characters: { id: string; name: string; tier: string }[] }) => {
        setCharacters((d.characters || []).filter(c => c.tier !== "meta"));
      })
      .catch(() => {});
    fetch("/api/system/config").then(r => r.json())
      .then(d => {
        if (d.emailLabelColors) setLabelStyle(() => buildLabelStyle(d.emailLabelColors));
      })
      .catch(() => {});
  }, []);

  // Direct actions: archive, delete, postman (no AI, instant)
  const runDirectAction = async (action: string, email: Email) => {
    setBusy(prev => new Set(prev).add(email.id));
    try {
      const res = await fetch("/api/inbox/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          emailId: email.id,
          threadId: email.threadId,
          account: email.account,
          from: email.from,
          subject: email.subject,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        logAction({
          widget: "inbox",
          action,
          target: `${email.from}: ${email.subject}`.slice(0, 80),
        });
        if (action === "archive" || action === "delete") {
          setEmails(prev => prev.filter(e => e.id !== email.id));
        }
      }
    } finally {
      setBusy(prev => { const n = new Set(prev); n.delete(email.id); return n; });
    }
  };

  // AI actions: reply, task, schedule → fetch body, trigger Chat
  const runAIAction = async (action: string, email: Email, opts?: { userPrompt?: string; charOverride?: string }) => {
    const mapping = AI_ACTIONS[action];
    if (!mapping) return;

    setBusy(prev => new Set(prev).add(email.id));
    setTaskEmail(null);
    setTaskInput("");

    try {
      // Fetch email body for context
      const res = await fetch("/api/inbox/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "body",
          emailId: email.id,
          account: email.account,
        }),
      });
      const data = await res.json();
      const body = data.body || email.snippet;

      const context = `Email Message ID: ${email.id} (${email.account} account) — use read_email to see full thread if needed.\nThread ID: ${email.threadId}\nFrom: ${email.from}\nSubject: ${email.subject}\n\n${body}`;

      const charName = opts?.charOverride || capitalize(mapping.defaultChar);
      const seed = opts?.userPrompt
        ? `${opts.userPrompt}\n\nEmail: [${email.subject}](gmail:${email.threadId}:${email.account})`
        : mapping.seed(email);

      setTrigger({
        charName,
        seedPrompt: seed,
        action,
        context,
      });

      logAction({
        widget: "inbox",
        action,
        target: `${email.from}: ${email.subject}`.slice(0, 80),
        character: charName,
      });
    } finally {
      setBusy(prev => { const n = new Set(prev); n.delete(email.id); return n; });
    }
  };

  const handleAction = (label: string, email: Email) => {
    if (busy.has(email.id)) return;
    const action = label.toLowerCase();
    if (action === "open") {
      window.open(gmailUrl(email.threadId, email.account), "_blank");
    } else if (action === "reply") {
      setReplyEmail(email);
      setReplyInput("");
      setTimeout(() => replyRef.current?.focus(), 50);
    } else if (action === "summarize") {
      runSummarize(email);
    } else if (action === "archive" || action === "delete") {
      runDirectAction(action, email);
    } else if (action === "task") {
      setTaskEmail(email);
      setTaskInput("");
      setTimeout(() => taskRef.current?.focus(), 50);
    } else if (action === "schedule") {
      runAIAction(action, email);
    }
  };

  const submitReply = async (email: Email, notes: string) => {
    if (!notes.trim()) return;
    setBusy(prev => new Set(prev).add(email.id));
    setReplyEmail(null);
    setReplyInput("");

    try {
      const res = await fetch("/api/inbox/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "body", emailId: email.id, account: email.account }),
      });
      const data = await res.json();
      const body = data.body || email.snippet;

      const context = `Email Message ID: ${email.id} (${email.account} account) — use read_email to see full thread if needed.\nThread ID: ${email.threadId}\nFrom: ${email.from}\nSubject: ${email.subject}\n\n${body}`;

      const replyChar = capitalize(ACTION_DEFAULTS.reply);
      setTrigger({
        charName: replyChar,
        seedPrompt: `Draft a reply to this email: [${email.subject}](gmail:${email.threadId}:${email.account})\n\nSave as Gmail draft in the ${email.account} account. Use the communication-style skill for writing voice.\n\nMy notes for the reply:\n${notes}`,
        action: "reply",
        context,
      });

      logAction({
        widget: "inbox",
        action: "reply",
        target: `${email.from}: ${email.subject}`.slice(0, 80),
        character: replyChar,
      });
    } finally {
      setBusy(prev => { const n = new Set(prev); n.delete(email.id); return n; });
    }
  };

  const runSummarize = async (email: Email) => {
    setSummaryEmail(email);
    setSummaryText("");
    setSummaryLoading(true);
    setReplyEmail(null);

    try {
      const res = await fetch("/api/inbox/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "summarize",
          emailId: email.id,
          account: email.account,
          from: email.from,
          subject: email.subject,
        }),
      });
      const data = await res.json();
      setSummaryText(data.summary || "Failed to generate summary.");
      logAction({
        widget: "inbox",
        action: "summarize",
        target: `${email.from}: ${email.subject}`.slice(0, 80),
        character: capitalize(ACTION_DEFAULTS.summarize),
      });
    } catch {
      setSummaryText("Error generating summary.");
    } finally {
      setSummaryLoading(false);
    }
  };

  return (
    <div className="widget">
      <div className="widget-header">
        <span className="widget-header-label">Inbox</span>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {(["personal", "school"] as const).map((key) => {
            const s = accountStyle[key];
            const Icon = s.icon;
            const count = unread[key];
            return (
              <span key={key} style={{ display: "flex", alignItems: "center", gap: 4, fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-3)" }}>
                <Icon size={11} strokeWidth={1.5} style={{ color: s.color }} />
                <span style={{ color: s.color, fontWeight: 600 }}>{loading ? "..." : count}</span>
              </span>
            );
          })}
          <button className="widget-toolbar-btn" data-tip="Refresh" onClick={fetchEmails}>
            <RefreshCw size={12} strokeWidth={1.5} style={loading ? { animation: "spin 1s linear infinite" } : undefined} />
          </button>
        </div>
      </div>

      <div className="widget-body" style={{ padding: 0 }}>
        {loading && emails.length === 0 && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 20, gap: 8 }}>
            <Loader2 size={14} strokeWidth={1.5} style={{ color: "var(--text-3)", animation: "spin 1s linear infinite" }} />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-3)" }}>Loading emails...</span>
          </div>
        )}

        {emails.map((email, i) => {
          const accts = email.accounts || [email.account];
          const isBusy = busy.has(email.id);
          const borderColor = ACCOUNT_BORDER[email.account] || "#94a3b8";
          return (
            <div
              className="item-row"
              key={email.threadId}
              style={{
                borderBottom: i < emails.length - 1 ? "1px solid var(--border)" : "none",
                borderLeft: `3px solid ${borderColor}`,
                opacity: isBusy ? 0.6 : 1,
              }}
            >
              <div style={{ padding: "9px 16px 6px", cursor: "pointer" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                  <span style={{
                    fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 500,
                    color: "var(--text)", flex: 1, overflow: "hidden",
                    textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {email.from}
                  </span>
                  {(email.threadCount ?? 1) > 1 && (
                    <span style={{
                      fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 600,
                      color: "var(--text-3)", background: "var(--bg-2)",
                      padding: "0 4px", borderRadius: 3, lineHeight: "16px",
                    }}>
                      {email.threadCount}
                    </span>
                  )}
                  {accts.map((acc) => {
                    const s = accountStyle[acc];
                    if (!s) return null;
                    const AccIcon = s.icon;
                    return <AccIcon key={acc} size={11} strokeWidth={1.5} style={{ color: s.color, flexShrink: 0 }} />;
                  })}
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-3)", flexShrink: 0 }}>
                    {formatTime(email.date)}
                  </span>
                </div>

                <div style={{
                  fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-2)",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  marginBottom: email.labels.length > 0 ? 5 : 0,
                }}>
                  {email.subject}
                </div>

                {email.labels.length > 0 && (
                  <div style={{ display: "flex", gap: 4 }}>
                    {email.labels.map((lbl) => {
                      const lc = labelStyle(lbl);
                      return (
                        <span key={lbl} style={{
                          fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 500,
                          color: lc.color, background: lc.bg,
                          padding: "1px 5px", borderRadius: 2,
                          textTransform: "uppercase", letterSpacing: "0.04em",
                        }}>
                          {lbl}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>

              {summaryEmail?.id === email.id && (
                <div style={{
                  borderTop: "1px solid var(--border)", background: "var(--surface-2)",
                  padding: "8px 12px", display: "flex", flexDirection: "column" as const, gap: 6,
                }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-3)", textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>
                      Summary
                    </span>
                    <button className="item-action-btn" data-tip="Close" onClick={() => { setSummaryEmail(null); setSummaryText(""); }} style={{ cursor: "pointer" }}>
                      <X size={10} strokeWidth={1.5} />
                    </button>
                  </div>
                  {summaryLoading ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 0" }}>
                      <Loader2 size={12} strokeWidth={1.5} style={{ color: "var(--text-3)", animation: "spin 1s linear infinite" }} />
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-3)" }}>Summarizing...</span>
                    </div>
                  ) : (
                    <div style={{
                      fontFamily: "var(--font-body)", fontSize: 11, lineHeight: 1.55,
                      color: "var(--text)", background: "var(--surface)",
                      border: "1px solid var(--border)", borderRadius: 4,
                      padding: "8px 10px", whiteSpace: "pre-wrap" as const,
                    }}>
                      {summaryText}
                    </div>
                  )}
                  {!summaryLoading && summaryText && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <button
                        className="item-action-btn item-action-btn-blue"
                        data-tip="Reply to this email"
                        onClick={() => {
                          setSummaryEmail(null);
                          setSummaryText("");
                          setReplyEmail(email);
                          setReplyInput("");
                          setTimeout(() => replyRef.current?.focus(), 50);
                        }}
                        style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 3, width: "auto", padding: "0 6px", fontFamily: "var(--font-mono)", fontSize: 9 }}
                      >
                        <Reply size={10} strokeWidth={1.5} />
                        Reply
                      </button>
                    </div>
                  )}
                </div>
              )}

              {replyEmail?.id === email.id && !isBusy && (
                <div style={{
                  borderTop: "1px solid var(--border)", background: "var(--surface-2)",
                  padding: "8px 12px", display: "flex", flexDirection: "column" as const, gap: 6,
                }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-3)", textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>
                      Reply notes
                    </span>
                    <button className="item-action-btn" data-tip="Cancel" onClick={() => { setReplyEmail(null); setReplyInput(""); }} style={{ cursor: "pointer" }}>
                      <X size={10} strokeWidth={1.5} />
                    </button>
                  </div>
                  <textarea
                    ref={replyRef}
                    value={replyInput}
                    onChange={e => setReplyInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter" && e.metaKey) submitReply(email, replyInput);
                      if (e.key === "Escape") { setReplyEmail(null); setReplyInput(""); }
                    }}
                    placeholder="What should the reply say..."
                    rows={3}
                    style={{
                      fontFamily: "var(--font-body)", fontSize: 11, lineHeight: 1.5,
                      background: "var(--surface)", border: "1px solid var(--border)",
                      borderRadius: 4, padding: "6px 8px", color: "var(--text)",
                      outline: "none", resize: "vertical" as const, minHeight: 56,
                    }}
                  />
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <button
                      className="item-action-btn item-action-btn-blue"
                      data-tip="Send to Postman (⌘↵)"
                      onClick={() => submitReply(email, replyInput)}
                      style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 3, width: "auto", padding: "0 6px", fontFamily: "var(--font-mono)", fontSize: 9 }}
                    >
                      <Send size={10} strokeWidth={1.5} />
                      Draft
                    </button>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-3)" }}>⌘↵</span>
                  </div>
                </div>
              )}

              {taskEmail?.id === email.id && !isBusy && (
                <div style={{
                  borderTop: "1px solid var(--border)", background: "var(--surface-2)",
                  padding: "8px 12px", display: "flex", flexDirection: "column" as const, gap: 6,
                }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-3)", textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>
                      Task from email
                    </span>
                    <button className="item-action-btn" data-tip="Cancel" onClick={() => { setTaskEmail(null); setTaskInput(""); }} style={{ cursor: "pointer" }}>
                      <X size={10} strokeWidth={1.5} />
                    </button>
                  </div>
                  <input
                    ref={taskRef}
                    value={taskInput}
                    onChange={e => setTaskInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter") runAIAction("task", email, { userPrompt: taskInput.trim() || undefined, charOverride: taskChar });
                      if (e.key === "Escape") { setTaskEmail(null); setTaskInput(""); }
                    }}
                    placeholder="What should be done... (optional)"
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
                      onChange={e => setTaskChar(e.target.value)}
                      style={{
                        fontFamily: "var(--font-mono)", fontSize: 10,
                        background: "var(--surface)", border: "1px solid var(--border)",
                        borderRadius: 4, padding: "3px 6px", color: "var(--text)",
                        outline: "none",
                        borderLeft: `3px solid ${charColor[taskChar.toLowerCase()] || "var(--text-3)"}`,
                      }}
                    >
                      {(characters.length > 0 ? characters : [{ id: ACTION_DEFAULTS.task, name: capitalize(ACTION_DEFAULTS.task) }]).map(c => (
                        <option key={c.id} value={c.name}>{c.name}</option>
                      ))}
                    </select>
                    <button
                      className="item-action-btn item-action-btn-green"
                      data-tip="Extract tasks automatically (Postman)"
                      onClick={() => runAIAction("task", email, { charOverride: capitalize(ACTION_DEFAULTS.task) })}
                      style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 3, width: "auto", padding: "0 6px", fontFamily: "var(--font-mono)", fontSize: 9 }}
                    >
                      <ListChecks size={10} strokeWidth={1.5} />
                      Extract
                    </button>
                    <button
                      className="item-action-btn item-action-btn-blue"
                      data-tip="Send to character with context"
                      onClick={() => runAIAction("task", email, { userPrompt: taskInput.trim() || undefined, charOverride: taskChar })}
                      style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 3, width: "auto", padding: "0 6px", fontFamily: "var(--font-mono)", fontSize: 9 }}
                    >
                      <Play size={10} strokeWidth={1.5} />
                      Go
                    </button>
                  </div>
                </div>
              )}

              <div className="item-actions" style={{ padding: "0 16px 6px" }}>
                {itemActions.map(({ icon: ActionIcon, label, colorClass }) => (
                  <button
                    key={label}
                    className={`item-action-btn ${colorClass}`}
                    data-tip={label}
                    disabled={isBusy}
                    onClick={() => handleAction(label, email)}
                    style={{ cursor: isBusy ? "not-allowed" : "pointer" }}
                  >
                    <ActionIcon size={12} strokeWidth={1.5} />
                  </button>
                ))}
                <div style={{ flex: 1 }} />
                <button
                  className="item-action-btn"
                  data-tip="Send to Postman"
                  disabled={isBusy}
                  onClick={() => runDirectAction("postman", email)}
                  style={{
                    display: "flex", alignItems: "center", gap: 3,
                    fontFamily: "var(--font-mono)", fontSize: 9,
                    width: "auto", padding: "0 5px",
                    cursor: isBusy ? "not-allowed" : "pointer",
                  }}
                >
                  <CornerUpRight size={9} strokeWidth={1.5} />
                  Postman
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
