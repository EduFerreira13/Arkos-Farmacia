# Schema `auth`

> Gerado automaticamente por `database/scripts/sync-schema.js`. Não editar à mão.

## perfis

| Coluna | Tipo | Nulo? | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| nome | character varying | NO | - |
| permissoes | jsonb | NO | '{}'::jsonb |
| criado_em | timestamp with time zone | NO | now() |

## tokens_recuperacao

| Coluna | Tipo | Nulo? | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| usuario_id | uuid | NO | - |
| token_hash | text | NO | - |
| expira_em | timestamp with time zone | NO | - |
| usado_em | timestamp with time zone | YES | - |
| criado_em | timestamp with time zone | NO | now() |

## usuarios

| Coluna | Tipo | Nulo? | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| perfil_id | uuid | NO | - |
| nome | character varying | NO | - |
| email | character varying | NO | - |
| senha_hash | text | NO | - |
| ativo | boolean | NO | true |
| criado_em | timestamp with time zone | NO | now() |

