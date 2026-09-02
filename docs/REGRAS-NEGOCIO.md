# Arkos — Regras de Negócio (MVP)

> Baseado em padrão de mercado para sistemas de gestão farmacêutica no Brasil.
> Última atualização: 01/09/2026

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
- Toda movimentação de estoque (entrada, saída, ajuste, perda, devolução) gera um **registro de auditoria** (quem, quando, motivo) — obrigatório para rastreabilidade, especialmente em controlados.
- Inventário: permite contagem física e ajuste com justificativa obrigatória para divergências. A folha de contagem traz só produto **com saldo** — o que entrou por compra e ainda não saiu por venda nem por perda.
- **Perda e avaria** têm tela própria, com motivo em lista fechada (avaria no transporte, embalagem danificada, produto vencido, quebra, furto, recolhimento) mais um detalhe livre. A baixa é sempre de um lote específico.
- **Entrada de lote acontece no recebimento do pedido de compra**, que é onde chegam número de lote e validade — não há entrada avulsa pela interface.

## 3. Vendas (PDV)

- Toda venda gera um registro com: itens, quantidade, preço unitário, desconto aplicado, forma de pagamento, vendedor/operador, data/hora.
- **Medicamento controlado** (tarja preta, psicotrópicos): venda só é concluída com registro da receita (número, CRM do médico, nome do paciente). Sistema não deixa finalizar a venda sem esses dados.
- **Antibióticos**: exigem retenção de receita (a receita fica retida no estabelecimento) — sistema deve permitir registrar isso mesmo sem integração completa com SNGPC no MVP (campo textual/anexo por enquanto).
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

- Cadastro de cliente exige **nome, CPF e telefone**: o CPF identifica a pessoa na nota e no convênio, o telefone é o que permite o retorno do relacionamento. Email, data de nascimento, convênio, endereço e observações são opcionais.
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

- Emissão de cupom fiscal / NFC-e por venda (mesmo que simplificada/simulada no MVP, para já deixar a estrutura pronta).
- CFOP e NCM associados ao produto (campos previstos no cadastro, mesmo que não usados 100% no MVP).
- Controlados: previsão de campo para futura integração com **SNGPC** (Sistema Nacional de Gerenciamento de Produtos Controlados) — não obrigatório rodar no MVP, mas a estrutura de dados já contempla.

## 8. Regras Gerais do Sistema

- Nenhuma venda de controlado sem receita registrada (bloqueio duro, não apenas alerta).
- Nenhum produto vencido pode ser vendido (bloqueio duro).
- Toda alteração de preço de produto fica registrada com histórico (quem mudou, de quanto para quanto, quando).
- Todo usuário deve ter perfil definido — não existe usuário "sem permissão" no sistema (mínimo é operador de caixa).

---

*Documento vivo — regras podem ser ajustadas conforme validação com você (dono do domínio de negócio).*
