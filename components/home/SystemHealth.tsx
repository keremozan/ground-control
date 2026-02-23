"use client";
import { mockHealth } from "@/lib/mock-data";

export default function SystemHealth() {
  return (
    <div className="widget">
      <div className="widget-display" style={{ padding: "10px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <span style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              fontWeight: 500,
              color: "var(--lcd-dim)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}>
              SYS
            </span>
            {mockHealth.mcpServers.map((server) => (
              <div key={server.name} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span className={"led " + (server.status === "connected" ? "led-on" : "led-error")} />
                <span className="lcd-xs">{server.name}</span>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <span className="lcd-xs" style={{ color: "var(--lcd-dim)" }}>
              CYCLE {mockHealth.lastCycle}
            </span>
            <span className="lcd-xs" style={{ color: mockHealth.errors > 0 ? "var(--red)" : "var(--lcd-dim)" }}>
              {mockHealth.errors} ERR
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
