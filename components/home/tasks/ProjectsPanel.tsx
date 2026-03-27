"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import { useSystemConfig } from "@/lib/shared-data";
import { buildColorMatcher } from "@/lib/colors";
import type { Project } from "@/types";
import ProjectsTimeline from "./ProjectsTimeline";

export default function ProjectsPanel() {
  const sharedConfig = useSystemConfig();
  const [projects, setProjects] = useState<Project[]>([]);

  const fetchProjects = useCallback(() => {
    fetch("/api/tana-projects")
      .then(r => r.json())
      .then(raw => { const d = raw?.data ?? raw; setProjects(d.projects || []); })
      .catch(() => {});
  }, []);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);

  const trackColor = useMemo(() => {
    if (sharedConfig.trackColorPatterns) {
      const matcher = buildColorMatcher(sharedConfig.trackColorPatterns);
      return (text: string) => matcher(text) ?? null;
    }
    return () => null;
  }, [sharedConfig.trackColorPatterns]);

  async function handleProjectClick(projectId: string) {
    try {
      await fetch("/api/tana-tasks/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodeId: projectId, action: "open" }),
      });
    } catch {}
  }

  return (
    <div className="widget">
      <ProjectsTimeline
        projects={projects}
        trackColor={trackColor}
        onProjectClick={handleProjectClick}
      />
    </div>
  );
}
