# Arkos — Plano de Construção do MVP

> Ordem obrigatória de execução. Não pular fases, não paralelizar entre serviços diferentes (ver `CONTRIBUTING.md` — "regra de ouro dos serviços"). Cada fase termina com commit(s) via Conventional Commits.

## Fase 0 — Fundação

- [x] Rodar `database/migrations/0000_drop_legacy.sql` até `0005_fiscal.sql`, em ordem, contra o `DATABASE_URL` do `.env` (`npm run migrate`).
- [x] Rodar `npm run sync:schema` uma primeira vez para gerar `database/schema/*.md`.
- [x] Criar `packages/shared-types` com os tipos de `Produto`, `Venda`, `Usuario` etc. (baseado em `docs/MODELO-DADOS.md`).
- [x] Scaffold do `apps/web` (React + Vite + Tailwind), com sidebar recolhível, topbar, toggle claro/escuro — seguindo `docs/REGRAS-VISUAIS.md` à risca (nada de emoji, nada de barra lateral decorativa, cantos arredondados).
- [x] Scaffold de cada serviço em `services/*` com Fastify: apenas um endpoint `GET /health` por enquanto, cada um na sua porta (ver `.env`).
- [ ] Subir Redis via `docker-compose up -d`. — Docker não está instalado nesta máquina; o cache é opcional e nada do MVP depende dele (`docs/PENDENCIAS.md`).

## Fase 1 — Autenticação (`auth-service`)

- [x] Implementar rotas de `docs/API-CONTRATOS.md` (`/auth/login`, `/auth/me`, `/auth/perfis`, `/auth/usuarios`).
- [x] Middleware de validação de JWT reutilizável pelos outros serviços (colocar em `packages/shared-types` ou em um pacote `packages/auth-middleware`).
- [x] Tela de login no front, redirecionando para o dashboard após autenticar.

## Fase 2 — Estoque (`estoque-service`)

- [x] Rotas de produtos, lotes, movimentações (`docs/API-CONTRATOS.md`).
- [x] Lógica de saída por **FEFO** (menor `data_validade` primeiro).
- [x] Views de alerta (`vw_estoque_baixo`, `vw_produtos_a_vencer`) expostas via API.
- [x] Telas: lista de produtos, cadastro de produto, entrada de lote, alertas.

## Fase 3 — Vendas / PDV (`vendas-service`)

- [x] Rotas completas de venda (abrir, itens, receita, pagamentos, finalizar, cancelar).
- [x] Integração com `estoque-service` (checar `tipo_controle`, dar saída FEFO).
- [x] Bloqueio duro de controlado sem receita (§3 das regras de negócio) — testar explicitamente esse caso.
- [x] Tela de PDV: busca de produto, carrinho, vínculo de receita quando necessário, formas de pagamento (inclusive mistas), emissão de cupom.

## Fase 4 — Compras e Financeiro (`financeiro-service`)

- [x] Rotas de caixa (abrir/fechar/status), contas a pagar/receber.
- [x] Integração: toda venda finalizada gera lançamento automático no caixa (nunca manual).
- [x] Telas: abertura/fechamento de caixa, contas a pagar/receber, fluxo de caixa do dia.

## Fase 5 — Fiscal (`fiscal-service`, mockado)

- [x] Rotas de NF-e e SNGPC retornando dados simulados, mas com a estrutura de dados real (ver `docs/MODELO-DADOS.md`).
- [x] Vínculo com `vendas-service` no fluxo de finalizar venda.

## Fase 6 — Dashboard e Relatórios

- [x] Tela inicial pós-login: 4 cards de indicadores (vendas do dia, produtos a vencer, estoque baixo, ticket médio) + área de comunicados/atualizações.
- [ ] Relatórios básicos (mais vendidos, margem) se houver tempo — não bloqueia o MVP. — não implementados.

## Fase 7 — Revisão final

- [x] Passar o checklist de `docs/REGRAS-VISUAIS.md` (§9) em todas as telas.
- [x] Conferir que `npm run sync:schema` está limpo (sem mudanças pendentes de commit).
- [x] Testar o fluxo completo ponta a ponta: login → cadastrar produto → dar entrada de lote → vender (com e sem controlado) → fechar caixa → ver dashboard atualizado.

---

## Regra de execução para quem estiver construindo isso

- Não pedir confirmação do usuário entre fases — seguir a ordem acima até o fim.
- Se algo genuinamente não puder ser decidido sozinho (ex: credencial externa que só o dono tem), registrar em `docs/PENDENCIAS.md` e seguir para o próximo item, não travar o andamento.
- Commitar ao final de cada fase (ou de cada sub-item relevante), seguindo `CONTRIBUTING.md`.
- Rodar `npm run sync:schema` sempre que uma migration nova for criada ou uma tabela for alterada.

---

## Status da construção (21/08/2026)

Fases 0 a 7 executadas. O fluxo do MVP roda ponta a ponta contra o banco real e
está coberto por `npm run test:fluxo` (29 verificações, todas passando):
login → abertura de caixa → cadastro de produto → entrada de lote → venda com
bloqueio de controlado sem receita → venda concluída com receita e baixa FEFO →
nota fiscal simulada → lançamento automático no caixa → fechamento com
divergência → dashboard com os 4 indicadores.

Itens conscientemente fora: Redis (sem Docker na máquina), relatórios avançados,
estorno de venda finalizada e verificação visual automatizada do frontend —
todos registrados em `docs/PENDENCIAS.md`.
