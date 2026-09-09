# Arkos

Sistema de gestão para farmácia — MVP.

## Sobre

Arkos é um sistema fullstack para farmácia cobrindo vendas (PDV), estoque, financeiro, compras e controle de medicamentos controlados. Este repositório é um **monorepo**: o frontend (`apps/web`) e o backend (`apps/api`, um monolito modular — um processo só, um módulo por domínio) são versionados juntos para facilitar o desenvolvimento em dupla.

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
│   ├── web/                     # Frontend — React + Vite + Tailwind
│   └── api/                     # Backend — processo único, um módulo por domínio
│       └── src/modulos/
│           ├── vendas/
│           ├── estoque/
│           ├── compras/
│           ├── financeiro/
│           ├── fiscal/
│           └── auth/
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
| Backend | Node.js (Fastify), processo único, um módulo por domínio |
| Banco de dados | PostgreSQL (schema isolado por módulo) |
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

# 4. Backend — processo único, todos os módulos juntos (porta 3000)
npm run dev:api

# 5. Frontend em outro terminal (http://localhost:5173)
npm run dev:web
```

`npm run dev` sobe backend e frontend de uma vez.

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

### Conferência automática

```bash
npm run test:integracao   # 121 verificações contra as APIs dos 6 módulos
npm run test:fluxo        # o fluxo do MVP ponta a ponta
npm run test:telas        # renderiza cada tela e testa o acesso por perfil
```

O de integração e o de fluxo precisam do backend rodando (`npm run dev:api`).
Os três criam dados no banco de desenvolvimento.

### Dados de demonstração

`npm run seed:demo` **limpa as tabelas de negócio** (produtos, lotes, vendas,
clientes, compras, caixa, contas, fiscal — os usuários são preservados) e cria
**120 dias de operação**:

- 25 produtos (medicamentos livres, tarja vermelha e preta, perfumaria,
  correlatos), 4 fornecedores e 35 lotes com validades variadas — um vencido e
  quatro vencendo em menos de 30 dias;
- cerca de 1.250 vendas ao longo de quatro meses, com movimento maior no sábado
  e loja fechada no domingo, pagamento misto, desconto ocasional, uma venda
  aberta e uma cancelada hoje;
- 36 clientes com padrão de compra de verdade: crônicos que levam o mesmo
  medicamento a cada 21 a 45 dias (alguns já atrasados), recorrentes de cesta
  variada, esporádicos, três que compravam e pararam, um recém-cadastrado e um
  que pediu para não receber oferta;
- caixa fechado por dia de operação, com divergência pequena em alguns;
- notas fiscais simuladas, registros de SNGPC (os recentes pendentes de envio),
  pedidos de compra nos quatro estados e contatos de relacionamento já feitos.

Dois invariantes são conferidos e impressos no fim: nenhum lote tem saldo
divergente da soma das movimentações, e nenhuma venda finalizada de controlado
existe sem receita. O sorteio usa semente fixa — rodar de novo dá o mesmo
cenário.

### Conferindo o fluxo completo

Com o backend rodando:

```bash
npm run test:fluxo
```

Executa o roteiro da Fase 7 contra as APIs reais: login, abertura de caixa,
cadastro de produto, entrada de lote, bloqueio de controlado sem receita, venda
concluída com receita, baixa FEFO, nota fiscal simulada, lançamento automático no
caixa e fechamento com divergência.

### Portas

| Processo | Porta |
|---|---|
| backend (`apps/api`) | 3000 |
| frontend (Vite) | 5173 |

O frontend fala com o backend por `/api/<módulo>/...` e o proxy do Vite manda
tudo para a mesma porta — não há CORS no desenvolvimento.

## Sincronizando a documentação do banco

Sempre que alterar uma tabela, rode:

```bash
npm run sync:schema
```

Isso varre o banco, atualiza `database/schema/` e já commita a mudança automaticamente (ver detalhes em [`docs/ARQUITETURA.md`](./docs/ARQUITETURA.md)).

## Versionamento

Cada pacote do monorepo (`apps/web`, cada `services/*`, cada `packages/*`) tem
sua própria versão (semver), controlada com [`@changesets/cli`](https://github.com/changesets/changesets).
Nenhum pacote é publicado no npm — todos são `private: true` — então o único
objetivo do versionamento é registrar, de forma legível, o que mudou em cada
serviço e gerar um `CHANGELOG.md` por pacote.

**No dia a dia, ao terminar uma mudança que deve contar para a versão:**

```bash
npx changeset
```

O CLI pergunta quais pacotes mudaram (você marca só os afetados, respeitando a
regra de nunca misturar serviços na mesma mudança) e o tipo de bump para cada
um:

- **patch** — correção de bug, ajuste que não muda contrato nem comportamento visível;
- **minor** — funcionalidade nova, compatível com o que já existia;
- **major** — mudança que quebra contrato (ex.: endpoint de `docs/API-CONTRATOS.md` mudando formato de resposta).

Isso grava um arquivo `.md` novo em `.changeset/` descrevendo a mudança — esse
arquivo entra no mesmo commit/PR da mudança de código.

**Quando quiser fechar uma versão** (ex.: antes de um deploy), rode:

```bash
npx changeset version
```

Isso consome todos os `.changeset/*.md` pendentes, sobe a versão no
`package.json` de cada pacote afetado (patch/minor/major, conforme registrado)
e escreve/atualiza o `CHANGELOG.md` de cada um. Revise o diff e commite o
resultado.

Não usamos `npx changeset publish` — não há registry para publicar, já que
todos os pacotes são privados.

## Relacionamento com clientes

A farmácia já sabe o que cada pessoa compra e de quanto em quanto tempo. A tela
de **Relacionamento** transforma isso na fila de quem ligar hoje: quem está
atrasado na reposição do medicamento de uso contínuo (com quantos dias de
atraso), quem começou a sumir, quem nunca voltou depois da primeira compra. Cada
linha vem com o motivo, a oferta sugerida a partir do histórico e uma mensagem
pronta para copiar — e o contato feito fica registrado com canal, oferta e
resultado, para a farmácia saber o que funcionou.

No balcão o ciclo fecha: identificando o cliente no ponto de venda, o operador vê
o ritmo de compra dele e os itens que ele repõe, com um botão para incluir no
carrinho e aviso quando o item está sem estoque.

## Tour do primeiro acesso

No primeiro login de cada usuário o sistema abre um tour de um minuto apontando
para as áreas da tela. O roteiro é filtrado pela permissão do perfil — o operador
de caixa não é apresentado a telas que ele não pode abrir. Dá para pular, navegar
pelas setas do teclado e rever depois pelo ícone de ajuda na barra de cima.

## Leitor de código de barras (PDV)

Leitor USB comum funciona como teclado (emulação HID): ele "digita" o código
sozinho, bem mais rápido que uma pessoa, e fecha com Enter. O PDV escuta isso
na tela inteira, sem precisar clicar em nenhum campo antes — um texto discreto
com um ícone de código de barras (que pisca) avisa que o leitor está ativo.
Reconhecido o código, o produto vem do `estoque-service` e entra sozinho no
carrinho; código que não bate com nenhum produto vira um aviso de erro claro,
sem travar a tela nem derrubar o que já estava no carrinho.

**Testando sem o leitor físico.** Digitar manualmente não dispara a leitura de
propósito — é assim que o sistema distingue alguém digitando com calma de um
leitor de verdade (intervalo entre teclas maior que ~80ms reinicia a captura).
Pra testar sem o aparelho, o card "Buscar produto" do PDV tem um campo **"Simular
leitura (teste sem leitor físico)"**: digite o código de barras ali e aperte
Enter (ou clique em "Simular") — funciona em qualquer velocidade de digitação,
sem passar pela checagem de tempo, chamando exatamente o mesmo caminho que um
leitor de verdade chamaria.

## Status

MVP funcional de ponta a ponta: login com os 4 perfis, cadastro de produto e
entrada de lote, venda no PDV (incluindo bloqueio de controlado sem receita),
fechamento de caixa e dashboard com indicadores reais do banco. O que ficou fora
está em [`docs/PENDENCIAS.md`](./docs/PENDENCIAS.md) e na seção "Fora do escopo
do MVP" de [`docs/REGRAS-NEGOCIO.md`](./docs/REGRAS-NEGOCIO.md).
