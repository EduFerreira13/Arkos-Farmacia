# Schema `estoque`

> Gerado automaticamente por `database/scripts/sync-schema.js`. Não editar à mão.

## categorias

| Coluna | Tipo | Nulo? | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| nome | character varying | NO | - |

## fornecedores

| Coluna | Tipo | Nulo? | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| nome | character varying | NO | - |
| cnpj | character varying | YES | - |
| telefone | character varying | YES | - |
| email | character varying | YES | - |

## historico_precos

| Coluna | Tipo | Nulo? | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| produto_id | uuid | NO | - |
| campo | character varying | NO | - |
| valor_anterior | numeric | NO | - |
| valor_novo | numeric | NO | - |
| usuario_id | uuid | NO | - |
| criado_em | timestamp with time zone | NO | now() |

## lotes

| Coluna | Tipo | Nulo? | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| produto_id | uuid | NO | - |
| numero_lote | character varying | NO | - |
| quantidade | integer | NO | 0 |
| data_validade | date | NO | - |
| data_entrada | date | NO | CURRENT_DATE |

## movimentacoes_estoque

| Coluna | Tipo | Nulo? | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| produto_id | uuid | NO | - |
| lote_id | uuid | YES | - |
| tipo | USER-DEFINED | NO | - |
| quantidade | integer | NO | - |
| motivo | text | YES | - |
| usuario_id | uuid | NO | - |
| criado_em | timestamp with time zone | NO | now() |

## produtos

| Coluna | Tipo | Nulo? | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| categoria_id | uuid | YES | - |
| fornecedor_id | uuid | YES | - |
| nome | character varying | NO | - |
| principio_ativo | character varying | YES | - |
| codigo_barras | character varying | YES | - |
| tipo_controle | USER-DEFINED | NO | 'livre'::estoque.tipo_controle |
| preco_custo | numeric | NO | 0 |
| preco_venda | numeric | NO | 0 |
| estoque_minimo | integer | NO | 0 |
| criado_em | timestamp with time zone | NO | now() |
| fabricante | character varying | YES | - |
| classe_terapeutica | character varying | YES | - |
| unidade_venda | character varying | NO | 'unidade'::character varying |
| ncm | character varying | YES | - |
| cfop | character varying | YES | - |
| venda_sob_encomenda | boolean | NO | false |
| dias_de_uso | integer | YES | - |
| codigo | character varying | YES | - |

## vw_estoque_baixo

| Coluna | Tipo | Nulo? | Default |
|---|---|---|---|
| produto_id | uuid | YES | - |
| nome | character varying | YES | - |
| estoque_minimo | integer | YES | - |
| quantidade_atual | bigint | YES | - |

## vw_produtos_a_vencer

| Coluna | Tipo | Nulo? | Default |
|---|---|---|---|
| lote_id | uuid | YES | - |
| produto_id | uuid | YES | - |
| nome | character varying | YES | - |
| numero_lote | character varying | YES | - |
| quantidade | integer | YES | - |
| data_validade | date | YES | - |
| dias_para_vencer | integer | YES | - |

