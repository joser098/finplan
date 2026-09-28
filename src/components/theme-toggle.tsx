"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";

function subscribe(callback: () => void) {
  window.addEventListener("finplan-theme-change", callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener("finplan-theme-change", callback);
    window.removeEventListener("storage", callback);
  };
}

function getTheme() {
  try {
    return localStorage.getItem("finplan-theme") === "dark";
  } catch {
    return document.documentElement.dataset.theme === "dark";
  }
}

export default function ThemeToggle() {
  const dark = useSyncExternalStore(subscribe, getTheme, () => false);
  return (
    <section className="panel settings-panel section-space appearance-panel">
      <div>
        <h3>Apariencia</h3>
        <p>Elegí cómo querés ver tu planificación.</p>
      </div>
      <button
        className="theme-toggle"
        role="switch"
        aria-checked={dark}
        aria-label="Modo oscuro"
        onClick={() => {
          const theme = dark ? "light" : "dark";
          document.documentElement.dataset.theme = theme;
          try { localStorage.setItem("finplan-theme", theme); } catch { /* Keep the theme for this visit when storage is unavailable. */ }
          window.dispatchEvent(new Event("finplan-theme-change"));
        }}
      >
        {dark ? <Moon size={18} /> : <Sun size={18} />}
        <span>Modo oscuro</span>
        <span className="theme-switch-track" aria-hidden="true"><span /></span>
      </button>
    </section>
  );
}
