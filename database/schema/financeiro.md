# Schema `financeiro`

> Gerado automaticamente por `database/scripts/sync-schema.js`. Não editar à mão.

## caixa

| Coluna | Tipo | Nulo? | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| usuario_id | uuid | NO | - |
| valor_abertura | numeric | NO | - |
| valor_fechamento_esperado | numeric | YES | - |
| valor_fechamento_contado | numeric | YES | - |
| aberto_em | timestamp with time zone | NO | now() |
| fechado_em | timestamp with time zone | YES | - |

## contas_pagar

| Coluna | Tipo | Nulo? | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| fornecedor_id | uuid | YES | - |
| descricao | character varying | NO | - |
| valor | numeric | NO | - |
| vencimento | date | NO | - |
| status | character varying | NO | 'pendente'::character varying |
| pago_em | timestamp with time zone | YES | - |

## contas_receber

| Coluna | Tipo | Nulo? | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| origem | character varying | NO | - |
| descricao | character varying | NO | - |
| valor | numeric | NO | - |
| vencimento | date | NO | - |
| status | character varying | NO | 'pendente'::character varying |
| recebido_em | timestamp with time zone | YES | - |

## movimentacoes_caixa

| Coluna | Tipo | Nulo? | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| caixa_id | uuid | NO | - |
| tipo | character varying | NO | - |
| valor | numeric | NO | - |
| origem | character varying | NO | - |
| criado_em | timestamp with time zone | NO | now() |
| descricao | character varying | YES | - |
| venda_id | uuid | YES | - |

