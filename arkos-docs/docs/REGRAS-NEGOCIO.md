# Arkos — Regras de Negócio (MVP)

> Baseado em padrão de mercado para sistemas de gestão farmacêutica no Brasil.
> Última atualização: 21/08/2026

---

## 1. Produtos

- Todo produto pertence a uma **categoria**: Medicamento (controlado ou não), Perfumaria/Higiene, Correlatos (produtos médico-hospitalares).
- Campos obrigatórios: nome, princípio ativo (se medicamento), fabricante, categoria, código de barras (EAN), unidade de venda (unidade/caixa), preço de custo, preço de venda, estoque mínimo.
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
- Inventário: permite contagem física e ajuste com justificativa obrigatória para divergências.

## 3. Vendas (PDV)

- Toda venda gera um registro com: itens, quantidade, preço unitário, desconto aplicado, forma de pagamento, vendedor/operador, data/hora.
- **Medicamento controlado** (tarja preta, psicotrópicos): venda só é concluída com registro da receita (número, CRM do médico, nome do paciente). Sistema não deixa finalizar a venda sem esses dados.
- **Antibióticos**: exigem retenção de receita (a receita fica retida no estabelecimento) — sistema deve permitir registrar isso mesmo sem integração completa com SNGPC no MVP (campo textual/anexo por enquanto).
- Desconto: só aplicável dentro de um limite percentual configurável por perfil de usuário (ex: operador de caixa até 5%, gerente até 15%).
- Cancelamento de venda (ou item) exige autorização de um perfil superior (ex: gerente) — nunca livre para o operador de caixa.
- Formas de pagamento no MVP: dinheiro, cartão (débito/crédito), Pix. Cada forma gera lançamento correspondente no financeiro.

## 4. Compras / Fornecedores

- Pedido de compra gerado manualmente ou por sugestão automática (quando estoque atinge o mínimo).
- Recebimento de mercadoria: conferência obrigatória (quantidade recebida x quantidade do pedido) antes de dar entrada no estoque.
- Divergência no recebimento gera alerta para o gestor, não bloqueia a entrada, mas fica registrada.

## 5. Financeiro

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
