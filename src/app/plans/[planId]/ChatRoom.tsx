"use client";

import { useEffect, useMemo, useState } from "react";

import { createClient } from "@/lib/supabase/browser";

type MessageItem = {
  id: string;
  user_id: string;
  body: string;
  created_at: string;
  author_name: string;
};

type ChatRoomProps = {
  planId: string;
  userId: string;
  initialMessages: MessageItem[];
};

type MessageRowPayload = {
  id: string;
  user_id: string;
  body: string;
  created_at: string;
};

function formatHourLabel(isoDate: string) {
  return new Intl.DateTimeFormat("es-EC", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(isoDate));
}

function appendMessage(current: MessageItem[], row: MessageRowPayload, userId: string) {
  if (current.some((item) => item.id === row.id)) {
    return current;
  }

  return [
    ...current,
    {
      id: row.id,
      user_id: row.user_id,
      body: row.body,
      created_at: row.created_at,
      author_name: row.user_id === userId ? "Tu" : "Estudiante",
    },
  ];
}

function replaceAuthorName(current: MessageItem[], messageId: string, authorName: string) {
  return current.map((item) => (item.id === messageId ? { ...item, author_name: authorName } : item));
}

export default function ChatRoom({ planId, userId, initialMessages }: Readonly<ChatRoomProps>) {
  const supabase = useMemo(() => createClient(), []);
  const [messages, setMessages] = useState<MessageItem[]>(initialMessages);
  const [messageText, setMessageText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const channel = supabase
      .channel(`plan-chat-${planId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `plan_id=eq.${planId}`,
        },
        async (payload) => {
          const row = payload.new as MessageRowPayload;
          setMessages((current) => appendMessage(current, row, userId));

          if (row.user_id !== userId) {
            const { data: profile } = await supabase
              .from("profiles")
              .select("first_name, last_name")
              .eq("id", row.user_id)
              .maybeSingle();

            if (profile) {
              const fullName = `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim() || "Estudiante";
              setMessages((current) => replaceAuthorName(current, row.id, fullName));
            }
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [planId, supabase, userId]);

  async function sendMessage() {
    setError(null);

    const body = messageText.trim();
    if (!body) {
      return;
    }

    if (body.length > 500) {
      setError("El mensaje no puede superar 500 caracteres.");
      return;
    }

    setSending(true);

    const { error: insertError } = await supabase.from("messages").insert({
      plan_id: planId,
      user_id: userId,
      body,
    });

    if (insertError) {
      setError(insertError.message);
      setSending(false);
      return;
    }

    setMessageText("");
    setSending(false);
  }

  const handleSend: React.ComponentProps<"form">["onSubmit"] = (event) => {
    event.preventDefault();
    void sendMessage();
  };

  return (
    <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Chat del plan</h2>

      <div className="mt-4 max-h-[420px] space-y-3 overflow-y-auto rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-950">
        {messages.length === 0 ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Aun no hay mensajes. Rompe el hielo.</p>
        ) : null}

        {messages.map((message) => {
          const isMe = message.user_id === userId;

          return (
            <article
              key={message.id}
              className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                isMe
                  ? "ml-auto bg-zinc-900 text-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                  : "bg-white text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
              }`}
            >
              <div className="mb-1 flex items-center justify-between gap-3 text-xs opacity-75">
                <span>{isMe ? "Tu" : message.author_name}</span>
                <span>{formatHourLabel(message.created_at)}</span>
              </div>
              <p className="whitespace-pre-wrap break-words">{message.body}</p>
            </article>
          );
        })}
      </div>

      <form onSubmit={handleSend} className="mt-4 space-y-2">
        <textarea
          value={messageText}
          onChange={(event) => setMessageText(event.target.value)}
          rows={3}
          maxLength={500}
          placeholder="Escribe un mensaje..."
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
        />
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-zinc-500 dark:text-zinc-400">{messageText.length}/500</span>
          <button
            type="submit"
            disabled={sending}
            className="cursor-pointer rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-zinc-100 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            {sending ? "Enviando..." : "Enviar"}
          </button>
        </div>
        {error ? <p className="text-sm text-red-500">{error}</p> : null}
      </form>
    </div>
  );
}
