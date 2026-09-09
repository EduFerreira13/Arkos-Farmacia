# Arkos — Contratos de API entre módulos

> O backend é um processo só (`apps/api`), mas cada módulo expõe sua própria API REST no seu prefixo. Comunicação entre módulos é sempre via HTTP — nunca acesso direto a schema de outro módulo (ver `docs/ARQUITETURA.md`).
>
> Autenticação: o módulo `auth` emite o JWT no login. Os demais **validam o token localmente** (mesmo `JWT_SECRET`) — não fazem uma chamada de rede ao módulo `auth` a cada requisição, por performance. Toda rota autenticada espera `Authorization: Bearer <token>`.

---

## auth (prefixo /auth)

| Método | Rota | Descrição |
|---|---|---|
| POST | `/auth/login` | `{ email, senha }` → `{ token, usuario }` |
| GET | `/auth/me` | Retorna dados do usuário autenticado |
| GET | `/auth/perfis` | Lista os 4 perfis padrão |
| POST | `/auth/recuperar-senha` | Gera código de redefinição válido por 30 minutos |
| POST | `/auth/redefinir-senha` | Troca a senha usando o código (uso único) |
| GET | `/auth/usuarios` | Lista usuários (admin) — `?busca=&perfil=&ativo=` |
| GET | `/auth/relatorios/usuarios` | Planilha dos usuários, com os mesmos filtros (admin) |
| POST | `/auth/simular` | `{ perfil }` → token valendo com o perfil escolhido (só administrador) |
| POST | `/auth/usuarios` | Cria usuário (admin) |
| PATCH | `/auth/usuarios/:id` | Ativa/desativa, troca perfil |

**Exemplo — login:**
```json
// POST /auth/login
{ "email": "gerente@arkos.com", "senha": "••••••" }

// 200 OK
{
  "token": "eyJhbGciOi...",
  "usuario": { "id": "uuid", "nome": "Ana", "perfil": "gerente" }
}
```

**Simulação de perfil**: `POST /auth/simular` devolve um token que vale com o
perfil pedido (e com os limites dele, como desconto máximo), guardando o perfil
real em `perfil_real` — a ação continua rastreável a quem operou. Vale 1 hora e
não aceita simular dentro de simulação; enquanto durar, `GET /auth/me` responde
com o perfil simulado. Encerrar é do lado do cliente: ele volta a usar o token
original que guardou.

---

## estoque (prefixo /estoque)

| Método | Rota | Descrição |
|---|---|---|
| GET | `/produtos` | Lista produtos (filtros: `busca`, `categoria_id`, `tipo_controle`, `com_saldo`) |
| POST | `/produtos` | Cria produto |
| GET | `/produtos/proximo-codigo` | Próximo código sugerido no cadastro (`PRD-00001`) |
| GET | `/produtos/:id` | Detalhe do produto + lotes |
| PATCH | `/produtos/:id` | Atualiza produto (preço gera histórico — §8 das regras de negócio) |
| POST | `/lotes` | Entrada de novo lote |
| POST | `/movimentacoes` | Registra movimentação (entrada/saída/ajuste/perda/devolução) |
| GET | `/alertas/estoque-baixo` | Usa `estoque.vw_estoque_baixo` (lote vencido não conta como disponível) |
| GET | `/alertas/vencimento` | Usa `estoque.vw_produtos_a_vencer` — `?dias=30\|60\|90` |
| GET | `/produtos/codigo-barras/:codigo` | Atalho do PDV para leitura de EAN |
| GET | `/movimentacoes` | Auditoria — `?produto_id=&tipo=&de=&ate=&busca=&limite=` |
| GET/POST | `/categorias` | Cadastro auxiliar exigido pelo formulário de produto |
| GET/POST | `/fornecedores` | Cadastro de fornecedores (`?busca=`) |
| GET | `/fornecedores/consulta-cnpj/:cnpj` | Consulta o CNPJ na base pública da Receita |
| PATCH | `/fornecedores/:id` | Atualiza fornecedor |
| GET | `/relatorios/estoque` | Planilha da posição atual — aceita os mesmos filtros de `/produtos` |
| GET | `/relatorios/movimentacoes` | Planilha da auditoria — `?de=&ate=&tipo=&produto_id=&busca=` |
| GET | `/relatorios/fornecedores` | Planilha dos fornecedores — `?busca=` |

**Código do produto.** `GET /produtos/proximo-codigo` devolve o próximo da
sequência (`PRD-00001`, `PRD-00002`...), calculado a partir do maior código já
usado — não de uma sequência do banco, para o número que a tela mostra ser o
mesmo que vai aparecer na lista. `POST /produtos` aceita `codigo`; sem ele, o
serviço gera.

**Consulta de CNPJ.** A chamada à base pública (BrasilAPI) fica no serviço, e
não no navegador, porque o endpoint não libera CORS — e assim trocar de
provedor (`CNPJ_API_URL` no `.env`) não mexe em nenhuma tela. Sem rede, responde
502 com mensagem clara e o cadastro segue manual.

**Filtros no relatório.** Toda rota de relatório aceita os mesmos filtros da
listagem correspondente: a planilha sai com o recorte que está na tela, e não
com a base inteira.

Permissão por movimentação: `saida` e `devolucao` pedem `vender` (são as duas
pontas da venda, e o estorno automático da finalização usa o token do operador);
`entrada`, `ajuste` e `perda` pedem `ajustar_estoque` (§6).

`POST /produtos` e `PATCH /produtos/:id` aceitam `dias_de_uso`: quanto tempo UMA
unidade de venda costuma durar (caixa de 30 comprimidos de uso diário, 30). É
opcional — vazio significa "não se aplica" e é gravado como `null`; zero e
negativo são recusados. O relacionamento usa esse número para prever recompra de
quem ainda não tem histórico.

**Regra crítica**: `POST /movimentacoes` do tipo `saida` deve escolher automaticamente o lote pela regra **FEFO** (menor `data_validade` com `quantidade > 0`) — não deixar o chamador escolher o lote manualmente, exceto em ajuste/perda.

**Exemplo — saída de estoque:**
```json
// POST /movimentacoes
{ "produto_id": "uuid", "tipo": "saida", "quantidade": 2, "motivo": "venda uuid-da-venda" }
```

---

## vendas (prefixo /vendas)

| Método | Rota | Descrição |
|---|---|---|
| POST | `/vendas` | Abre uma venda (status `aberta`) |
| POST | `/vendas/:id/itens` | Adiciona item (chama `estoque-service` para validar disponibilidade) |
| POST | `/vendas/:id/receita` | Registra dados da receita (obrigatório se algum item for controlado) |
| POST | `/vendas/:id/pagamentos` | Adiciona forma de pagamento (suporta múltiplos, ex: pagamento misto) |
| POST | `/vendas/:id/finalizar` | Fecha a venda: valida receita se necessário, chama `estoque-service` (saída FEFO) e `financeiro-service` (lançamento no caixa) |
| POST | `/vendas/:id/cancelar` | Cancela — exige perfil gerente/admin e `categoria` da lista fechada |
| DELETE | `/vendas/:id/receita` | Desvincula a receita enquanto a venda está aberta |
| GET | `/vendas/:id` | Detalhe completo |
| PATCH | `/vendas/:id/itens/:itemId` | Altera a quantidade da linha, reconferindo o saldo |
| DELETE | `/vendas/:id/itens/:itemId` | Remove item do carrinho e recalcula o total |
| POST | `/vendas/:id/itens/:itemId/desconto` | Desconto de um item só |
| POST | `/vendas/:id/desconto` | Aplica desconto, limitado ao percentual do perfil (§3) |
| GET | `/vendas` | Histórico com filtros; sem data, o movimento de hoje |
| GET | `/vendas/resumo/hoje` | Total, ticket médio, quebra por forma de pagamento e variação vs. ontem |
| GET | `/vendas/relatorio` | Planilha do período — `?de=&ate=`, `?agrupar=produto` para o total por produto |
| GET | `/vendas/analise` | Vendas por produto, por dia e por forma no período (base do BI) |
| GET | `/vendas/receitas` | Receitas retidas — `?de=&ate=&busca=` |
| GET/POST | `/vendas/clientes` | Cadastro de clientes (`?busca=&convenio=&min_compras=&min_valor=&ordenar=`) |
| GET | `/vendas/relatorios/clientes` | Planilha dos clientes, com os mesmos filtros |
| GET | `/vendas/crm/retornos` | Retornos combinados e ainda não atendidos |
| PATCH | `/vendas/clientes/:id` | Atualiza cliente |

**Obrigatórios do cliente (§5)**: `nome` e `telefone`. `cpf` é opcional
(minimização de dados, LGPD) — o identificador do cliente é sempre o `id`
interno, nunca o CPF. No `PATCH` a exigência só vale para o campo que vier no
corpo. A planilha de clientes leva dado pessoal (CPF, telefone, endereço) — a
finalidade precisa justificar a extração (LGPD).
| POST | `/vendas/:id/cliente` | Vincula (ou desvincula) o cliente da venda |
| DELETE | `/vendas/:id/pagamentos/:pagamentoId` | Remove forma de pagamento antes de finalizar |

`GET /vendas` aceita `de`, `ate`, `status`, `controlado=sim|nao`, `busca`
(produto, paciente ou cliente) e `limite`, e devolve os totais do recorte. Sem
filtro de data, responde o movimento de hoje.

`POST /vendas/:id/desconto` aceita `desconto` (reais) **ou** `desconto_pct`
(percentual) — os dois passam pelo mesmo limite do perfil (§3). O desconto por
item usa o mesmo par de campos, e o teto do perfil é conferido sobre a soma de
tudo: descontos de item mais o desconto da venda.

`POST /vendas/:id/itens` **soma na linha que já existe** quando o produto já está
no carrinho, em vez de repetir o produto. Corrigir a quantidade depois é
`PATCH /vendas/:id/itens/:itemId` com `{ "quantidade": n }`, que reconfere o
saldo disponível antes de aumentar.

Toda venda recebe um `numero` sequencial (`vendas.numero_venda_seq`) — é o que
aparece na tela e na planilha, no lugar de um pedaço do identificador.

`POST /vendas/:id/cancelar` exige `categoria` em `CATEGORIA_CANCELAMENTO_LISTA`
(`compra_errada`, `pagamento_errado`, `orcamento`, `desistencia`, `item_errado`,
`outro`); o `motivo` em texto livre continua aceito e é opcional. A categoria é o
que permite agrupar no relatório.

`GET /vendas/relatorio` e `GET /vendas/crm/relatorio` aceitam `formato=xlsx`: a
planilha sai com os dados numa aba e o resumo em outra. Sem o parâmetro, sai o
CSV de sempre, com o resumo no rodapé do arquivo — CSV não tem aba.

`GET /vendas/crm/contatos` filtra por `de`, `ate`, `resultado`, `canal` e `busca`
(nome do cliente, motivo ou oferta). `GET /vendas/crm/relatorio?tipo=contatos`
aceita os mesmos parâmetros, para a planilha sair igual ao que está na tela.

### Ciclo do contato

`POST /vendas/crm/contatos` aceita, além do que já registrava, `proximo_contato_em`
(data de hoje em diante — quando voltar a falar) e `desconto_pct` (o que foi
prometido). `PATCH /vendas/crm/contatos/:id` também aceita `proximo_contato_em`.

`GET /vendas/crm/retornos` lista o que está pendente, com `dias_de_atraso`
(negativo = ainda vai chegar). Um retorno é considerado **atendido quando existe
um contato mais novo com o mesmo cliente** — falar de novo é atender o retorno.
Não há "marcar como concluído": esse tipo de tarefa nunca é feita.

**Conversão é medida, não declarada.** Os contatos devolvem `venda_apos_contato_id`,
`comprou_em`, `valor_da_compra` e `dias_ate_a_compra`, procurando a venda
finalizada do cliente até 30 dias depois do contato. O campo `resultado`
continua existindo para o que a pessoa observou na conversa, mas não é ele que
alimenta o indicador. `GET /vendas/crm/resumo` traz `contatos.com_compra_depois`,
`contatos.conversao_pct` e `contatos.valor_apos_contato`.

`GET /vendas/crm/clientes/:id` devolve `oferta_aberta`: o contato recente cuja
oferta ainda não virou compra. É o que o PDV mostra no balcão. Na finalização,
se havia oferta em aberto, ela é amarrada à venda (`venda_id`) e marcada como
convertida — a resposta de `POST /vendas/:id/finalizar` traz `contato_convertido`.

**Janela de silêncio.** `GET /vendas/crm/clientes` esconde quem foi contatado há
pouco: 90 dias para quem disse `sem_interesse`, 3 para quem `nao_atendeu`, 5 para
qualquer contato. A resposta traz `em_silencio` (quantos ficaram de fora) e
`?incluir_silencio=sim` mostra todos, cada um com `silencio_motivo` e
`silencio_dias_restantes`. `GET /vendas/crm/clientes/:id` ignora a janela de
propósito — silêncio é regra da fila, não pode esconder alguém que foi aberto na
mão nem o cliente que está no balcão.

**Régua de recompra.** Cada cliente devolve `regua_dias` (o intervalo usado),
`origem_regua` (`historico` ou `produto`) e `duracao_do_produto_dias`. Com três
compras ou mais vale o ritmo observado; abaixo disso, a duração do produto
(`estoque.produtos.dias_de_uso`, copiada para `vendas.itens_venda.dias_de_uso` no
momento da venda), que dá sinal já na primeira compra.

`POST /vendas/:id/finalizar` também recusa (422) venda sem item, venda com
pagamentos abaixo do total (`pagamento_insuficiente`) e item acima do estoque
disponível. Cancelamento de venda **já finalizada** não está no MVP (estorno de
estoque e caixa) — ver `docs/PENDENCIAS.md`.

**Recibo térmico.** Depois da venda finalizada, o `vendas-service` tenta
imprimir o recibo (ESC/POS, endereço em `PRINTER_URL`). Isso nunca bloqueia
nem desfaz a venda: a resposta de `POST /vendas/:id/finalizar` traz
`recibo: { impresso: boolean, motivo: string | null, texto: string }` — `texto`
é o recibo em texto puro (sem os comandos ESC/POS), preenchido mesmo quando
`impresso` é `false`, porque o PDV mostra essa pré-visualização na tela de
qualquer forma. O front mostra um aviso ao operador quando `impresso` é
`false`, mas a venda já está salva de qualquer forma.

**Regra crítica (§3)**: `POST /vendas/:id/finalizar` **bloqueia** (HTTP 422) se houver item com `tipo_controle` diferente de `livre` e nenhuma receita vinculada. Essa validação é feita no `vendas-service`, consultando o `estoque-service` para saber o `tipo_controle` de cada item.

**CPF na nota (§5, LGPD).** `POST /vendas/:id/finalizar` aceita `cpf_nota`
opcional no corpo — só para constar na nota fiscal emitida, a pedido do
cliente. Não exige cliente cadastrado nem vinculado à venda, e não bloqueia a
finalização se vier vazio. O valor é repassado ao `fiscal-service`
(`POST /notas-fiscais`, campo `cpf_nota`) e volta em
`nota_fiscal.cpf_nota` na resposta.

**Exemplo — bloqueio de controlado sem receita:**
```json
// POST /vendas/:id/finalizar
// 422 Unprocessable Entity
{ "erro": "receita_obrigatoria", "mensagem": "Item controlado sem receita vinculada." }
```

---

## financeiro (prefixo /financeiro)

| Método | Rota | Descrição |
|---|---|---|
| POST | `/caixa/abrir` | Abre caixa do dia (`valor_abertura`) — só 1 caixa aberto por usuário |
| POST | `/caixa/:id/fechar` | Fecha caixa, compara esperado x contado |
| GET | `/caixa/status` | Caixa aberto do usuário atual, se houver |
| POST | `/caixa/movimentacoes` | Lançamento manual (venda gera automático, nunca manual — §5) |
| GET | `/contas-pagar` | Lista, filtro por status |
| POST | `/contas-pagar` | Cria conta a pagar |
| GET | `/contas-receber` | Lista, filtro por status |
| POST | `/contas-receber` | Cria conta a receber |
| PATCH | `/contas-pagar/:id/pagar` | Quita a conta (status `pago`, `pago_em`) |
| PATCH | `/contas-receber/:id/receber` | Baixa o recebimento (status `recebido`) |
| GET | `/relatorios/caixa` | Planilha do movimento de caixa — `?de=&ate=` |
| GET | `/relatorios/contas` | Planilha de contas por vencimento — `?tipo=pagar\|receber&de=&ate=` |
| GET | `/visao-geral` | Correlação entre pagar e receber por faixa de vencimento, saldo projetado e curva de caixa |
| GET | `/fluxo-caixa/hoje` | Junta o caixa aberto do operador com o resumo do dia buscado no vendas-service |

Sem caixa aberto, `POST /caixa/movimentacoes` recusa com 422 `caixa_fechado` —
por consequência, a venda não finaliza antes de o operador abrir o caixa (§5).

---

## fiscal (prefixo /fiscal)

| Método | Rota | Descrição |
|---|---|---|
| POST | `/notas-fiscais` | Emite NFC-e — **mockado no MVP**, sempre retorna `status: "simulado"` |
| GET | `/notas-fiscais/:venda_id` | Consulta nota de uma venda |
| POST | `/controlados-sngpc` | Registra envio ao SNGPC — **mockado**, `enviado_anvisa` sempre `false` |
| GET | `/notas-fiscais` | Lista notas do período — `?de=&ate=` |
| GET | `/controlados-sngpc` | Lista registros — `?venda_id=&de=&ate=&pendentes=sim` |
| POST | `/controlados-sngpc/enviar` | Marca registros como enviados — **simulado**, só grava a data |

`POST /notas-fiscais` é idempotente: a mesma venda devolve sempre a mesma nota,
com chave de acesso simulada de 44 dígitos derivada do ID da venda. Aceita
`cpf_nota` opcional (dado pessoal informado só a pedido do cliente — LGPD).

---

## compras (prefixo /compras)

| Método | Rota | Descrição |
|---|---|---|
| GET | `/compras/pedidos` | Lista (filtros: `busca`, `status`, `fornecedor_id`, `forma_pagamento`, `de`, `ate`) |
| GET | `/compras/pedidos/:id` | Pedido com itens e recebimentos |
| POST | `/compras/pedidos` | Cria pedido já `pendente_entrega` (`fornecedor_id`, `forma_pagamento`, `frete`, `desconto`, `itens[]`) |
| GET | `/compras/pedidos/:id/ordem-de-compra.pdf` | Ordem de compra em PDF |
| POST | `/compras/pedidos/:id/cancelar` | Cancela — exige motivo |
| POST | `/compras/pedidos/:id/receber` | Conferência item a item, `entregue_em`, entrada no estoque e conta a pagar |
| GET | `/compras/sugestao` | Sugestão de compra a partir do estoque baixo — **sem tela no MVP** |
| GET | `/compras/relatorios/pedidos` | Planilha dos pedidos, com os mesmos filtros da lista |

**Situações do pedido**: `pendente_entrega` (nasce assim), `recebido`,
`cancelado`. Não existe rascunho, e por isso não existe rota de envio ao
fornecedor — o pedido já sai valendo (§4).

**Numeração**: o pedido recebe `numero` no formato `PC-AAAA-00001`, gerado pelo
default da tabela, então dois pedidos criados no mesmo instante não brigam pelo
mesmo número.

**Regra crítica (§4)**: `POST /compras/pedidos/:id/receber` compara a quantidade
recebida com a pedida, item a item. Divergência **não bloqueia** a entrada — é
gravada em `compras.itens_recebimento.divergencia` e devolvida em
`alerta_divergencia` para o gestor ver. Cada item recebido entra como lote no
`estoque-service` e o valor **efetivamente recebido** (não o do pedido) vira
conta a pagar no `financeiro-service` — com frete e desconto do pedido entrando
proporcionalmente ao que chegou.

**Exemplo — recebimento com falta:**
```json
// POST /compras/pedidos/:id/receber
{ "itens": [{ "item_pedido_id": "uuid", "quantidade_recebida": 8,
              "numero_lote": "REC-1042", "data_validade": "2027-12-31" }] }

// 200 OK
{
  "recebimento": { "tem_divergencia": true },
  "alerta_divergencia": ["Dipirona 500mg: pedido 10, recebido 8"],
  "valor_recebido": 36.00,
  "conta_pagar": { "id": "uuid", "valor": 36.00 }
}
```

Se a conta a pagar falhar depois da entrada, a mercadoria **não** é desfeita (ela
chegou de verdade): a resposta traz `aviso_conta` pedindo o lançamento manual.

---

## Relacionamento com clientes (CRM) — módulo de vendas

| Método | Rota | Descrição |
|---|---|---|
| GET | `/vendas/crm/clientes` | Fila de contato ordenada por urgência (`?situacao=&busca=`) |
| GET | `/vendas/crm/clientes/:id` | Ficha: análise, últimas compras e contatos |
| GET | `/vendas/crm/resumo` | Contadores por situação, recompra prevista e contatos |
| GET | `/vendas/crm/contatos` | Contatos registrados (`?de=&ate=&resultado=`) |
| POST | `/vendas/crm/contatos` | Registra contato (`cliente_id`, `canal`, `motivo`, `oferta`) |
| PATCH | `/vendas/crm/contatos/:id` | Atualiza o resultado do contato |

A análise sai só do schema `vendas` — nenhum outro serviço é consultado. O preço
e o saldo atual do produto sugerido são cruzados por quem monta a tela, pelo
`estoque-service`: não faz sentido oferecer o que não há para entregar.

**Como a situação de cada cliente é decidida:**

| Situação | Regra |
|---|---|
| `novo` | nenhuma compra, ou só uma há menos de 30 dias |
| `ativo` | comprando dentro do próprio ritmo |
| `recompra_atrasada` | passou de 25% do intervalo médio dele sem aparecer |
| `em_risco` | sem histórico de ritmo e 30 dias parado, ou 1,5× o intervalo |
| `inativo` | três intervalos sem comprar (mínimo de 45 dias) |

O intervalo médio é a janela entre a primeira e a última compra dividida pelo
número de compras menos um — só existe a partir da segunda compra. **Uso
contínuo** é o produto que o cliente levou três vezes ou mais: é o sinal mais
forte, porque significa tratamento em andamento e, se atrasou, provavelmente a
pessoa ficou sem o medicamento.

Cada cliente da fila vem com `motivo` (por que ligar), `oferta` (o que propor),
`mensagem` (texto pronto, tirado do próprio histórico) e `prioridade`, que ordena
a lista. Cliente com `aceita_contato = false` não entra na fila.

---

## Relatórios em planilha

As rotas `/relatorio*` devolvem **CSV** (`text/csv`) com separador `;`, decimal
com vírgula e BOM — é o formato que o Excel em português abre com um duplo
clique, já com as colunas separadas. O nome do arquivo vem no
`Content-Disposition`. Como a rota exige token, o front baixa por `fetch` e não
por link direto.

Toda coluna cujo título traz `(R$)` sai com duas casas; quantidade inteira sai
sem casas. O período é inclusivo nas duas pontas e, quando omitido, vale o dia
de hoje.

## Fuso do negócio

O dia da farmácia (dashboard, `vw_vendas_hoje`, fechamento de caixa, janelas de
validade, período padrão dos relatórios) é o dia local, definido por
`TZ_NEGOCIO` no `.env` (`America/Sao_Paulo`). Cada serviço abre a conexão com o
Postgres já nesse fuso — sem isso `current_date` viraria à meia-noite UTC e a
venda das 21h cairia no movimento do dia seguinte.

## Fluxo entre módulos — exemplo completo (finalizar uma venda)

1. Front chama `POST /vendas/:id/finalizar` no `vendas-service`.
2. `vendas-service` consulta `estoque-service` (`GET /produtos/:id`) para conferir `tipo_controle` de cada item.
3. Se houver controlado sem receita → bloqueia (422), fim do fluxo.
4. Caso contrário, `vendas-service` chama `estoque-service` (`POST /movimentacoes`, tipo `saida`) para cada item.
5. `vendas-service` chama `financeiro-service` (`POST /caixa/movimentacoes`) para lançar o valor recebido.
6. `vendas-service` chama `fiscal-service` (`POST /notas-fiscais`) para emitir a nota (mockada).
7. `vendas-service` marca a venda como `finalizada` e retorna 200 ao front.

Se qualquer chamada de 4 a 6 falhar, a venda **não** é marcada como finalizada:
o `vendas-service` estorna o que já tinha efeito (devolução dos lotes baixados e
saída do valor lançado no caixa), devolve o erro do serviço que falhou e deixa a
venda em `aberta` para nova tentativa. Falha no próprio estorno vira log de erro
com o ID da venda, para conferência manual.
