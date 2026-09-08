# Marca do Arkos

Arquivos originais da identidade visual, como vieram do design. Esta pasta é a
fonte da verdade da marca — o que estiver no código foi derivado daqui.

## O que tem aqui

| Pasta | Conteúdo |
|---|---|
| `svg/` | Vetores para uso digital: `logo-arkos.svg` (marca completa), `elemento-arkos.svg` (só o símbolo) e `tipografia-arkos.svg` (só o wordmark) |
| `png/` | As mesmas três peças em bitmap, para onde SVG não serve |
| `originais/` | Fontes do CorelDRAW (`.cdr`), os PDFs de variantes (RGB e CMYK) e `manual-de-marca-arkos.html` — o manual de marca completo (uso do logotipo, paleta, tipografia, área de proteção, tamanho mínimo, erros comuns) |

RGB para tela, CMYK para impressão.

## Como isso vira interface

Os três vetores viram componente em
[`apps/web/src/componentes/Logo.jsx`](../apps/web/src/componentes/Logo.jsx), com
os traçados inline — assim a marca herda tamanho e cor da tela em vez de virar um
`<img>` de tamanho fixo:

| Vetor | Componente | Onde aparece |
|---|---|---|
| `elemento-arkos.svg` | `Simbolo` | Sozinho no menu recolhido; dentro do `Logo` |
| `tipografia-arkos.svg` | `Tipografia` | Dentro do `Logo` |
| ambos, lado a lado | `Logo` | Cabeçalho do menu |
| `logo-arkos.svg` | `LogoCompleta` | Tela de login |

`Logo` é o lockup horizontal (símbolo à esquerda, wordmark à direita), para barra
e cabeçalho. `LogoCompleta` é a composição do próprio manual — o arco com o
wordmark dentro —, para onde a marca é o assunto da tela e tem espaço.

Os `viewBox` dos componentes (`75 75 851 600` no símbolo, `75 75 1000 300` no
wordmark) são a caixa de tinta dos vetores, sem a área de respiro que o Corel
exporta em volta. A marca completa já vem enquadrada e usa `0 0 1000 487.01`.

Se a marca mudar, reexportar o SVG para cá e refazer os traçados do componente a
partir do arquivo novo — não editar os `d` na mão.

## Cores

O degradê do símbolo vai de `#24BCCA` a `#26398C`/`#223D9F`, e o wordmark é
`#26398C` sólido (no Tailwind, `azul-marca`). A paleta da interface que nasceu
dessas cores está em [`docs/REGRAS-VISUAIS.md`](../docs/REGRAS-VISUAIS.md) §2.

## Tipografia

O manual (`originais/manual-de-marca-arkos.html`) define duas fontes para a
comunicação da marca — o logotipo em si é um desenho fixo, nunca fonte: **Sora**
nos títulos e **Inter** nos textos corridos e nas interfaces. Sem fonte da marca
(e-mail, documento compartilhado), usar Arial no lugar. Isso já está aplicado na
interface — ver `docs/REGRAS-VISUAIS.md` §3.
