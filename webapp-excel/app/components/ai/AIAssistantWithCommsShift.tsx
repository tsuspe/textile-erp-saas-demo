//pp/components/ai/AIAssistantWithCommsShift.tsx
"use client";

import AIAssistantProvider from "@/app/components/ai/AIAssistantProvider";
import { useComms } from "@/app/components/comms/CommsProvider";

export default function AIAssistantWithCommsShift({ empresa }: { empresa: string }) {
  const comms = useComms();

  // AJUSTA si tu CommsDrawer no mide 380px.
  // La idea: si el drawer está abierto, empujamos el asistente a la izquierda.
  const COMMS_DRAWER_WIDTH = 380;
  const GAP = 24;

  const rightShiftPx = comms.open ? COMMS_DRAWER_WIDTH + GAP : 0;

  return <AIAssistantProvider empresa={empresa} rightShiftPx={rightShiftPx} />;
}
