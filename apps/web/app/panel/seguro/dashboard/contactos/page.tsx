"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { DashboardShell, useDashboardSession } from "@/components/DashboardShell";
import { getToken } from "@/lib/session";
import {
  blockUser,
  deleteMessage,
  fetchBundle,
  listBlocks,
  RelayError,
  unblockUser,
} from "@/lib/relay-client";
import {
  addContactFromDirectory,
  listContacts,
  removeContact,
} from "@/lib/contacts";
import {
  clearConversation,
  conversationPeers,
  hasIncoming,
  lastMessage,
  loadHistory,
  markUnread,
} from "@/lib/chat";
import { fingerprint16, fromBase64Url } from "@/lib/crypto/ed25519";
import { groupIdentity } from "@/lib/identity";
import { IconSend, IconUsers } from "@/components/Icons";

const BASE = "/panel/seguro/dashboard";

/** Fila de la lista: identidad legible por su @nombre o su huella (nunca la clave cruda). */
interface Row {
  pub: string; // clave pública (base64url) — solo para acciones/enlaces, no se muestra
  handle: string | null; // @nombre público, si lo tiene
  fp: string; // huella legible de 16 letras agrupada (ABCD · EFGH · …)
  preview?: string; // último mensaje, para previsualizar una solicitud
}

/** Huella legible (16 letras agrupadas) derivada de la clave pública. Nunca muestra la clave. */
async function readableFp(pub: string): Promise<string> {
  try {
    return groupIdentity(await fingerprint16(fromBase64Url(pub)));
  } catch {
    return "—";
  }
}

/** Texto principal de una fila: su @nombre si lo tiene, si no la huella legible. */
function title(row: Row): string {
  return row.handle ? `@${row.handle}` : row.fp;
}

/** Iniciales para el avatar (2 letras). */
function initials(row: Row): string {
  const base = row.handle ?? row.fp;
  return base.replace(/[^A-Za-z0-9]/g, "").slice(0, 2).toUpperCase();
}

function Contactos() {
  const session = useDashboardSession();
  const ownPub = session.publicKey;

  const [contacts, setContacts] = useState<Row[]>([]);
  const [requests, setRequests] = useState<Row[]>([]);
  const [blocked, setBlocked] = useState<Row[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null); // pub en curso
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const token = getToken();
    const cts = await listContacts();
    const contactPubs = new Set(cts.map((c) => c.pub));

    const blk = token ? await listBlocks(token).catch(() => []) : [];
    const blockedPubs = new Set(blk.map((b) => b.publicKey));

    // Solicitudes = peers con hilo entrante que no son contacto ni están bloqueados.
    const reqPubs = conversationPeers(ownPub).filter(
      (p) => hasIncoming(ownPub, p) && !contactPubs.has(p) && !blockedPubs.has(p),
    );

    // Resuelve el @nombre desde el directorio (best-effort); la huella se deriva de la clave.
    const handleOf = async (pub: string): Promise<string | null> => {
      if (!token) return null;
      try {
        return (await fetchBundle(token, pub)).username;
      } catch {
        return null;
      }
    };

    const contactRows: Row[] = await Promise.all(
      cts.map(async (c) => ({ pub: c.pub, handle: c.handle, fp: await readableFp(c.pub) })),
    );
    const requestRows: Row[] = await Promise.all(
      reqPubs.map(async (pub) => ({
        pub,
        handle: await handleOf(pub),
        fp: await readableFp(pub),
        preview: lastMessage(ownPub, pub)?.body ?? "",
      })),
    );
    const blockedRows: Row[] = await Promise.all(
      blk.map(async (b) => ({
        pub: b.publicKey,
        handle: await handleOf(b.publicKey),
        fp: await readableFp(b.publicKey),
      })),
    );

    setContacts(contactRows);
    setRequests(requestRows);
    setBlocked(blockedRows);
    setLoaded(true);
  }, [ownPub]);

  useEffect(() => {
    void reload();
  }, [reload]);

  /** Envuelve una acción: marca ocupado por pub, captura error y recarga. */
  const run = useCallback(
    async (pub: string, fn: () => Promise<void>) => {
      setBusy(pub);
      setError(null);
      try {
        await fn();
        await reload();
      } catch (err) {
        setError(err instanceof RelayError ? err.message : "No se pudo completar la acción.");
      } finally {
        setBusy(null);
      }
    },
    [reload],
  );

  /** Purga del buzón los sobres ya recibidos de un peer (al bloquear) para que no reaparezcan. */
  async function purgeInbox(pub: string) {
    const token = getToken();
    if (!token) return;
    const ids = loadHistory(ownPub, pub)
      .filter((m) => m.dir === "in")
      .map((m) => m.id);
    await Promise.allSettled(ids.map((id) => deleteMessage(token, id)));
  }

  function removeAction(pub: string) {
    return run(pub, async () => {
      await removeContact(pub);
    });
  }

  function blockAction(pub: string) {
    return run(pub, async () => {
      const token = getToken();
      if (!token) throw new Error("Sesión no disponible.");
      await purgeInbox(pub);
      await blockUser(token, pub);
      await removeContact(pub); // si era contacto, deja de serlo
      clearConversation(ownPub, pub); // olvida el hilo local
    });
  }

  function acceptAction(pub: string) {
    return run(pub, async () => {
      const token = getToken();
      if (!token) throw new Error("Sesión no disponible.");
      const entry = await fetchBundle(token, pub);
      await addContactFromDirectory(entry); // verifica la prekey antes de guardar
      // Ya es contacto: su mensaje pendiente pasa a contar como no leído (badge del Canal).
      if (hasIncoming(ownPub, pub)) markUnread(ownPub, pub);
    });
  }

  function unblockAction(pub: string) {
    return run(pub, async () => {
      const token = getToken();
      if (!token) throw new Error("Sesión no disponible.");
      await unblockUser(token, pub);
    });
  }

  return (
    <div className="flex-1 overflow-y-auto p-5 md:p-8">
      <div className="max-w-[900px] mx-auto">
        <h1 className="font-sans text-3xl font-bold tracking-tight text-text mb-1">Contactos</h1>
        <p className="font-mono text-[11px] text-muted-2 mb-6">
          Tu libreta es local a este dispositivo; los bloqueos los impone el servidor (valen por
          conexión normal y protegida).
        </p>

        {error && (
          <div className="mb-4 bg-error/10 border border-error/30 rounded-sm px-3 py-2">
            <p className="text-[12px] text-error">{error}</p>
          </div>
        )}

        {/* Solicitudes */}
        {requests.length > 0 && (
          <section className="mb-6 bg-surface border border-accent/30 rounded-sm p-5">
            <p className="label text-accent mb-1">Solicitudes de contacto · {requests.length}</p>
            <p className="font-mono text-[11px] text-muted-2 mb-4">
              Estas personas te han escrito y aún no las tienes en contactos. Acéptalas para poder
              responder, o bloquéalas.
            </p>
            <ul className="space-y-2">
              {requests.map((r) => (
                <li key={r.pub} className="flex items-center gap-3 bg-bg border border-line rounded-sm p-3">
                  <div className="w-9 h-9 rounded-sm bg-surface-2 border border-line flex items-center justify-center font-mono text-accent text-xs shrink-0">
                    {initials(r)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-[13px] text-accent truncate">{title(r)}</p>
                    {r.handle && <p className="font-mono text-[10px] text-muted-2 truncate">{r.fp}</p>}
                    {r.preview && <p className="text-[12px] text-muted truncate">«{r.preview}»</p>}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => void acceptAction(r.pub)}
                      disabled={busy === r.pub}
                      className="label py-1.5 px-3 bg-accent text-bg font-bold rounded-sm hover:brightness-110 transition disabled:opacity-40"
                    >
                      {busy === r.pub ? "…" : "Aceptar"}
                    </button>
                    <button
                      onClick={() => void blockAction(r.pub)}
                      disabled={busy === r.pub}
                      className="label py-1.5 px-3 border border-line text-muted hover:text-error hover:border-error/40 rounded-sm transition-colors disabled:opacity-40"
                    >
                      Bloquear
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Contactos */}
        <section className="mb-6 bg-surface border border-line rounded-sm p-5">
          <p className="label text-text mb-4">Mis contactos · {contacts.length}</p>
          {!loaded ? (
            <p className="font-mono text-[13px] text-muted-2">Cargando…</p>
          ) : contacts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center gap-2">
              <IconUsers className="w-7 h-7 text-muted-2" />
              <p className="text-[14px] text-muted">No tienes contactos todavía.</p>
              <p className="font-mono text-[11px] text-muted-2">
                Añade a alguien desde el Canal por su nombre de usuario, o acepta una solicitud.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {contacts.map((c) => (
                <li key={c.pub} className="flex items-center gap-3 bg-bg border border-line rounded-sm p-3">
                  <div className="w-9 h-9 rounded-sm bg-surface-2 border border-line flex items-center justify-center font-mono text-accent text-xs shrink-0">
                    {initials(c)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-[13px] text-accent truncate">{title(c)}</p>
                    <p className="font-mono text-[10px] text-muted-2 truncate">{c.fp}</p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Link
                      href={`${BASE}?peer=${encodeURIComponent(c.pub)}`}
                      className="inline-flex items-center gap-1 label py-1.5 px-3 bg-accent/10 text-accent border border-accent/30 rounded-sm hover:bg-accent/15 transition-colors"
                    >
                      <IconSend className="w-3.5 h-3.5" /> Escribir
                    </Link>
                    <button
                      onClick={() => void removeAction(c.pub)}
                      disabled={busy === c.pub}
                      className="label py-1.5 px-3 border border-line text-muted hover:text-text rounded-sm transition-colors disabled:opacity-40"
                    >
                      Eliminar
                    </button>
                    <button
                      onClick={() => void blockAction(c.pub)}
                      disabled={busy === c.pub}
                      className="label py-1.5 px-3 border border-line text-muted hover:text-error hover:border-error/40 rounded-sm transition-colors disabled:opacity-40"
                    >
                      Bloquear
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Bloqueados */}
        {blocked.length > 0 && (
          <section className="bg-surface border border-line rounded-sm p-5">
            <p className="label text-muted mb-1">Bloqueados · {blocked.length}</p>
            <p className="font-mono text-[11px] text-muted-2 mb-4">
              No pueden dejarte mensajes. Ellos no saben que están bloqueados.
            </p>
            <ul className="space-y-2">
              {blocked.map((b) => (
                <li key={b.pub} className="flex items-center gap-3 bg-bg border border-line rounded-sm p-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-[13px] text-muted truncate">{title(b)}</p>
                    {b.handle && <p className="font-mono text-[10px] text-muted-2 truncate">{b.fp}</p>}
                  </div>
                  <button
                    onClick={() => void unblockAction(b.pub)}
                    disabled={busy === b.pub}
                    className="label py-1.5 px-3 border border-line text-muted hover:text-text rounded-sm transition-colors disabled:opacity-40 shrink-0"
                  >
                    {busy === b.pub ? "…" : "Desbloquear"}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}

export default function ContactosPage() {
  return (
    <DashboardShell>
      <Contactos />
    </DashboardShell>
  );
}
