# Arkos — Regras Visuais (Design System)

> Base de conhecimento visual para desenvolvimento do sistema Arkos.
> Última atualização: 20/08/2026

---

## 1. Identidade

- **Nome:** Arkos
- **Logo:** montanha estilizada em degradê azul → ciano, com wordmark em azul escuro sólido, sem serifa.
- **Conceito:** solidez (montanha), tecnologia (gradiente), clareza (clean/corporativo).

---

## 2. Paleta de Cores

Extraída do logo + expandida para uso em UI (light e dark mode).

### Cores de marca

| Nome | Hex | Uso |
|---|---|---|
| Azul Marinho (Primary Dark) | `#152A54` | Wordmark, texto de destaque, header no dark mode |
| Azul Primário | `#1E4E9C` | Botões primários, links, ícones ativos |
| Azul Médio | `#2C6FBF` | Hover states, gráficos |
| Ciano/Teal (Accent) | `#20B8C4` | Destaques, badges, indicadores positivos, gradientes |
| Gradiente Marca | `linear-gradient(135deg, #152A54 0%, #1E4E9C 50%, #20B8C4 100%)` | Headers de destaque, cards de boas-vindas, tela pós-login |

### Cores neutras (light mode)

| Nome | Hex | Uso |
|---|---|---|
| Fundo principal | `#F5F7FA` | Background da aplicação |
| Fundo de card | `#FFFFFF` | Cards, modais, tabelas |
| Borda sutil | `#E2E6EC` | Divisores, bordas de input |
| Texto primário | `#1A2332` | Títulos, texto principal |
| Texto secundário | `#5B6572` | Legendas, labels, texto auxiliar |

### Cores neutras (dark mode)

| Nome | Hex | Uso |
|---|---|---|
| Fundo principal | `#0F1620` | Background da aplicação |
| Fundo de card | `#1A2332` | Cards, modais |
| Borda sutil | `#2A3446` | Divisores |
| Texto primário | `#EDEFF2` | Títulos |
| Texto secundário | `#9AA4B2` | Texto auxiliar |

### Cores semânticas (funcionam nos dois modos, ajustando luminosidade)

| Estado | Hex (light) | Hex (dark) |
|---|---|---|
| Sucesso | `#1F9D55` | `#3ECF6E` |
| Alerta | `#E0A426` | `#F2BC4E` |
| Erro/Crítico | `#D6473C` | `#F16A5F` |
| Informação | `#2C6FBF` | `#4E8FE0` |

> Uso típico na farmácia: **Alerta** para validade próxima e estoque baixo; **Erro** para medicamento vencido ou controlado sem receita; **Sucesso** para venda concluída.

---

## 3. Tipografia

- **Fonte:** Inter (padrão sugerido — moderna, excelente legibilidade em telas densas, gratuita).
- **Fallback:** `-apple-system, Segoe UI, Roboto, sans-serif`

| Estilo | Tamanho | Peso | Uso |
|---|---|---|---|
| H1 | 28px | 700 | Título de página |
| H2 | 22px | 600 | Título de seção/card |
| H3 | 18px | 600 | Subtítulo |
| Body | 14px | 400 | Texto padrão (modo denso) |
| Body (espaçoso) | 15px | 400 | Texto padrão (modo confortável) |
| Small/Label | 12px | 500 | Labels, legendas, badges |
| Números de indicadores | 32px | 700 | Cards do dashboard |

---

## 4. Layout

### Estrutura geral
- **Menu:** lateral (sidebar), **recolhível** (expandido ~240px / recolhido ~64px, mostrando apenas ícones).
- **Topbar:** fixa, com busca global, notificações, perfil do usuário e toggle de tema (claro/escuro).
- **Arquitetura horizontal:** módulos (Vendas, Estoque, Financeiro, etc.) como seções independentes acessadas pela sidebar, cada uma com seu próprio layout interno — evita acoplamento entre módulos.

### Tela inicial (pós-login)
- **4 cards de indicadores** no topo (ex: vendas do dia, produtos a vencer, estoque baixo, ticket médio) — cards com número grande + label + variação (%).
- **Área de comunicados/atualizações do sistema** abaixo dos indicadores — carrossel ou lista de cards com novidades, avisos e propagandas internas.

### Densidade de tabelas
- Usuário pode alternar entre **Denso** (padrão) e **Confortável** nas preferências.
- Denso: linha ~36px, padding 8px.
- Confortável: linha ~48px, padding 14px.

---

## 5. Componentes

### Regras gerais
- **Cantos arredondados** em todos os elementos: botões, inputs, cards, badges, modais.
  - Botões/inputs: `border-radius: 8px`
  - Cards: `border-radius: 12px`
  - Badges/chips: `border-radius: 999px` (pill)
- **Proibido:** uso de emojis em qualquer parte da interface (textos, notificações, mensagens de sistema).
- **Proibido:** barras/faixas de destaque decorativas nas laterais de cards, boxes ou botões (nada de "accent bar" lateral colorida). O destaque visual deve vir de cor de fundo, ícone ou tipografia — nunca de barra lateral.
- **Sombras:** sutis, nunca pesadas. Ex: `box-shadow: 0 1px 3px rgba(0,0,0,0.08)` no light mode.
- **Ícones:** escolher um set único (sugestão: **Lucide**, por ser clean, consistente e combinar com o estilo do logo) e manter esse set em 100% da aplicação — sem misturar bibliotecas.

### Botões
| Tipo | Estilo |
|---|---|
| Primário | Fundo azul primário (`#1E4E9C`), texto branco, radius 8px |
| Secundário | Contorno azul, fundo transparente/branco |
| Destrutivo | Fundo vermelho de erro, texto branco |
| Desabilitado | Cinza neutro, sem sombra |

### Cards de indicador (dashboard)
- Fundo branco/card, radius 12px, sombra sutil.
- Número grande (32px/700) + label pequena (12px) + ícone (Lucide) + variação percentual colorida (verde/vermelho).
- **Sem** barra lateral colorida — o ícone e a cor do número já comunicam o status.

---

## 6. Modo Claro / Escuro

- Toggle na topbar, com persistência da preferência do usuário.
- Gradiente da marca (`#152A54 → #1E4E9C → #20B8C4`) pode ser usado em ambos os modos como elemento de destaque (ex: header da tela de login, banner de boas-vindas).

---

## 7. Plataforma e Público

- **Somente Web** (sem app mobile/desktop nesta fase).
- Público-alvo: uso em **telas grandes** (notebook/desktop) — layout otimizado a partir de 1280px, sem necessidade de breakpoints mobile prioritários.
- Sem requisitos de alto contraste adicional (WCAG AA padrão é suficiente).

---

## 8. Stack e Arquitetura Recomendada

> Critério: velocidade de resposta + estrutura horizontal (módulos independentes, fácil escalar e adicionar novos módulos sem acoplamento).

| Camada | Escolha sugerida | Motivo |
|---|---|---|
| Frontend | React + Vite | Build rápido, ecossistema maduro, fácil modularização por rotas/módulos |
| Estilo | Tailwind CSS | Consistência com o design system (radius, cores, espaçamento via tokens) |
| Backend | Node.js (Fastify) | Alta performance, baixo overhead, ótimo para APIs horizontais |
| Banco de dados | PostgreSQL | Robusto, ótimo para dados relacionais (estoque, vendas, fiscal) |
| Cache | Redis | Acelera dashboard e consultas frequentes (indicadores) |
| Arquitetura | Modular monolith (por domínio: vendas, estoque, financeiro, fiscal) | Horizontal, cada módulo independente, mas sem overhead de microsserviços numa fase inicial — migração futura para microsserviços fica facilitada |
| Autenticação | JWT + perfis de acesso (RBAC) | Necessário para farmácia (controle de quem mexe em controlados, financeiro etc.) |

---

## 9. Checklist rápido para qualquer nova tela

- [ ] Usa a paleta oficial (sem cores fora da tabela)?
- [ ] Cantos arredondados aplicados (8px inputs/botões, 12px cards)?
- [ ] Nenhuma barra lateral decorativa em cards/boxes?
- [ ] Nenhum emoji em textos ou mensagens?
- [ ] Ícones do mesmo set (Lucide)?
- [ ] Funciona em light e dark mode?
- [ ] Densidade de tabela respeita a preferência do usuário?
- [ ] Tipografia Inter, hierarquia respeitada?

---

*Documento vivo — atualizar conforme decisões forem tomadas ao longo do projeto.*
