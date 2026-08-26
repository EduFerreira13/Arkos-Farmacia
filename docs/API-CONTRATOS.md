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
| POST | `/auth/recuperar-senha` | Gera código de redefinição válido por 30 minutos |
| POST | `/auth/redefinir-senha` | Troca a senha usando o código (uso único) |
| GET | `/auth/usuarios` | Lista usuários (admin) |
| POST | `/auth/simular` | `{ perfil }` → token valendo com o perfil escolhido (só administrador) |
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

**Simulação de perfil**: `POST /auth/simular` devolve um token que vale com o
perfil pedido (e com os limites dele, como desconto máximo), guardando o perfil
real em `perfil_real` — a ação continua rastreável a quem operou. Vale 1 hora e
não aceita simular dentro de simulação; enquanto durar, `GET /auth/me` responde
com o perfil simulado. Encerrar é do lado do cliente: ele volta a usar o token
original que guardou.

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
| PATCH | `/fornecedores/:id` | Atualiza fornecedor |
| GET | `/relatorios/estoque` | Planilha da posição atual (saldo, vencido, situação, valor em estoque) |
| GET | `/relatorios/movimentacoes` | Planilha da auditoria — `?de=&ate=` |

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
| POST | `/vendas/:id/cancelar` | Cancela — exige perfil gerente/admin e `categoria` da lista fechada |
| DELETE | `/vendas/:id/receita` | Desvincula a receita enquanto a venda está aberta |
| GET | `/vendas/:id` | Detalhe completo |
| PATCH | `/vendas/:id/itens/:itemId` | Altera a quantidade da linha, reconferindo o saldo |
| DELETE | `/vendas/:id/itens/:itemId` | Remove item do carrinho e recalcula o total |
| POST | `/vendas/:id/itens/:itemId/desconto` | Desconto de um item só |
| POST | `/vendas/:id/desconto` | Aplica desconto, limitado ao percentual do perfil (§3) |
| GET | `/vendas` | Histórico com filtros; sem data, o movimento de hoje |
| GET | `/vendas/resumo/hoje` | Total, ticket médio, quebra por forma de pagamento e variação vs. ontem |
| GET | `/vendas/relatorio` | Planilha do período — `?de=&ate=`, `?agrupar=produto` para o total por produto |
| GET | `/vendas/analise` | Vendas por produto, por dia e por forma no período (base do BI) |
| GET | `/vendas/receitas` | Receitas retidas — `?de=&ate=&busca=` |
| GET/POST | `/vendas/clientes` | Cadastro de clientes (`?busca=`) |
| PATCH | `/vendas/clientes/:id` | Atualiza cliente |
| POST | `/vendas/:id/cliente` | Vincula (ou desvincula) o cliente da venda |
| DELETE | `/vendas/:id/pagamentos/:pagamentoId` | Remove forma de pagamento antes de finalizar |

`GET /vendas` aceita `de`, `ate`, `status`, `controlado=sim|nao`, `busca`
(produto, paciente ou cliente) e `limite`, e devolve os totais do recorte. Sem
filtro de data, responde o movimento de hoje.

`POST /vendas/:id/desconto` aceita `desconto` (reais) **ou** `desconto_pct`
(percentual) — os dois passam pelo mesmo limite do perfil (§3). O desconto por
item usa o mesmo par de campos, e o teto do perfil é conferido sobre a soma de
tudo: descontos de item mais o desconto da venda.

`POST /vendas/:id/itens` **soma na linha que já existe** quando o produto já está
no carrinho, em vez de repetir o produto. Corrigir a quantidade depois é
`PATCH /vendas/:id/itens/:itemId` com `{ "quantidade": n }`, que reconfere o
saldo disponível antes de aumentar.

Toda venda recebe um `numero` sequencial (`vendas.numero_venda_seq`) — é o que
aparece na tela e na planilha, no lugar de um pedaço do identificador.

`POST /vendas/:id/cancelar` exige `categoria` em `CATEGORIA_CANCELAMENTO_LISTA`
(`compra_errada`, `pagamento_errado`, `orcamento`, `desistencia`, `item_errado`,
`outro`); o `motivo` em texto livre continua aceito e é opcional. A categoria é o
que permite agrupar no relatório.

`GET /vendas/relatorio` e `GET /vendas/crm/relatorio` aceitam `formato=xlsx`: a
planilha sai com os dados numa aba e o resumo em outra. Sem o parâmetro, sai o
CSV de sempre, com o resumo no rodapé do arquivo — CSV não tem aba.

`GET /vendas/crm/contatos` filtra por `de`, `ate`, `resultado`, `canal` e `busca`
(nome do cliente, motivo ou oferta). `GET /vendas/crm/relatorio?tipo=contatos`
aceita os mesmos parâmetros, para a planilha sair igual ao que está na tela.

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
| GET | `/relatorios/caixa` | Planilha do movimento de caixa — `?de=&ate=` |
| GET | `/relatorios/contas` | Planilha de contas por vencimento — `?tipo=pagar\|receber&de=&ate=` |
| GET | `/visao-geral` | Correlação entre pagar e receber por faixa de vencimento, saldo projetado e curva de caixa |
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
| GET | `/notas-fiscais` | Lista notas do período — `?de=&ate=` |
| GET | `/controlados-sngpc` | Lista registros — `?venda_id=&de=&ate=&pendentes=sim` |
| POST | `/controlados-sngpc/enviar` | Marca registros como enviados — **simulado**, só grava a data |

`POST /notas-fiscais` é idempotente: a mesma venda devolve sempre a mesma nota,
com chave de acesso simulada de 44 dígitos derivada do ID da venda.

---

## compras-service (porta 3006)

| Método | Rota | Descrição |
|---|---|---|
| GET | `/compras/pedidos` | Lista (filtros: `status`, `de`, `ate`) |
| GET | `/compras/pedidos/:id` | Pedido com itens e recebimentos |
| POST | `/compras/pedidos` | Cria pedido em rascunho (`fornecedor_id`, `itens[]`) |
| POST | `/compras/pedidos/:id/enviar` | Marca como enviado ao fornecedor |
| POST | `/compras/pedidos/:id/cancelar` | Cancela — exige motivo |
| POST | `/compras/pedidos/:id/receber` | Conferência item a item, entrada no estoque e conta a pagar |
| GET | `/compras/sugestao` | Sugestão de compra a partir do estoque baixo |
| GET | `/compras/relatorios/pedidos` | Planilha dos pedidos do período |

**Regra crítica (§4)**: `POST /compras/pedidos/:id/receber` compara a quantidade
recebida com a pedida, item a item. Divergência **não bloqueia** a entrada — é
gravada em `compras.itens_recebimento.divergencia` e devolvida em
`alerta_divergencia` para o gestor ver. Cada item recebido entra como lote no
`estoque-service` e o valor **efetivamente recebido** (não o do pedido) vira
conta a pagar no `financeiro-service`.

**Exemplo — recebimento com falta:**
```json
// POST /compras/pedidos/:id/receber
{ "itens": [{ "item_pedido_id": "uuid", "quantidade_recebida": 8,
              "numero_lote": "REC-1042", "data_validade": "2027-12-31" }] }

// 200 OK
{
  "recebimento": { "tem_divergencia": true },
  "alerta_divergencia": ["Dipirona 500mg: pedido 10, recebido 8"],
  "valor_recebido": 36.00,
  "conta_pagar": { "id": "uuid", "valor": 36.00 }
}
```

Se a conta a pagar falhar depois da entrada, a mercadoria **não** é desfeita (ela
chegou de verdade): a resposta traz `aviso_conta` pedindo o lançamento manual.

---

## Relacionamento com clientes (CRM) — vendas-service

| Método | Rota | Descrição |
|---|---|---|
| GET | `/vendas/crm/clientes` | Fila de contato ordenada por urgência (`?situacao=&busca=`) |
| GET | `/vendas/crm/clientes/:id` | Ficha: análise, últimas compras e contatos |
| GET | `/vendas/crm/resumo` | Contadores por situação, recompra prevista e contatos |
| GET | `/vendas/crm/contatos` | Contatos registrados (`?de=&ate=&resultado=`) |
| POST | `/vendas/crm/contatos` | Registra contato (`cliente_id`, `canal`, `motivo`, `oferta`) |
| PATCH | `/vendas/crm/contatos/:id` | Atualiza o resultado do contato |

A análise sai só do schema `vendas` — nenhum outro serviço é consultado. O preço
e o saldo atual do produto sugerido são cruzados por quem monta a tela, pelo
`estoque-service`: não faz sentido oferecer o que não há para entregar.

**Como a situação de cada cliente é decidida:**

| Situação | Regra |
|---|---|
| `novo` | nenhuma compra, ou só uma há menos de 30 dias |
| `ativo` | comprando dentro do próprio ritmo |
| `recompra_atrasada` | passou de 25% do intervalo médio dele sem aparecer |
| `em_risco` | sem histórico de ritmo e 30 dias parado, ou 1,5× o intervalo |
| `inativo` | três intervalos sem comprar (mínimo de 45 dias) |

O intervalo médio é a janela entre a primeira e a última compra dividida pelo
número de compras menos um — só existe a partir da segunda compra. **Uso
contínuo** é o produto que o cliente levou três vezes ou mais: é o sinal mais
forte, porque significa tratamento em andamento e, se atrasou, provavelmente a
pessoa ficou sem o medicamento.

Cada cliente da fila vem com `motivo` (por que ligar), `oferta` (o que propor),
`mensagem` (texto pronto, tirado do próprio histórico) e `prioridade`, que ordena
a lista. Cliente com `aceita_contato = false` não entra na fila.

---

## Relatórios em planilha

As rotas `/relatorio*` devolvem **CSV** (`text/csv`) com separador `;`, decimal
com vírgula e BOM — é o formato que o Excel em português abre com um duplo
clique, já com as colunas separadas. O nome do arquivo vem no
`Content-Disposition`. Como a rota exige token, o front baixa por `fetch` e não
por link direto.

Toda coluna cujo título traz `(R$)` sai com duas casas; quantidade inteira sai
sem casas. O período é inclusivo nas duas pontas e, quando omitido, vale o dia
de hoje.

## Fuso do negócio

O dia da farmácia (dashboard, `vw_vendas_hoje`, fechamento de caixa, janelas de
validade, período padrão dos relatórios) é o dia local, definido por
`TZ_NEGOCIO` no `.env` (`America/Sao_Paulo`). Cada serviço abre a conexão com o
Postgres já nesse fuso — sem isso `current_date` viraria à meia-noite UTC e a
venda das 21h cairia no movimento do dia seguinte.

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
