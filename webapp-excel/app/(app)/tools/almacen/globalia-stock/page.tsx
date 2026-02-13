// app/(app)/tools/almacen/globalia-stock/page.tsx
export const dynamic = "force-dynamic";
export const revalidate = 0;

import GlobaliaStockClient from "./GlobaliaStockClient";

export default function Page() {
  return (
    <div className="mx-auto w-full max-w-[1700px] px-3 md:px-6">
      <GlobaliaStockClient />
    </div>
  );
}

