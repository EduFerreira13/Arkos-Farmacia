import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import { ProvedorAutenticacao } from "./lib/autenticacao.jsx";
import { ProvedorPreferencias } from "./lib/preferencias.jsx";
import "./index.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ProvedorPreferencias>
      <ProvedorAutenticacao>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ProvedorAutenticacao>
    </ProvedorPreferencias>
  </React.StrictMode>
);
