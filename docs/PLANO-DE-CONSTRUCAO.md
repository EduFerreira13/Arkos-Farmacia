# Arkos — Plano de Construção do MVP

> Ordem obrigatória de execução. Não pular fases, não paralelizar entre serviços diferentes (ver `CONTRIBUTING.md` — "regra de ouro dos serviços"). Cada fase termina com commit(s) via Conventional Commits.

## Fase 0 — Fundação

- [ ] Rodar `database/migrations/0000_drop_legacy.sql` até `0005_fiscal.sql`, em ordem, contra o `DATABASE_URL` do `.env` (`npm run migrate`).
- [ ] Rodar `npm run sync:schema` uma primeira vez para gerar `database/schema/*.md`.
- [ ] Criar `packages/shared-types` com os tipos de `Produto`, `Venda`, `Usuario` etc. (baseado em `docs/MODELO-DADOS.md`).
- [ ] Scaffold do `apps/web` (React + Vite + Tailwind), com sidebar recolhível, topbar, toggle claro/escuro — seguindo `docs/REGRAS-VISUAIS.md` à risca (nada de emoji, nada de barra lateral decorativa, cantos arredondados).
- [ ] Scaffold de cada serviço em `services/*` com Fastify: apenas um endpoint `GET /health` por enquanto, cada um na sua porta (ver `.env`).
- [ ] Subir Redis via `docker-compose up -d`.

## Fase 1 — Autenticação (`auth-service`)

- [ ] Implementar rotas de `docs/API-CONTRATOS.md` (`/auth/login`, `/auth/me`, `/auth/perfis`, `/auth/usuarios`).
- [ ] Middleware de validação de JWT reutilizável pelos outros serviços (colocar em `packages/shared-types` ou em um pacote `packages/auth-middleware`).
- [ ] Tela de login no front, redirecionando para o dashboard após autenticar.

## Fase 2 — Estoque (`estoque-service`)

- [ ] Rotas de produtos, lotes, movimentações (`docs/API-CONTRATOS.md`).
- [ ] Lógica de saída por **FEFO** (menor `data_validade` primeiro).
- [ ] Views de alerta (`vw_estoque_baixo`, `vw_produtos_a_vencer`) expostas via API.
- [ ] Telas: lista de produtos, cadastro de produto, entrada de lote, alertas.

## Fase 3 — Vendas / PDV (`vendas-service`)

- [ ] Rotas completas de venda (abrir, itens, receita, pagamentos, finalizar, cancelar).
- [ ] Integração com `estoque-service` (checar `tipo_controle`, dar saída FEFO).
- [ ] Bloqueio duro de controlado sem receita (§3 das regras de negócio) — testar explicitamente esse caso.
- [ ] Tela de PDV: busca de produto, carrinho, vínculo de receita quando necessário, formas de pagamento (inclusive mistas), emissão de cupom.

## Fase 4 — Compras e Financeiro (`financeiro-service`)

- [ ] Rotas de caixa (abrir/fechar/status), contas a pagar/receber.
- [ ] Integração: toda venda finalizada gera lançamento automático no caixa (nunca manual).
- [ ] Telas: abertura/fechamento de caixa, contas a pagar/receber, fluxo de caixa do dia.

## Fase 5 — Fiscal (`fiscal-service`, mockado)

- [ ] Rotas de NF-e e SNGPC retornando dados simulados, mas com a estrutura de dados real (ver `docs/MODELO-DADOS.md`).
- [ ] Vínculo com `vendas-service` no fluxo de finalizar venda.

## Fase 6 — Dashboard e Relatórios

- [ ] Tela inicial pós-login: 4 cards de indicadores (vendas do dia, produtos a vencer, estoque baixo, ticket médio) + área de comunicados/atualizações.
- [ ] Relatórios básicos (mais vendidos, margem) se houver tempo — não bloqueia o MVP.

## Fase 7 — Revisão final

- [ ] Passar o checklist de `docs/REGRAS-VISUAIS.md` (§9) em todas as telas.
- [ ] Conferir que `npm run sync:schema` está limpo (sem mudanças pendentes de commit).
- [ ] Testar o fluxo completo ponta a ponta: login → cadastrar produto → dar entrada de lote → vender (com e sem controlado) → fechar caixa → ver dashboard atualizado.

---

## Regra de execução para quem estiver construindo isso

- Não pedir confirmação do usuário entre fases — seguir a ordem acima até o fim.
- Se algo genuinamente não puder ser decidido sozinho (ex: credencial externa que só o dono tem), registrar em `docs/PENDENCIAS.md` e seguir para o próximo item, não travar o andamento.
- Commitar ao final de cada fase (ou de cada sub-item relevante), seguindo `CONTRIBUTING.md`.
- Rodar `npm run sync:schema` sempre que uma migration nova for criada ou uma tabela for alterada.
