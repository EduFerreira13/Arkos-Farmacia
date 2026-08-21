# Schema `vendas`

> Gerado automaticamente por `database/scripts/sync-schema.js`. Não editar à mão.

## itens_venda

| Coluna | Tipo | Nulo? | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| venda_id | uuid | NO | - |
| produto_id | uuid | NO | - |
| lote_id | uuid | YES | - |
| quantidade | integer | NO | - |
| preco_unitario | numeric | NO | - |
| produto_nome | character varying | YES | - |
| tipo_controle | character varying | YES | - |

## pagamentos

| Coluna | Tipo | Nulo? | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| venda_id | uuid | NO | - |
| forma_pagamento | character varying | NO | - |
| valor | numeric | NO | - |

## receitas

| Coluna | Tipo | Nulo? | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| venda_id | uuid | NO | - |
| medico_nome | character varying | NO | - |
| medico_crm | character varying | NO | - |
| paciente_nome | character varying | NO | - |
| data_emissao | date | NO | - |

## vendas

| Coluna | Tipo | Nulo? | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| usuario_id | uuid | NO | - |
| status | USER-DEFINED | NO | 'aberta'::vendas.status_venda |
| valor_total | numeric | NO | 0 |
| desconto | numeric | NO | 0 |
| motivo_cancelamento | text | YES | - |
| criado_em | timestamp with time zone | NO | now() |

## vw_vendas_hoje

| Coluna | Tipo | Nulo? | Default |
|---|---|---|---|
| total_vendas | bigint | YES | - |
| valor_total_dia | numeric | YES | - |
| ticket_medio | numeric | YES | - |

