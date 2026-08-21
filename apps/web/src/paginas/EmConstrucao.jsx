import { Hammer } from "lucide-react";
import { Card, EstadoVazio, TituloPagina } from "../componentes/Superficies.jsx";

/** Placeholder das rotas que ainda serão construídas nas fases seguintes. */
export function EmConstrucao({ titulo = "Em construção", descricao }) {
  return (
    <>
      <TituloPagina titulo={titulo} />
      <Card>
        <EstadoVazio
          icone={Hammer}
          titulo="Módulo em construção"
          descricao={descricao ?? "Esta tela entra em uma das próximas fases do MVP."}
        />
      </Card>
    </>
  );
}
