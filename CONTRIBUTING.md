# Contribuindo com o Arkos

Guia rápido para não pisar no próprio trabalho (hoje, um dev só) e para
trabalhar em dupla sem pisar no do outro, quando isso voltar a acontecer.

## Branches e commits (hoje)

Hoje o Arkos tem um desenvolvedor só — commit direto na `main`, sem branch de
feature nem Pull Request. Isso é intencional (branch de feature sem revisor do
outro lado só cria passo de merge a mais), não um desvio do processo.

O que continua valendo mesmo sem PR: um módulo por commit (regra de ouro
abaixo), Conventional Commits, e rodar as suítes de teste antes de commitar —
ver "Antes de commitar, confirme" no fim deste documento.

### Se um segundo desenvolvedor entrar ativamente no projeto

Aí branch + PR + revisão cruzada voltam a fazer sentido, para não pisar no
trabalho um do outro:

- `main` — sempre estável, o que está aqui funciona.
- `feature/<nome-curto>` — nova funcionalidade (ex: `feature/pdv-desconto`)
- `fix/<nome-curto>` — correção de bug (ex: `fix/estoque-validade`)
- PR obrigatório, pelo menos um dos dois revisa antes do merge, merge por
  **squash** (um commit por feature na `main`).

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

## Regra de ouro dos módulos

Se sua tarefa está no módulo de estoque, não mexa no de vendas no mesmo commit — mesmo que pareça mais rápido. O backend é um processo só, mas cada módulo é independente por design (ver [`docs/ARQUITETURA.md`](./docs/ARQUITETURA.md)); misturar mudanças de módulos diferentes num commit só quebra esse isolamento.

## Banco de dados

Nunca editar `database/schema/` manualmente — esses arquivos são gerados pelo `npm run sync:schema`. Se você alterou uma tabela, rode o comando antes de commitar, e deixe o commit automático de sync junto (ou em commit separado, tanto faz).

## Testes

Quatro suítes:

```bash
npm run test:integracao   # verificações nas APIs dos 6 módulos
npm run test:fluxo        # o fluxo do MVP ponta a ponta
npm run test:telas        # renderiza cada tela e testa o acesso por perfil
npm run test:pdf          # layout da ordem de compra em PDF
```

As duas primeiras precisam do banco e do backend no ar (`npm run dev:api`).
A de telas roda sozinha, em jsdom, e é a que pega erro de runtime que o build
não vê. A de PDF também roda sozinha: mede cada trecho de texto do arquivo
gerado e reprova sobreposição de coluna ou texto fora da folha — ela mede com
tabela de larguras própria, de propósito, para discordar do gerador quando ele
errar.

Mexeu em regra de negócio? Acrescente a verificação na suíte de integração junto
com a mudança — é lá que fica registrado o que o sistema promete não deixar
acontecer (venda de controlado sem receita, saída acima do saldo, desconto acima
do limite do perfil).

## Antes de commitar, confirme

- [ ] Rodei `npm run sync:schema` se mexi em alguma tabela
- [ ] Rodei as quatro suítes de teste e todas passaram
- [ ] Segui as regras de negócio em `docs/REGRAS-NEGOCIO.md`
- [ ] Segui o design system em `docs/REGRAS-VISUAIS.md` (se mexi em UI)
- [ ] Não misturei mudanças de mais de um módulo no mesmo commit
