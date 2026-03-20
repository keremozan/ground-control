"use client";
import { useRef, useState, useEffect } from "react";
import { GripHorizontal, Send, Square, X } from "lucide-react";
import { parseToolName } from "@/lib/mcp-icons";
import { toolInputLabel } from "./helpers";

type SkillInfo = { name: string; description: string; character?: string };

type ChatFormProps = {
  input: string;
  setInput: (v: string) => void;
  onSend: () => void;
  isLoading: boolean;
  onStop: () => void;
  canSend: boolean;
  charName: string;
  accent: string;
  activeTool: string | null;
  activeToolInput: string;
  toolLogCount: number;
  elapsed: number;
  pastedImages: string[];
  onPasteImage: (dataUrl: string) => void;
  onRemoveImage: (index: number) => void;
  modelOverride: string;
  setModelOverride: (m: string) => void;
  charDefaultModel?: string;
  messageQueue: string[];
  onRemoveQueueItem: (index: number) => void;
};

export default function ChatForm({
  input, setInput, onSend, isLoading, onStop, canSend,
  charName, accent, activeTool, activeToolInput, toolLogCount, elapsed,
  pastedImages, onPasteImage, onRemoveImage,
  modelOverride, setModelOverride, charDefaultModel,
  messageQueue, onRemoveQueueItem,
}: ChatFormProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [inputHeight, setInputHeight] = useState(34);
  const [skillPicker, setSkillPicker] = useState(false);
  const [skillList, setSkillList] = useState<SkillInfo[]>([]);
  const [skillFilter, setSkillFilter] = useState("");

  useEffect(() => {
    fetch("/api/system/skills").then(r => r.json()).then(raw => { const d = raw?.data ?? raw; setSkillList(d.skills || []); }).catch(() => {});
  }, []);

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (!file) continue;
        const reader = new FileReader();
        reader.onload = (ev) => {
          const dataUrl = ev.target?.result as string;
          if (dataUrl) onPasteImage(dataUrl);
        };
        reader.readAsDataURL(file);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (skillPicker) {
      if (e.key === "Escape") { e.preventDefault(); setSkillPicker(false); setInput(""); return; }
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); return; }
    }
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSend(); }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value;
    setInput(v);
    if (v === "/") {
      setSkillPicker(true);
      setSkillFilter("");
      if (skillList.length === 0) {
        fetch("/api/system/skills").then(r => r.json()).then(raw => { const d = raw?.data ?? raw; setSkillList(d.skills || []); }).catch(() => {});
      }
    } else if (v.startsWith("/") && skillPicker) {
      setSkillFilter(v.slice(1).toLowerCase());
    } else if (!v.startsWith("/")) {
      setSkillPicker(false);
    }
  };

  const cycleModel = () => {
    const models = ["haiku", "sonnet", "opus"];
    const idx = models.indexOf(modelOverride);
    setModelOverride(models[(idx + 1) % models.length]);
  };

  const placeholder = isLoading
    ? activeTool
      ? `${charName}: ${parseToolName(activeTool).displayName}${activeToolInput ? ` ${toolInputLabel(activeTool, activeToolInput)}` : ""}...`
      : toolLogCount > 0
        ? `${charName}: working (${toolLogCount} steps, ${elapsed}s)...`
        : `${charName} is thinking...`
    : !canSend ? "4 chats running — wait or stop one"
    : `Ask ${charName}... (type / for skills)`;

  const filtered = skillPicker
    ? skillList.filter(s =>
        !skillFilter || s.name.includes(skillFilter) || (s.description || "").toLowerCase().includes(skillFilter)
      )
    : [];

  return (
    <>
      {pastedImages.length > 0 && (
        <div style={{ padding: "6px 12px 0", display: "flex", gap: 6, flexWrap: "wrap" }}>
          {pastedImages.map((img, idx) => (
            <div key={idx} style={{ position: "relative" }}>
              <img src={img} style={{ height: 56, maxWidth: 100, borderRadius: 4, border: "1px solid var(--border)", objectFit: "cover", display: "block" }} />
              <button
                onClick={() => onRemoveImage(idx)}
                style={{
                  position: "absolute", top: -4, right: -4, width: 14, height: 14, borderRadius: "50%",
                  background: "var(--bg-2)", border: "1px solid var(--border)",
                  cursor: "pointer", padding: 0, display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                <X size={8} strokeWidth={2} style={{ color: "var(--text-2)" }} />
              </button>
            </div>
          ))}
        </div>
      )}
      {messageQueue.length > 0 && (
        <div style={{ padding: "4px 12px 0", display: "flex", gap: 4, flexWrap: "wrap" }}>
          {messageQueue.map((qm, idx) => (
            <div key={idx} style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              background: "var(--bg-2)", borderRadius: 3, padding: "2px 6px",
              fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-2)",
              maxWidth: 240,
            }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                queued: {qm.length > 40 ? qm.slice(0, 40) + "..." : qm}
              </span>
              <button
                onClick={() => onRemoveQueueItem(idx)}
                style={{
                  background: "transparent", border: "none", cursor: "pointer",
                  padding: 0, display: "flex", alignItems: "center", flexShrink: 0,
                }}
              >
                <X size={8} strokeWidth={2} style={{ color: "var(--text-3)" }} />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="widget-footer" style={{ padding: "10px 12px", gap: 8, alignItems: "center" }}>
        <div style={{ flex: 1, position: "relative", display: "flex", flexDirection: "column" }}>
          <div
            onMouseDown={e => {
              e.preventDefault();
              const startY = e.clientY;
              const startH = inputHeight;
              const onMove = (ev: MouseEvent) => {
                const delta = startY - ev.clientY;
                setInputHeight(Math.max(34, Math.min(240, startH + delta)));
              };
              const onUp = () => {
                document.removeEventListener("mousemove", onMove);
                document.removeEventListener("mouseup", onUp);
              };
              document.addEventListener("mousemove", onMove);
              document.addEventListener("mouseup", onUp);
            }}
            style={{
              height: 6, cursor: "ns-resize",
              display: "flex", alignItems: "center", justifyContent: "flex-end",
              paddingRight: 4, flexShrink: 0,
            }}
          >
            <GripHorizontal size={8} strokeWidth={1.5} style={{ color: "var(--text-3)", opacity: 0.4 }} />
          </div>
          {skillPicker && (
            <div style={{
              position: "absolute", bottom: "100%", left: 0, right: 0,
              maxHeight: 220, overflowY: "auto", zIndex: 20,
              background: "var(--surface)", border: "1px solid var(--border)",
              borderRadius: 6, boxShadow: "0 -4px 16px rgba(0,0,0,0.3)",
              marginBottom: 2,
            }}>
              {filtered.length === 0 && (
                <div style={{ padding: "10px 12px", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-3)" }}>
                  {skillList.length === 0 ? "Loading skills..." : "No matching skills"}
                </div>
              )}
              {filtered.map(s => (
                <div
                  key={s.name}
                  onClick={() => {
                    setInput(`/${s.name} `);
                    setSkillPicker(false);
                    textareaRef.current?.focus();
                  }}
                  style={{
                    padding: "6px 12px", cursor: "pointer",
                    borderBottom: "1px solid var(--border)",
                    transition: "background 0.08s",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-2)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600, color: "var(--text)" }}>
                      /{s.name}
                    </span>
                    {s.character && (
                      <span style={{
                        fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-3)",
                        background: "var(--bg-2)", padding: "1px 5px", borderRadius: 3,
                      }}>
                        {s.character}
                      </span>
                    )}
                  </div>
                  <div style={{
                    fontFamily: "var(--font-body)", fontSize: 10, color: "var(--text-3)",
                    marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {s.description}
                  </div>
                </div>
              ))}
            </div>
          )}
          <textarea
            ref={textareaRef}
            className="chat-input"
            value={input}
            onChange={handleChange}
            onPaste={handlePaste}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            rows={1}
            disabled={!canSend}
            style={{ height: inputHeight, resize: "none", flex: "none" }}
          />
        </div>
        <button
          onClick={cycleModel}
          data-tip={`Model: ${modelOverride}${modelOverride === charDefaultModel ? " (default)" : " (override)"} — click to cycle`}
          style={{
            fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.04em",
            padding: 0, cursor: "pointer", flexShrink: 0, alignSelf: "center",
            border: "none", background: "transparent",
            color: modelOverride !== charDefaultModel
              ? accent
              : "var(--text-3)",
            opacity: modelOverride !== charDefaultModel ? 1 : 0.5,
            transition: "all 0.12s",
          }}
        >
          {modelOverride}
        </button>
        {isLoading ? (
          <button
            onClick={onStop}
            data-tip="Stop"
            style={{
              width: 30, height: 30, borderRadius: 5, cursor: "pointer", flexShrink: 0,
              background: "#dc262618", border: "1px solid #dc262630",
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "background 0.12s",
            }}
          >
            <Square size={10} strokeWidth={2} style={{ color: "var(--red)", fill: "var(--red)" }} />
          </button>
        ) : (
          <button
            onClick={onSend}
            disabled={!canSend}
            data-tip={!canSend ? "4 chats already running" : undefined}
            style={{
              width: 30, height: 30, borderRadius: 5, flexShrink: 0,
              cursor: canSend ? "pointer" : "default",
              background: accent + "18", border: `1px solid ${accent}30`,
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "background 0.12s",
              opacity: canSend ? 1 : 0.4,
            }}
          >
            <Send size={12} strokeWidth={1.5} style={{ color: accent }} />
          </button>
        )}
      </div>
    </>
  );
}
