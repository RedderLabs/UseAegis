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
  type Contact,
} from "@/lib/contacts";
import {
  clearConversation,
  conversationPeers,
  hasIncoming,
  lastMessage,
  loadHistory,
} from "@/lib/chat";
import { IconSend, IconUsers } from "@/components/Icons";

const BASE = "/panel/seguro/dashboard";

/** Una solicitud: alguien que NO es contacto y nos ha escrito. */
interface Request {
  pub: string;
  handle: string | null;
  fingerprint: string;
  preview: string;
}

/** Un bloqueado, con su handle resuelto si aún está en el directorio. */
interface Blocked {
  pub: string;
  handle: string | null;
  fingerprint: string;
}

function short(pub: string): string {
  return `${pub.slice(0, 10)}…`;
}

function label(handle: string | null, fingerprint: string): string {
  return handle ? `@${handle}` : fingerprint;
}

function Contactos() {
  const session = useDashboardSession();
  const ownPub = session.publicKey;

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [requests, setRequests] = useState<Request[]>([]);
  const [blocked, setBlocked] = useState<Blocked[]>([]);
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

    // Resuelve handle/huella de solicitudes y bloqueados (best-effort contra el directorio).
    const resolve = async (pub: string) => {
      if (!token) return { handle: null, fingerprint: short(pub) };
      try {
        const e = await fetchBundle(token, pub);
        return { handle: e.username, fingerprint: e.fingerprint };
      } catch {
        return { handle: null, fingerprint: short(pub) };
      }
    };

    const reqs: Request[] = await Promise.all(
      reqPubs.map(async (pub) => {
        const { handle, fingerprint } = await resolve(pub);
        return { pub, handle, fingerprint, preview: lastMessage(ownPub, pub)?.body ?? "" };
      }),
    );
    const blocks: Blocked[] = await Promise.all(
      blk.map(async (b) => {
        const { handle, fingerprint } = await resolve(b.publicKey);
        return { pub: b.publicKey, handle, fingerprint };
      }),
    );

    setContacts(cts);
    setRequests(reqs);
    setBlocked(blocks);
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
            <p className="label text-accent mb-1">
              Solicitudes de contacto · {requests.length}
            </p>
            <p className="font-mono text-[11px] text-muted-2 mb-4">
              Estas personas te han escrito y aún no las tienes en contactos. Acéptalas para poder
              responder, o bloquéalas.
            </p>
            <ul className="space-y-2">
              {requests.map((r) => (
                <li
                  key={r.pub}
                  className="flex items-center gap-3 bg-bg border border-line rounded-sm p-3"
                >
                  <div className="w-9 h-9 rounded-sm bg-surface-2 border border-line flex items-center justify-center font-mono text-accent text-xs shrink-0">
                    {label(r.handle, r.fingerprint).slice(r.handle ? 1 : 0, r.handle ? 3 : 2).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-[13px] text-accent truncate">
                      {label(r.handle, r.fingerprint)}
                    </p>
                    {r.preview && (
                      <p className="text-[12px] text-muted truncate">«{r.preview}»</p>
                    )}
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
                <li
                  key={c.pub}
                  className="flex items-center gap-3 bg-bg border border-line rounded-sm p-3"
                >
                  <div className="w-9 h-9 rounded-sm bg-surface-2 border border-line flex items-center justify-center font-mono text-accent text-xs shrink-0">
                    {label(c.handle, c.fingerprint).slice(c.handle ? 1 : 0, c.handle ? 3 : 2).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-[13px] text-accent truncate">
                      {label(c.handle, c.fingerprint)}
                    </p>
                    <p className="font-mono text-[10px] text-muted-2 truncate">{c.fingerprint}</p>
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
                <li
                  key={b.pub}
                  className="flex items-center gap-3 bg-bg border border-line rounded-sm p-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-[13px] text-muted truncate">
                      {label(b.handle, b.fingerprint)}
                    </p>
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
