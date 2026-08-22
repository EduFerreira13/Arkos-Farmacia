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
│   ├── compras-service/
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

O PostgreSQL é remoto (a `DATABASE_URL` já vem no `.env`). O Redis do
`docker-compose.yml` é opcional: nada no MVP depende dele.

```bash
# 1. Dependências de todos os workspaces
npm install

# 2. Estrutura do banco (recria os 5 schemas do Arkos) e usuários de acesso
npm run migrate
npm run seed

# 3. Opcional: dados fictícios para navegar com o sistema já populado
npm run seed:demo

# 4. Backend — sobe os 5 serviços juntos (portas 3001 a 3005)
npm run dev:services

# 5. Frontend em outro terminal (http://localhost:5173)
npm run dev:web
```

`npm run dev` sobe backend e frontend de uma vez. Para um serviço só:
`npm run dev:estoque` (ou `dev:auth`, `dev:vendas`, `dev:financeiro`, `dev:fiscal`,
`dev:compras`).

Conferência automática das telas (renderiza cada uma e testa o acesso por perfil):

```bash
npm run testar:telas --workspace=apps/web
```

### Usuários criados pelo seed (desenvolvimento)

| Email | Perfil | Senha |
|---|---|---|
| `caixa@arkos.com` | Operador de caixa | `arkos123` |
| `farmaceutico@arkos.com` | Farmacêutico responsável | `arkos123` |
| `gerente@arkos.com` | Gerente | `arkos123` |
| `admin@arkos.com` | Administrador | `arkos123` |

### Dados de demonstração

`npm run seed:demo` **limpa as tabelas de negócio** (produtos, lotes, vendas,
caixa, contas, fiscal — os usuários são preservados) e cria um cenário coerente:
18 produtos entre medicamentos livres, tarja vermelha e tarja preta, perfumaria e
correlatos; 4 fornecedores; 24 lotes com validades variadas (incluindo um lote
vencido e quatro vencendo em menos de 30 dias); histórico de entrada, perda,
ajuste de inventário e devolução; 15 vendas distribuídas entre hoje, ontem e
anteontem (com receita nos controlados, pagamento misto, uma venda aberta e uma
cancelada); notas fiscais simuladas; caixa de ontem fechado com divergência de
R$ 2,50; dois caixas abertos hoje; e contas a pagar/receber com itens vencidos.

O saldo de cada lote fecha com a soma das movimentações, e nenhuma venda
finalizada de controlado existe sem receita — os mesmos invariantes que as APIs
exigem.

### Conferindo o fluxo completo

Com os serviços rodando:

```bash
npm run test:fluxo
```

Executa o roteiro da Fase 7 contra as APIs reais: login, abertura de caixa,
cadastro de produto, entrada de lote, bloqueio de controlado sem receita, venda
concluída com receita, baixa FEFO, nota fiscal simulada, lançamento automático no
caixa e fechamento com divergência.

### Portas

| Serviço | Porta |
|---|---|
| auth-service | 3001 |
| estoque-service | 3002 |
| vendas-service | 3003 |
| financeiro-service | 3004 |
| fiscal-service | 3005 |
| compras-service | 3006 |
| frontend (Vite) | 5173 |

O frontend fala com os serviços por `/api/<serviço>/...` e o proxy do Vite
resolve a porta — não há CORS no desenvolvimento.

## Sincronizando a documentação do banco

Sempre que alterar uma tabela, rode:

```bash
npm run sync:schema
```

Isso varre o banco, atualiza `database/schema/` e já commita a mudança automaticamente (ver detalhes em [`docs/ARQUITETURA.md`](./docs/ARQUITETURA.md)).

## Status

MVP funcional de ponta a ponta: login com os 4 perfis, cadastro de produto e
entrada de lote, venda no PDV (incluindo bloqueio de controlado sem receita),
fechamento de caixa e dashboard com indicadores reais do banco. O que ficou fora
está em [`docs/PENDENCIAS.md`](./docs/PENDENCIAS.md) e na seção "Fora do escopo
do MVP" de [`docs/REGRAS-NEGOCIO.md`](./docs/REGRAS-NEGOCIO.md).
