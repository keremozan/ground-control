"use client";

interface LedProps {
  status: "on" | "off" | "error" | "warn" | "pulse";
}

export function Led({ status }: LedProps) {
  const cls = status === "pulse" ? "led led-on led-pulse"
    : status === "on" ? "led led-on"
    : status === "error" ? "led led-error"
    : status === "warn" ? "led led-warn"
    : "led led-off";
  return <span className={cls} />;
}
