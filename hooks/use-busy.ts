"use client";
import { useState, useCallback } from "react";

export function useBusy() {
  const [busySet, setBusySet] = useState<Set<string>>(new Set());

  const isBusy = useCallback((id: string) => busySet.has(id), [busySet]);

  const markBusy = useCallback((id: string) => {
    setBusySet((prev) => new Set(prev).add(id));
  }, []);

  const clearBusy = useCallback((id: string) => {
    setBusySet((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  return { isBusy, markBusy, clearBusy, busySet };
}
