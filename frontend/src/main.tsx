import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, HashRouter } from "react-router-dom";
import { IS_DEMO } from "./api";
import DemoPanel from "./demo/DemoPanel";
import App from "./App";
import { AuthProvider } from "./auth";
import { ToastProvider } from "./ui";
import "./index.css";

const Router = IS_DEMO ? HashRouter : BrowserRouter;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Router>
      <AuthProvider>
        <ToastProvider>
          <App />
          {IS_DEMO && <DemoPanel />}
        </ToastProvider>
      </AuthProvider>
    </Router>
  </StrictMode>,
);
