//app/(app)/account/AccountShell.tsx
"use client";

import AccountTopBar from "@/app/components/AccountTopBar";
import { CommsDrawer } from "@/app/components/comms/CommsDrawer";
import { useComms } from "@/app/components/comms/CommsProvider";
import FlashFromQuery from "@/app/components/FlashFromQuery";
// ⚠️ AJUSTA este import al componente real del asistente IA
// (si tu botón/componente se llama distinto, cámbialo aquí)
import AIAssistantButton from "@/app/components/ai/AIAssistantButton";


export default function AccountShell({ children }: { children: React.ReactNode }) {
  const comms = useComms();
  const assistantOpen = false; // placeholder por ahora


  // ancho del drawer: 420px + right-4 (16px) + un poco de margen
  const pushRight = comms.open ? "pr-[460px]" : "pr-0";

  return (
    <>
      {/* Chrome/overlays no se imprimen */}
      <div className="print-hide">
        {/* Topbar + Asistente IA */}
        <div className={`transition-[padding] duration-200 ${pushRight}`}>
          <AccountTopBar />

        <div className="max-w-7xl mx-auto px-4 pt-3 flex items-center justify-between gap-3">
          <FlashFromQuery />
        </div>

        <AIAssistantButton
          open={assistantOpen}
          onClick={() => {
            console.log("Abrir asistente IA");
          }}
        />

        </div>

        {/* Drawer */}
        <CommsDrawer />
      </div>

      {/* Contenido principal (pantalla + print) */}
      <main
        className={[
          "mx-auto w-full max-w-7xl px-4 py-6 print-reset transition-[padding] duration-200",
          comms.open ? "pr-[460px]" : "",
        ].join(" ")}
      >
        {children}
      </main>
    </>
  );
}
