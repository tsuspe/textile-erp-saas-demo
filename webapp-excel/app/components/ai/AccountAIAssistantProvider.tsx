// app/components/ai/AccountAIAssistantProvider.tsx
"use client";

import AIAssistantButton from "@/app/components/ai/AIAssistantButton";
import AIAssistantDrawer from "@/app/components/ai/AIAssistantDrawer";
import { useAIAssistant } from "@/app/components/ai/useAIAssistant";

export default function AccountAIAssistantProvider({ rightShiftPx = 0 }: { rightShiftPx?: number }) {
  const assistant = useAIAssistant();

  // Si Comms está abierto, empujamos el drawer de IA a la izquierda del Comms:
  // Comms: width 420 + right margin 16 + gap 16 => ~452
  // Pero como ya nos pasan rightShiftPx desde AccountChrome, lo reutilizamos.
  const aiDrawerShift = rightShiftPx;

  return (
    <>
      <AIAssistantButton
        onClick={assistant.toggle}
        open={assistant.open}
        rightShiftPx={rightShiftPx}
      />

      <AIAssistantDrawer
        empresa="account"
        assistant={assistant}
        rightShiftPx={aiDrawerShift} // 👈 clave
      />
    </>
  );
}
