// app/(app)/[empresa]/layout.tsx
import AppBreadcrumbs from "@/app/components/AppBreadcrumbs";
import AppTopBar from "@/app/components/AppTopBar";
import FlashFromQuery from "@/app/components/FlashFromQuery";
import AIAssistantWithCommsShift from "@/app/components/ai/AIAssistantWithCommsShift";
import { CommsDrawer } from "@/app/components/comms/CommsDrawer";
import { CommsProvider } from "@/app/components/comms/CommsProvider";
import DemoTourFloatingWithCommsShift from "@/app/components/demo/DemoTourFloatingWithCommsShift";

export default async function EmpresaLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ empresa: string }>;
}) {
  const { empresa } = await params;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 print:bg-white print:text-slate-900">
      <style>{`
        @media print {
          html, body { background: #fff !important; }
          .print-hide { display: none !important; }
          .print-reset {
            max-width: none !important;
            padding: 0 !important;
            margin: 0 !important;
            background: #fff !important;
            color: #0f172a !important;
          }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>

      {/* Chrome visible en pantalla, oculto al imprimir */}
      <div className="print-hide">
        <CommsProvider>
          <AppTopBar empresaSlug={empresa} />

          <div className="max-w-7xl mx-auto px-4 pt-3 space-y-2">
            <AppBreadcrumbs empresaSlug={empresa} />
            <FlashFromQuery />
          </div>

          <CommsDrawer />

          {/* 👇 IA ahora está dentro del CommsProvider y recibe el shift real */}
          <AIAssistantWithCommsShift empresa={empresa} />
          <DemoTourFloatingWithCommsShift empresaSlug={empresa} />
        </CommsProvider>
      </div>

      {/* Contenido “real” (pantalla + print) */}
      <div className="print-reset">{children}</div>
    </div>
  );
}
