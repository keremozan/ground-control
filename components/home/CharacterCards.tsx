"use client";
import { characters } from "@/lib/mock-data";
import {
  Mail, MessageSquare, Send, RefreshCw, PenTool, Search,
  BookOpen, Eye, Monitor, Wrench, GraduationCap, Share2,
  FileText, Users, Edit3, Heart, RotateCcw, Frame,
  Globe, Building2, Settings, Database, Hammer, Compass, Sparkles,
} from "lucide-react";

const actionIcons: Record<string, React.ComponentType<{ size?: number; strokeWidth?: number }>> = {
  "Scan Mail": Mail,
  "Scan WA": MessageSquare,
  "Deliver": Send,
  "Cycle": RefreshCw,
  "Write": PenTool,
  "Research": Search,
  "Thesis": BookOpen,
  "Critique": Eye,
  "Slides": Monitor,
  "Workshop": Wrench,
  "SUCourse": GraduationCap,
  "Share": Share2,
  "Admin": FileText,
  "Advisory": Users,
  "Sign": Edit3,
  "Check In": Heart,
  "Review": RotateCcw,
  "FASS": Frame,
  "Mondial": Globe,
  "Sanatorium": Building2,
  "System": Settings,
  "Schema": Database,
  "Build": Hammer,
  "Watch": Compass,
  "Advise": Sparkles,
};

export default function CharacterCards() {
  return (
    <div className="widget">
      <div className="widget-header">
        <span className="widget-header-label">Crew</span>
        <span className="widget-header-meta">{characters.length} characters</span>
      </div>
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: 8,
        padding: 10,
      }}>
        {characters.map((c) => (
          <div key={c.name} className="char-card">
            <div className="char-card-header" style={{ borderBottom: "1px solid var(--border)" }}>
              <div
                className="char-badge"
                style={{ background: c.color, width: 24, height: 24, fontSize: 11, borderRadius: 3 }}
              >
                {c.name[0]}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontFamily: "var(--font-body)",
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--text)",
                  lineHeight: 1.2,
                }}>
                  {c.name}
                </div>
                <div style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 9,
                  color: "var(--text-3)",
                  textTransform: "uppercase",
                }}>
                  {c.domain}
                </div>
              </div>
              <span style={{
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                color: "var(--text-3)",
                textTransform: "uppercase",
              }}>
                {c.model}
              </span>
            </div>
            <div className="char-card-actions">
              {c.actions.map((action) => {
                const Icon = actionIcons[action] || Settings;
                return (
                  <button key={action} className="char-action-tile">
                    <Icon size={15} strokeWidth={1.5} />
                    <span>{action}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
