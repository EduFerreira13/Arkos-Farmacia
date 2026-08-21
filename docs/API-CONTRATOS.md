# Arkos — Contratos de API entre serviços

> Cada serviço expõe sua própria API REST. Comunicação entre serviços é sempre via HTTP — nunca acesso direto a schema de outro serviço (ver `docs/ARQUITETURA.md`).
>
> Autenticação: o `auth-service` emite o JWT no login. Os demais serviços **validam o token localmente** (mesmo `JWT_SECRET`, compartilhado via `.env`) — não fazem uma chamada de rede ao `auth-service` a cada requisição, por performance. Toda rota autenticada espera `Authorization: Bearer <token>`.

---

## auth-service (porta 3001)

| Método | Rota | Descrição |
|---|---|---|
| POST | `/auth/login` | `{ email, senha }` → `{ token, usuario }` |
| GET | `/auth/me` | Retorna dados do usuário autenticado |
| GET | `/auth/perfis` | Lista os 4 perfis padrão |
| POST | `/auth/usuarios` | Cria usuário (admin) |
| PATCH | `/auth/usuarios/:id` | Ativa/desativa, troca perfil |

**Exemplo — login:**
```json
// POST /auth/login
{ "email": "gerente@arkos.com", "senha": "••••••" }

// 200 OK
{
  "token": "eyJhbGciOi...",
  "usuario": { "id": "uuid", "nome": "Ana", "perfil": "gerente" }
}
```

---

## estoque-service (porta 3002)

| Método | Rota | Descrição |
|---|---|---|
| GET | `/produtos` | Lista produtos (filtros: nome, categoria, tipo_controle) |
| POST | `/produtos` | Cria produto |
| GET | `/produtos/:id` | Detalhe do produto + lotes |
| PATCH | `/produtos/:id` | Atualiza produto (preço gera histórico — §8 das regras de negócio) |
| POST | `/lotes` | Entrada de novo lote |
| POST | `/movimentacoes` | Registra movimentação (entrada/saída/ajuste/perda/devolução) |
| GET | `/alertas/estoque-baixo` | Usa `estoque.vw_estoque_baixo` (lote vencido não conta como disponível) |
| GET | `/alertas/vencimento` | Usa `estoque.vw_produtos_a_vencer` — `?dias=30\|60\|90` |
| GET | `/produtos/codigo-barras/:codigo` | Atalho do PDV para leitura de EAN |
| GET | `/movimentacoes` | Auditoria — `?produto_id=&limite=` |
| GET/POST | `/categorias` | Cadastro auxiliar exigido pelo formulário de produto |
| GET/POST | `/fornecedores` | Cadastro auxiliar exigido pelo formulário de produto |

Permissão por movimentação: `saida` e `devolucao` pedem `vender` (são as duas
pontas da venda, e o estorno automático da finalização usa o token do operador);
`entrada`, `ajuste` e `perda` pedem `ajustar_estoque` (§6).

**Regra crítica**: `POST /movimentacoes` do tipo `saida` deve escolher automaticamente o lote pela regra **FEFO** (menor `data_validade` com `quantidade > 0`) — não deixar o chamador escolher o lote manualmente, exceto em ajuste/perda.

**Exemplo — saída de estoque:**
```json
// POST /movimentacoes
{ "produto_id": "uuid", "tipo": "saida", "quantidade": 2, "motivo": "venda uuid-da-venda" }
```

---

## vendas-service (porta 3003)

| Método | Rota | Descrição |
|---|---|---|
| POST | `/vendas` | Abre uma venda (status `aberta`) |
| POST | `/vendas/:id/itens` | Adiciona item (chama `estoque-service` para validar disponibilidade) |
| POST | `/vendas/:id/receita` | Registra dados da receita (obrigatório se algum item for controlado) |
| POST | `/vendas/:id/pagamentos` | Adiciona forma de pagamento (suporta múltiplos, ex: pagamento misto) |
| POST | `/vendas/:id/finalizar` | Fecha a venda: valida receita se necessário, chama `estoque-service` (saída FEFO) e `financeiro-service` (lançamento no caixa) |
| POST | `/vendas/:id/cancelar` | Cancela — exige perfil gerente/admin e motivo |
| GET | `/vendas/:id` | Detalhe completo |
| DELETE | `/vendas/:id/itens/:itemId` | Remove item do carrinho e recalcula o total |
| POST | `/vendas/:id/desconto` | Aplica desconto, limitado ao percentual do perfil (§3) |
| GET | `/vendas` | Vendas do dia (status, itens, formas de pagamento) |
| GET | `/vendas/resumo/hoje` | Total, ticket médio, quebra por forma de pagamento e variação vs. ontem |

`POST /vendas/:id/finalizar` também recusa (422) venda sem item, venda com
pagamentos abaixo do total (`pagamento_insuficiente`) e item acima do estoque
disponível. Cancelamento de venda **já finalizada** não está no MVP (estorno de
estoque e caixa) — ver `docs/PENDENCIAS.md`.

**Regra crítica (§3)**: `POST /vendas/:id/finalizar` **bloqueia** (HTTP 422) se houver item com `tipo_controle` diferente de `livre` e nenhuma receita vinculada. Essa validação é feita no `vendas-service`, consultando o `estoque-service` para saber o `tipo_controle` de cada item.

**Exemplo — bloqueio de controlado sem receita:**
```json
// POST /vendas/:id/finalizar
// 422 Unprocessable Entity
{ "erro": "receita_obrigatoria", "mensagem": "Item controlado sem receita vinculada." }
```

---

## financeiro-service (porta 3004)

| Método | Rota | Descrição |
|---|---|---|
| POST | `/caixa/abrir` | Abre caixa do dia (`valor_abertura`) — só 1 caixa aberto por usuário |
| POST | `/caixa/:id/fechar` | Fecha caixa, compara esperado x contado |
| GET | `/caixa/status` | Caixa aberto do usuário atual, se houver |
| POST | `/caixa/movimentacoes` | Lançamento manual (venda gera automático, nunca manual — §5) |
| GET | `/contas-pagar` | Lista, filtro por status |
| POST | `/contas-pagar` | Cria conta a pagar |
| GET | `/contas-receber` | Lista, filtro por status |
| POST | `/contas-receber` | Cria conta a receber |
| PATCH | `/contas-pagar/:id/pagar` | Quita a conta (status `pago`, `pago_em`) |
| PATCH | `/contas-receber/:id/receber` | Baixa o recebimento (status `recebido`) |
| GET | `/fluxo-caixa/hoje` | Junta o caixa aberto do operador com o resumo do dia buscado no vendas-service |

Sem caixa aberto, `POST /caixa/movimentacoes` recusa com 422 `caixa_fechado` —
por consequência, a venda não finaliza antes de o operador abrir o caixa (§5).

---

## fiscal-service (porta 3005)

| Método | Rota | Descrição |
|---|---|---|
| POST | `/notas-fiscais` | Emite NFC-e — **mockado no MVP**, sempre retorna `status: "simulado"` |
| GET | `/notas-fiscais/:venda_id` | Consulta nota de uma venda |
| POST | `/controlados-sngpc` | Registra envio ao SNGPC — **mockado**, `enviado_anvisa` sempre `false` |
| GET | `/controlados-sngpc` | Lista registros — `?venda_id=` |

`POST /notas-fiscais` é idempotente: a mesma venda devolve sempre a mesma nota,
com chave de acesso simulada de 44 dígitos derivada do ID da venda.

---

## Fluxo entre serviços — exemplo completo (finalizar uma venda)

1. Front chama `POST /vendas/:id/finalizar` no `vendas-service`.
2. `vendas-service` consulta `estoque-service` (`GET /produtos/:id`) para conferir `tipo_controle` de cada item.
3. Se houver controlado sem receita → bloqueia (422), fim do fluxo.
4. Caso contrário, `vendas-service` chama `estoque-service` (`POST /movimentacoes`, tipo `saida`) para cada item.
5. `vendas-service` chama `financeiro-service` (`POST /caixa/movimentacoes`) para lançar o valor recebido.
6. `vendas-service` chama `fiscal-service` (`POST /notas-fiscais`) para emitir a nota (mockada).
7. `vendas-service` marca a venda como `finalizada` e retorna 200 ao front.

Se qualquer chamada de 4 a 6 falhar, a venda **não** é marcada como finalizada:
o `vendas-service` estorna o que já tinha efeito (devolução dos lotes baixados e
saída do valor lançado no caixa), devolve o erro do serviço que falhou e deixa a
venda em `aberta` para nova tentativa. Falha no próprio estorno vira log de erro
com o ID da venda, para conferência manual.
