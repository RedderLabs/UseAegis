"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DashboardShell, useDashboardSession } from "@/components/DashboardShell";
import { getToken } from "@/lib/session";
import { RelayError, resolveUsername } from "@/lib/relay-client";
import {
  addContactFromDirectory,
  listContacts,
  type Contact,
} from "@/lib/contacts";
import {
  loadHistory,
  mergeIncoming,
  pollInbox,
  saveHistory,
  sendText,
  type ChatMessage,
} from "@/lib/chat";
import { IconSend, IconCheck } from "@/components/Icons";

const POLL_MS = 4000;

function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function contactLabel(c: Contact): string {
  return c.handle ? `@${c.handle}` : c.fingerprint;
}

function Channel() {
  const session = useDashboardSession();
  const ownPub = session.publicKey;

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selected, setSelected] = useState<Contact | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  // Alta de contacto por handle.
  const [addOpen, setAddOpen] = useState(false);
  const [handle, setHandle] = useState("");
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const threadRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<Contact | null>(null);
  selectedRef.current = selected;

  // Carga inicial de la libreta; selecciona el primer contacto si lo hay.
  useEffect(() => {
    let alive = true;
    listContacts().then((list) => {
      if (!alive) return;
      setContacts(list);
      setSelected((cur) => cur ?? list[0] ?? null);
    });
    return () => {
      alive = false;
    };
  }, []);

  // Al cambiar de contacto, carga su historial local.
  useEffect(() => {
    setMessages(selected ? loadHistory(ownPub, selected.pub) : []);
  }, [selected, ownPub]);

  // Sondeo del buzón: abre entrantes, los integra por conversación y refresca la abierta.
  useEffect(() => {
    const token = getToken();
    if (!token) return;
    let alive = true;

    async function tick() {
      try {
        const { incoming } = await pollInbox(token!, ownPub);
        if (!alive || incoming.length === 0) return;
        const touched = mergeIncoming(ownPub, incoming);
        const open = selectedRef.current;
        if (open && touched.has(open.pub)) {
          setMessages(loadHistory(ownPub, open.pub));
        }
      } catch {
        /* relay caído o sesión expirada: la próxima vuelta reintenta */
      }
    }

    const id = window.setInterval(tick, POLL_MS);
    void tick();
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [ownPub]);

  useEffect(() => {
    threadRef.current?.scrollTo(0, threadRef.current.scrollHeight);
  }, [messages]);

  const send = useCallback(async () => {
    const text = draft.trim();
    const token = getToken();
    if (!text || !selected || !token || sending) return;
    setSending(true);
    setDraft("");
    try {
      const sent = await sendText(token, selected, text);
      setMessages((prev) => {
        const next = [...prev, sent];
        saveHistory(ownPub, selected.pub, next);
        return next;
      });
    } catch (err) {
      const msg = err instanceof RelayError ? err.message : "No se pudo enviar el mensaje.";
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          dir: "out",
          body: `${text}  ⚠️ ${msg}`,
          sentAt: new Date().toISOString(),
          peerPub: selected.pub,
        },
      ]);
    } finally {
      setSending(false);
    }
  }, [draft, selected, sending, ownPub]);

  async function addContact() {
    const h = handle.trim().replace(/^@/, "");
    const token = getToken();
    if (!h || !token || addBusy) return;
    setAddBusy(true);
    setAddError(null);
    try {
      const entry = await resolveUsername(token, h);
      const contact = await addContactFromDirectory(entry);
      const list = await listContacts();
      setContacts(list);
      setSelected(contact);
      setHandle("");
      setAddOpen(false);
    } catch (err) {
      if (err instanceof RelayError && err.status === 404) {
        setAddError(`No existe ningún usuario con el handle «${h}».`);
      } else {
        setAddError(err instanceof Error ? err.message : "No se pudo añadir el contacto.");
      }
    } finally {
      setAddBusy(false);
    }
  }

  return (
    <div className="flex flex-1 min-h-0">
      <section className="flex-1 flex flex-col min-w-0">
        {/* Header: desplegable de contactos + alta */}
        <div className="shrink-0 border-b border-line bg-surface/50 backdrop-blur-sm px-4 md:px-6 py-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-sm bg-surface-2 border border-line flex items-center justify-center font-mono text-accent text-sm shrink-0">
              {selected ? contactLabel(selected).slice(selected.handle ? 1 : 0, selected.handle ? 3 : 2).toUpperCase() : "—"}
            </div>
            <div className="min-w-0 flex-1">
              <label className="label text-muted-2 block mb-0.5">Conversación con</label>
              <select
                value={selected?.pub ?? ""}
                onChange={(e) => setSelected(contacts.find((c) => c.pub === e.target.value) ?? null)}
                disabled={contacts.length === 0}
                className="w-full max-w-xs bg-surface-2 border border-line rounded-sm px-2 py-1.5 font-mono text-[13px] text-text focus:outline-none focus:border-accent/50 disabled:text-muted-2"
              >
                {contacts.length === 0 ? (
                  <option value="">Sin contactos todavía</option>
                ) : (
                  contacts.map((c) => (
                    <option key={c.pub} value={c.pub}>
                      {contactLabel(c)}
                    </option>
                  ))
                )}
              </select>
            </div>
            <button
              onClick={() => {
                setAddOpen((v) => !v);
                setAddError(null);
              }}
              className="shrink-0 label text-accent border border-accent/30 rounded-sm px-3 py-2 hover:bg-accent/5 transition-colors"
            >
              + Añadir
            </button>
          </div>

          {addOpen && (
            <div className="mt-3 flex flex-col gap-2 bg-bg border border-line rounded-sm p-3">
              <p className="label text-muted-2">Añadir contacto por handle público</p>
              <div className="flex items-center gap-2">
                <input
                  value={handle}
                  onChange={(e) => setHandle(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addContact()}
                  placeholder="handle (p. ej. alicia)"
                  className="flex-1 bg-surface-2 border border-line rounded-sm px-3 py-2 text-[13px] text-text placeholder:text-muted-2 focus:outline-none focus:border-accent/50"
                />
                <button
                  onClick={addContact}
                  disabled={!handle.trim() || addBusy}
                  className="label text-bg bg-accent rounded-sm px-3 py-2 hover:brightness-110 disabled:opacity-40 transition-all"
                >
                  {addBusy ? "Buscando…" : "Añadir"}
                </button>
              </div>
              {addError && <p className="text-[12px] text-error">{addError}</p>}
              <p className="font-mono text-[10px] text-muted-2 leading-relaxed">
                Se descarga su clave de cifrado del directorio y se verifica su firma antes de
                guardarla (anti-MITM). El buzón es el mismo por clearnet y .onion.
              </p>
            </div>
          )}
        </div>

        {/* Mensajes */}
        <div ref={threadRef} className="flex-1 overflow-y-auto px-4 md:px-6 py-6 space-y-4">
          <div className="flex justify-center">
            <span className="label text-muted-2 bg-surface-2 border border-line rounded-sm px-3 py-1.5 text-center">
              Canal cifrado extremo a extremo · XChaCha20-Poly1305 · Sealed sender
            </span>
          </div>

          {!selected ? (
            <div className="flex flex-col items-center justify-center py-16 text-center gap-2">
              <p className="text-[14px] text-muted">No tienes contactos todavía.</p>
              <p className="font-mono text-[11px] text-muted-2">
                Pulsa «+ Añadir» e introduce el handle de otro usuario para empezar.
              </p>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center gap-2">
              <p className="text-[14px] text-muted">
                Sin mensajes con {contactLabel(selected)} todavía.
              </p>
              <p className="font-mono text-[11px] text-muted-2">
                Escribe abajo para enviar el primero.
              </p>
            </div>
          ) : (
            messages.map((m) => (
              <div
                key={m.id}
                className={`flex flex-col max-w-[80%] ${
                  m.dir === "out" ? "items-end self-end ml-auto" : "items-start self-start mr-auto"
                }`}
              >
                <div
                  className={`rounded-sm px-4 py-3 border ${
                    m.dir === "out"
                      ? "bg-bubble-out border-accent/40"
                      : "bg-surface-2 border-line"
                  }`}
                >
                  <p className="text-[14px] text-text leading-relaxed break-words whitespace-pre-wrap">
                    {m.body}
                  </p>
                </div>
                <span className="inline-flex items-center gap-1 mt-1.5 label text-accent-dim">
                  <span className="font-mono text-[10px] text-muted-2 normal-case tracking-normal">
                    {formatTime(m.sentAt)}
                  </span>
                  {m.dir === "out" && <IconCheck className="w-3 h-3" />}
                  {m.dir === "out" ? "Enviado" : "Recibido"}
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
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void send();
                }
              }}
              disabled={!selected}
              placeholder={selected ? "Transmitir mensaje…" : "Elige o añade un contacto para empezar"}
              className="flex-1 bg-transparent border-none px-1 py-2 text-[14px] text-text placeholder:text-muted-2 focus:outline-none disabled:cursor-not-allowed"
            />
            <button
              onClick={() => void send()}
              disabled={!draft.trim() || !selected || sending}
              className="w-10 h-10 rounded-sm flex items-center justify-center transition-all bg-accent text-bg hover:brightness-110 active:scale-95 disabled:opacity-40"
              title="Enviar"
            >
              <IconSend className="w-5 h-5" />
            </button>
          </div>
        </div>
      </section>

      {/* Panel derecho — metadata honesta */}
      <aside className="hidden xl:flex flex-col w-72 shrink-0 border-l border-line bg-surface/60 backdrop-blur-sm p-5 overflow-y-auto">
        <h2 className="label text-muted border-b border-line pb-2 mb-4">Estado de la sesión</h2>
        <div className="space-y-3">
          <div className="bg-bg border border-line rounded-sm p-3">
            <p className="label text-muted-2 mb-1">Transporte</p>
            <div className="flex items-center justify-between">
              <span className="font-mono text-[13px] text-accent">
                {session.secure ? "Relay · .onion" : "Relay · clearnet"}
              </span>
              <span className="w-2 h-2 rounded-full bg-accent" style={{ boxShadow: "0 0 8px #c3f400" }} />
            </div>
          </div>
          <div className="bg-bg border border-line rounded-sm p-3">
            <p className="label text-muted-2 mb-1">Cifrado de contenido</p>
            <span className="font-mono text-[12px] text-text">XChaCha20-Poly1305</span>
          </div>
          <div className="bg-bg border border-line rounded-sm p-3">
            <p className="label text-muted-2 mb-1">Remitente</p>
            <span className="font-mono text-[12px] text-accent">Sealed sender</span>
          </div>
          <div className="bg-bg border border-line rounded-sm p-3">
            <p className="label text-muted-2 mb-1">Contactos verificados</p>
            <span className="font-mono text-[13px] text-text">{contacts.length}</span>
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
