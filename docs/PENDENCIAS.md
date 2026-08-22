# Arkos — Pendências

> Itens que não podem ser resolvidos de forma autônoma durante a construção do MVP. Registrar aqui em vez de travar o desenvolvimento — o dono do projeto revisa quando puder.

## Aberto

- [ ] **Docker não está instalado nesta máquina** — `docker compose up -d` não roda, então o Redis do `docker-compose.yml` não sobe. Decisão tomada para não travar: o cache do dashboard é **opcional** nos serviços (se `REDIS_URL` não responder, o serviço loga um aviso e consulta o banco direto). Nada no MVP depende de Redis. Instalar Docker Desktop quando quiser ligar o cache.
- [ ] **Schema `public` do banco tem um projeto legado inteiro (Prisma)** — 58 tabelas de um backoffice de clínica (`tenants`, `pacientes`, `prontuarios`, `agendamentos`, `_prisma_migrations`, etc.). Não faz parte desta modelagem e **não foi apagado** (a `0000_drop_legacy.sql` só limpa os 5 schemas do Arkos). Decidir se esse banco pode ser limpo de vez ou se o Arkos deve continuar convivendo com o legado em `public`.
- [ ] **Consentimento e retenção de dados do CRM (LGPD)** — o sistema já respeita o `aceita_contato` do cliente e registra quem foi contatado, mas falta: momento e forma de coletar o consentimento no cadastro, prazo de retenção do histórico de compra e um caminho para o cliente pedir exclusão. Decisão de negócio, não técnica — vale conversar com quem cuida do jurídico antes de usar a lista para campanha.
- [ ] **Régua de recompra é a mesma para todo produto** — o CRM usa o intervalo observado de cada cliente. Para tratamento com caixa de 30 comprimidos isso funciona; para produto sazonal (protetor solar) o sinal fica fraco. O caminho seria uma duração esperada por produto no cadastro.
- [ ] **Textos das ofertas do CRM são fixos no código** — as mensagens sugeridas estão em `services/vendas-service/src/crm.js`. Se a farmácia quiser mudar o tom ou o percentual de desconto oferecido, hoje é alteração de código.
- [ ] **Passos do tour são fixos no código** — `apps/web/src/componentes/Tour.jsx`. Trocar a ordem ou o texto exige alterar o arquivo.
- [ ] **Estorno de venda já finalizada** — o cancelamento só funciona com a venda em `aberta`. Cancelar venda finalizada exigiria devolver o estoque dos lotes exatos e lançar a saída no caixa, com regra de quem autoriza; ficou fora do MVP e hoje a API responde 422 explicando.
- [ ] **Nenhuma verificação visual automatizada do frontend** — o build passa e as telas foram construídas seguindo `docs/REGRAS-VISUAIS.md`, mas não há navegador headless nesta máquina para conferir renderização, contraste no modo escuro e densidade de tabela. Vale uma passada manual em 1280px, claro e escuro.
- [ ] Credenciais reais de um provedor de NF-e (ex: Focus NFe, eNotas) para sair do modo mockado — não necessário para o MVP.
- [ ] Definição de identidade visual final do logo em formatos vetoriais (SVG) para uso em favicon, PDF de cupom, etc.
- [ ] Domínio/hospedagem definitivos para deploy (fora do escopo do MVP local).

## Resolvido

<!-- Mover itens para cá conforme forem decididos, com a data e a decisão tomada -->
