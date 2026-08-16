"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { DashboardShell, useDashboardSession } from "@/components/DashboardShell";
import { getToken } from "@/lib/session";
import {
  fetchQuota,
  listBlocks,
  quotaPreflight,
  RelayError,
  resolveUsername,
  type QuotaStatus,
} from "@/lib/relay-client";
import {
  addContactByPublicKey,
  addContactFromDirectory,
  addContactFromUriBundle,
  listContacts,
  type Contact,
} from "@/lib/contacts";
import { AddByQr } from "@/components/ContactQr";
import type { ContactUri } from "@/lib/contact-uri";
import {
  conversationPeers,
  createChatTransport,
  downloadAttachment,
  hasIncoming,
  loadHistory,
  markRead,
  markUnread,
  mergeIncoming,
  saveHistory,
  unreadPeers,
  type ChatMessage,
  type ChatTransport,
  type FileAttachment,
} from "@/lib/chat";
import { IconSend, IconCheck, IconClip, IconDownload, IconPlay } from "@/components/Icons";
import { VoiceRecorder } from "@/components/VoiceRecorder";
import { useLocalePath, useT } from "@/lib/i18n/provider";

const BASE = "/panel/seguro/dashboard";

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

function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function isAudio(file: FileAttachment): boolean {
  return file.mime.startsWith("audio/");
}

// Tope de subida acorde con el límite del relay (MEDIA_MAX_BYTES por defecto = 50 MiB). Es solo
// el valor de reserva: si el relay dice el suyo en GET /media/quota, manda el del servidor.
const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024;

/** Burbuja de nota de voz: descarga+descifra bajo demanda y reproduce con controles nativos. */
function AudioBubble({ file }: { file: FileAttachment }) {
  const t = useT();
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [url]);

  async function load() {
    const token = getToken();
    if (!token || loading || url) return;
    setLoading(true);
    setError(null);
    try {
      const blob = await downloadAttachment(token, file);
      setUrl(URL.createObjectURL(blob));
    } catch (err) {
      setError(err instanceof Error ? err.message : t.channel.errors.loadVoiceNote);
    } finally {
      setLoading(false);
    }
  }

  if (url) {
    // eslint-disable-next-line jsx-a11y/media-has-caption
    return <audio className="max-w-[220px]" controls autoPlay src={url} />;
  }
  const hint = file.durationMs ? formatDuration(file.durationMs) : formatSize(file.size);
  return (
    <button
      onClick={() => void load()}
      disabled={loading}
      className="flex items-center gap-3 text-left w-full min-w-0 disabled:opacity-60"
      title={t.channel.playTitle}
    >
      <span className="w-9 h-9 rounded-sm bg-surface border border-line flex items-center justify-center shrink-0 text-accent">
        <IconPlay className="w-4 h-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] text-text">{t.channel.voiceNote}</span>
        <span className="block font-mono text-[10px] text-muted-2">
          {loading
            ? t.channel.decrypting
            : error
              ? error
              : `${hint} · ${t.channel.playHint}`}
        </span>
      </span>
    </button>
  );
}

/** Burbuja de un adjunto: nombre + tamaño + botón para descargar y descifrar bajo demanda. */
function AttachmentBubble({ file }: { file: FileAttachment }) {
  const t = useT();
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
      setError(err instanceof Error ? err.message : t.channel.errors.downloadFile);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={() => void open()}
      disabled={busy}
      className="flex items-center gap-3 text-left w-full min-w-0 disabled:opacity-60"
      title={t.channel.downloadTitle}
    >
      <span className="w-9 h-9 rounded-sm bg-surface border border-line flex items-center justify-center shrink-0 text-accent">
        <IconDownload className="w-4 h-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] text-text truncate">{file.name}</span>
        <span className="block font-mono text-[10px] text-muted-2">
          {busy
            ? t.channel.decrypting
            : error
              ? error
              : `${formatSize(file.size)} · ${t.channel.downloadHint}`}
        </span>
      </span>
    </button>
  );
}

function Channel() {
  const session = useDashboardSession();
  const t = useT();
  const href = useLocalePath();
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
  const [addMode, setAddMode] = useState<"name" | "qr">("name");
  const [handle, setHandle] = useState("");
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const [attaching, setAttaching] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Última lectura de la cuota de adjuntos. Sirve para avisar ANTES de cifrar y subir 40 MB que
  // el relay va a rechazar igual. En un ref y no en estado: no pinta nada, solo decide. Puede
  // quedarse obsoleta (otra pestaña, otro dispositivo) y no pasa nada: el 507/429 del relay es
  // el que manda, y dice exactamente el mismo mensaje.
  const quotaRef = useRef<QuotaStatus | null>(null);

  const threadRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<Contact | null>(null);
  selectedRef.current = selected;
  const contactsRef = useRef<Contact[]>([]);
  contactsRef.current = contacts;
  const blockedRef = useRef<Set<string>>(new Set());
  const transportRef = useRef<ChatTransport | null>(null);

  // Recalcula cuántos peers nos han escrito sin ser contacto ni estar bloqueados (solicitudes).
  const refreshPending = useCallback(() => {
    const contactPubs = new Set(contactsRef.current.map((c) => c.pub));
    const count = conversationPeers(ownPub).filter(
      (p) => hasIncoming(ownPub, p) && !contactPubs.has(p) && !blockedRef.current.has(p),
    ).length;
    setPending(count);
  }, [ownPub]);

  /** Relee la cuota de adjuntos (silenciosa: si el relay no la da, se sigue sin preflight). */
  const refreshQuota = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    quotaRef.current = await fetchQuota(token);
  }, []);

  useEffect(() => {
    void refreshQuota();
  }, [refreshQuota]);

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

  // Recepción por el transporte: abre cada entrante, lo integra por conversación y refresca la
  // abierta. El transporte posee el bucle de sondeo (start/stop) y el cursor; aquí solo se
  // reacciona a cada mensaje ya abierto y clasificado.
  useEffect(() => {
    const token = getToken();
    if (!token) return;
    const transport = createChatTransport(token, ownPub);
    transportRef.current = transport;

    const off = transport.subscribe((m) => {
      const touched = mergeIncoming(ownPub, [m], (p) => blockedRef.current.has(p));
      const open = selectedRef.current;
      // No leído = entrante de un CONTACTO cuya conversación no está abierta. Los no-contactos se
      // avisan por «Solicitudes» (banner), no por este badge (no se abren en el Canal).
      const isContact = contactsRef.current.some((c) => c.pub === m.peerPub);
      if (m.dir === "in" && !blockedRef.current.has(m.peerPub) && isContact && m.peerPub !== open?.pub) {
        markUnread(ownPub, m.peerPub);
      }
      if (open && touched.has(open.pub)) {
        setMessages(loadHistory(ownPub, open.pub));
        markRead(ownPub, open.pub); // lo abierto se lee al vuelo
      }
      setUnread(unreadPeers(ownPub));
      refreshPending(); // un entrante de un no-contacto es una solicitud nueva
    });

    transport.start();
    return () => {
      off();
      transport.stop();
      transportRef.current = null;
    };
  }, [ownPub, refreshPending]);

  useEffect(() => {
    threadRef.current?.scrollTo(0, threadRef.current.scrollHeight);
  }, [messages]);

  const send = useCallback(async () => {
    const text = draft.trim();
    const transport = transportRef.current;
    if (!text || !selected || !transport || sending) return;
    setSending(true);
    setDraft("");
    try {
      const sent = await transport.sendText(selected, text);
      setMessages((prev) => {
        const next = [...prev, sent];
        saveHistory(ownPub, selected.pub, next);
        return next;
      });
    } catch (err) {
      // Muestra la causa real (RelayError o cualquier Error, p. ej. "Identidad bloqueada").
      const msg = err instanceof Error ? err.message : t.channel.errors.sendMessage;
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
  }, [draft, selected, sending, ownPub, t]);

  const sendAttachment = useCallback(
    async (file: File, kind: "file" | "audio" = "file", durationMs?: number) => {
      const transport = transportRef.current;
      if (!file || !selected || !transport || attaching) return;

      /** Aviso local, sin viajar: el que se pinta cuando ni merece la pena intentarlo. */
      const refuse = (body: string) =>
        setMessages((prev) => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            dir: "out",
            body,
            sentAt: new Date().toISOString(),
            peerPub: selected.pub,
          },
        ]);

      // 1) Tope de UN objeto (el relay responde 413). El suyo si lo conocemos, si no el de reserva.
      const maxUpload = quotaRef.current?.maxUploadBytes || MAX_ATTACHMENT_BYTES;
      if (file.size > maxUpload) {
        refuse(t.channel.errors.tooLarge(file.name, formatSize(maxUpload)));
        return;
      }
      // 2) Techo acumulado y ráfaga del día (507 / 429). Se comprueba aquí para no hacerle grabar
      //    y cifrar una nota de voz entera antes de decirle que no cabe.
      const noRoom = quotaPreflight(quotaRef.current, file.size);
      if (noRoom) {
        refuse(`⚠️ ${noRoom}`);
        void refreshQuota(); // por si la copia local iba desfasada y en realidad sí cabía
        return;
      }

      setAttaching(true);
      try {
        const sent = await transport.sendFile(selected, file, kind, durationMs);
        setMessages((prev) => {
          const next = [...prev, sent];
          saveHistory(ownPub, selected.pub, next);
          return next;
        });
        void refreshQuota(); // el adjunto ya cuenta: que la barra de Bóveda no mienta
      } catch (err) {
        const msg = err instanceof Error ? err.message : t.channel.errors.sendFile;
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
    [selected, attaching, ownPub, t, refreshQuota],
  );

  /** Refresca la lista, selecciona el contacto recién añadido y cierra el panel de alta. */
  async function finishAdd(contact: Contact) {
    const list = await listContacts();
    setContacts(list);
    contactsRef.current = list;
    setSelected(contact);
    setHandle("");
    setAddOpen(false);
    refreshPending();
  }

  async function addContact() {
    const h = handle.trim().replace(/^@/, "");
    const token = getToken();
    if (!h || !token || addBusy) return;
    setAddBusy(true);
    setAddError(null);
    try {
      const entry = await resolveUsername(token, h);
      const contact = await addContactFromDirectory(entry);
      await finishAdd(contact);
    } catch (err) {
      if (err instanceof RelayError && err.status === 404) {
        setAddError(t.channel.errors.usernameNotFound(h));
      } else {
        setAddError(err instanceof Error ? err.message : t.channel.errors.addContact);
      }
    } finally {
      setAddBusy(false);
    }
  }

  /**
   * Alta desde un QR. Dos caminos, misma verificación:
   *  - QR autosuficiente (`x`+`s`): la prekey y su firma vienen en el propio código → se comprueba
   *    la firma en local y se guarda SIN TOCAR LA RED (ni token hace falta).
   *  - QR antiguo (solo `k`): la clave viene fuera de banda y el key bundle se baja del directorio.
   */
  async function addByQr(uri: ContactUri) {
    if (uri.pub === ownPub) throw new Error(t.channel.errors.ownQr);
    if (uri.prekey && uri.prekeySignature) {
      await finishAdd(await addContactFromUriBundle(uri));
      return;
    }
    const token = getToken();
    if (!token) throw new Error(t.channel.errors.noSession);
    try {
      const contact = await addContactByPublicKey(token, uri.pub);
      await finishAdd(contact);
    } catch (err) {
      if (err instanceof RelayError && err.status === 404) {
        throw new Error(t.channel.errors.qrIdentityNotFound);
      }
      throw err;
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
              <label className="label text-muted-2 block mb-0.5">
                {t.channel.conversationWith}
              </label>
              <select
                value={selected?.pub ?? ""}
                onChange={(e) => setSelected(contacts.find((c) => c.pub === e.target.value) ?? null)}
                disabled={contacts.length === 0}
                className="w-full max-w-xs bg-surface-2 border border-line rounded-sm px-2 py-1.5 font-mono text-[13px] text-text focus:outline-none focus:border-accent/50 disabled:text-muted-2"
              >
                {contacts.length === 0 ? (
                  <option value="">{t.channel.noContactsYet}</option>
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
              {t.channel.addContact}
            </button>
          </div>

          {addOpen && (
            <div className="mt-3 flex flex-col gap-3 bg-bg border border-line rounded-sm p-3">
              {/* Selector: por nombre de usuario o por QR (fuera de banda) */}
              <div className="flex gap-1 p-0.5 bg-surface-2 border border-line rounded-sm w-fit">
                {(["name", "qr"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => {
                      setAddMode(m);
                      setAddError(null);
                    }}
                    className={`label px-3 py-1 rounded-sm transition-colors ${
                      addMode === m ? "bg-accent text-bg" : "text-muted hover:text-text"
                    }`}
                  >
                    {m === "name" ? t.channel.byName : t.channel.byQr}
                  </button>
                ))}
              </div>

              {addMode === "name" ? (
                <>
                  <div className="flex items-center gap-2">
                    <input
                      value={handle}
                      onChange={(e) => setHandle(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && addContact()}
                      placeholder={t.channel.handlePlaceholder}
                      className="flex-1 bg-surface-2 border border-line rounded-sm px-3 py-2 text-[13px] text-text placeholder:text-muted-2 focus:outline-none focus:border-accent/50"
                    />
                    <button
                      onClick={addContact}
                      disabled={!handle.trim() || addBusy}
                      className="label text-bg bg-accent rounded-sm px-3 py-2 hover:brightness-110 disabled:opacity-40 transition-all"
                    >
                      {addBusy ? t.channel.searching : t.common.add}
                    </button>
                  </div>
                  {addError && <p className="text-[12px] text-error">{addError}</p>}
                  <p className="font-mono text-[10px] text-muted-2 leading-relaxed">
                    {t.channel.addNote}
                  </p>
                </>
              ) : (
                <AddByQr onAdd={addByQr} disabled={addBusy} />
              )}
            </div>
          )}
        </div>

        {/* Aviso de solicitudes de contacto (gente que te ha escrito sin ser contacto) */}
        {pending > 0 && (
          <Link
            href={href(`${BASE}/contactos`)}
            className="shrink-0 flex items-center justify-between gap-3 bg-accent/10 border-b border-accent/30 px-4 md:px-6 py-2.5 hover:bg-accent/15 transition-colors"
          >
            <span className="label text-accent">{t.channel.pendingRequests(pending)}</span>
            <span className="label text-accent">{t.channel.seeRequests}</span>
          </Link>
        )}

        {/* Mensajes */}
        <div ref={threadRef} className="flex-1 overflow-y-auto px-4 md:px-6 py-6 space-y-4">
          <div className="flex justify-center">
            <span className="label text-muted-2 bg-surface-2 border border-line rounded-sm px-3 py-1.5 text-center">
              {t.channel.e2eBanner}
            </span>
          </div>

          {!selected ? (
            <div className="flex flex-col items-center justify-center py-16 text-center gap-2">
              <p className="text-[14px] text-muted">{t.channel.emptyNoContacts}</p>
              <p className="font-mono text-[11px] text-muted-2">
                {t.channel.emptyNoContactsHint}
              </p>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center gap-2">
              <p className="text-[14px] text-muted">
                {t.channel.emptyNoMessages(contactLabel(selected))}
              </p>
              <p className="font-mono text-[11px] text-muted-2">
                {t.channel.emptyNoMessagesHint}
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
                    isAudio(m.file) ? (
                      <AudioBubble file={m.file} />
                    ) : (
                      <AttachmentBubble file={m.file} />
                    )
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
                  {m.dir === "out" ? t.channel.sent : t.channel.received}
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
              {t.channel.encryptedHere}
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
              title={t.channel.attachTitle}
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
                  ? t.channel.placeholderAttaching
                  : selected
                    ? t.channel.placeholderReady
                    : t.channel.placeholderNoContact
              }
              className="flex-1 bg-transparent border-none px-1 py-2 text-[14px] text-text placeholder:text-muted-2 focus:outline-none disabled:cursor-not-allowed"
            />
            {draft.trim() ? (
              <button
                onClick={() => void send()}
                disabled={!selected || sending}
                className="w-10 h-10 rounded-sm flex items-center justify-center transition-all bg-accent text-bg hover:brightness-110 active:scale-95 disabled:opacity-40"
                title={t.channel.sendTitle}
              >
                <IconSend className="w-5 h-5" />
              </button>
            ) : (
              <VoiceRecorder
                disabled={!selected || attaching}
                // "¿Cabe siquiera un byte más?" — con 1 solo salta cuando de verdad no queda
                // sitio (o se agotó la ráfaga del día), que es cuando no tiene sentido ni pedir
                // el micrófono. Si cabe algo, se graba y el tamaño real se comprueba al enviar.
                blockedReason={() => quotaPreflight(quotaRef.current, 1)}
                onRecorded={(file, durationMs) => void sendAttachment(file, "audio", durationMs)}
              />
            )}
          </div>
        </div>
      </section>

      {/* Panel derecho — metadata honesta */}
      <aside className="hidden xl:flex flex-col w-72 shrink-0 border-l border-line bg-surface/60 backdrop-blur-sm p-5 overflow-y-auto">
        <h2 className="label text-muted border-b border-line pb-2 mb-4">{t.channel.aside.title}</h2>
        <div className="space-y-3">
          <div className="bg-bg border border-line rounded-sm p-3">
            <p className="label text-muted-2 mb-1">{t.channel.aside.connection}</p>
            <div className="flex items-center justify-between">
              <span className="font-mono text-[13px] text-accent">
                {session.secure
                  ? t.channel.aside.connectionSecure
                  : t.channel.aside.connectionNormal}
              </span>
              <span className="w-2 h-2 rounded-full bg-accent" style={{ boxShadow: "0 0 8px #c3f400" }} />
            </div>
          </div>
          <div className="bg-bg border border-line rounded-sm p-3">
            <p className="label text-muted-2 mb-1">{t.channel.aside.contentEncryption}</p>
            <span className="font-mono text-[12px] text-text">XChaCha20-Poly1305</span>
          </div>
          <div className="bg-bg border border-line rounded-sm p-3">
            <p className="label text-muted-2 mb-1">{t.channel.aside.sender}</p>
            <span className="font-mono text-[12px] text-accent">{t.channel.aside.senderSealed}</span>
          </div>
          <div className="bg-bg border border-line rounded-sm p-3">
            <p className="label text-muted-2 mb-1">{t.channel.aside.verifiedContacts}</p>
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
