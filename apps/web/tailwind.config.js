/**
 * Tokens do design system do Arkos (docs/REGRAS-VISUAIS.md).
 * As cores de superfície vêm de CSS custom properties definidas em
 * src/index.css, então o mesmo utilitário (ex: bg-card) funciona nos dois modos.
 */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Cores de marca (§2) — iguais nos dois modos
        marinho: "#152A54",
        primario: "#1E4E9C",
        medio: "#2C6FBF",
        ciano: "#20B8C4",
        // Azul da tipografia como sai do vetor oficial (marca/svg): um
        // pouco mais claro que o marinho, e só a marca usa.
        "azul-marca": "#26398C",

        // Superfícies e texto — trocam conforme o modo
        fundo: "var(--cor-fundo)",
        card: "var(--cor-card)",
        borda: "var(--cor-borda)",
        texto: "var(--cor-texto)",
        secundario: "var(--cor-texto-secundario)",

        // Semânticas (§2)
        sucesso: "var(--cor-sucesso)",
        alerta: "var(--cor-alerta)",
        erro: "var(--cor-erro)",
        info: "var(--cor-info)",
      },
      fontFamily: {
        sans: ["Inter", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
      },
      fontSize: {
        // §3 — hierarquia tipográfica
        h1: ["28px", { lineHeight: "34px", fontWeight: "700" }],
        h2: ["22px", { lineHeight: "28px", fontWeight: "600" }],
        h3: ["18px", { lineHeight: "24px", fontWeight: "600" }],
        corpo: ["14px", { lineHeight: "20px" }],
        "corpo-espacoso": ["15px", { lineHeight: "22px" }],
        rotulo: ["12px", { lineHeight: "16px", fontWeight: "500" }],
        indicador: ["32px", { lineHeight: "38px", fontWeight: "700" }],
      },
      borderRadius: {
        // §5 — botões/inputs 8px, cards 12px, badges pill
        botao: "8px",
        card: "12px",
      },
      boxShadow: {
        card: "0 1px 3px rgba(0,0,0,0.08)",
        flutuante: "0 4px 16px rgba(0,0,0,0.12)",
      },
      backgroundImage: {
        marca: "linear-gradient(135deg, #152A54 0%, #1E4E9C 50%, #20B8C4 100%)",
      },
      spacing: {
        sidebar: "240px",
        "sidebar-recolhida": "64px",
      },
    },
  },
  plugins: [],
};
