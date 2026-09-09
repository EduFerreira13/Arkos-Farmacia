# Arkos — Arquitetura

## Princípio central

O backend é um **monolito modular**: um só processo Node/Fastify (`apps/api`), com um módulo por domínio de negócio, cada um isolado em sua própria pasta e no seu próprio prefixo de rota. Frontend e backend ficam em pastas raiz separadas para nunca haver dúvida sobre o que é o quê.

```
arkos/
├── apps/
│   ├── web/                     # FRONTEND
│   └── api/                     # BACKEND — processo único
│       └── src/
│           ├── modulos/
│           │   ├── auth/
│           │   ├── estoque/
│           │   ├── vendas/
│           │   ├── financeiro/
│           │   ├── fiscal/
│           │   └── compras/
│           ├── app.js           # registra cada módulo no seu prefixo
│           ├── db.js            # pool do Postgres, compartilhado
│           └── env.js
├── database/
│   ├── schema/                  # docs auto-geradas — nunca editar à mão
│   ├── migrations/
│   └── scripts/sync-schema.js
├── packages/
│   └── shared-types/            # único código compartilhado
└── docs/
```

## Por que consolidamos

Os seis serviços (`auth`, `estoque`, `vendas`, `financeiro`, `fiscal`, `compras`) nasceram como processos independentes, pensando num deploy com escala e times por domínio. No estágio de MVP isso custava mais do que valia: seis processos para subir e derrubar em dev, seis portas para gerenciar, seis pontos de rede para expor e proteger. Um processo só reduz a superfície de ataque (uma porta, um binário) e a complexidade operacional (um `npm run dev`, um log, um deploy) sem abrir mão do isolamento entre módulos — cada um continua no seu schema lógico e só enxerga o do outro por HTTP.

## Frontend (`apps/web`)

- React + Vite + Tailwind.
- Consome o backend via API REST — cada módulo mantém seu prefixo de rota (o proxy do Vite manda tudo para o mesmo host:porta).
- Segue o design system em [`REGRAS-VISUAIS.md`](./REGRAS-VISUAIS.md).

## Backend (`apps/api`)

Um processo Fastify só, um módulo por domínio dentro de `src/modulos/`:

- Cada módulo é registrado em `app.js` com o prefixo correspondente ao seu nome (`/auth`, `/estoque`, `/vendas`, `/financeiro`, `/fiscal`, `/compras`) — sem exceção, mesmo os que antes respondiam na raiz.
- Cada módulo tem seu **próprio schema lógico** dentro do mesmo PostgreSQL (ex: `estoque.produtos`, `vendas.pedidos`) — isolamento real de dados sem o custo de manter 5 bancos físicos no MVP. Migrar para bancos físicos separados no futuro é só trocar a connection string.
- Um módulo nunca acessa o schema de outro diretamente: quando precisa (ex: vendas conferindo o `tipo_controle` de um item no estoque), chama a rota do outro módulo por HTTP, como antes — só que agora sempre para o mesmo host:porta (`ESTOQUE_URL`, `FINANCEIRO_URL`, `FISCAL_URL`, `VENDAS_URL` em `env.js` já apontam pra si mesmo). Isso é o que garante que "cada um fica no seu quadrado", mesmo dividindo processo.
- `db.js` e `env.js` são compartilhados (um pool de conexão só, não seis) — o resto de cada módulo (rotas, repositório, regras) é o mesmo código de antes, só reorganizado de pasta.

| Módulo | Responsabilidade |
|---|---|
| `vendas` | PDV, cupom, formas de pagamento, clientes, histórico, relacionamento (CRM) |
| `estoque` | entrada/saída, lotes, validade, alertas, inventário |
| `compras` | pedido de compra, recebimento com conferência, sugestão |
| `financeiro` | contas a pagar/receber, fluxo de caixa |
| `fiscal` | NF-e, SNGPC, controlados |
| `auth` | login, usuários, permissões (RBAC) |

## Como voltar a separar em microsserviços, se um dia for necessário

Cada módulo em `src/modulos/<nome>/` já é praticamente independente — só compartilha `db.js`, `env.js` e o pacote `packages/auth-middleware`. Para extrair um módulo de volta a um serviço próprio:

1. Criar `services/<nome>-service/` com seu próprio `package.json`, `app.js`, `server.js`, `env.js` e `db.js` (o padrão que existia antes da consolidação está no histórico do git, antes deste commit).
2. Mover `src/modulos/<nome>/*` para `services/<nome>-service/src/`, restaurando os imports relativos de `./db.js`/`./env.js`.
3. Trocar, no `env.js` do módulo consolidado que ainda chama esse módulo por HTTP, a URL fixa (`http://localhost:${PORT}/<nome>`) por uma variável de porta própria do serviço extraído.
4. Repetir para cada módulo que precisar virar serviço de novo — não precisa ser tudo de uma vez.

Não há trava técnica que impeça isso: a separação por módulo e a comunicação por HTTP entre eles (nunca acesso direto a schema) foram mantidas de propósito.

## Banco de dados e documentação auto-sincronizada

A pasta `database/schema/` nunca é editada manualmente. Ela é gerada e mantida atualizada pelo comando `sync-schema.js`:

1. **Rodar comando** — `npm run sync:schema`
2. **Conectar ao banco** — o script lê a estrutura real (tabelas, colunas, tipos, relacionamentos) via `information_schema` do PostgreSQL
3. **Comparar schema** — compara o que leu agora com o que está salvo em `database/schema/` (ex: detecta que a tabela `produtos` ganhou uma coluna nova)
4. **Atualizar e commitar** — se houve mudança, regrava os arquivos (dicionário de dados em Markdown + diagrama ERD) e faz um `git commit` automático com a mensagem `docs(database): sync schema`

Se nada mudou no banco, o script não gera commit vazio.

> Isso garante que quem for entrar no projeto (o Bryan, por exemplo) sempre vê a estrutura real do banco documentada em `database/schema/`, sem depender de alguém lembrar de atualizar manualmente.

### Rodando o comando

```bash
npm run sync:schema
```

Pré-requisito: variável de ambiente `DATABASE_URL` apontando para o banco local ou de desenvolvimento.

## Pacotes compartilhados (`packages/shared-types`)

O único lugar com código compartilhado entre frontend e serviços — tipos de dados e contratos de API (ex: o formato de um "Produto" ou "Venda"). Evita duplicar a mesma interface em 5 lugares diferentes, sem criar acoplamento de lógica de negócio entre os serviços.

## Porta e prefixos

Um processo só, na porta `PORT` do `.env` (padrão `3000`). Cada módulo mantém
seu prefixo e seu schema:

| Módulo | Prefixo | Schema |
|---|---|---|
| `auth` | `/auth` | `auth` |
| `estoque` | `/estoque` | `estoque` |
| `vendas` | `/vendas` | `vendas` |
| `financeiro` | `/financeiro` | `financeiro` |
| `fiscal` | `/fiscal` | `fiscal` |
| `compras` | `/compras` | `compras` |

O frontend fala com todos por `/api/<módulo>/...`; o proxy do Vite manda tudo
para a mesma porta. Nenhum módulo lê o schema de outro — o recebimento de
compra, por exemplo, dá entrada no estoque e cria a conta a pagar por HTTP.

## Fuso do negócio

O dia da farmácia é o dia local (`TZ_NEGOCIO` no `.env`, `America/Sao_Paulo`).
O backend abre a conexão com o Postgres nesse fuso, senão `current_date`
viraria à meia-noite UTC e a venda das 21h cairia no movimento do dia seguinte.

## Onde mora a inteligência do relacionamento

A análise de recompra fica no módulo de vendas, junto do dado que a sustenta:
as vendas e os itens de cada cliente. Ela não consulta outro módulo.

O cruzamento com preço e saldo do produto sugerido acontece **na borda** — a tela
pede o catálogo ao módulo de estoque e junta as duas respostas. Isso mantém o
isolamento (nenhum módulo lê o schema do outro) sem criar uma conversa de
serviço para serviço a cada linha da lista. O mesmo vale para a margem e a curva
ABC dos relatórios: a receita vem de vendas, o custo vem do estoque, e a conta é
feita onde os dois se encontram.
