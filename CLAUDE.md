# Instruções para o Claude Code neste repositório

Este arquivo é lido automaticamente ao abrir o projeto. Ele te dá tudo que você precisa para construir o MVP do Arkos do início ao fim **sem depender de confirmação do usuário a cada passo**.

## Quando o usuário mandar apenas "Comece"

Isso significa: comece pela Fase 0 de `docs/PLANO-DE-CONSTRUCAO.md` e siga, em ordem, até a Fase 7, sem parar para perguntar "posso continuar?" entre as fases. Só pare para perguntar se travar em algo genuinamente impossível de decidir sozinho (credenciais externas, decisão de negócio ambígua não coberta pelos docs) — nesse caso, registre em `docs/PENDENCIAS.md` e siga para o próximo item, não fique esperando resposta.

## Ordem de leitura obrigatória antes de escrever a primeira linha de código

1. `README.md` — visão geral e stack
2. `docs/ARQUITETURA.md` — estrutura de pastas e como os serviços se isolam
3. `docs/REGRAS-NEGOCIO.md` — regras da farmácia (o que cada tela/rota precisa respeitar)
4. `docs/REGRAS-VISUAIS.md` — design system (cores, tipografia, componentes) — **seguir à risca**
5. `docs/MODELO-DADOS.md` — ERD e dicionário de dados
6. `docs/API-CONTRATOS.md` — contratos exatos de endpoint entre serviços
7. `docs/PLANO-DE-CONSTRUCAO.md` — ordem de execução, fase por fase
8. `CONTRIBUTING.md` — convenção de commits e a regra de nunca misturar serviços no mesmo commit/PR

## Banco de dados

- A connection string real já está em `.env` (`DATABASE_URL`), apontando para um PostgreSQL remoto já provisionado.
- Esse banco tinha uma versão anterior e abandonada do projeto — está autorizado apagar tudo que estiver lá. A migration `database/migrations/0000_drop_legacy.sql` já faz isso para os schemas conhecidos (`auth`, `estoque`, `vendas`, `financeiro`, `fiscal`). Se houver tabelas soltas em `public` que não fazem parte desta modelagem, **não apagar às cegas** — listar o que existe e seguir em frente sem mexer nelas (registrar em `docs/PENDENCIAS.md` se parecer relevante).
- Rodar as migrations com `npm run migrate` (script em `database/scripts/run-migrations.js`, usa o pacote `pg`).
- Depois de qualquer mudança de schema (nova tabela, nova coluna), rodar `npm run sync:schema` — isso atualiza `database/schema/*.md` e já commita automaticamente se algo mudou.

## Regras não negociáveis durante a construção

- **Nunca** um monolito — cada serviço em `services/*` é independente, com seu próprio `package.json` e processo. Comunicação entre serviços é só via HTTP (ver `docs/API-CONTRATOS.md`).
- **Nunca** misturar mudanças de mais de um serviço no mesmo commit.
- **Nunca** editar `database/schema/` manualmente — só via `sync-schema.js`.
- **Nunca** usar emoji em nenhuma parte da interface.
- **Nunca** usar barra lateral decorativa em cards/boxes (accent bar). Destaque vem de cor de fundo, ícone ou tipografia.
- **Sempre** cantos arredondados (8px botões/inputs, 12px cards) — ver `docs/REGRAS-VISUAIS.md`.
- **Sempre** bloquear venda de medicamento controlado sem receita vinculada — regra dura, não alerta (ver `docs/REGRAS-NEGOCIO.md` §3 e `docs/API-CONTRATOS.md`).
- **Sempre** seguir Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`).

## Definição de "MVP pronto"

O MVP está pronto quando o fluxo abaixo funciona ponta a ponta, localmente:

1. Login com um dos 4 perfis (`auth-service`).
2. Cadastro de produto e entrada de lote (`estoque-service`).
3. Venda completa no PDV — incluindo o caso de item controlado exigindo receita, e o caso de bloqueio quando a receita não é informada (`vendas-service`).
4. Fechamento de caixa refletindo a venda (`financeiro-service`).
5. Dashboard pós-login mostrando os 4 indicadores atualizados com dados reais do banco.

Quando isso estiver rodando de ponta a ponta, o MVP está entregue — funcionalidades fora disso (relatórios avançados, fiscal real, multi-filial) ficam para depois, conforme já registrado em `docs/REGRAS-NEGOCIO.md` na seção "Fora do escopo do MVP".
