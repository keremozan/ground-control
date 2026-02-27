"use client";
import { useEffect } from "react";

/**
 * Global tooltip for [data-tip] elements.
 * Uses position:fixed + inline styles to escape overflow:hidden.
 */
export default function Tooltip() {
  useEffect(() => {
    // Remove any stale tooltips (querySelectorAll handles HMR duplicates)
    document.querySelectorAll("#gc-tip").forEach(el => el.remove());

    const tip = document.createElement("div");
    tip.id = "gc-tip";
    Object.assign(tip.style, {
      position: "fixed",
      padding: "3px 7px",
      borderRadius: "4px",
      background: "#1c1917",
      color: "#d4d4d4",
      fontFamily: "'IBM Plex Mono', monospace",
      fontSize: "9px",
      lineHeight: "1.4",
      whiteSpace: "nowrap",
      pointerEvents: "none",
      zIndex: "99999",
      opacity: "0",
      transition: "opacity 0.08s",
    });
    document.body.appendChild(tip);

    let currentEl: Element | null = null;

    const show = (e: MouseEvent) => {
      const target = e.target;
      if (!(target instanceof Element)) return;
      const el = target.closest("[data-tip]");
      if (!el) return;
      const text = el.getAttribute("data-tip");
      if (!text) return;

      currentEl = el;
      tip.textContent = text;
      const rect = el.getBoundingClientRect();
      // Show above by default, below if too close to top
      if (rect.top > 36) {
        tip.style.left = `${rect.left + rect.width / 2}px`;
        tip.style.top = `${rect.top - 4}px`;
        tip.style.transform = "translate(-50%, -100%)";
      } else {
        tip.style.left = `${rect.left + rect.width / 2}px`;
        tip.style.top = `${rect.bottom + 4}px`;
        tip.style.transform = "translateX(-50%)";
      }
      tip.style.opacity = "1";
    };

    const hide = (e: MouseEvent) => {
      const related = e.relatedTarget;
      if (related instanceof Element) {
        const next = related.closest("[data-tip]");
        if (next && next === currentEl) return;
      }
      tip.style.opacity = "0";
      currentEl = null;
    };

    document.addEventListener("mouseover", show);
    document.addEventListener("mouseout", hide);

    return () => {
      document.removeEventListener("mouseover", show);
      document.removeEventListener("mouseout", hide);
      tip.remove();
    };
  }, []);

  return null;
}
