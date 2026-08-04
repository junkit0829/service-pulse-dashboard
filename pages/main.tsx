import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { DashboardFoundation } from "../app/dashboard-foundation";
import "../app/globals.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Dashboard root element was not found.");
}

createRoot(root).render(
  <StrictMode>
    <DashboardFoundation />
  </StrictMode>,
);
