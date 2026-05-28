import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { applyTheme, getStoredTheme } from "./lib/theme";
import { api } from "./lib/api";

async function initTheme() {
  try {
    const s = await api.getSettings();
    const theme =
      s.theme === "light" || s.theme === "dark" || s.theme === "system"
        ? s.theme
        : getStoredTheme();
    applyTheme(theme);
  } catch {
    applyTheme(getStoredTheme());
  }
}

void initTheme();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
