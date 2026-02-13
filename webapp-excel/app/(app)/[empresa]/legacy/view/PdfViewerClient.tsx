// app/(app)/[empresa]/legacy/view/PdfViewerClient.tsx
"use client";

import { PrintButton } from "@/app/components/PrintButton";

export default function PdfViewerClient({ pdfSrc }: { pdfSrc: string }) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-2">
      <div className="flex justify-end mb-2">
        <PrintButton />
      </div>

      <iframe
        className="w-full h-[80vh] rounded-lg border border-slate-800 bg-slate-950"
        src={pdfSrc}
      />
    </section>
  );
}
