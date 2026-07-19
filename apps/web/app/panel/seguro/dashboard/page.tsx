"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { DashboardShell, useDashboardSession } from "@/components/DashboardShell";
import { getToken } from "@/lib/session";
import { listBlocks, RelayError, resolveUsername } from "@/lib/relay-client";
import {
  addContactFromDirectory,
  listContacts,
  type Contact,
} from "@/lib/contacts";
import {
  conversationPeers,
  downloadAttachment,
  hasIncoming,
  loadHistory,
  markRead,
  markUnread,
  mergeIncoming,
  pollInbox,
  saveHistory,
  sendFile,
  sendText,
  unreadPeers,
  type ChatMessage,
  type FileAttachment,
} from "@/lib/chat";
import { IconSend, IconCheck, IconClip, IconDownload } from "@/components/Icons";

const BASE = "/panel/seguro/dashboard";

const POLL_MS = 4000;

function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function contactLabel(c: Contact): string {
  return c.handle ? `@${c.handle}` : c.fingerprint;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Tope de subida acorde con el límite del relay (MEDIA_MAX_BYTES por defecto = 50 MiB).
const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024;

/** Burbuja de un adjunto: nombre + tamaño + botón para descargar y descifrar bajo demanda. */
function AttachmentBubble({ file }: { file: FileAttachment }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function open() {
    const token = getToken();
    if (!token || busy) return;
    setBusy(true);
    setError(null);
    try {
      const blob = await downloadAttachment(token, file);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Revoca tras un momento para no cortar la descarga en curso.
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo descargar el archivo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={() => void open()}
      disabled={busy}
      className="flex items-center gap-3 text-left w-full min-w-0 disabled:opacity-60"
      title="Descargar y descifrar"
    >
      <span className="w-9 h-9 rounded-sm bg-surface border border-line flex items-center justify-center shrink-0 text-accent">
        <IconDownload className="w-4 h-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] text-text truncate">{file.name}</span>
        <span className="block font-mono text-[10px] text-muted-2">
          {busy ? "Descifrando…" : error ? error : `${formatSize(file.size)} · descargar`}
        </span>
      </span>
    </button>
  );
}

function Channel() {
  const session = useDashboardSession();
  const ownPub = session.publicKey;
  const searchParams = useSearchParams();
  const peerParam = searchParams.get("peer");

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selected, setSelected] = useState<Contact | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [pending, setPending] = useState(0); // solicitudes de contacto sin resolver
  const [unread, setUnread] = useState<Set<string>>(new Set()); // conversaciones con no leídos

  // Alta de contacto por handle.
  const [addOpen, setAddOpen] = useState(false);
  const [handle, setHandle] = useState("");
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const [attaching, setAttaching] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const threadRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<Contact | null>(null);
  selectedRef.current = selected;
  const contactsRef = useRef<Contact[]>([]);
  contactsRef.current = contacts;
  const blockedRef = useRef<Set<string>>(new Set());

  // Recalcula cuántos peers nos han escrito sin ser contacto ni estar bloqueados (solicitudes).
  const refreshPending = useCallback(() => {
    const contactPubs = new Set(contactsRef.current.map((c) => c.pub));
    const count = conversationPeers(ownPub).filter(
      (p) => hasIncoming(ownPub, p) && !contactPubs.has(p) && !blockedRef.current.has(p),
    ).length;
    setPending(count);
  }, [ownPub]);

  // Carga inicial: libreta + lista de bloqueados; selecciona contacto (?peer= o el primero).
  useEffect(() => {
    let alive = true;
    const token = getToken();
    Promise.all([
      listContacts(),
      token ? listBlocks(token).catch(() => []) : Promise.resolve([]),
    ]).then(([list, blocks]) => {
      if (!alive) return;
      blockedRef.current = new Set(blocks.map((b) => b.publicKey));
      setContacts(list);
      setSelected((cur) => cur ?? list.find((c) => c.pub === peerParam) ?? list[0] ?? null);
      contactsRef.current = list;
      refreshPending();
    });
    return () => {
      alive = false;
    };
  }, [peerParam, refreshPending]);

  // Al cambiar de contacto, carga su historial local y lo marca como leído.
  useEffect(() => {
    setMessages(selected ? loadHistory(ownPub, selected.pub) : []);
    if (selected) {
      markRead(ownPub, selected.pub);
      setUnread(unreadPeers(ownPub));
    }
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
        const touched = mergeIncoming(ownPub, incoming, (p) => blockedRef.current.has(p));
        const open = selectedRef.current;
        // No leído = entrante de un CONTACTO cuya conversación no está abierta. Los no-contactos
        // se avisan por «Solicitudes» (banner), no por este badge (no se pueden abrir en el Canal).
        const contactPubs = new Set(contactsRef.current.map((c) => c.pub));
        for (const m of incoming) {
          if (m.dir !== "in" || blockedRef.current.has(m.peerPub) || !contactPubs.has(m.peerPub)) continue;
          if (m.peerPub !== open?.pub) markUnread(ownPub, m.peerPub);
        }
        if (open && touched.has(open.pub)) {
          setMessages(loadHistory(ownPub, open.pub));
          markRead(ownPub, open.pub); // lo abierto se lee al vuelo
        }
        setUnread(unreadPeers(ownPub));
        refreshPending(); // un entrante de un no-contacto es una solicitud nueva
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
  }, [ownPub, refreshPending]);

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
      const sent = await sendText(token, ownPub, selected, text);
      setMessages((prev) => {
        const next = [...prev, sent];
        saveHistory(ownPub, selected.pub, next);
        return next;
      });
    } catch (err) {
      // Muestra la causa real (RelayError o cualquier Error, p. ej. "Identidad bloqueada").
      const msg = err instanceof Error ? err.message : "No se pudo enviar el mensaje.";
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

  const sendAttachment = useCallback(
    async (file: File) => {
      const token = getToken();
      if (!file || !selected || !token || attaching) return;
      if (file.size > MAX_ATTACHMENT_BYTES) {
        setMessages((prev) => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            dir: "out",
            body: `⚠️ «${file.name}» supera el límite de ${formatSize(MAX_ATTACHMENT_BYTES)}.`,
            sentAt: new Date().toISOString(),
            peerPub: selected.pub,
          },
        ]);
        return;
      }
      setAttaching(true);
      try {
        const sent = await sendFile(token, ownPub, selected, file);
        setMessages((prev) => {
          const next = [...prev, sent];
          saveHistory(ownPub, selected.pub, next);
          return next;
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "No se pudo enviar el archivo.";
        setMessages((prev) => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            dir: "out",
            body: `⚠️ ${msg}`,
            sentAt: new Date().toISOString(),
            peerPub: selected.pub,
          },
        ]);
      } finally {
        setAttaching(false);
      }
    },
    [selected, attaching, ownPub],
  );

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
      contactsRef.current = list;
      setSelected(contact);
      setHandle("");
      setAddOpen(false);
      refreshPending();
    } catch (err) {
      if (err instanceof RelayError && err.status === 404) {
        setAddError(`No existe ningún usuario con el nombre de usuario «${h}».`);
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
                      {unread.has(c.pub) ? "● " : ""}
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
              <p className="label text-muted-2">Añadir contacto por su nombre de usuario</p>
              <div className="flex items-center gap-2">
                <input
                  value={handle}
                  onChange={(e) => setHandle(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addContact()}
                  placeholder="nombre de usuario (p. ej. alicia)"
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
                Descargamos su llave de cifrado y comprobamos que es de verdad suya antes de
                guardarla. El buzón es el mismo por conexión normal y protegida (Tor).
              </p>
            </div>
          )}
        </div>

        {/* Aviso de solicitudes de contacto (gente que te ha escrito sin ser contacto) */}
        {pending > 0 && (
          <Link
            href={`${BASE}/contactos`}
            className="shrink-0 flex items-center justify-between gap-3 bg-accent/10 border-b border-accent/30 px-4 md:px-6 py-2.5 hover:bg-accent/15 transition-colors"
          >
            <span className="label text-accent">
              Tienes {pending} {pending === 1 ? "solicitud" : "solicitudes"} de contacto
            </span>
            <span className="label text-accent">Ver →</span>
          </Link>
        )}

        {/* Mensajes */}
        <div ref={threadRef} className="flex-1 overflow-y-auto px-4 md:px-6 py-6 space-y-4">
          <div className="flex justify-center">
            <span className="label text-muted-2 bg-surface-2 border border-line rounded-sm px-3 py-1.5 text-center">
              Solo tú y tu contacto podéis leerlo · cifrado de extremo a extremo · XChaCha20-Poly1305
            </span>
          </div>

          {!selected ? (
            <div className="flex flex-col items-center justify-center py-16 text-center gap-2">
              <p className="text-[14px] text-muted">No tienes contactos todavía.</p>
              <p className="font-mono text-[11px] text-muted-2">
                Pulsa «+ Añadir» e introduce el nombre de usuario de otra persona para empezar.
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
                  {m.file ? (
                    <AttachmentBubble file={m.file} />
                  ) : (
                    <p className="text-[14px] text-text leading-relaxed break-words whitespace-pre-wrap">
                      {m.body}
                    </p>
                  )}
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
              Se cifra en tu dispositivo · XChaCha20-Poly1305
            </span>
          </div>
          <div className="flex items-center gap-2 bg-surface-2 border border-line rounded-sm px-2 py-1.5 focus-within:border-accent/50 transition-colors">
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void sendAttachment(file);
                e.target.value = ""; // permite reenviar el mismo archivo
              }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={!selected || attaching}
              className="w-9 h-9 shrink-0 rounded-sm flex items-center justify-center text-muted hover:text-accent transition-colors disabled:opacity-40"
              title="Adjuntar archivo (cifrado de extremo a extremo)"
            >
              <IconClip className="w-5 h-5" />
            </button>
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
              placeholder={
                attaching
                  ? "Cifrando y enviando archivo…"
                  : selected
                    ? "Transmitir mensaje…"
                    : "Elige o añade un contacto para empezar"
              }
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
            <p className="label text-muted-2 mb-1">Conexión</p>
            <div className="flex items-center justify-between">
              <span className="font-mono text-[13px] text-accent">
                {session.secure ? "Protegida (Tor)" : "Normal"}
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
            <span className="font-mono text-[12px] text-accent">Remitente oculto</span>
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
      <Suspense fallback={null}>
        <Channel />
      </Suspense>
    </DashboardShell>
  );
}
