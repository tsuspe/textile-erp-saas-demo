// app/(app)/account/api/ai/chat/route.ts
import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({
    answer:
      "En /account estoy en modo básico. Para el asistente completo (fichas/maestros/producción) abre una empresa y úsame desde ahí.\n\n" +
      "Tip: entra en HOME / Empresas → elige empresa → y me vuelves a abrir.",
    actions: [{ label: "Ir a Empresas", href: "/" }],
  });
}
