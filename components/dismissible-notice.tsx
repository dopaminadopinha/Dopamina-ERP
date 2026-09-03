"use client";

import { useState, type ReactNode } from "react";
import { X } from "lucide-react";

const dismissedNotices = new Set<string>();

export function DismissibleNotice({ children, noticeKey, className = "data-warning", label = "Fechar aviso" }: { children: ReactNode; noticeKey: string; className?: string; label?: string }) {
  const [visible, setVisible] = useState(() => !dismissedNotices.has(noticeKey));

  if (!visible) return null;

  return <div className={`${className} dismissible-notice`}>
    {children}
    <button type="button" className="notice-dismiss" onClick={() => { dismissedNotices.add(noticeKey); setVisible(false); }} aria-label={label} title={label}>
      <X size={14} />
    </button>
  </div>;
}
