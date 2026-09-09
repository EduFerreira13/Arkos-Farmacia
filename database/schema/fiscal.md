# Schema `fiscal`

> Gerado automaticamente por `database/scripts/sync-schema.js`. Não editar à mão.

## controlados_sngpc

| Coluna | Tipo | Nulo? | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| venda_id | uuid | NO | - |
| produto_id | uuid | NO | - |
| receita_id | uuid | NO | - |
| enviado_anvisa | boolean | NO | false |
| criado_em | timestamp with time zone | NO | now() |
| enviado_em | timestamp with time zone | YES | - |

## notas_fiscais

| Coluna | Tipo | Nulo? | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| venda_id | uuid | NO | - |
| chave_acesso | character varying | YES | - |
| status | character varying | NO | 'simulado'::character varying |
| xml_url | text | YES | - |
| emitida_em | timestamp with time zone | NO | now() |
| cpf_nota | character varying | YES | - |

