import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import { ProvedorAutenticacao } from "./lib/autenticacao.jsx";
import { ProvedorConectividade } from "./lib/conectividade.jsx";
import { ProvedorPreferencias } from "./lib/preferencias.jsx";
import "./index.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ProvedorPreferencias>
      <ProvedorAutenticacao>
        {/* PDV offline (Fase 5) precisa saber se está online em qualquer
            tela que o use — o provider fica aqui, não só dentro do PDV. */}
        <ProvedorConectividade>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </ProvedorConectividade>
      </ProvedorAutenticacao>
    </ProvedorPreferencias>
  </React.StrictMode>
);
