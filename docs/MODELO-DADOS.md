# Arkos — Modelagem de Dados

> Cada serviço tem seu próprio schema lógico no PostgreSQL (ver `docs/ARQUITETURA.md`). Referências entre serviços (ex: `produto_id` dentro de `vendas`) são **por ID apenas — sem FK real entre schemas**, porque um serviço nunca acessa a tabela de outro diretamente, só via API.
>
> Esta modelagem é o ponto de partida para as migrations. `database/schema/` (gerado por `sync-schema.js`) será a fonte de verdade depois que o banco existir de fato.

---

## `auth` (auth-service)

```mermaid
erDiagram
  PERFIS ||--o{ USUARIOS : possui
  PERFIS {
    uuid id PK
    string nome
    jsonb permissoes
  }
  USUARIOS {
    uuid id PK
    uuid perfil_id FK
    string nome
    string email
    string senha_hash
    boolean ativo
    timestamp criado_em
  }
```

| Tabela | Campo-chave | Observação |
|---|---|---|
| `perfis` | `nome` | operador_caixa, farmaceutico, gerente, administrador (ver `REGRAS-NEGOCIO.md` §7) |
| `usuarios` | `email` (único) | `senha_hash` nunca em texto plano |

---

## `estoque` (estoque-service)

```mermaid
erDiagram
  CATEGORIAS ||--o{ PRODUTOS : classifica
  FORNECEDORES ||--o{ PRODUTOS : fornece
  PRODUTOS ||--o{ LOTES : possui
  PRODUTOS ||--o{ MOVIMENTACOES_ESTOQUE : gera
  LOTES ||--o{ MOVIMENTACOES_ESTOQUE : origem

  CATEGORIAS {
    uuid id PK
    string nome
  }
  FORNECEDORES {
    uuid id PK
    string nome
    string cnpj
    string telefone
    string email
  }
  PRODUTOS {
    uuid id PK
    uuid categoria_id FK
    uuid fornecedor_id FK
    string nome
    string principio_ativo
    string codigo_barras
    string tipo_controle
    numeric preco_custo
    numeric preco_venda
    int estoque_minimo
  }
  LOTES {
    uuid id PK
    uuid produto_id FK
    string numero_lote
    int quantidade
    date data_validade
    date data_entrada
  }
  MOVIMENTACOES_ESTOQUE {
    uuid id PK
    uuid produto_id FK
    uuid lote_id FK
    string tipo
    int quantidade
    string motivo
    uuid usuario_id
    timestamp criado_em
  }
```

| Tabela | Campo-chave | Observação |
|---|---|---|
| `produtos.tipo_controle` | enum | `livre`, `tarja_vermelha`, `tarja_preta` — define se exige receita (§1) |
| `lotes` | `data_validade` | base da regra **FEFO** — saída sempre pelo lote que vence primeiro (§2) |
| `movimentacoes_estoque.tipo` | enum | `entrada`, `saida`, `ajuste`, `perda`, `devolucao` — toda movimentação é auditada (§2) |

---

## `vendas` (vendas-service)

```mermaid
erDiagram
  VENDAS ||--o{ ITENS_VENDA : contem
  VENDAS ||--o{ PAGAMENTOS : recebe
  VENDAS ||--o| RECEITAS : referencia

  VENDAS {
    uuid id PK
    uuid usuario_id
    string status
    numeric valor_total
    numeric desconto
    timestamp criado_em
  }
  ITENS_VENDA {
    uuid id PK
    uuid venda_id FK
    uuid produto_id
    uuid lote_id
    int quantidade
    numeric preco_unitario
  }
  PAGAMENTOS {
    uuid id PK
    uuid venda_id FK
    string forma_pagamento
    numeric valor
  }
  RECEITAS {
    uuid id PK
    uuid venda_id FK
    string medico_nome
    string medico_crm
    string paciente_nome
    date data_emissao
  }
```

| Tabela | Campo-chave | Observação |
|---|---|---|
| `vendas.status` | enum | `aberta`, `finalizada`, `cancelada` — cancelamento sempre com motivo (§3) |
| `pagamentos` | 1 venda → N pagamentos | suporta pagamento misto (parte cartão, parte dinheiro) |
| `receitas` | vinculada à venda | obrigatória se algum item for `tarja_vermelha`/`tarja_preta` — sem isso, venda bloqueada (§3) |

---

## `financeiro` (financeiro-service)

```mermaid
erDiagram
  CAIXA ||--o{ MOVIMENTACOES_CAIXA : registra

  CONTAS_PAGAR {
    uuid id PK
    uuid fornecedor_id
    string descricao
    numeric valor
    date vencimento
    string status
    timestamp pago_em
  }
  CONTAS_RECEBER {
    uuid id PK
    string origem
    string descricao
    numeric valor
    date vencimento
    string status
    timestamp recebido_em
  }
  CAIXA {
    uuid id PK
    uuid usuario_id
    numeric valor_abertura
    numeric valor_fechamento_esperado
    numeric valor_fechamento_contado
    timestamp aberto_em
    timestamp fechado_em
  }
  MOVIMENTACOES_CAIXA {
    uuid id PK
    uuid caixa_id FK
    string tipo
    numeric valor
    string origem
    timestamp criado_em
  }
```

| Tabela | Campo-chave | Observação |
|---|---|---|
| `caixa` | abertura/fechamento | fechamento sempre confere esperado x contado (§5) |
| `movimentacoes_caixa` | gerada automaticamente | toda venda finalizada gera lançamento — nunca manual (§5) |

---

## `fiscal` (fiscal-service)

```mermaid
erDiagram
  NOTAS_FISCAIS {
    uuid id PK
    uuid venda_id
    string chave_acesso
    string status
    string xml_url
    timestamp emitida_em
  }
  CONTROLADOS_SNGPC {
    uuid id PK
    uuid venda_id
    uuid produto_id
    uuid receita_id
    boolean enviado_anvisa
    timestamp criado_em
  }
```

| Tabela | Campo-chave | Observação |
|---|---|---|
| `notas_fiscais` | `status` | no MVP fica mockado (`simulado`), estrutura pronta pra integrar provedor real depois (§6) |
| `controlados_sngpc` | `enviado_anvisa` | fica `false` no MVP — campo já existe para quando a integração real for feita |

---

## Convenções gerais

- Toda tabela usa `uuid` como chave primária (evita conflito ao gerar IDs em serviços diferentes sem coordenação central).
- Datas de auditoria (`criado_em`, etc.) em `timestamp with time zone`.
- Nenhuma FK cruza schemas de serviços diferentes — só dentro do mesmo serviço.
- Campos monetários sempre `numeric(10,2)`, nunca float.
