/**
 * Marca do Arkos.
 *
 * Os traçados vêm dos vetores oficiais em `marca/svg/` (elemento-arkos.svg e
 * tipografia-arkos.svg, exportados do CorelDRAW). Aqui eles viram componente
 * para herdar tamanho e cor da interface — ver docs/REGRAS-VISUAIS.md §1.
 *
 * Duas variantes:
 * - `cor` (padrão): o símbolo com o degradê original da marca. No modo escuro
 *   o degradê perde contraste contra o fundo, então as faces viram branco via
 *   CSS — a união delas é exatamente a silhueta, então o desenho não muda.
 * - `monocromatico`: silhueta em `currentColor`, para fundos coloridos (o
 *   painel da tela de login) onde nem o degradê nem o branco puro resolvem.
 *
 * Não editar os `d` à mão: se a marca mudar, reexportar o SVG e regerar.
 */

import { useId } from "react";

// Caixa de tinta dos vetores, sem a área de respiro que o Corel exporta.
const CAIXA_SIMBOLO = "75 75 851 600";
const PROPORCAO_SIMBOLO = 851 / 600;

// A altura é 273.51, não 300: o wordmark não tem descida, e a sobra abaixo da
// linha de base empurrava as letras para cima do símbolo no lockup.
const CAIXA_TIPOGRAFIA = "75.22 75.22 999.56 273.51";
const PROPORCAO_TIPOGRAFIA = 999.56 / 273.51;

// A marca completa já vem enquadrada do Corel, sem respiro sobrando.
const CAIXA_COMPLETA = "0 0 1000 487.01";
const PROPORCAO_COMPLETA = 1000 / 487.01;

// A tipografia ao lado do símbolo fica com pouco mais da metade da altura dele:
// é o equilíbrio do lockup horizontal do manual.
const ALTURA_TIPOGRAFIA = 0.52;

export function Simbolo({
  tamanho = 32,
  variante = "cor",
  className = "",
  rotulo = "Arkos",
}) {
  const prefixo = useId().replace(/:/g, "");
  const mono = variante === "monocromatico";
  const acessibilidade = rotulo ? { role: "img", "aria-label": rotulo } : { "aria-hidden": true };

  return (
    <svg
      width={Math.round(tamanho * PROPORCAO_SIMBOLO)}
      height={tamanho}
      viewBox={CAIXA_SIMBOLO}
      fillRule="evenodd"
      clipRule="evenodd"
      className={`${mono ? "" : "dark:[&_path]:fill-white"} ${className}`}
      {...acessibilidade}
    >
      {mono ? (
        <g fill="currentColor">
          <path d="M176.69 527.6c8.68,-3.17 15.51,-8.64 20.72,-16.58 42.03,-64.12 146.76,-170.13 208.23,-254.02 41.17,-56.18 77.25,-116.31 94.86,-182.03 47.86,178.56 213.54,299.47 303.09,436.05 5.21,7.94 12.04,13.41 20.72,16.58 62.24,22.72 101.72,79.15 101.72,145.41l0 1.75c-59.57,-27.45 -124.78,-51.79 -197.02,-72.03 -23.76,-6.64 -49.1,-57.34 -94.07,-100.52l-33.39 -30.06 -101.05 -71.24 -101.05 71.24c-38.24,32.12 -76.72,71.79 -103.13,112.66 -5.88,9.1 -13.9,15.01 -24.33,17.92 -72.24,20.24 -137.45,44.58 -197.02,72.03l0 -1.75c0,-66.26 39.48,-122.69 101.72,-145.41z" />
          <path d="M188.51 356.36c42.12,-20.59 83.05,-42.76 128.99,-67.06 -16.77,19.99 -33.98,39.66 -50.98,59.17 -25.14,28.27 -50.76,57.05 -74,86.44 -12.55,15.62 -24.47,31.48 -35.03,47.43 -32.87,12.43 -60.89,32.23 -82.52,57.18l0 -1.3c0,-79.22 42.36,-147.07 113.54,-181.86zm737.52 181.86l0 1.3c-21.63,-24.95 -49.65,-44.75 -82.52,-57.18 -43.88,-66.42 -103.68,-128.06 -158.85,-192.42 45.55,24.09 86.12,46.05 127.85,66.44 71.16,34.8 113.52,102.64 113.52,181.86z" />
        </g>
      ) : (
        <>
          <defs>
            <radialGradient
              id={`${prefixo}-a`}
              gradientUnits="userSpaceOnUse"
              gradientTransform="matrix(-1.15622 4.61798 -4.65465 -0.960285 2339 -3685)"
              cx="845.18"
              cy="110.96"
              r="100.71"
              fx="845.18"
              fy="110.96"
            >
              <stop offset="0" stopColor="#24BCCA" />
              <stop offset="1" stopColor="#26398C" />
            </radialGradient>
            <radialGradient
              id={`${prefixo}-b`}
              gradientUnits="userSpaceOnUse"
              gradientTransform="matrix(1.11491 2.38902 2.48981 -0.779492 -449 -507)"
              cx="335.23"
              cy="164.98"
              r="61.34"
              fx="335.23"
              fy="164.98"
            >
              <stop offset="0" stopColor="#24BCCA" />
              <stop offset="1" stopColor="#223D9F" />
            </radialGradient>
            <radialGradient
              id={`${prefixo}-c`}
              gradientUnits="userSpaceOnUse"
              gradientTransform="matrix(5.13217 -1.88857 2.00737 4.80496 -2994 -147)"
              cx="568.58"
              cy="320.89"
              r="100.71"
              fx="568.58"
              fy="320.89"
            >
              <stop offset="0" stopColor="#24BCCA" />
              <stop offset="1" stopColor="#26398C" />
            </radialGradient>
            <radialGradient
              id={`${prefixo}-d`}
              gradientUnits="userSpaceOnUse"
              gradientTransform="matrix(-0.814852 3.25456 -3.28043 -0.676774 1906 -2578)"
              cx="849.43"
              cy="110.96"
              r="142.89"
              fx="849.43"
              fy="110.96"
            >
              <stop offset="0" stopColor="#24BCCA" />
              <stop offset="1" stopColor="#223D9F" />
            </radialGradient>
            <radialGradient
              id={`${prefixo}-e`}
              gradientUnits="userSpaceOnUse"
              gradientTransform="matrix(-0.44408 2.35711 -2.13377 0.0515901 1348 -1146)"
              cx="582.06"
              cy="238.05"
              r="61.34"
              fx="582.06"
              fy="238.05"
            >
              <stop offset="0" stopColor="#24BCCA" />
              <stop offset="1" stopColor="#223D9F" />
            </radialGradient>
            <radialGradient
              id={`${prefixo}-f`}
              gradientUnits="userSpaceOnUse"
              gradientTransform="matrix(3.09414 1.42483 -1.43812 4.24675 -850 -2626)"
              cx="738.79"
              cy="484.47"
              r="142.89"
              fx="738.79"
              fy="484.47"
            >
              <stop offset="0" stopColor="#24BCCA" />
              <stop offset="1" stopColor="#26398C" />
            </radialGradient>
          </defs>
          <path fill={`url(#${prefixo}-d)`} d="M176.69 527.6c8.68,-3.17 15.51,-8.64 20.72,-16.58 42.03,-64.12 146.76,-170.13 208.23,-254.02 41.17,-56.18 77.25,-116.31 94.86,-182.03 47.86,178.56 213.54,299.47 303.09,436.05 5.21,7.94 12.04,13.41 20.72,16.58 62.24,22.72 101.72,79.15 101.72,145.41l0 1.75c-59.57,-27.45 -124.78,-51.79 -197.02,-72.03 -23.76,-6.64 -49.1,-57.34 -94.07,-100.52l-33.39 -30.06 -101.05 -71.24 -101.05 71.24c-38.24,32.12 -76.72,71.79 -103.13,112.66 -5.88,9.1 -13.9,15.01 -24.33,17.92 -72.24,20.24 -137.45,44.58 -197.02,72.03l0 -1.75c0,-66.26 39.48,-122.69 101.72,-145.41z" />
          <path fill={`url(#${prefixo}-a)`} d="M176.69 527.6c8.68,-3.17 15.51,-8.64 20.72,-16.58 42.03,-64.12 146.76,-170.13 208.23,-254.02 41.17,-56.18 77.25,-116.31 94.86,-182.03l0 325.94 -101.05 71.24c-38.24,32.12 -76.72,71.79 -103.13,112.66 -5.88,9.1 -13.9,15.01 -24.33,17.92 -72.24,20.24 -137.45,44.58 -197.02,72.03l0 -1.75c0,-66.26 39.48,-122.69 101.72,-145.41z" />
          <path fill={`url(#${prefixo}-c)`} d="M500.5 74.97c47.86,178.56 213.54,299.47 303.09,436.05 5.21,7.94 12.04,13.41 20.72,16.58 62.24,22.72 101.72,79.15 101.72,145.41l0 1.75c-59.57,-27.45 -124.78,-51.79 -197.02,-72.03 -23.76,-6.64 -49.1,-57.34 -94.07,-100.52l-33.39 -30.06 -101.05 -71.24 0 -325.94z" />
          <path fill={`url(#${prefixo}-e)`} d="M500.5 400.91l-101.05 71.24c-38.22,32.11 -76.74,71.81 -103.13,112.66 -2.94,4.55 -6.42,8.3 -10.46,11.28 71.55,-121.78 181.62,-242.11 214.64,-365.34l0 170.16z" />
          <path fill={`url(#${prefixo}-b)`} d="M500.5 400.91l101.05 71.24c38.22,32.11 76.74,71.81 103.13,112.66 2.94,4.55 6.42,8.3 10.46,11.28 -71.55,-121.78 -181.62,-242.11 -214.64,-365.34l0 170.16z" />
          <path fill={`url(#${prefixo}-f)`} d="M188.51 356.36c42.12,-20.59 83.05,-42.76 128.99,-67.06 -16.77,19.99 -33.98,39.66 -50.98,59.17 -25.14,28.27 -50.76,57.05 -74,86.44 -12.55,15.62 -24.47,31.48 -35.03,47.43 -32.87,12.43 -60.89,32.23 -82.52,57.18l0 -1.3c0,-79.22 42.36,-147.07 113.54,-181.86zm737.52 181.86l0 1.3c-21.63,-24.95 -49.65,-44.75 -82.52,-57.18 -43.88,-66.42 -103.68,-128.06 -158.85,-192.42 45.55,24.09 86.12,46.05 127.85,66.44 71.16,34.8 113.52,102.64 113.52,181.86z" />
        </>
      )}
    </svg>
  );
}

export function Tipografia({ altura = 16, className = "", rotulo = "Arkos" }) {
  const acessibilidade = rotulo ? { role: "img", "aria-label": rotulo } : { "aria-hidden": true };

  return (
    <svg
      width={Math.round(altura * PROPORCAO_TIPOGRAFIA)}
      height={altura}
      viewBox={CAIXA_TIPOGRAFIA}
      fill="currentColor"
      fillRule="evenodd"
      clipRule="evenodd"
      className={className}
      {...acessibilidade}
    >
      <path d="M233.02 95.45l-55.64 0 -102.16 249.19 45.66 0c32.04,-64.1 136.78,-63.74 168.64,0l45.67 0 -102.17 -249.19zm-28.56 161.21c-22.14,0 -30.66,4.92 -48.67,13.62l49.38 -124.9 49.68 124.43c-18.6,-8.41 -27.87,-13.15 -50.39,-13.15zm156.87 87.98l44.79 0 0 -100.02c0,-43.67 13.79,-55.71 54.73,-43.85l0 -37.7c-46.57,-11.39 -99.52,-12.16 -99.52,50.65l0 130.92zm298.61 -184.78l-43.33 0c-2.3,52.62 -38.75,69.05 -80.18,100.55l0 -185.19 -45.91 19.07 0 250.35 40.53 0c2.59,-36.47 30.18,-55.07 58.62,-74.98 37.64,8.01 41.59,40.7 41.93,74.98l39.52 0c-1.36,-42.37 -13.44,-77.76 -49.97,-99.41 25.77,-25.86 37.56,-47.98 38.79,-85.37zm128.3 -3.35c-127.95,0 -128.35,191.85 0,191.85 128.11,0 128.1,-191.85 0,-191.85zm50.01 95.92c0,76.28 -100.03,76.7 -100.03,0 0,-76.23 100.03,-76.24 100.03,0zm184.47 -42.19l45.53 0c-14.99,-71.73 -152.93,-71.33 -152.93,5.34 0,68.21 113.55,42.04 113.55,77.81 0,25.11 -62.78,30.09 -72.74,1.62l-45.44 0c15.95,78.27 164.09,66.25 164.09,-5.34 0,-59.92 -113.55,-32.51 -113.55,-72.23 0,-31.5 52.03,-31.61 61.49,-7.2z" />
    </svg>
  );
}

/** Lockup horizontal: símbolo + tipografia, o formato usado no cabeçalho. */
export function Logo({ tamanho = 32, mostrarNome = true, variante = "cor", className = "" }) {
  return (
    <div
      className={`flex items-center gap-2.5 ${
        variante === "monocromatico" ? "" : "text-azul-marca dark:text-white"
      } ${className}`}
      role="img"
      aria-label="Arkos"
    >
      <Simbolo tamanho={tamanho} variante={variante} rotulo={null} />
      {mostrarNome ? (
        <Tipografia altura={Math.round(tamanho * ALTURA_TIPOGRAFIA)} rotulo={null} />
      ) : null}
    </div>
  );
}

/**
 * Marca completa: o arco com o wordmark dentro, de marca/svg/logo-arkos.svg.
 * É uma composição própria — não é o `Logo` empilhado —, então vale onde a
 * marca é o assunto da tela e tem espaço para respirar, como o painel do login.
 */
export function LogoCompleta({ altura = 56, variante = "cor", className = "" }) {
  const prefixo = useId().replace(/:/g, "");
  const mono = variante === "monocromatico";

  return (
    <svg
      width={Math.round(altura * PROPORCAO_COMPLETA)}
      height={altura}
      viewBox={CAIXA_COMPLETA}
      fillRule="evenodd"
      clipRule="evenodd"
      className={`${
        mono ? "" : "dark:[&_path]:fill-white dark:[&_polygon]:fill-white"
      } ${className}`}
      role="img"
      aria-label="Arkos"
    >
      {mono ? (
        <>
          <path fill="currentColor" d="M9.49 467.06c113.7,-41.07 174.19,-256 380.62,-314.66 3.45,-0.98 6.11,-2.93 8.08,-5.93 14.12,-21.54 49.3,-57.15 69.95,-85.33 13.82,-18.87 25.95,-39.07 31.86,-61.14 16.08,59.98 71.73,100.59 101.81,146.47 1.97,3 4.63,4.95 8.08,5.93 206.43,58.66 266.92,273.59 380.62,314.66 10.22,3.69 9.48,12.46 9.48,19.95 -171.35,-45.91 -185.6,-243.17 -423.23,-309.73 -7.98,-2.23 -16.5,-19.26 -31.6,-33.77l-11.22 -10.09 -33.94 -23.94 -33.94 23.94c-12.85,10.79 -25.77,24.11 -34.64,37.84 -1.98,3.06 -4.68,5.04 -8.18,6.02 -237.63,66.56 -251.88,263.82 -423.23,309.73 0,-7.49 -0.74,-16.26 9.48,-19.95z" />
          <polygon fill="currentColor" points="57.6,446.83 940.15,446.83 940.15,459.13 57.6,459.13 " />
          <path fill="currentColor" d="M9.49 467.06c113.7,-41.07 174.19,-256 380.62,-314.66 3.45,-0.98 6.11,-2.93 8.08,-5.93 14.12,-21.54 49.3,-57.15 69.95,-85.33 13.82,-18.87 25.95,-39.07 31.86,-61.14l0 109.48 -33.94 23.94c-12.85,10.79 -25.77,24.11 -34.64,37.84 -1.98,3.06 -4.68,5.04 -8.18,6.02 -237.63,66.56 -251.88,263.82 -423.23,309.73 0,-7.49 -0.74,-16.26 9.48,-19.95z" />
          <path fill="currentColor" d="M500 0c16.08,59.98 71.73,100.59 101.81,146.47 1.97,3 4.63,4.95 8.08,5.93 206.43,58.66 266.92,273.59 380.62,314.66 10.22,3.69 9.48,12.46 9.48,19.95 -171.35,-45.91 -185.6,-243.17 -423.23,-309.73 -7.98,-2.23 -16.5,-19.26 -31.6,-33.77l-11.22 -10.09 -33.94 -23.94 0 -109.48z" />
          <path fill="currentColor" d="M500 109.48l-33.94 23.94c-12.84,10.78 -25.78,24.12 -34.64,37.84 -0.99,1.53 -2.16,2.79 -3.52,3.79 24.03,-40.91 61.01,-81.33 72.1,-122.73l0 57.16z" />
          <path fill="currentColor" d="M500 109.48l33.94 23.94c12.84,10.78 25.78,24.12 34.64,37.84 0.99,1.53 2.16,2.79 3.52,3.79 -24.03,-40.91 -61.01,-81.33 -72.1,-122.73l0 57.16z" />
          <path fill="currentColor" d="M65.86 408.15c71.21,-134.76 156.96,-254.97 313.2,-304.7l59.77 -31.61 -1.85 2.22c-17,20.11 -37.62,40.94 -52.08,62.78 -99.75,28.56 -167.71,91.26 -232.47,169 -27.67,33.23 -56.41,71.94 -86.57,102.31zm868.28 0c-71.21,-134.76 -156.96,-254.97 -313.2,-304.7l-59.77 -31.61 1.85 2.22c17,20.11 37.62,40.94 52.08,62.78 99.75,28.56 167.71,91.26 232.47,169 27.67,33.23 56.41,71.94 86.57,102.31z" />
          <path fill="currentColor" d="M318.1 286.18l-29.92 0 -54.94 134.01 24.55 0c17.23,-34.47 73.56,-34.28 90.69,0l24.56 0 -54.94 -134.01zm-15.36 86.7c-11.91,0 -16.49,2.64 -26.17,7.32l26.55 -67.16 26.72 66.91c-10.01,-4.53 -14.99,-7.07 -27.1,-7.07zm84.36 47.31l24.08 0 0 -53.79c0,-23.48 7.42,-29.95 29.44,-23.58l0 -20.27c-25.05,-6.13 -53.52,-6.54 -53.52,27.23l0 70.41zm160.58 -99.37l-23.3 0c-1.24,28.3 -20.84,37.13 -43.12,54.08l0 -99.6 -24.69 10.26 0 134.63 21.8 0c1.39,-19.61 16.22,-29.61 31.52,-40.32 20.24,4.3 22.37,21.89 22.55,40.32l21.25 0c-0.73,-22.78 -7.23,-41.82 -26.87,-53.46 13.86,-13.91 20.2,-25.8 20.86,-45.91zm68.99 -1.8c-68.8,0 -69.02,103.17 0,103.17 68.9,0 68.89,-103.17 0,-103.17zm26.9 51.59c0,41.01 -53.79,41.24 -53.79,0 0,-41 53.79,-41.01 53.79,0zm99.2 -22.7l24.49 0c-8.07,-38.57 -82.25,-38.36 -82.25,2.88 0,36.68 61.07,22.6 61.07,41.84 0,13.5 -33.77,16.18 -39.12,0.87l-24.44 0c8.58,42.09 88.25,35.63 88.25,-2.87 0,-32.22 -61.07,-17.48 -61.07,-38.84 0,-16.95 27.98,-17 33.07,-3.88z" />
        </>
      ) : (
        <>
          <defs>
            <radialGradient
              id={`${prefixo}-id4`}
              gradientUnits="userSpaceOnUse"
              gradientTransform="matrix(-0.253204 1.01131 -1.01934 -0.210298 787 -615)"
              cx="620"
              cy="9.74"
              r="224.48"
              fx="620"
              fy="9.74"
            >
              <stop offset="0" stopColor="#24BCCA" />
              <stop offset="1" stopColor="#223D9F" />
            </radialGradient>
            <linearGradient
              id={`${prefixo}-id0`}
              gradientUnits="userSpaceOnUse"
              x1="57.6"
              y1="452.98"
              x2="940.15"
              y2="452.98"
            >
              <stop offset="0" stopColor="#26398C" />
              <stop offset="1" stopColor="#26398C" />
            </linearGradient>
            <radialGradient
              id={`${prefixo}-id2`}
              gradientUnits="userSpaceOnUse"
              gradientTransform="matrix(-0.582369 2.32602 -2.34447 -0.483682 996 -1416)"
              cx="615"
              cy="9.74"
              r="97.6"
              fx="615"
              fy="9.74"
            >
              <stop offset="0" stopColor="#24BCCA" />
              <stop offset="1" stopColor="#26398C" />
            </radialGradient>
            <radialGradient
              id={`${prefixo}-id6`}
              gradientUnits="userSpaceOnUse"
              gradientTransform="matrix(2.20001 -0.809578 0.860499 2.05974 -701 337)"
              cx="525"
              cy="82.79"
              r="114.68"
              fx="525"
              fy="82.79"
            >
              <stop offset="0" stopColor="#24BCCA" />
              <stop offset="1" stopColor="#26398C" />
            </radialGradient>
            <radialGradient
              id={`${prefixo}-id5`}
              gradientUnits="userSpaceOnUse"
              gradientTransform="matrix(-0.444074 2.35705 -2.1338 0.0515901 878 -1191)"
              cx="527.4"
              cy="54.78"
              r="29.94"
              fx="527.4"
              fy="54.78"
            >
              <stop offset="0" stopColor="#24BCCA" />
              <stop offset="1" stopColor="#223D9F" />
            </radialGradient>
            <radialGradient
              id={`${prefixo}-id3`}
              gradientUnits="userSpaceOnUse"
              gradientTransform="matrix(1.1149 2.38895 2.48985 -0.779492 -147 -1446)"
              cx="627.61"
              cy="30.24"
              r="29.94"
              fx="627.61"
              fy="30.24"
            >
              <stop offset="0" stopColor="#24BCCA" />
              <stop offset="1" stopColor="#223D9F" />
            </radialGradient>
            <radialGradient
              id={`${prefixo}-id1`}
              gradientUnits="userSpaceOnUse"
              gradientTransform="matrix(1.01873 0.341257 -0.473488 1.01712 45 -199)"
              cx="578.15"
              cy="118.92"
              r="211.86"
              fx="578.15"
              fy="118.92"
            >
              <stop offset="0" stopColor="#24BCCA" />
              <stop offset="1" stopColor="#26398C" />
            </radialGradient>
          </defs>
          <path fill={`url(#${prefixo}-id4)`} d="M9.49 467.06c113.7,-41.07 174.19,-256 380.62,-314.66 3.45,-0.98 6.11,-2.93 8.08,-5.93 14.12,-21.54 49.3,-57.15 69.95,-85.33 13.82,-18.87 25.95,-39.07 31.86,-61.14 16.08,59.98 71.73,100.59 101.81,146.47 1.97,3 4.63,4.95 8.08,5.93 206.43,58.66 266.92,273.59 380.62,314.66 10.22,3.69 9.48,12.46 9.48,19.95 -171.35,-45.91 -185.6,-243.17 -423.23,-309.73 -7.98,-2.23 -16.5,-19.26 -31.6,-33.77l-11.22 -10.09 -33.94 -23.94 -33.94 23.94c-12.85,10.79 -25.77,24.11 -34.64,37.84 -1.98,3.06 -4.68,5.04 -8.18,6.02 -237.63,66.56 -251.88,263.82 -423.23,309.73 0,-7.49 -0.74,-16.26 9.48,-19.95z" />
          <polygon fill={`url(#${prefixo}-id0)`} points="57.6,446.83 940.15,446.83 940.15,459.13 57.6,459.13 " />
          <path fill={`url(#${prefixo}-id2)`} d="M9.49 467.06c113.7,-41.07 174.19,-256 380.62,-314.66 3.45,-0.98 6.11,-2.93 8.08,-5.93 14.12,-21.54 49.3,-57.15 69.95,-85.33 13.82,-18.87 25.95,-39.07 31.86,-61.14l0 109.48 -33.94 23.94c-12.85,10.79 -25.77,24.11 -34.64,37.84 -1.98,3.06 -4.68,5.04 -8.18,6.02 -237.63,66.56 -251.88,263.82 -423.23,309.73 0,-7.49 -0.74,-16.26 9.48,-19.95z" />
          <path fill={`url(#${prefixo}-id6)`} d="M500 0c16.08,59.98 71.73,100.59 101.81,146.47 1.97,3 4.63,4.95 8.08,5.93 206.43,58.66 266.92,273.59 380.62,314.66 10.22,3.69 9.48,12.46 9.48,19.95 -171.35,-45.91 -185.6,-243.17 -423.23,-309.73 -7.98,-2.23 -16.5,-19.26 -31.6,-33.77l-11.22 -10.09 -33.94 -23.94 0 -109.48z" />
          <path fill={`url(#${prefixo}-id5)`} d="M500 109.48l-33.94 23.94c-12.84,10.78 -25.78,24.12 -34.64,37.84 -0.99,1.53 -2.16,2.79 -3.52,3.79 24.03,-40.91 61.01,-81.33 72.1,-122.73l0 57.16z" />
          <path fill={`url(#${prefixo}-id3)`} d="M500 109.48l33.94 23.94c12.84,10.78 25.78,24.12 34.64,37.84 0.99,1.53 2.16,2.79 3.52,3.79 -24.03,-40.91 -61.01,-81.33 -72.1,-122.73l0 57.16z" />
          <path fill={`url(#${prefixo}-id1)`} d="M65.86 408.15c71.21,-134.76 156.96,-254.97 313.2,-304.7l59.77 -31.61 -1.85 2.22c-17,20.11 -37.62,40.94 -52.08,62.78 -99.75,28.56 -167.71,91.26 -232.47,169 -27.67,33.23 -56.41,71.94 -86.57,102.31zm868.28 0c-71.21,-134.76 -156.96,-254.97 -313.2,-304.7l-59.77 -31.61 1.85 2.22c17,20.11 37.62,40.94 52.08,62.78 99.75,28.56 167.71,91.26 232.47,169 27.67,33.23 56.41,71.94 86.57,102.31z" />
          <path fill="#26398C" d="M318.1 286.18l-29.92 0 -54.94 134.01 24.55 0c17.23,-34.47 73.56,-34.28 90.69,0l24.56 0 -54.94 -134.01zm-15.36 86.7c-11.91,0 -16.49,2.64 -26.17,7.32l26.55 -67.16 26.72 66.91c-10.01,-4.53 -14.99,-7.07 -27.1,-7.07zm84.36 47.31l24.08 0 0 -53.79c0,-23.48 7.42,-29.95 29.44,-23.58l0 -20.27c-25.05,-6.13 -53.52,-6.54 -53.52,27.23l0 70.41zm160.58 -99.37l-23.3 0c-1.24,28.3 -20.84,37.13 -43.12,54.08l0 -99.6 -24.69 10.26 0 134.63 21.8 0c1.39,-19.61 16.22,-29.61 31.52,-40.32 20.24,4.3 22.37,21.89 22.55,40.32l21.25 0c-0.73,-22.78 -7.23,-41.82 -26.87,-53.46 13.86,-13.91 20.2,-25.8 20.86,-45.91zm68.99 -1.8c-68.8,0 -69.02,103.17 0,103.17 68.9,0 68.89,-103.17 0,-103.17zm26.9 51.59c0,41.01 -53.79,41.24 -53.79,0 0,-41 53.79,-41.01 53.79,0zm99.2 -22.7l24.49 0c-8.07,-38.57 -82.25,-38.36 -82.25,2.88 0,36.68 61.07,22.6 61.07,41.84 0,13.5 -33.77,16.18 -39.12,0.87l-24.44 0c8.58,42.09 88.25,35.63 88.25,-2.87 0,-32.22 -61.07,-17.48 -61.07,-38.84 0,-16.95 27.98,-17 33.07,-3.88z" />
        </>
      )}
    </svg>
  );
}
