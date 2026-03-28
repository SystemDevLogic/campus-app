"use client";

import { useState } from "react";

type EmailQuickActionsProps = {
  email: string;
};

function canUseAsEmail(email: string) {
  return email.includes("@");
}

export default function EmailQuickActions({ email }: Readonly<EmailQuickActionsProps>) {
  const [copied, setCopied] = useState(false);
  const isValidEmail = canUseAsEmail(email);

  async function copyEmail() {
    try {
      await navigator.clipboard.writeText(email);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  }

  if (!isValidEmail) {
    return null;
  }

  return (
    <span className="inline-flex items-center gap-2">
      <a
        href={`mailto:${email}`}
        data-no-global-loader="true"
        className="rounded-md border border-zinc-600 px-2 py-0.5 text-[11px] font-semibold text-zinc-300 hover:border-zinc-400"
      >
        Enviar
      </a>
      <button
        type="button"
        onClick={() => {
          void copyEmail();
        }}
        className="rounded-md border border-zinc-600 px-2 py-0.5 text-[11px] font-semibold text-zinc-300 hover:border-zinc-400"
      >
        {copied ? "Copiado" : "Copiar"}
      </button>
    </span>
  );
}
