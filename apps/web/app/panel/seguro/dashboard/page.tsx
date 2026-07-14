"use client";

import { useEffect, useRef, useState } from "react";
import { DashboardShell, useDashboardSession } from "@/components/DashboardShell";
import { groupIdentity } from "@/lib/identity";
import { IconSend, IconMic, IconClip, IconCheck } from "@/components/Icons";

type Msg = { id: number; text: string; delivered: boolean; ts: number };

function Waveform({ bars = 22 }: { bars?: number }) {
  const heights = [40, 70, 30, 90, 55, 65, 35, 80, 45, 60, 30, 75, 50, 40];
  return (
    <div className="flex items-end gap-[3px] h-6">
      {Array.from({ length: bars }).map((_, i) => (
        <span
          key={i}
          className="w-[3px] rounded-full bg-accent-dim"
          style={{ height: `${heights[i % heights.length]}%` }}
        />
      ))}
    </div>
  );
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes(),
  ).padStart(2, "0")}`;
}

function Channel() {
  const session = useDashboardSession();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const threadRef = useRef<HTMLDivElement>(null);

  const storageKey = `aegis.chat.${session.id}`;
  const grouped = groupIdentity(session.id);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) setMessages(JSON.parse(raw) as Msg[]);
    } catch {
      /* noop */
    }
  }, [storageKey]);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(messages));
    } catch {
      /* noop */
    }
  }, [messages, storageKey]);

  useEffect(() => {
    threadRef.current?.scrollTo(0, threadRef.current.scrollHeight);
  }, [messages]);

  function send() {
    const text = draft.trim();
    if (!text) return;
    const id = Date.now();
    setMessages((m) => [...m, { id, text, delivered: false, ts: id }]);
    setDraft("");
    window.setTimeout(
      () =>
        setMessages((m) =>
          m.map((msg) => (msg.id === id ? { ...msg, delivered: true } : msg)),
        ),
      600,
    );
  }

  return (
    <div className="flex flex-1 min-h-0">
      {/* Área de conversación */}
      <section className="flex-1 flex flex-col min-w-0">
        {/* Header del canal */}
        <div className="shrink-0 border-b border-line bg-surface/50 backdrop-blur-sm px-4 md:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-sm bg-surface-2 border border-line flex items-center justify-center font-mono text-accent text-sm shrink-0">
              {session.id.slice(0, 2)}
            </div>
            <div className="min-w-0">
              <h1 className="font-mono text-[13px] text-text leading-tight truncate">
                {grouped}
              </h1>
              <span className="inline-flex items-center gap-1.5 label text-accent">
                <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                Canal cifrado
              </span>
            </div>
          </div>
          <span className="hidden sm:inline-flex items-center gap-1.5 label text-accent border border-accent/20 rounded-full px-3 py-1.5 shrink-0">
            E2E verificado
          </span>
        </div>

        {/* Mensajes */}
        <div
          ref={threadRef}
          className="flex-1 overflow-y-auto px-4 md:px-6 py-6 space-y-4"
        >
          <div className="flex justify-center">
            <span className="label text-muted-2 bg-surface-2 border border-line rounded-sm px-3 py-1.5 text-center">
              Canal cifrado extremo a extremo · XChaCha20-Poly1305
            </span>
          </div>

          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center gap-2">
              <p className="text-[14px] text-muted">Sin mensajes todavía.</p>
              <p className="font-mono text-[11px] text-muted-2">
                Escribe abajo para enviar el primero.
              </p>
            </div>
          ) : (
            messages.map((m) => (
              <div
                key={m.id}
                className="flex flex-col items-end self-end max-w-[80%] ml-auto"
              >
                <div className="bg-bubble-out border border-accent/40 rounded-sm px-4 py-3">
                  <p className="text-[14px] text-text leading-relaxed break-words">
                    {m.text}
                  </p>
                </div>
                <span className="inline-flex items-center gap-1 mt-1.5 label text-accent-dim">
                  <span className="font-mono text-[10px] text-muted-2 normal-case tracking-normal">
                    {formatTime(m.ts)}
                  </span>
                  <IconCheck className="w-3 h-3" />
                  {m.delivered ? "Entregado" : "Enviando…"}
                </span>
              </div>
            ))
          )}
        </div>

        {/* Input */}
        <div className="shrink-0 border-t border-line bg-surface px-4 md:px-6 py-3">
          <div className="flex items-center justify-between mb-2">
            <span className="inline-flex items-center gap-1.5 label text-muted-2">
              <span className="w-1.5 h-1.5 rounded-full bg-accent-dim" />
              Cifrado en el dispositivo · XChaCha20-Poly1305
            </span>
          </div>
          <div className="flex items-center gap-2 bg-surface-2 border border-line rounded-sm px-2 py-1.5 focus-within:border-accent/50 transition-colors">
            <button
              className="p-2 text-muted hover:text-accent transition-colors"
              title="Adjuntar (cifrado)"
            >
              <IconClip />
            </button>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder="Transmitir mensaje…"
              className="flex-1 bg-transparent border-none px-1 py-2 text-[14px] text-text placeholder:text-muted-2 focus:outline-none"
            />
            <button
              onClick={send}
              disabled={!draft.trim()}
              className="w-10 h-10 rounded-sm flex items-center justify-center transition-all bg-accent text-bg hover:brightness-110 active:scale-95 disabled:opacity-40"
              title={draft.trim() ? "Enviar" : "Nota de voz (próximamente)"}
            >
              {draft.trim() ? (
                <IconSend className="w-5 h-5" />
              ) : (
                <IconMic className="w-5 h-5" />
              )}
            </button>
          </div>
        </div>
      </section>

      {/* Panel derecho — metadata honesta */}
      <aside className="hidden xl:flex flex-col w-72 shrink-0 border-l border-line bg-surface/60 backdrop-blur-sm p-5 overflow-y-auto">
        <h2 className="label text-muted border-b border-line pb-2 mb-4">
          Estado de la sesión
        </h2>
        <div className="space-y-3">
          <div className="bg-bg border border-line rounded-sm p-3">
            <p className="label text-muted-2 mb-1">Transporte</p>
            <div className="flex items-center justify-between">
              <span className="font-mono text-[13px] text-accent">Relay</span>
              <span
                className="w-2 h-2 rounded-full bg-accent"
                style={{ boxShadow: "0 0 8px #c3f400" }}
              />
            </div>
          </div>
          <div className="bg-bg border border-line rounded-sm p-3">
            <p className="label text-muted-2 mb-1">Cifrado de contenido</p>
            <span className="font-mono text-[12px] text-text">
              XChaCha20-Poly1305
            </span>
          </div>
          <div className="bg-bg border border-line rounded-sm p-3">
            <p className="label text-muted-2 mb-1">Remitente</p>
            <span className="font-mono text-[12px] text-accent">
              Sealed sender
            </span>
          </div>
          <div className="bg-bg border border-line rounded-sm p-3">
            <p className="label text-muted-2 mb-1">IP frente al relay</p>
            <div className="flex items-center justify-between">
              <span className="font-mono text-[12px] text-status-p2p">
                Visible
              </span>
              <span className="w-2 h-2 rounded-full bg-status-p2p" />
            </div>
            <p className="font-mono text-[10px] text-muted-2 mt-2 leading-relaxed">
              Tor no integrado por defecto. Ver modelo de amenaza.
            </p>
          </div>
        </div>

        <div className="mt-6">
          <h2 className="label text-muted border-b border-line pb-2 mb-4">
            Pulso de señal
          </h2>
          <div className="bg-bg border border-line rounded-sm p-4 flex items-center justify-center">
            <Waveform bars={22} />
          </div>
        </div>
      </aside>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <DashboardShell>
      <Channel />
    </DashboardShell>
  );
}
