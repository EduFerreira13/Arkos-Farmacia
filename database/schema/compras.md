# Schema `compras`

> Gerado automaticamente por `database/scripts/sync-schema.js`. Não editar à mão.

## itens_pedido

| Coluna | Tipo | Nulo? | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| pedido_id | uuid | NO | - |
| produto_id | uuid | NO | - |
| produto_nome | character varying | NO | - |
| quantidade | integer | NO | - |
| preco_unitario | numeric | NO | - |

## itens_recebimento

| Coluna | Tipo | Nulo? | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| recebimento_id | uuid | NO | - |
| item_pedido_id | uuid | NO | - |
| produto_id | uuid | NO | - |
| produto_nome | character varying | NO | - |
| quantidade_pedida | integer | NO | - |
| quantidade_recebida | integer | NO | - |
| numero_lote | character varying | NO | - |
| data_validade | date | NO | - |
| divergencia | integer | NO | 0 |

## pedidos

| Coluna | Tipo | Nulo? | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| fornecedor_id | uuid | NO | - |
| fornecedor_nome | character varying | NO | - |
| status | character varying | NO | 'pendente_entrega'::character varying |
| observacao | text | YES | - |
| motivo_cancelamento | text | YES | - |
| valor_total | numeric | NO | 0 |
| usuario_id | uuid | NO | - |
| criado_em | timestamp with time zone | NO | now() |
| enviado_em | timestamp with time zone | YES | - |
| recebido_em | timestamp with time zone | YES | - |
| numero | character varying | NO | ((('PC-'::text || to_char(now(), 'YYYY'::text)) || '-'::text) || lpad((nextval('compras.pedido_numero_seq'::regclass))::text, 5, '0'::text)) |
| forma_pagamento | character varying | NO | 'boleto'::character varying |
| frete | numeric | NO | 0 |
| desconto | numeric | NO | 0 |
| entregue_em | date | YES | - |

## recebimentos

| Coluna | Tipo | Nulo? | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| pedido_id | uuid | NO | - |
| usuario_id | uuid | NO | - |
| observacao | text | YES | - |
| tem_divergencia | boolean | NO | false |
| recebido_em | timestamp with time zone | NO | now() |

