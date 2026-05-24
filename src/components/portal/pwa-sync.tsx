"use client";

import { useEffect } from "react";

function updatePwaData(key: string, value: any) {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    const raw = window.localStorage.getItem("pwa-dashboard-data");
    const data = raw ? JSON.parse(raw) : { syncedAt: new Date().toISOString() };
    data[key] = value;
    data.syncedAt = new Date().toISOString();
    window.localStorage.setItem("pwa-dashboard-data", JSON.stringify(data));
  } catch (err) {
    console.error("Failed to update PWA storage:", err);
  }
}

export function PWASyncNextVisit({ visit }: { visit: any }) {
  useEffect(() => {
    updatePwaData("nextVisit", visit ? {
      scheduledFor: visit.scheduledFor,
      modality: visit.modality,
      id: visit.id
    } : null);
  }, [visit]);
  return null;
}

export function PWASyncTasks({ tasks }: { tasks: any[] }) {
  useEffect(() => {
    updatePwaData("tasks", tasks ? tasks.map(t => ({ title: t.title, dueAt: t.dueAt })) : []);
  }, [tasks]);
  return null;
}

export function PWASyncStreak({ streak }: { streak: any }) {
  useEffect(() => {
    updatePwaData("streak", streak ? {
      currentStreak: streak.currentStreak,
      longestStreak: streak.longestStreak,
      lastCheckInDate: streak.lastCheckInDate
    } : null);
  }, [streak]);
  return null;
}
