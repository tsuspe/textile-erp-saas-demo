// app/(app)/tools/layout.tsx
import AccountChrome from "@/app/(app)/account/AccountChrome";
import { CommsProvider } from "@/app/components/comms/CommsProvider";

export default function ToolsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 print:bg-white print:text-slate-900">
      <style>{`
        html { scrollbar-gutter: stable; }
        body { overflow-y: scroll; }

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

      <CommsProvider>
        <AccountChrome>{children}</AccountChrome>
      </CommsProvider>
    </div>
  );
}
