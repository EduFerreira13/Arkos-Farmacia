# Contribuindo com o Arkos

Guia rápido para trabalharmos em dupla sem pisar no trabalho um do outro.

## Branches

- `main` — sempre estável, o que está aqui funciona.
- `feature/<nome-curto>` — nova funcionalidade (ex: `feature/pdv-desconto`)
- `fix/<nome-curto>` — correção de bug (ex: `fix/estoque-validade`)

Nunca commitar direto na `main`. Toda mudança entra por Pull Request.

## Commits

Seguimos [Conventional Commits](https://www.conventionalcommits.org/) — facilita entender o histórico e automatizar changelog depois.

```
feat(estoque): adiciona alerta de validade próxima
fix(vendas): corrige cálculo de desconto máximo
docs(readme): atualiza instruções de setup
chore(deps): atualiza dependências
docs(database): sync schema        ← gerado automaticamente pelo sync-schema.js
```

Tipos principais: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`.

## Pull Requests

1. Abrir a branch a partir da `main` atualizada.
2. Trabalhar apenas dentro do serviço/módulo relacionado à tarefa — evita PRs gigantes mexendo em vários serviços ao mesmo tempo.
3. Abrir o PR (pode ser como *draft* se ainda estiver em andamento, pra o outro acompanhar).
4. Pelo menos **um dos dois revisa antes do merge** — mesmo sendo só dois devs, isso evita bug bobo passar direto.
5. Merge por **squash** — mantém o histórico da `main` limpo (um commit por feature).

## Regra de ouro dos serviços

Se sua tarefa está no `estoque-service`, não mexa no `vendas-service` no mesmo PR — mesmo que pareça mais rápido. Cada serviço é independente por design (ver [`docs/ARQUITETURA.md`](./docs/ARQUITETURA.md)); misturar mudanças de serviços diferentes num PR só quebra esse isolamento.

## Banco de dados

Nunca editar `database/schema/` manualmente — esses arquivos são gerados pelo `npm run sync:schema`. Se você alterou uma tabela, rode o comando antes de abrir o PR, e deixe o commit automático de sync junto (ou em PR separado, tanto faz).

## Testes

Quatro suítes:

```bash
npm run test:integracao   # verificações nas APIs dos 6 serviços
npm run test:fluxo        # o fluxo do MVP ponta a ponta
npm run test:telas        # renderiza cada tela e testa o acesso por perfil
npm run test:pdf          # layout da ordem de compra em PDF
```

As duas primeiras precisam do banco e dos serviços no ar (`npm run dev:services`).
A de telas roda sozinha, em jsdom, e é a que pega erro de runtime que o build
não vê. A de PDF também roda sozinha: mede cada trecho de texto do arquivo
gerado e reprova sobreposição de coluna ou texto fora da folha — ela mede com
tabela de larguras própria, de propósito, para discordar do gerador quando ele
errar.

Mexeu em regra de negócio? Acrescente a verificação na suíte de integração junto
com a mudança — é lá que fica registrado o que o sistema promete não deixar
acontecer (venda de controlado sem receita, saída acima do saldo, desconto acima
do limite do perfil).

## Antes de abrir o PR, confirme

- [ ] Rodei `npm run sync:schema` se mexi em alguma tabela
- [ ] Rodei as quatro suítes de teste e todas passaram
- [ ] Segui as regras de negócio em `docs/REGRAS-NEGOCIO.md`
- [ ] Segui o design system em `docs/REGRAS-VISUAIS.md` (se mexi em UI)
- [ ] Não misturei mudanças de mais de um serviço no mesmo PR
