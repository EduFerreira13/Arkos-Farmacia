-- estoque-service — classificação de PIS/COFINS por produto (CST e alíquota).
-- Ref: relatório mensal "Vendas PIS/COFINS" que a contabilidade da farmácia
-- exige (agrupado por NCM/CST, com alíquota e valor de PIS e de COFINS).
--
-- Mesmo padrão de NCM/CFOP (migration 0006): campo de texto/número livre,
-- preenchido manualmente no cadastro do produto — o sistema não deriva essa
-- classificação sozinho (é uma decisão fiscal que já cabe a quem cadastra o
-- produto, como já acontece hoje com NCM/CFOP), pra não arriscar aplicar uma
-- alíquota errada sem confirmação de quem entende a legislação tributária.

ALTER TABLE estoque.produtos
  ADD COLUMN IF NOT EXISTS cst_pis        varchar(2),
  ADD COLUMN IF NOT EXISTS cst_cofins     varchar(2),
  ADD COLUMN IF NOT EXISTS aliquota_pis    numeric(5,2),
  ADD COLUMN IF NOT EXISTS aliquota_cofins numeric(5,2);

COMMENT ON COLUMN estoque.produtos.cst_pis IS
  'Código de Situação Tributária do PIS (ex: 01, 04, 06, 07, 49) — igual ao usado no relatório fiscal da contabilidade.';
COMMENT ON COLUMN estoque.produtos.cst_cofins IS
  'Código de Situação Tributária da COFINS — mesma classificação usada para o PIS na prática desta farmácia.';
COMMENT ON COLUMN estoque.produtos.aliquota_pis IS
  'Alíquota de PIS em percentual (ex: 1.65) aplicada sobre o valor vendido do item.';
COMMENT ON COLUMN estoque.produtos.aliquota_cofins IS
  'Alíquota de COFINS em percentual (ex: 7.60) aplicada sobre o valor vendido do item.';
