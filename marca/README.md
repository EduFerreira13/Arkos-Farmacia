# Marca do Arkos

Arquivos originais da identidade visual, como vieram do design. Esta pasta é a
fonte da verdade da marca — o que estiver no código foi derivado daqui.

## O que tem aqui

| Pasta | Conteúdo |
|---|---|
| `svg/` | Vetores para uso digital: `logo-arkos.svg` (marca completa), `elemento-arkos.svg` (só o símbolo) e `tipografia-arkos.svg` (só o wordmark) |
| `png/` | As mesmas três peças em bitmap, para onde SVG não serve |
| `originais/` | Fontes do CorelDRAW (`.cdr`) e os PDFs de variantes, em RGB e CMYK |

RGB para tela, CMYK para impressão.

## Como isso vira interface

O componente [`apps/web/src/componentes/Logo.jsx`](../apps/web/src/componentes/Logo.jsx)
carrega os traçados de `elemento-arkos.svg` e `tipografia-arkos.svg` inline, para
a marca herdar tamanho e cor da tela em vez de virar um `<img>` de tamanho fixo.

Os `viewBox` do componente (`75 75 851 600` no símbolo, `75 75 1000 300` no
wordmark) são a caixa de tinta dos vetores, sem a área de respiro que o Corel
exporta em volta.

Se a marca mudar, reexportar o SVG para cá e refazer os traçados do componente a
partir do arquivo novo — não editar os `d` na mão.

## Cores

O degradê do símbolo vai de `#24BCCA` a `#26398C`/`#223D9F`, e o wordmark é
`#26398C` sólido (no Tailwind, `azul-marca`). A paleta da interface que nasceu
dessas cores está em [`docs/REGRAS-VISUAIS.md`](../docs/REGRAS-VISUAIS.md) §2.
