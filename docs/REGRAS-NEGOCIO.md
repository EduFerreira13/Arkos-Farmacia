# Arkos — Regras de Negócio (MVP)

> Baseado em padrão de mercado para sistemas de gestão farmacêutica no Brasil.
> Última atualização: 16/09/2026

---

## 1. Produtos

- Todo produto pertence a uma **categoria**: Medicamento (genérico, similar, de referência, manipulado), Perfumaria/Higiene, Correlatos (produtos médico-hospitalares), Dermocosmético, Vitaminas e suplementos, entre outras — a lista fica em `estoque.categorias` e cresce por migration.
- Todo produto tem um **código** curto e sequencial (`PRD-00001`), que é o que se usa para conferir nota, etiqueta e contagem. O serviço sugere o próximo no cadastro, e quem já tem numeração própria pode informar a sua.
- Campos obrigatórios: código, nome, princípio ativo (se medicamento), fabricante, categoria, código de barras (EAN), unidade de venda (unidade/caixa), preço de custo, preço de venda, estoque mínimo.
- Produto **não tem fornecedor fixo**: o mesmo genérico vem de distribuidoras diferentes conforme o preço da semana. Quem abasteceu cada lote fica registrado no pedido de compra.
- Medicamentos controlados exigem campo **classe terapêutica** (ex: psicotrópico, antibiótico, tarja preta) — usado para acionar regras de venda restrita.
- Produto sem estoque não pode ser vendido (bloqueio automático no PDV), exceto se configurado para venda sob encomenda.

## 2. Estoque

- Controle por **lote e validade** obrigatório para medicamentos.
- Saída de estoque segue regra **FEFO** (First Expire, First Out — primeiro a vencer, primeiro a sair), não FIFO.
- Alertas automáticos:
  - Estoque abaixo do mínimo definido por produto.
  - Produtos a vencer em 90 / 60 / 30 dias (janelas configuráveis).
  - Produto vencido: bloqueado automaticamente para venda.
- Saída sem saldo suficiente é sempre recusada, com uma exceção: a sincronização de uma venda feita no PDV **offline**, quando outro caixa vendeu o mesmo produto enquanto o primeiro estava sem rede. Nesse caso o sistema não desfaz a venda que já aconteceu — deixa o saldo do lote ficar negativo e marca a venda para conferência do gerente (`vendas.estoque_conferencia_pendente`) em vez de recusar a baixa.
- Toda movimentação de estoque (entrada, saída, ajuste, perda, devolução) gera um **registro de auditoria** (quem, quando, motivo) — obrigatório para rastreabilidade, especialmente em controlados.
- Inventário: permite contagem física e ajuste com justificativa obrigatória para divergências. A folha de contagem traz só produto **com saldo** — o que entrou por compra e ainda não saiu por venda nem por perda.
- **Perda e avaria** têm tela própria, com motivo em lista fechada (avaria no transporte, embalagem danificada, produto vencido, quebra, furto, recolhimento) mais um detalhe livre. A baixa é sempre de um lote específico.
- **Entrada de lote acontece no recebimento do pedido de compra**, que é onde chegam número de lote e validade — não há entrada avulsa pela interface.

## 3. Vendas (PDV)

- Toda venda gera um registro com: itens, quantidade, preço unitário, desconto aplicado, forma de pagamento, vendedor/operador, data/hora.
- **Medicamento controlado** (`tarja_preta` ou `tarja_vermelha` — inclui psicotrópicos e antibióticos): venda só é concluída com o registro da receita (nome do médico, CRM, nome do paciente, data de emissão — tabela `vendas.receitas`). Sistema não deixa finalizar a venda sem esses dados.
  - **Nota:** o MVP usa esse único registro para os dois casos. Não existe campo separado de "retenção física da receita" (anexo/scan) nem número de receita próprio — pendência registrada em `docs/PENDENCIAS.md` para decidir se isso é necessário além do registro digital.
- Desconto: só aplicável dentro de um limite percentual configurável por perfil de usuário (ex: operador de caixa até 5%, gerente até 15%).
- Cancelamento de venda (ou item) exige autorização de um perfil superior (ex: gerente) — nunca livre para o operador de caixa.
- Formas de pagamento no MVP: dinheiro, cartão (débito/crédito), Pix. Cada forma gera lançamento correspondente no financeiro.

## 4. Compras / Fornecedores

- Pedido de compra gerado manualmente. A sugestão automática a partir do estoque baixo **ficou fora do MVP** — a regra está descrita aqui e a rota existe no serviço, mas não há tela para ela.
- A tela de alertas mostra o que está abaixo do mínimo; por enquanto o pedido a partir daí é montado à mão.
- **Não existe rascunho**: o pedido é criado quando a compra está decidida e nasce `pendente_entrega`, saindo desse estado só ao ser recebido ou cancelado. Criar meio pedido e deixar guardado só gerava lista de pedido que ninguém mandou.
- Todo pedido recebe um **número** sequencial e legível (`PC-2026-00001`) — é por ele que se procura o pedido no telefone com o fornecedor.
- O pedido registra **forma de pagamento**, **frete** e **desconto** combinados com o fornecedor. O total é itens + frete − desconto, e é esse valor que vira conta a pagar.
- Ao ser criado, o pedido gera a **ordem de compra em PDF** com os dados da farmácia, do fornecedor, os itens, as quantidades e os valores. É o documento que vai para o fornecedor, e pode ser reimpresso a qualquer momento.
- Recebimento de mercadoria: conferência obrigatória (quantidade recebida x quantidade do pedido) antes de dar entrada no estoque, junto com a **data em que a mercadoria chegou**.
- Divergência no recebimento gera alerta para o gestor, não bloqueia a entrada, mas fica registrada. Quando chega menos do que o pedido, frete e desconto entram na conta a pagar proporcionalmente ao que veio.
- Cadastro de fornecedor consulta o **CNPJ** na base pública da Receita e preenche razão social, telefone e email. O retorno preenche o formulário, nunca o cadastro: quem cadastra confere antes de salvar.

## 5. Financeiro

- Cadastro de cliente exige **nome e telefone** — o telefone é o que permite o retorno do relacionamento. **CPF é opcional** (minimização de dados, LGPD): o identificador do cliente no sistema é o `id` interno, nunca o CPF. Email, data de nascimento, convênio, endereço e observações também são opcionais.
- Na finalização da venda, o operador pode informar um **CPF só para constar na nota fiscal**, independente de haver cliente vinculado — não é obrigatório para concluir a venda, e não cria nem exige cadastro de cliente.
- **Direito de exclusão (LGPD)**: o cliente pode pedir para apagar seus dados. `POST /vendas/clientes/:id/excluir-dados` (perfil gerente/admin) anonimiza o cadastro — nome vira um rótulo genérico, CPF/telefone/email/convênio/observação/endereço/data de nascimento somem, consentimento de contato é desligado — sem apagar a linha, para não quebrar o histórico de vendas já registrado. Fica gravado quem e quando pediu.
- **Retenção do histórico de compra (LGPD)**: cliente sem nenhuma compra há mais de **2 anos** (ou cadastrado há mais de 2 anos e nunca comprou) é elegível para a mesma anonimização, agora por prazo em vez de pedido — rodar `npm run retencao:clientes` (lista por padrão; `--aplicar` executa de fato).
- Contas a pagar: vinculadas a fornecedores e compras.
- Contas a receber: geradas automaticamente por vendas a prazo (se houver) ou por convênios.
- Fluxo de caixa diário: soma automática das vendas do PDV (por forma de pagamento) + lançamentos manuais.
- Fechamento de caixa: obrigatório ao final do turno/dia, com conferência de valores esperados x valores informados pelo operador.

## 6. Usuários e Permissões (perfis padrão de mercado)

| Perfil | Permissões |
|---|---|
| Operador de caixa | Vender, consultar estoque, aplicar desconto limitado |
| Farmacêutico responsável | Tudo do operador + validar receitas de controlados + liberar venda restrita |
| Gerente | Tudo acima + cancelar vendas, ajustar estoque, aplicar descontos maiores, ver relatórios financeiros |
| Administrador | Acesso total, incluindo cadastros, configurações do sistema e usuários |

- Toda ação sensível (cancelamento, ajuste de estoque, desconto acima do limite) fica registrada com o usuário responsável (log de auditoria).

## 7. Regras Fiscais (nível MVP)

- Emissão de NFC-e real por venda, via Focus NFe (ambiente de homologação da SEFAZ — nunca produção no MVP). Ver `docs/API-CONTRATOS.md` (módulo fiscal) e `apps/api/src/modulos/fiscal`.
- CFOP e NCM são obrigatórios no produto **para a nota sair**: falta de um dos dois é validada antes de chamar a Focus NFe (evita gastar uma tentativa de emissão com payload incompleto) e vira nota com `status: "erro"`, nomeando o produto.
- Erro de emissão — payload incompleto, rejeição da SEFAZ ou falha ao chamar a Focus NFe — **nunca bloqueia a venda**: fica registrado (`mensagem_erro`) para o operador tentar reemitir depois (reemitir = chamar `POST /notas-fiscais` de novo para a mesma venda; a Focus NFe reprocessa o mesmo `ref` quando a tentativa anterior não foi autorizada).
- Controlados: previsão de campo para futura integração com **SNGPC** (Sistema Nacional de Gerenciamento de Produtos Controlados) — não obrigatório rodar no MVP, mas a estrutura de dados já contempla.

## 8. Regras Gerais do Sistema

- Nenhuma venda de controlado sem receita registrada (bloqueio duro, não apenas alerta).
- Nenhum produto vencido pode ser vendido (bloqueio duro).
- Toda alteração de preço de produto fica registrada com histórico (quem mudou, de quanto para quanto, quando).
- Todo usuário deve ter perfil definido — não existe usuário "sem permissão" no sistema (mínimo é operador de caixa).

## 9. Fora do escopo do MVP

- Sugestão automática de pedido de compra a partir do estoque baixo — a regra e a rota existem (§4), mas não há tela.
- Estorno/cancelamento de venda já finalizada — só funciona com a venda em `aberta` (ver `docs/PENDENCIAS.md`).
- Integração real com o SNGPC (Anvisa) — a estrutura de dados já existe (`fiscal.controlados_sngpc`), o envio real não (§7).
- Emissão de NFC-e em produção — o MVP roda só em homologação da SEFAZ via Focus NFe (§7).
- Relatórios fiscais ou gerenciais além dos já existentes em `Relatorios.jsx` (curva ABC, análise por dia/produto/margem).
- Multi-filial: o modelo de dados inteiro assume uma farmácia só — não há conceito de filial/unidade em nenhum schema.
- Telas de parâmetro para valores hoje fixos no código (metas de faturamento, janelas de silêncio do CRM, motivos de perda, textos do tour) — lista completa em `docs/PENDENCIAS.md`.

---

*Documento vivo — regras podem ser ajustadas conforme validação com você (dono do domínio de negócio).*
