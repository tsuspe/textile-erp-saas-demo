// app/components/ai/AIAssistantProvider.tsx
"use client";

import AIAssistantButton from "./AIAssistantButton";
import AIAssistantDrawer from "./AIAssistantDrawer";
import { useAIAssistant } from "./useAIAssistant";

export default function AIAssistantProvider({
  empresa,
  rightShiftPx = 0,
}: {
  empresa: string;
  rightShiftPx?: number;
}) {
  const assistant = useAIAssistant();

  return (
    <>
      <AIAssistantButton
        onClick={assistant.toggle}
        open={assistant.open}
        rightShiftPx={rightShiftPx}
      />

      <AIAssistantDrawer
        empresa={empresa}
        assistant={assistant}
        rightShiftPx={rightShiftPx}
      />
    </>
  );
}
