"use client";
import { useState, useEffect, useCallback } from "react";
import { BookOpen, RefreshCw, Loader2, ChevronRight, ChevronDown, CheckCheck, MessageSquare } from "lucide-react";
import type { ClassPrepNode, ChecklistItem } from "@/lib/tana";
import { useChatTrigger } from "@/lib/chat-store";
import { formatWhen, getDateUrgency } from "@/lib/date-format";

function coursePill(course: string): { label: string; color: string } {
  if (/203|204|drawing/i.test(course)) return { label: "VA 204", color: "#7c3aed" };
  if (/315|515|culture/i.test(course)) return { label: "VA 315", color: "#0369a1" };
  return { label: course.slice(0, 8), color: "#64748b" };
}

function ProgressBar({ checked, total }: { checked: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((checked / total) * 100);
  const color = pct === 100 ? "#16a34a" : pct >= 50 ? "#2563eb" : "#94a3b8";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{
        flex: 1, height: 3, borderRadius: 2,
        background: "var(--border)",
        overflow: "hidden",
      }}>
        <div style={{
          width: `${pct}%`, height: "100%",
          background: color,
          transition: "width 0.2s ease",
        }} />
      </div>
      <span style={{
        fontFamily: "var(--font-mono)", fontSize: 9,
        color: pct === 100 ? "#16a34a" : "var(--text-3)",
        fontWeight: pct === 100 ? 600 : 400,
        minWidth: 28, textAlign: "right",
      }}>
        {checked}/{total}
      </span>
    </div>
  );
}

function ChecklistGroup({
  label,
  items,
  toggling,
  onToggle,
}: {
  label: string;
  items: ChecklistItem[];
  toggling: Set<string>;
  onToggle: (item: ChecklistItem) => void;
}) {
  const [open, setOpen] = useState(true);
  if (items.length === 0) return null;
  const done = items.filter(i => i.checked).length;

  return (
    <div style={{ marginTop: 6 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: "flex", alignItems: "center", gap: 4,
          background: "none", border: "none", cursor: "pointer",
          padding: "0 0 2px", width: "100%",
        }}
      >
        {open
          ? <ChevronDown size={9} strokeWidth={2} style={{ color: "var(--text-3)", flexShrink: 0 }} />
          : <ChevronRight size={9} strokeWidth={2} style={{ color: "var(--text-3)", flexShrink: 0 }} />
        }
        <span style={{
          fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 600,
          textTransform: "uppercase", letterSpacing: "0.05em",
          color: done === items.length ? "#16a34a" : "var(--text-3)",
        }}>
          {label}
        </span>
        <span style={{
          fontFamily: "var(--font-mono)", fontSize: 8,
          color: "var(--text-3)", marginLeft: 4,
        }}>
          {done}/{items.length}
        </span>
      </button>

      {open && (
        <div style={{ paddingLeft: 14 }}>
          {items.map(item => {
            const isBusy = toggling.has(item.id);
            return (
              <label
                key={item.id}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "2px 0", cursor: isBusy ? "default" : "pointer",
                  opacity: isBusy ? 0.5 : 1,
                }}
              >
                {isBusy
                  ? <Loader2 size={10} strokeWidth={1.5} style={{ color: "var(--text-3)", animation: "spin 1s linear infinite", flexShrink: 0 }} />
                  : (
                    <input
                      type="checkbox"
                      checked={item.checked}
                      disabled={isBusy}
                      onChange={() => onToggle(item)}
                      style={{ width: 11, height: 11, accentColor: "#2563eb", flexShrink: 0, cursor: "pointer" }}
                    />
                  )
                }
                <span style={{
                  fontFamily: "var(--font-body)", fontSize: 11,
                  color: item.checked ? "var(--text-3)" : "var(--text)",
                  textDecoration: item.checked ? "line-through" : "none",
                  flex: 1,
                }}>
                  {item.text}
                </span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function ClassesTabContent() {
  const [classes, setClasses] = useState<ClassPrepNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [toggling, setToggling] = useState<Set<string>>(new Set());
  // Local optimistic state: nodeId → checked
  const [localChecked, setLocalChecked] = useState<Record<string, boolean>>({});
  const [lessonDoneLoading, setLessonDoneLoading] = useState<string | null>(null);
  const { setTrigger } = useChatTrigger();

  const fetchClasses = useCallback(() => {
    setLoading(true);
    fetch("/api/class-prep")
      .then(r => r.json())
      .then(d => {
        const list = (d.classes || []) as ClassPrepNode[];
        setClasses(list);
        // Auto-expand the next upcoming class
        if (list.length > 0) {
          setExpanded(new Set([list[0].id]));
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => { fetchClasses(); }, [fetchClasses]);

  async function handleToggle(item: ChecklistItem) {
    if (toggling.has(item.id)) return;
    const newChecked = !((localChecked[item.id] !== undefined) ? localChecked[item.id] : item.checked);

    // Optimistic update
    setLocalChecked(prev => ({ ...prev, [item.id]: newChecked }));
    setToggling(prev => new Set(prev).add(item.id));
    // Update the count in classes optimistically
    setClasses(prev => prev.map(c => {
      const inList = c.checklist.some(i => i.id === item.id);
      if (!inList) return c;
      const delta = newChecked ? 1 : -1;
      return { ...c, checkedItems: Math.max(0, Math.min(c.totalItems, c.checkedItems + delta)) };
    }));

    try {
      const res = await fetch("/api/class-prep/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodeId: item.id, checked: newChecked }),
      });
      if (!res.ok) {
        // Revert
        setLocalChecked(prev => ({ ...prev, [item.id]: !newChecked }));
        setClasses(prev => prev.map(c => {
          const inList = c.checklist.some(i => i.id === item.id);
          if (!inList) return c;
          const delta = newChecked ? -1 : 1;
          return { ...c, checkedItems: Math.max(0, Math.min(c.totalItems, c.checkedItems + delta)) };
        }));
      }
    } catch {
      setLocalChecked(prev => ({ ...prev, [item.id]: !newChecked }));
    } finally {
      setToggling(prev => { const n = new Set(prev); n.delete(item.id); return n; });
    }
  }

  async function handlePrepDone(cls: ClassPrepNode) {
    if (lessonDoneLoading) return;
    setLessonDoneLoading(cls.id + '-prep');
    try {
      const prepItems = cls.checklist.filter(i => i.group === 'prep');
      // Mark all prep items done via individual toggles
      await Promise.all(
        prepItems.filter(i => !(localChecked[i.id] !== undefined ? localChecked[i.id] : i.checked))
          .map(item => fetch('/api/class-prep/toggle', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nodeId: item.id, checked: true }),
          }))
      );
      setLocalChecked(prev => {
        const next = { ...prev };
        prepItems.forEach(i => { next[i.id] = true; });
        return next;
      });
      const checkedPostCount = cls.checklist.filter(i => i.group === 'post-lesson' && (localChecked[i.id] !== undefined ? localChecked[i.id] : i.checked)).length;
      setClasses(prev => prev.map(c => c.id === cls.id
        ? { ...c, checkedItems: prepItems.length + checkedPostCount }
        : c
      ));
    } finally {
      setLessonDoneLoading(null);
    }
    setTrigger({
      charName: 'Proctor',
      seedPrompt: `prep done for ${cls.name}. Ready to lesson.`,
      action: 'prep done',
    });
  }

  async function handleLessonDone(cls: ClassPrepNode) {
    if (lessonDoneLoading) return;
    setLessonDoneLoading(cls.id);
    setExpanded(prev => new Set(prev).add(cls.id));
    try {
      await fetch('/api/class-prep/lesson-done', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classNodeId: cls.id }),
      });
      setLocalChecked(prev => {
        const next = { ...prev };
        cls.checklist.filter(i => i.group === 'prep').forEach(i => { next[i.id] = true; });
        return next;
      });
      const prepCount = cls.checklist.filter(i => i.group === 'prep').length;
      setClasses(prev => prev.map(c => c.id === cls.id
        ? { ...c, checkedItems: prepCount + c.checklist.filter(i => i.group === 'post-lesson' && i.checked).length }
        : c
      ));
    } finally {
      setLessonDoneLoading(null);
    }
    setTrigger({
      charName: 'Proctor',
      seedPrompt: `lesson done, ${cls.name}`,
      action: 'lesson done',
    });
  }

  function handleSendToProctor(cls: ClassPrepNode) {
    const allItems = cls.checklist.map(item => ({
      ...item,
      checked: localChecked[item.id] !== undefined ? localChecked[item.id] : item.checked,
    }));
    const prepItems = allItems.filter(i => i.group === 'prep');
    const postItems = allItems.filter(i => i.group === 'post-lesson');

    const fmt = (items: typeof allItems) =>
      items.map(i => `${i.checked ? '✓' : '○'} ${i.text}`).join('\n');

    const checkedCount = allItems.filter(i => i.checked).length;
    const dateStr = cls.date ? formatWhen(cls.date, false) : '';
    const daysCalc = cls.date ? Math.round((new Date(cls.date + "T00:00:00").getTime() - new Date(new Date().toDateString()).getTime()) / 86400000) : null;
    const daysStr = daysCalc === 0 ? 'today' : daysCalc === 1 ? 'tomorrow' : daysCalc !== null ? `in ${daysCalc} days` : '';

    const msg = [
      `${cls.name}${dateStr ? ` — ${dateStr}${daysStr ? ` (${daysStr})` : ''}` : ''}`,
      `Progress: ${checkedCount}/${allItems.length}`,
      '',
      prepItems.length > 0 ? `Prep:\n${fmt(prepItems)}` : '',
      postItems.length > 0 ? `Post-lesson:\n${fmt(postItems)}` : '',
    ].filter(Boolean).join('\n');

    setTrigger({
      charName: 'Proctor',
      seedPrompt: msg,
      action: 'class status',
    });
  }

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const totalPrepped = classes.filter(c => c.checkedItems === c.totalItems && c.totalItems > 0).length;

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 16px", borderBottom: "1px solid var(--border)" }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-3)" }}>
          {loading ? "..." : <><span style={{ color: "#16a34a", fontWeight: 600 }}>{totalPrepped}</span>/{classes.length} prepped</>}
        </span>
        <button className="widget-toolbar-btn" data-tip="Refresh" onClick={fetchClasses}>
          <RefreshCw size={12} strokeWidth={1.5} style={loading ? { animation: "spin 1s linear infinite" } : undefined} />
        </button>
      </div>

      <div className="widget-body" style={{ padding: "6px 0" }}>
        {loading && classes.length === 0 && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 20, gap: 8 }}>
            <Loader2 size={14} strokeWidth={1.5} style={{ color: "var(--text-3)", animation: "spin 1s linear infinite" }} />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-3)" }}>Loading from Tana...</span>
          </div>
        )}

        {!loading && classes.length === 0 && (
          <div style={{ padding: "16px", textAlign: "center" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-3)" }}>No upcoming classes</span>
          </div>
        )}

        {classes.map((cls, i) => {
          const isExpanded = expanded.has(cls.id);
          const pill = coursePill(cls.course);
          const dateUrgency = cls.date ? getDateUrgency(cls.date, "future") : null;
          const isToday = dateUrgency?.color === "#d97706" && dateUrgency?.dot;
          const isSoon = dateUrgency?.color === "#0d9488" && dateUrgency?.dot;

          const prepItems = cls.checklist.map(item => ({
            ...item,
            checked: localChecked[item.id] !== undefined ? localChecked[item.id] : item.checked,
          })).filter(i => i.group === 'prep');

          const postItems = cls.checklist.map(item => ({
            ...item,
            checked: localChecked[item.id] !== undefined ? localChecked[item.id] : item.checked,
          })).filter(i => i.group === 'post-lesson');

          const otherItems = cls.checklist.map(item => ({
            ...item,
            checked: localChecked[item.id] !== undefined ? localChecked[item.id] : item.checked,
          })).filter(i => i.group === null);

          return (
            <div key={cls.id} style={{
              paddingTop: i > 0 ? 0 : 0,
              borderTop: i > 0 ? "1px solid var(--border)" : "none",
            }}>
              {/* Class header row */}
              <div
                onClick={() => toggleExpand(cls.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 0,
                  padding: "8px 16px", cursor: "pointer",
                  background: isToday ? "rgba(37,99,235,0.04)" : "transparent",
                }}
              >
                <ChevronRight
                  size={10} strokeWidth={2}
                  style={{
                    color: "var(--text-3)", flexShrink: 0, marginRight: 8,
                    transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
                    transition: "transform 0.15s ease",
                  }}
                />

                {/* Course pill */}
                <span style={{
                  fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 600,
                  color: pill.color, background: pill.color + "18",
                  padding: "1px 5px", borderRadius: 3, flexShrink: 0,
                  letterSpacing: "0.03em", marginRight: 8,
                }}>
                  {pill.label}
                </span>

                {/* Lesson number badge */}
                {cls.number !== null && (
                  <span style={{
                    fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 600,
                    color: "var(--text-3)", flexShrink: 0, marginRight: 8,
                  }}>
                    L{cls.number}
                  </span>
                )}

                {/* Class name */}
                <span style={{
                  fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 500,
                  color: "var(--text)", flex: 1,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {cls.name}
                </span>

                {/* Date on right */}
                {cls.date && dateUrgency && (
                  <span style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0, marginLeft: 8 }}>
                    <span style={{ width: 4, height: 4, borderRadius: "50%", background: dateUrgency.dot ? dateUrgency.color : "transparent", flexShrink: 0 }} />
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: dateUrgency.color, whiteSpace: "nowrap" }}>
                      {formatWhen(cls.date, false)}
                    </span>
                  </span>
                )}
              </div>

              {/* Progress bar (always visible) */}
              <div style={{ padding: "0 16px 6px 34px" }}>
                <ProgressBar checked={cls.checkedItems} total={cls.totalItems} />
              </div>

              {/* Expanded checklist */}
              {isExpanded && cls.checklist.length > 0 && (
                <div style={{ padding: "0 16px 10px 34px" }}>
                  <ChecklistGroup
                    label="Prep"
                    items={prepItems}
                    toggling={toggling}
                    onToggle={handleToggle}
                  />
                  <ChecklistGroup
                    label="Post-lesson"
                    items={postItems}
                    toggling={toggling}
                    onToggle={handleToggle}
                  />
                  {otherItems.length > 0 && (
                    <ChecklistGroup
                      label="Other"
                      items={otherItems}
                      toggling={toggling}
                      onToggle={handleToggle}
                    />
                  )}
                </div>
              )}

              {isExpanded && cls.checklist.length === 0 && (
                <div style={{ padding: "0 16px 10px 34px" }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-3)" }}>
                    No checklist.
                  </span>
                </div>
              )}

              {/* Action buttons — visible on all expanded classes */}
              {isExpanded && (
                <div style={{ padding: "4px 16px 10px 34px", display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <button
                    disabled={!!lessonDoneLoading}
                    onClick={() => handlePrepDone(cls)}
                    style={{
                      display: "flex", alignItems: "center", gap: 5,
                      background: lessonDoneLoading === cls.id + '-prep' ? "var(--border)" : "#7c3aed",
                      color: lessonDoneLoading === cls.id + '-prep' ? "var(--text-3)" : "#fff",
                      border: "none", borderRadius: 5, cursor: lessonDoneLoading ? "default" : "pointer",
                      padding: "5px 10px",
                      fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 600,
                      transition: "background 0.15s",
                    }}
                  >
                    {lessonDoneLoading === cls.id + '-prep'
                      ? <Loader2 size={10} strokeWidth={2} style={{ animation: "spin 1s linear infinite" }} />
                      : <CheckCheck size={10} strokeWidth={2} />
                    }
                    Prep done
                  </button>

                  <button
                    disabled={!!lessonDoneLoading}
                    onClick={() => handleLessonDone(cls)}
                    style={{
                      display: "flex", alignItems: "center", gap: 5,
                      background: lessonDoneLoading === cls.id ? "var(--border)" : "#2563eb",
                      color: lessonDoneLoading === cls.id ? "var(--text-3)" : "#fff",
                      border: "none", borderRadius: 5, cursor: lessonDoneLoading ? "default" : "pointer",
                      padding: "5px 10px",
                      fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 600,
                      transition: "background 0.15s",
                    }}
                  >
                    {lessonDoneLoading === cls.id
                      ? <Loader2 size={10} strokeWidth={2} style={{ animation: "spin 1s linear infinite" }} />
                      : <CheckCheck size={10} strokeWidth={2} />
                    }
                    Lesson done
                  </button>

                  <button
                    onClick={() => handleSendToProctor(cls)}
                    style={{
                      display: "flex", alignItems: "center", gap: 5,
                      background: "transparent",
                      color: "var(--text-3)",
                      border: "1px solid var(--border)",
                      borderRadius: 5, cursor: "pointer",
                      padding: "5px 10px",
                      fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 600,
                      transition: "color 0.15s, border-color 0.15s",
                    }}
                    onMouseEnter={e => {
                      (e.currentTarget as HTMLButtonElement).style.color = "var(--text)";
                      (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--text-3)";
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLButtonElement).style.color = "var(--text-3)";
                      (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)";
                    }}
                  >
                    <MessageSquare size={10} strokeWidth={2} />
                    → Proctor
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

export default function ClassesWidget() {
  return (
    <div className="widget">
      <div className="widget-header">
        <span className="widget-header-label">
          <BookOpen size={13} strokeWidth={1.5} /> Classes
        </span>
      </div>
      <ClassesTabContent />
    </div>
  );
}
