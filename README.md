# Arkos

Sistema de gestão para farmácia — MVP.

## Sobre

Arkos é um sistema fullstack para farmácia cobrindo vendas (PDV), estoque, financeiro, compras e controle de medicamentos controlados. Este repositório é um **monorepo**: o frontend e cada serviço de backend são independentes, mas versionados juntos para facilitar o desenvolvimento em dupla.

## Documentação

Antes de mexer em qualquer coisa, leia (nessa ordem):

1. [`docs/ARQUITETURA.md`](./docs/ARQUITETURA.md) — como o projeto é estruturado, serviços, banco de dados
2. [`docs/REGRAS-NEGOCIO.md`](./docs/REGRAS-NEGOCIO.md) — regras de negócio da farmácia (estoque, vendas, controlados, etc.)
3. [`docs/REGRAS-VISUAIS.md`](./docs/REGRAS-VISUAIS.md) — design system (cores, tipografia, componentes)
4. [`CONTRIBUTING.md`](./CONTRIBUTING.md) — como trabalhamos em dupla: branches, commits, PRs

## Estrutura do projeto

```
arkos/
├── apps/
│   └── web/                     # Frontend — React + Vite + Tailwind
├── services/                    # Backend — cada domínio é um serviço isolado
│   ├── vendas-service/
│   ├── estoque-service/
│   ├── financeiro-service/
│   ├── fiscal-service/
│   └── auth-service/
├── database/
│   ├── schema/                  # Documentação AUTO-GERADA do banco (não editar manualmente)
│   ├── migrations/
│   └── scripts/
│       └── sync-schema.js       # Comando que sincroniza database/schema/ com o banco real
├── packages/
│   └── shared-types/            # Único código compartilhado entre serviços
├── docs/
└── .github/
```

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend | React + Vite + Tailwind CSS |
| Backend | Node.js (Fastify), um processo por serviço |
| Banco de dados | PostgreSQL (schema isolado por serviço) |
| Cache | Redis |
| Autenticação | JWT + RBAC (perfis de acesso) |

## Rodando localmente

> Preencher conforme o setup for definido (`docker-compose`, variáveis de ambiente, etc.)

```bash
# Instalar dependências de todos os workspaces
npm install

# Subir banco + redis
docker compose up -d

# Rodar um serviço específico
npm run dev --workspace=services/estoque-service

# Rodar o frontend
npm run dev --workspace=apps/web
```

## Sincronizando a documentação do banco

Sempre que alterar uma tabela, rode:

```bash
npm run sync:schema
```

Isso varre o banco, atualiza `database/schema/` e já commita a mudança automaticamente (ver detalhes em [`docs/ARQUITETURA.md`](./docs/ARQUITETURA.md)).

## Status

MVP em desenvolvimento — ver [Issues](../../issues) para o que está em andamento.
