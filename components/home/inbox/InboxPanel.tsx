"use client";
import { useState, useEffect, useCallback } from "react";
import { Mail, RefreshCw, Loader2, User, GraduationCap } from "lucide-react";
import { useFetchAPI, useBusy } from "@/hooks";
import { useSharedData } from "@/lib/shared-data";
import { useChatTrigger } from "@/lib/chat-store";
import { logAction } from "@/lib/action-log";
import { buildColorMatcher } from "@/lib/colors";
import type { Email } from "@/types";
import EmailItem from "./EmailItem";
import SummaryPanel from "./SummaryPanel";
import ReplyPanel from "./ReplyPanel";
import TaskPanel from "./TaskPanel";

// --- Label style helpers ---

const DEFAULT_LABEL_COLORS: Record<string, { color: string; bg: string }> = {
  "to respond":  { color: "var(--amber)",  bg: "var(--amber-bg)" },
  "needs reply": { color: "var(--amber)",  bg: "var(--amber-bg)" },
  "to do":       { color: "var(--red)",    bg: "var(--red-bg)"   },
  "fyi":         { color: "var(--text-3)", bg: "var(--surface-2)" },
  "waiting":     { color: "var(--blue)",   bg: "var(--blue-bg)"  },
  "important":   { color: "var(--red)",    bg: "var(--red-bg)"   },
  "starred":     { color: "var(--amber)",  bg: "var(--amber-bg)" },
};

function buildLabelStyle(
  extraLabels: Record<string, { color: string; bg: string }>
): (lbl: string) => { color: string; bg: string } {
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

// --- Constants ---

function capitalize(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1); }

const GMAIL_ACCOUNT_INDEX: Record<string, number> = { personal: 0, school: 1 };

function gmailUrl(threadId: string, account: string): string {
  const idx = GMAIL_ACCOUNT_INDEX[account] ?? 0;
  return `https://mail.google.com/mail/u/${idx}/#inbox/${threadId}`;
}

const ACTION_DEFAULTS: Record<string, string> = {
  task: "postman", schedule: "steward", reply: "postman", summarize: "postman",
};

const AI_ACTIONS: Record<string, { defaultChar: string; seed: (email: Email) => string }> = {
  task:     { defaultChar: ACTION_DEFAULTS.task,     seed: (e) => `Extract tasks from this email: [${e.subject}](gmail:${e.threadId}:${e.account})` },
  schedule: { defaultChar: ACTION_DEFAULTS.schedule, seed: (e) => `Create a calendar event from this email: [${e.subject}](gmail:${e.threadId}:${e.account})` },
};

const accountStyle: Record<string, { color: string; icon: React.ElementType }> = {
  personal: { color: "var(--blue)",  icon: User          },
  school:   { color: "var(--amber)", icon: GraduationCap },
};

// --- InboxPanel ---

interface InboxAPIResponse {
  emails: Email[];
  unread: { personal: number; school: number };
}

export default function InboxPanel() {
  const { isBusy, markBusy, clearBusy } = useBusy();
  const { characters: allCharacters, config: sharedConfig } = useSharedData();
  const characters = allCharacters.filter(c => c.tier !== "meta");
  const { setTrigger } = useChatTrigger();

  const { data, loading, refetch } = useFetchAPI<InboxAPIResponse>("/api/inbox", {
    transform: (raw) => ({ emails: raw.emails || [], unread: raw.unread || { personal: 0, school: 0 } }),
    pollInterval: 10 * 60 * 1000,
  });

  const emails = data?.emails ?? [];
  const unread = data?.unread ?? { personal: 0, school: 0 };

  // Per-email expansion state
  const [summaryEmail, setSummaryEmail] = useState<Email | null>(null);
  const [summaryText, setSummaryText] = useState("");
  const [summaryLoading, setSummaryLoading] = useState(false);

  const [replyEmail, setReplyEmail] = useState<Email | null>(null);
  const [replyInput, setReplyInput] = useState("");

  const [taskEmail, setTaskEmail] = useState<Email | null>(null);
  const [taskInput, setTaskInput] = useState("");
  const [taskChar, setTaskChar] = useState(capitalize(ACTION_DEFAULTS.task));

  // Color/label style built from config
  const [labelStyle, setLabelStyle] = useState<(lbl: string) => { color: string; bg: string }>(
    () => buildLabelStyle({})
  );
  const [emailColorFn, setEmailColorFn] = useState<(from: string, subject: string) => string | null>(
    () => () => null
  );

  // Mutable email list for optimistic removes
  const [localEmails, setLocalEmails] = useState<Email[]>([]);
  const [localUnread, setLocalUnread] = useState<{ personal: number; school: number }>({ personal: 0, school: 0 });

  useEffect(() => {
    if (data) {
      setLocalEmails(data.emails);
      setLocalUnread(data.unread);
    }
  }, [data]);

  useEffect(() => {
    if (sharedConfig.emailLabelColors) {
      setLabelStyle(() => buildLabelStyle(sharedConfig.emailLabelColors!));
    }
    if (sharedConfig.emailColorPatterns) {
      const matcher = buildColorMatcher(sharedConfig.emailColorPatterns);
      setEmailColorFn(() => (from: string, subject: string) => matcher(`${from} ${subject}`));
    }
  }, [sharedConfig]);

  // --- Actions ---

  const runDirectAction = useCallback(async (action: string, email: Email) => {
    markBusy(email.id);
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
      const rawResult = await res.json();
      const result = rawResult?.data ?? rawResult;
      if (result.ok) {
        logAction({ widget: "inbox", action, target: `${email.from}: ${email.subject}`.slice(0, 80) });
        if (action === "archive" || action === "delete") {
          setLocalEmails(prev => prev.filter(e => e.id !== email.id));
          if (email.unread) {
            setLocalUnread(prev => ({
              ...prev,
              [email.account]: Math.max(0, prev[email.account] - 1),
            }));
          }
        }
      }
    } finally {
      clearBusy(email.id);
    }
  }, [markBusy, clearBusy]);

  const runAIAction = useCallback(async (
    action: string,
    email: Email,
    opts?: { userPrompt?: string; charOverride?: string }
  ) => {
    const mapping = AI_ACTIONS[action];
    if (!mapping) return;
    markBusy(email.id);
    setTaskEmail(null);
    setTaskInput("");
    try {
      const res = await fetch("/api/inbox/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "body", emailId: email.id, account: email.account }),
      });
      const rawBody = await res.json();
      const bodyData = rawBody?.data ?? rawBody;
      const body = bodyData.body || email.snippet;
      const context = `Email Message ID: ${email.id} (${email.account} account) — use read_email to see full thread if needed.\nThread ID: ${email.threadId}\nFrom: ${email.from}\nSubject: ${email.subject}\n\n${body}`;
      const charName = opts?.charOverride || capitalize(mapping.defaultChar);
      const seed = opts?.userPrompt
        ? `${opts.userPrompt}\n\nEmail: [${email.subject}](gmail:${email.threadId}:${email.account})`
        : mapping.seed(email);
      setTrigger({ charName, seedPrompt: seed, action, context });
      logAction({ widget: "inbox", action, target: `${email.from}: ${email.subject}`.slice(0, 80), character: charName });
    } finally {
      clearBusy(email.id);
    }
  }, [markBusy, clearBusy, setTrigger]);

  const submitReply = useCallback(async (email: Email, notes: string) => {
    if (!notes.trim()) return;
    markBusy(email.id);
    setReplyEmail(null);
    setReplyInput("");
    try {
      const res = await fetch("/api/inbox/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "body", emailId: email.id, account: email.account }),
      });
      const rawBody2 = await res.json();
      const bodyData = rawBody2?.data ?? rawBody2;
      const body = bodyData.body || email.snippet;
      const context = `Email Message ID: ${email.id} (${email.account} account) — use read_email to see full thread if needed.\nThread ID: ${email.threadId}\nFrom: ${email.from}\nSubject: ${email.subject}\n\n${body}`;
      const replyChar = capitalize(ACTION_DEFAULTS.reply);
      setTrigger({
        charName: replyChar,
        seedPrompt: `Draft a reply to this email: [${email.subject}](gmail:${email.threadId}:${email.account})\n\nSave as Gmail draft in the ${email.account} account. Use the communication-style skill for writing voice.\n\nMy notes for the reply:\n${notes}`,
        action: "reply",
        context,
      });
      logAction({ widget: "inbox", action: "reply", target: `${email.from}: ${email.subject}`.slice(0, 80), character: replyChar });
    } finally {
      clearBusy(email.id);
    }
  }, [markBusy, clearBusy, setTrigger]);

  const runSummarize = useCallback(async (email: Email) => {
    setSummaryEmail(email);
    setSummaryText("");
    setSummaryLoading(true);
    setReplyEmail(null);
    try {
      const res = await fetch("/api/inbox/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "summarize", emailId: email.id, account: email.account, from: email.from, subject: email.subject }),
      });
      const rawSummary = await res.json();
      const result = rawSummary?.data ?? rawSummary;
      setSummaryText(result.summary || "Failed to generate summary.");
      logAction({ widget: "inbox", action: "summarize", target: `${email.from}: ${email.subject}`.slice(0, 80), character: capitalize(ACTION_DEFAULTS.summarize) });
    } catch {
      setSummaryText("Error generating summary.");
    } finally {
      setSummaryLoading(false);
    }
  }, []);

  const handleAction = useCallback((label: string, email: Email) => {
    if (isBusy(email.id)) return;
    const action = label.toLowerCase();
    if (action === "open") {
      window.open(gmailUrl(email.threadId, email.account), "_blank");
    } else if (action === "reply") {
      setReplyEmail(email);
      setReplyInput("");
    } else if (action === "summarize") {
      runSummarize(email);
    } else if (action === "archive" || action === "delete") {
      runDirectAction(action, email);
    } else if (action === "task") {
      setTaskEmail(email);
      setTaskInput("");
    } else if (action === "schedule") {
      runAIAction(action, email);
    }
  }, [isBusy, runSummarize, runDirectAction, runAIAction]);

  return (
    <div className="widget">
      <div className="widget-header">
        <span className="widget-header-label"><Mail size={13} strokeWidth={1.5} /> Inbox</span>
        <div className="row" style={{ gap: 10 }}>
          {(["personal", "school"] as const).map((key) => {
            const s = accountStyle[key];
            const Icon = s.icon;
            const count = localUnread[key];
            return (
              <span key={key} className="row mono-xs" style={{ gap: 4 }}>
                <Icon size={11} strokeWidth={1.5} style={{ color: s.color }} />
                <span style={{ color: s.color, fontWeight: 600 }}>{loading ? "..." : count}</span>
              </span>
            );
          })}
          <button className="widget-toolbar-btn" data-tip="Refresh" onClick={refetch}>
            <RefreshCw size={12} strokeWidth={1.5} style={loading ? { animation: "spin 1s linear infinite" } : undefined} />
          </button>
        </div>
      </div>

      <div className="widget-body" style={{ padding: 0 }}>
        {loading && localEmails.length === 0 && (
          <div className="loading-row">
            <Loader2 size={14} strokeWidth={1.5} style={{ color: "var(--text-3)", animation: "spin 1s linear infinite" }} />
            <span className="mono-xs">Loading emails...</span>
          </div>
        )}

        {localEmails.map((email, i) => (
          <EmailItem
            key={email.threadId}
            email={email}
            isLast={i === localEmails.length - 1}
            isBusy={isBusy(email.id)}
            emailColor={emailColorFn}
            labelStyle={labelStyle}
            onAction={handleAction}
            onPostman={(e) => runDirectAction("postman", e)}
            summarySlot={summaryEmail?.id === email.id ? (
              <SummaryPanel
                text={summaryText}
                loading={summaryLoading}
                onClose={() => { setSummaryEmail(null); setSummaryText(""); }}
                onReply={() => {
                  setSummaryEmail(null);
                  setSummaryText("");
                  setReplyEmail(email);
                  setReplyInput("");
                }}
              />
            ) : undefined}
            replySlot={replyEmail?.id === email.id && !isBusy(email.id) ? (
              <ReplyPanel
                value={replyInput}
                onChange={setReplyInput}
                onSubmit={() => submitReply(email, replyInput)}
                onCancel={() => { setReplyEmail(null); setReplyInput(""); }}
              />
            ) : undefined}
            taskSlot={taskEmail?.id === email.id && !isBusy(email.id) ? (
              <TaskPanel
                taskInput={taskInput}
                onTaskInputChange={setTaskInput}
                taskChar={taskChar}
                onTaskCharChange={setTaskChar}
                characters={characters}
                defaultChar={capitalize(ACTION_DEFAULTS.task)}
                onExtract={() => runAIAction("task", email, { charOverride: capitalize(ACTION_DEFAULTS.task) })}
                onGo={() => {
                  const prompt = taskInput.trim() || "Do the work on this email. Read the context, take the needed action, and when done create a Tana log entry in the relevant track.";
                  runAIAction("task", email, { userPrompt: prompt, charOverride: taskChar });
                }}
                onCancel={() => { setTaskEmail(null); setTaskInput(""); }}
              />
            ) : undefined}
          />
        ))}
      </div>
    </div>
  );
}
