// app/(app)/account/AccountChrome.tsx
"use client";

import { Suspense } from "react";
import AccountTopBar from "@/app/components/AccountTopBar";
import FlashFromQuery from "@/app/components/FlashFromQuery";
import AccountAIAssistantProvider from "@/app/components/ai/AccountAIAssistantProvider";
import { CommsDrawer } from "@/app/components/comms/CommsDrawer";
import { useComms } from "@/app/components/comms/CommsProvider";
import DemoTourFloatingButton from "@/app/components/demo/DemoTourFloatingButton";

export default function AccountChrome({ children }: { children: React.ReactNode }) {
  const comms = useComms();

  // Drawer: right-4 (16px) + width 420 + gap 16px = 452px aprox
  // Solo lo usamos para mover overlays (topbar / botón IA / drawer IA), NO el contenido.
  const rightShiftPx = comms.open ? 452 : 0;

  return (
    <>
      {/* Chrome/overlays no se imprimen */}
      <div className="print-hide">
        {/* Topbar puede moverse para no quedar debajo del drawer */}
        <AccountTopBar rightShiftPx={rightShiftPx} />

        {/* Flash NO debe moverse: overlay siempre por encima */}
        <div className="max-w-7xl mx-auto px-4 pt-3">
          <Suspense fallback={null}>
            <FlashFromQuery />
          </Suspense>
        </div>

        {/* Comms drawer: overlay fixed */}
        <CommsDrawer />

        {/* Asistente IA (en Account): esto sí se desplaza para no chocar con el drawer */}
        <AccountAIAssistantProvider rightShiftPx={rightShiftPx} />
        <DemoTourFloatingButton rightShiftPx={rightShiftPx} />
      </div>

      {/* Contenido principal (pantalla + print): NO se desplaza */}
      <main className="mx-auto w-full max-w-7xl px-4 py-6 print-reset">
        {children}
      </main>
    </>
  );
}
