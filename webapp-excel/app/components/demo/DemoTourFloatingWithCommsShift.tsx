"use client";

import { useComms } from "@/app/components/comms/CommsProvider";
import DemoTourFloatingButton from "@/app/components/demo/DemoTourFloatingButton";

export default function DemoTourFloatingWithCommsShift({ empresaSlug }: { empresaSlug?: string }) {
  const comms = useComms();

  // right-4 (16px) + drawer 420px + gap 16px
  const rightShiftPx = comms.open ? 452 : 0;

  return <DemoTourFloatingButton empresaSlug={empresaSlug} rightShiftPx={rightShiftPx} />;
}
