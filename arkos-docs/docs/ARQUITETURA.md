# Arkos — Arquitetura

## Princípio central

Cada domínio de negócio é um **serviço independente** (não um monolito modular). Frontend e backend ficam em pastas raiz separadas para nunca haver dúvida sobre o que é o quê.

```
arkos/
├── apps/
│   └── web/                     # FRONTEND
├── services/                    # BACKEND — cada um roda e é deployado separado
│   ├── vendas-service/
│   ├── estoque-service/
│   ├── financeiro-service/
│   ├── fiscal-service/
│   └── auth-service/
├── database/
│   ├── schema/                  # docs auto-geradas — nunca editar à mão
│   ├── migrations/
│   └── scripts/sync-schema.js
├── packages/
│   └── shared-types/            # único código compartilhado
└── docs/
```

## Frontend (`apps/web`)

- React + Vite + Tailwind.
- Consome os serviços de backend via API REST (cada serviço expõe sua própria API).
- Segue o design system em [`REGRAS-VISUAIS.md`](./REGRAS-VISUAIS.md).

## Backend (`services/*`)

Cada serviço:

- Tem seu próprio `package.json`, roda em processo separado, pode subir/cair sem afetar os demais.
- Tem seu **próprio schema lógico** dentro do mesmo PostgreSQL (ex: `estoque.produtos`, `vendas.pedidos`) — isolamento real de dados sem o custo de manter 5 bancos físicos no MVP. Migrar para bancos físicos separados no futuro é só trocar a connection string.
- Só se comunica com outro serviço via API HTTP — nunca acessando o schema de outro serviço diretamente. Isso é o que garante que "cada um fica no seu quadrado".

| Serviço | Responsabilidade |
|---|---|
| `vendas-service` | PDV, cupom, formas de pagamento |
| `estoque-service` | entrada/saída, lotes, validade, alertas |
| `financeiro-service` | contas a pagar/receber, fluxo de caixa |
| `fiscal-service` | NF-e, SNGPC, controlados |
| `auth-service` | login, usuários, permissões (RBAC) |

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
