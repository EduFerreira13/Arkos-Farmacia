# Arkos — Modelagem de Dados

> Cada módulo tem seu próprio schema lógico no PostgreSQL, mesmo rodando no mesmo processo (ver `docs/ARQUITETURA.md`). Referências entre módulos (ex: `produto_id` dentro de `vendas`) são **por ID apenas — sem FK real entre schemas**, porque um módulo nunca acessa a tabela de outro diretamente, só via API.
>
> `database/schema/*.md` (gerado por `sync-schema.js`, nunca editado à mão) é a fonte de verdade para a lista exata de colunas, tipos, nulabilidade e defaults de cada tabela — sempre reflete o banco real. Este documento não repete isso: ele mostra os **relacionamentos** (ERD) e o **significado de negócio** de cada tabela/enum, coisa que o schema gerado não carrega. Se algo aqui divergir do schema gerado, o schema gerado está certo.

---

## `auth`

```mermaid
erDiagram
  PERFIS ||--o{ USUARIOS : possui
  USUARIOS ||--o{ TOKENS_RECUPERACAO : solicita
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
  TOKENS_RECUPERACAO {
    uuid id PK
    uuid usuario_id FK
    text token_hash
    timestamp expira_em
    timestamp usado_em
    timestamp criado_em
  }
```

| Tabela | Campo-chave | Observação |
|---|---|---|
| `perfis` | `nome` | operador_caixa, farmaceutico, gerente, administrador (ver `REGRAS-NEGOCIO.md` §7) |
| `usuarios` | `email` (único) | `senha_hash` nunca em texto plano |
| `tokens_recuperacao` | `token_hash` | hash do token de redefinição de senha (nunca o token em texto puro); `expira_em` controla validade do link, `usado_em` impede reuso |

---

## `estoque`

```mermaid
erDiagram
  CATEGORIAS ||--o{ PRODUTOS : classifica
  FORNECEDORES ||--o{ PRODUTOS : fornece
  PRODUTOS ||--o{ LOTES : possui
  PRODUTOS ||--o{ MOVIMENTACOES_ESTOQUE : gera
  PRODUTOS ||--o{ HISTORICO_PRECOS : audita
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
    string codigo
    string nome
    string principio_ativo
    string codigo_barras
    string tipo_controle
    string fabricante
    string classe_terapeutica
    string unidade_venda
    string ncm
    string cfop
    boolean venda_sob_encomenda
    int dias_de_uso
    numeric preco_custo
    numeric preco_venda
    int estoque_minimo
    timestamp criado_em
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
  HISTORICO_PRECOS {
    uuid id PK
    uuid produto_id FK
    string campo
    numeric valor_anterior
    numeric valor_novo
    uuid usuario_id
    timestamp criado_em
  }
```

| Tabela | Campo-chave | Observação |
|---|---|---|
| `produtos.tipo_controle` | enum | `livre`, `tarja_vermelha`, `tarja_preta` — define se exige receita (§1) |
| `produtos.dias_de_uso` | opcional | sugestão de duração do tratamento, usada pelo CRM de recompra (`vendas.contatos_cliente`) |
| `lotes` | `data_validade` | base da regra **FEFO** — saída sempre pelo lote que vence primeiro (§2) |
| `movimentacoes_estoque.tipo` | enum | `entrada`, `saida`, `ajuste`, `perda`, `devolucao` — toda movimentação é auditada (§2) |
| `historico_precos` | 1 produto → N registros | grava toda alteração de `preco_custo`/`preco_venda`/outros campos monetários, com quem alterou |

**Views** (derivadas, sem PK — só leitura):

| View | Uso |
|---|---|
| `vw_estoque_baixo` | produtos com saldo atual abaixo do `estoque_minimo`, para o dashboard de alertas |
| `vw_produtos_a_vencer` | lotes com `dias_para_vencer` calculado, para o dashboard de alertas de validade |

---

## `vendas`

```mermaid
erDiagram
  VENDAS ||--o{ ITENS_VENDA : contem
  VENDAS ||--o{ PAGAMENTOS : recebe
  VENDAS ||--o| RECEITAS : referencia
  VENDAS }o--o| CLIENTES : identifica
  CLIENTES ||--o{ CONTATOS_CLIENTE : recebe

  VENDAS {
    uuid id PK
    uuid usuario_id
    uuid cliente_id FK
    bigint numero
    string status
    string origem_sincronizacao
    numeric valor_total
    numeric desconto
    text motivo_cancelamento
    string categoria_cancelamento
    boolean estoque_conferencia_pendente
    uuid conferencia_resolvida_por
    timestamp conferencia_resolvida_em
    timestamp finalizado_em
    timestamp criado_em
  }
  ITENS_VENDA {
    uuid id PK
    uuid venda_id FK
    uuid produto_id
    uuid lote_id
    string produto_nome
    string tipo_controle
    int quantidade
    numeric preco_unitario
    numeric desconto
    int dias_de_uso
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
    bytea anexo
    string anexo_tipo
    string anexo_nome
    timestamp anexo_enviado_em
  }
  CLIENTES {
    uuid id PK
    string nome
    string cpf
    string telefone
    string email
    string convenio
    text observacao
    boolean ativo
    boolean aceita_contato
    date data_nascimento
    text endereco
    uuid dados_excluidos_por
    timestamp dados_excluidos_em
    timestamp criado_em
  }
  CONTATOS_CLIENTE {
    uuid id PK
    uuid cliente_id FK
    uuid usuario_id
    uuid venda_id
    string canal
    string motivo
    string oferta
    text observacao
    string resultado
    date proximo_contato_em
    numeric desconto_pct
    timestamp criado_em
  }
```

| Tabela | Campo-chave | Observação |
|---|---|---|
| `vendas.status` | enum `status_venda` | `aberta`, `finalizada`, `cancelada` — cancelamento sempre com `motivo_cancelamento` + `categoria_cancelamento` (§3) |
| `vendas.origem_sincronizacao` | enum `origem_venda` | `online` (PDV com conexão) ou `offline` (venda feita no PDV offline e sincronizada depois) |
| `vendas.estoque_conferencia_pendente` | flag | marcada quando uma venda `offline` sincronizada deixou saldo de lote negativo — fica pendente até um gerente conferir (`conferencia_resolvida_por`/`_em`); ver nota de saldo negativo em `REGRAS-NEGOCIO.md` §2 |
| `itens_venda.tipo_controle` | cópia do produto | snapshot do `tipo_controle` do produto no momento da venda (histórico não muda se o cadastro do produto mudar depois) |
| `pagamentos` | 1 venda → N pagamentos | suporta pagamento misto (parte cartão, parte dinheiro) |
| `receitas` | vinculada à venda | obrigatória se algum item for `tarja_vermelha`/`tarja_preta` — sem isso, venda bloqueada (§3) |
| `receitas.anexo` | opcional | foto/scan da receita (retenção física exigida pela RDC 20/2011 para antibiótico) — `bytea`, servido por `GET /vendas/:id/receita/anexo`, nunca embutido no JSON do detalhe da venda |
| `clientes.cpf`/`telefone`/`email`/`endereco`/`data_nascimento` | dados pessoais | sujeitos à LGPD (finalidade: identificação para venda/convênio e relacionamento) — coleta e uso devem se limitar a essa finalidade; `aceita_contato` é o registro de consentimento para o CRM de recompra, e deve ser respeitado antes de qualquer contato em `contatos_cliente` |
| `clientes.dados_excluidos_por`/`dados_excluidos_em` | direito de exclusão (LGPD) | preenchidos por `POST /vendas/clientes/:id/excluir-dados` ou pela retenção automática (`npm run retencao:clientes`, 2 anos sem compra) — quando não-nulos, os demais campos pessoais da linha já foram anonimizados, mas o `id` permanece para não quebrar `vendas`/`itens_venda`/`contatos_cliente` que referenciam esse cliente |
| `contatos_cliente.resultado` | enum `resultado_contato` | `aguardando`, `interessado`, `sem_interesse`, `nao_atendeu`, `convertido` — fecha o ciclo do CRM de recompra |
| `contatos_cliente.canal` | enum `canal_contato` | `telefone`, `whatsapp`, `email`, `presencial` |

**Views**:

| View | Uso |
|---|---|
| `vw_vendas_hoje` | `total_vendas`, `valor_total_dia`, `ticket_medio` do dia local (`TZ_NEGOCIO`) — alimenta o dashboard |

---

## `financeiro`

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
    uuid venda_id
    string tipo
    numeric valor
    string origem
    string descricao
    timestamp criado_em
  }
```

| Tabela | Campo-chave | Observação |
|---|---|---|
| `caixa` | abertura/fechamento | fechamento sempre confere esperado x contado (§5) |
| `movimentacoes_caixa` | gerada automaticamente | toda venda finalizada gera lançamento — nunca manual (§5); `venda_id` referencia a venda de origem por ID (sem FK real — `financeiro` não acessa o schema `vendas` diretamente) |
| `contas_pagar` | `fornecedor_id` | referencia `estoque.fornecedores` por ID; ligado ao fluxo de compras (`compras.pedidos` gera conta a pagar no recebimento) |

---

## `fiscal`

```mermaid
erDiagram
  NOTAS_FISCAIS {
    uuid id PK
    uuid venda_id
    string chave_acesso
    string status
    string numero
    string serie
    string cpf_nota
    string url_consulta
    string mensagem_erro
    jsonb retorno_focus
    string xml_url
    timestamp emitida_em
  }
  CONTROLADOS_SNGPC {
    uuid id PK
    uuid venda_id
    uuid produto_id
    uuid receita_id
    boolean enviado_anvisa
    timestamp enviado_em
    timestamp criado_em
  }
```

| Tabela | Campo-chave | Observação |
|---|---|---|
| `notas_fiscais` | `status` | `emitida` (autorizada pela SEFAZ) ou `erro` (rejeição/payload incompleto — motivo em `mensagem_erro`); `simulado` é o default histórico da coluna, de antes da integração real com a Focus NFe (§6) |
| `notas_fiscais.cpf_nota` | dado pessoal | CPF do cliente na nota (quando informado na venda) — dado sensível sob a LGPD; finalidade é estritamente fiscal (emissão de NF-e), não deve ser reaproveitado para outro fim sem base legal própria |
| `controlados_sngpc` | `enviado_anvisa` | fica `false` no MVP — campo já existe para quando a integração real for feita; `enviado_em` registra o timestamp do envio quando acontecer |

---

## `compras`

```mermaid
erDiagram
  PEDIDOS ||--o{ ITENS_PEDIDO : contem
  PEDIDOS ||--o{ RECEBIMENTOS : gera
  RECEBIMENTOS ||--o{ ITENS_RECEBIMENTO : contem

  PEDIDOS {
    uuid id PK
    uuid fornecedor_id
    string fornecedor_nome
    string numero
    string status
    text observacao
    text motivo_cancelamento
    string forma_pagamento
    numeric valor_total
    numeric frete
    numeric desconto
    uuid usuario_id
    timestamp criado_em
    timestamp enviado_em
    timestamp recebido_em
    date entregue_em
  }
  ITENS_PEDIDO {
    uuid id PK
    uuid pedido_id FK
    uuid produto_id
    string produto_nome
    int quantidade
    numeric preco_unitario
  }
  RECEBIMENTOS {
    uuid id PK
    uuid pedido_id FK
    uuid usuario_id
    text observacao
    boolean tem_divergencia
    timestamp recebido_em
  }
  ITENS_RECEBIMENTO {
    uuid id PK
    uuid recebimento_id FK
    uuid item_pedido_id FK
    uuid produto_id
    string produto_nome
    int quantidade_pedida
    int quantidade_recebida
    string numero_lote
    date data_validade
    int divergencia
  }
```

| Tabela | Campo-chave | Observação |
|---|---|---|
| `pedidos.status` | enum `status_pedido` | `rascunho`, `enviado`, `recebido`, `cancelado` |
| `pedidos.numero` | gerado | formato `PC-<ano>-<sequencial>` (sequência própria por schema) |
| `pedidos.fornecedor_id` | referencia | `estoque.fornecedores` por ID (sem FK real entre schemas) |
| `itens_recebimento.divergencia` | calculado | `quantidade_recebida - quantidade_pedida`; `recebimentos.tem_divergencia` sinaliza se algum item do recebimento divergiu — conferência manual antes de dar entrada no estoque (o recebimento gera `estoque.movimentacoes_estoque` e `financeiro.contas_pagar` por HTTP) |

---

## Convenções gerais

- Toda tabela usa `uuid` como chave primária (evita conflito ao gerar IDs em módulos diferentes sem coordenação central).
- Datas de auditoria (`criado_em`, etc.) em `timestamp with time zone`.
- Nenhuma FK cruza schemas de módulos diferentes — só dentro do mesmo módulo. Referências entre módulos são por ID, resolvidas via HTTP quando o dado do outro lado é necessário.
- Campos monetários sempre `numeric(10,2)`, nunca float.
- Colunas com dado pessoal (CPF, telefone, e-mail, endereço, data de nascimento) existem hoje em `vendas.clientes` e `fiscal.notas_fiscais.cpf_nota` — qualquer novo uso desses dados (relatório, exportação, integração) deve respeitar a finalidade original (venda/convênio/nota fiscal) e os princípios de minimização da LGPD, não presumir uso livre só porque o dado já está no banco.
