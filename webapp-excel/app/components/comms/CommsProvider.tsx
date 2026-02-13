//app/components/comnms/CommsProvider.tsx

"use client";

import React, { createContext, useContext, useMemo, useState } from "react";

type CommsTab = "notifications" | "chat";

type CommsState = {
  open: boolean;
  tab: CommsTab;
  threadId: string | null;

  openDrawer: (tab?: CommsTab) => void;
  closeDrawer: () => void;
  toggleDrawer: (tab?: CommsTab) => void;

  setTab: (tab: CommsTab) => void;
  setThreadId: (id: string | null) => void;
};

const Ctx = createContext<CommsState | null>(null);

export function CommsProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<CommsTab>("notifications");
  const [threadId, setThreadId] = useState<string | null>(null);

  const api = useMemo<CommsState>(() => {
    function openDrawer(nextTab?: CommsTab) {
      if (nextTab) setTab(nextTab);
      setOpen(true);
    }
    function closeDrawer() {
      setOpen(false);
    }
    function toggleDrawer(nextTab?: CommsTab) {
      setOpen((isOpen) => {
        // si está cerrado -> abrir (y setear tab si viene)
        if (!isOpen) {
          if (nextTab) setTab(nextTab);
          return true;
        }

        // si está abierto y me pides otra tab -> mantener abierto y cambiar tab
        if (nextTab && nextTab !== tab) {
          setTab(nextTab);
          return true;
        }

        // si está abierto y es la misma tab (o no se pasa tab) -> cerrar
        return false;
      });
    }


    return {
      open,
      tab,
      threadId,
      openDrawer,
      closeDrawer,
      toggleDrawer,
      setTab,
      setThreadId,
    };
  }, [open, tab, threadId]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useComms() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useComms must be used inside <CommsProvider>");
  return ctx;
}
