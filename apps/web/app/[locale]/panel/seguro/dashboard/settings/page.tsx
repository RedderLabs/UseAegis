"use client";

import { useEffect, useMemo, useState } from "react";
import { DashboardShell, useDashboardSession } from "@/components/DashboardShell";
import { groupIdentity } from "@/lib/identity";
import { getToken } from "@/lib/session";
import { claimUsername, fetchMe, RelayError, WEB_ONION_URL } from "@/lib/relay-client";
import { generateUsername } from "@/lib/username";
import { contactUriFromBytes, encodeContactUri } from "@/lib/contact-uri";
import { fromBase64Url } from "@/lib/crypto";
// La versión de `identity-store` (sin argumentos) usa la semilla desbloqueada en memoria: la
// semilla nunca sale de ese módulo, ni siquiera para firmar mi propia prekey.
import { buildSignedPrekey } from "@/lib/crypto/identity-store";
import { ContactQR } from "@/components/ContactQr";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import { IconCopy, IconDownload, IconQr } from "@/components/Icons";
import { LOCALE_LABELS } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n/provider";

function Settings() {
  const session = useDashboardSession();
  const t = useT();
  const locale = useLocale();
  const grouped = groupIdentity(session.id);
  const [copied, setCopied] = useState(false);
  // La puerta (transporte) la fija el origen por el que se abrió la app; `session.secure` la
  // guarda al iniciar sesión (true = .onion). Ya NO es un toggle: aquí solo se muestra.
  const onion = session.secure;

  // Nombre de usuario público (handle): con él te encuentran para añadirte como contacto.
  // NO se teclea a mano — se GENERA (palabra + número, legible) y el usuario re-genera hasta que
  // le guste. Así el campo no tiene texto libre (cero superficie de inyección) y siempre es válido.
  const [username, setUsername] = useState<string | null>(null);
  const [usernameLoaded, setUsernameLoaded] = useState(false);
  const [candidate, setCandidate] = useState<string | null>(null);
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [nameSaved, setNameSaved] = useState(false);

  // Lee el nombre actual del servidor y propone un primer candidato (solo en cliente: usa crypto).
  useEffect(() => {
    setCandidate(generateUsername());
    const token = getToken();
    if (!token) {
      setUsernameLoaded(true);
      return;
    }
    fetchMe(token)
      .then((me) => setUsername(me.username))
      .catch(() => {
        /* el servidor puede estar caído; se puede reintentar al guardar */
      })
      .finally(() => setUsernameLoaded(true));
  }, []);

  function regenerate() {
    setNameError(null);
    setNameSaved(false);
    setCandidate(generateUsername());
  }

  async function claimCandidate() {
    const token = getToken();
    if (!token || savingName || !candidate) return;
    setSavingName(true);
    setNameError(null);
    setNameSaved(false);
    try {
      // Reintenta con nombres nuevos por si el sorteo choca con alguno ya existente.
      let attempt = candidate;
      for (let i = 0; i < 6; i++) {
        try {
          const res = await claimUsername(token, attempt);
          setUsername(res.username);
          setCandidate(generateUsername());
          setNameSaved(true);
          window.setTimeout(() => setNameSaved(false), 2500);
          return;
        } catch (err) {
          if (err instanceof RelayError && err.code === "username_taken") {
            attempt = generateUsername(); // otro nombre y a reintentar
            continue;
          }
          throw err;
        }
      }
      setNameError(t.settings.username.noFreeName);
    } catch (err) {
      setNameError(err instanceof Error ? err.message : t.settings.username.saveFailed);
    } finally {
      setSavingName(false);
    }
  }

  async function copyId() {
    try {
      await navigator.clipboard.writeText(session.id);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* noop */
    }
  }

  const [copiedCode, setCopiedCode] = useState(false);

  // Mi URI de contacto (lo que codifica el QR). La clave siempre está; el @nombre se incrusta
  // cuando carga. Si la clave no fuese válida, no rompemos la página: cae a null → "no disponible".
  const shortUri = useMemo(() => {
    try {
      return encodeContactUri({ pub: session.publicKey, handle: username });
    } catch {
      return null;
    }
  }, [session.publicKey, username]);

  // Al QR se le añade el KEY BUNDLE (prekey X25519 + su firma) para que quien lo escanee pueda
  // darme de alta SIN preguntarle al directorio: cara a cara, sin red, o con el relay bloqueado.
  // La prekey se deriva de la semilla y la firma la hace mi identidad, así que esto no sale de este
  // dispositivo ni necesita al relay. Si el keystore no está desbloqueado, `buildSignedPrekey`
  // lanza y nos quedamos con la URI corta: el QR sigue siendo válido, solo que el otro tendrá que
  // pasar por el directorio (comportamiento de siempre).
  const [contactUri, setContactUri] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setContactUri(shortUri);
    if (!shortUri) return;
    void (async () => {
      try {
        const bundle = await buildSignedPrekey();
        if (alive) {
          setContactUri(
            contactUriFromBytes(fromBase64Url(session.publicKey), username, bundle),
          );
        }
      } catch {
        /* sin keystore desbloqueado: se queda la URI corta */
      }
    })();
    return () => {
      alive = false;
    };
  }, [shortUri, session.publicKey, username]);

  async function copyContactCode() {
    if (!contactUri) return;
    try {
      await navigator.clipboard.writeText(contactUri);
      setCopiedCode(true);
      window.setTimeout(() => setCopiedCode(false), 1500);
    } catch {
      /* noop */
    }
  }

  async function downloadQr() {
    if (!contactUri) return;
    const QRCode = (await import("qrcode")).default;
    const dataUrl = await QRCode.toDataURL(contactUri, { margin: 1, width: 512 });
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `aegis-qr${username ? `-${username}` : ""}.png`;
    a.click();
  }

  function downloadId() {
    const blob = new Blob(
      [`${t.settings.file.header}\n\n${session.id}\n\n${t.settings.file.body}`],
      { type: "text/plain" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = t.settings.file.filename(session.id);
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex-1 overflow-y-auto p-5 md:p-8">
      <div className="max-w-[1100px] mx-auto">
        <h1 className="font-sans text-3xl font-bold tracking-tight text-text mb-6">
          {t.settings.title}
        </h1>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Nombre de usuario público (handle) — se elige UNA vez y es definitivo */}
        <section className="md:col-span-2 bg-surface border border-line rounded-sm p-5">
          <p className="label text-text">{t.settings.username.title}</p>
          <p className="font-mono text-[11px] text-muted-2 mt-1 leading-relaxed">
            {t.settings.username.bodyStart}
            <span className="text-muted">{t.settings.username.bodyStrong}</span>
          </p>

          <div className="mt-4 pt-4 border-t border-line">
            <p className="label text-muted-2 mb-1">{t.settings.username.current}</p>
            {!usernameLoaded ? (
              <p className="font-mono text-[13px] text-muted-2">{t.common.checking}</p>
            ) : username ? (
              <div className="flex items-center gap-3">
                <p className="font-mono text-[15px] text-accent">@{username}</p>
                <button
                  onClick={() => void navigator.clipboard?.writeText(`@${username}`).catch(() => {})}
                  className="inline-flex items-center gap-1 label text-muted-2 hover:text-text transition-colors"
                >
                  <IconCopy className="w-3.5 h-3.5" /> {t.common.copy}
                </button>
              </div>
            ) : (
              <p className="font-mono text-[13px] text-muted">{t.settings.username.none}</p>
            )}
          </div>

          {/* Una vez fijado, el nombre es definitivo: se oculta la reclamación. */}
          {usernameLoaded &&
            (username ? (
              <div className="mt-4 flex items-start gap-2 bg-bg border border-line rounded-sm p-3">
                <span className="mt-0.5 w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
                <p className="font-mono text-[11px] text-muted-2 leading-relaxed">
                  {t.settings.username.fixedStart}
                  <span className="text-accent">{t.settings.username.fixedWord}</span>
                  {t.settings.username.fixedMiddle}
                  <span className="text-text">@{username}</span>
                  {t.settings.username.fixedEnd}
                </p>
              </div>
            ) : (
              <div className="mt-4">
                <p className="label text-muted-2 mb-1.5">{t.settings.username.proposed}</p>
                <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                  <div className="flex-1 flex items-center bg-bg border border-line rounded-sm px-3 py-2.5">
                    <span className="font-mono text-[15px] text-accent select-all">
                      @{candidate ?? "…"}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={regenerate}
                      disabled={savingName}
                      className="shrink-0 label py-2.5 px-4 border border-line text-muted hover:text-text hover:border-accent-dim rounded-sm transition-colors disabled:opacity-40 disabled:pointer-events-none"
                    >
                      {t.settings.username.regenerate}
                    </button>
                    <button
                      onClick={claimCandidate}
                      disabled={savingName || !candidate}
                      className="shrink-0 label py-2.5 px-5 bg-accent text-bg font-bold rounded-sm hover:brightness-110 transition disabled:opacity-40 disabled:pointer-events-none"
                    >
                      {savingName ? t.common.saving : t.settings.username.useThis}
                    </button>
                  </div>
                </div>
                <p className="font-mono text-[11px] text-status-p2p mt-2">
                  {t.settings.username.warning}
                </p>
                {nameError && (
                  <p className="font-mono text-[11px] text-status-p2p mt-2">{nameError}</p>
                )}
                {nameSaved && (
                  <p className="font-mono text-[11px] text-accent mt-2">
                    {t.settings.username.saved}
                  </p>
                )}
              </div>
            ))}
        </section>

        {/* Mi código QR — para que me añadan escaneándolo o subiendo una foto de él */}
        <section className="md:col-span-2 bg-surface border border-line rounded-sm p-5">
          <p className="label text-text flex items-center gap-1.5">
            <IconQr className="w-4 h-4 text-accent" /> {t.settings.qr.title}
          </p>
          <p className="font-mono text-[11px] text-muted-2 mt-1 leading-relaxed">
            {t.settings.qr.body}
          </p>
          <div className="mt-4 pt-4 border-t border-line flex flex-col sm:flex-row gap-5 sm:items-center">
            {contactUri ? (
              <ContactQR uri={contactUri} />
            ) : (
              <p className="font-mono text-[12px] text-muted-2">{t.settings.qr.unavailable}</p>
            )}
            <div className="flex-1 min-w-0">
              {!username && (
                <p className="font-mono text-[11px] text-status-p2p mb-3 leading-relaxed">
                  {t.settings.qr.noHandleWarning}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={copyContactCode}
                  disabled={!contactUri}
                  className="inline-flex items-center gap-1.5 label py-2 px-3 border border-line text-muted hover:text-text rounded-sm transition-colors disabled:opacity-40"
                >
                  <IconCopy className="w-3.5 h-3.5" />{" "}
                  {copiedCode ? t.settings.qr.copiedCode : t.settings.qr.copyCode}
                </button>
                <button
                  onClick={() => void downloadQr()}
                  disabled={!contactUri}
                  className="inline-flex items-center gap-1.5 label py-2 px-3 border border-line text-muted hover:text-text rounded-sm transition-colors disabled:opacity-40"
                >
                  <IconDownload className="w-3.5 h-3.5" /> {t.settings.qr.downloadQr}
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Transporte / puerta */}
        <section className="bg-surface border border-line rounded-sm p-5">
          <p className="label text-text">{t.settings.connection.title}</p>
          <p className="font-mono text-[11px] text-muted-2 mt-1">
            {t.settings.connection.bodyStart}
            <code className="text-text">.onion</code>
            {t.settings.connection.bodyEnd}
          </p>
          <div className="mt-4 pt-4 border-t border-line flex items-center gap-2">
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: onion ? "#c3f400" : "#fbbf24" }}
            />
            <span className="label" style={{ color: onion ? "#c3f400" : "#fbbf24" }}>
              {onion ? t.settings.connection.secure : t.settings.connection.normal}
            </span>
          </div>
          <p className="font-mono text-[11px] text-muted-2 mt-3 leading-relaxed">
            {onion ? t.settings.connection.secureNote : t.settings.connection.normalNote}
            {!onion && WEB_ONION_URL && (
              <>
                {t.settings.connection.onionInviteStart}
                <span className="text-accent break-all">{WEB_ONION_URL}</span>
                {t.settings.connection.onionInviteEnd}
              </>
            )}
          </p>
        </section>

        {/* Identidad */}
        <section className="bg-surface border border-line rounded-sm p-5">
          <p className="label text-muted mb-3">{t.settings.identity.title}</p>
          <div className="bg-bg border border-line rounded-sm p-3">
            <p className="font-mono text-[13px] text-accent break-all leading-relaxed">
              {grouped}
            </p>
          </div>
          <div className="flex gap-3 mt-3">
            <button
              onClick={copyId}
              className="inline-flex items-center gap-1.5 label text-muted hover:text-text transition-colors"
            >
              <IconCopy className="w-3.5 h-3.5" />
              {copied ? t.common.copied : t.settings.identity.copyId}
            </button>
            <button
              onClick={downloadId}
              className="inline-flex items-center gap-1.5 label text-muted hover:text-text transition-colors"
            >
              <IconDownload className="w-3.5 h-3.5" />
              {t.common.download}
            </button>
          </div>
        </section>

        {/* Acerca de */}
        <section className="md:col-span-2 bg-surface border border-line rounded-sm p-5">
          <p className="label text-muted mb-3">{t.settings.about.title}</p>
          <dl className="space-y-2 font-mono text-[12px]">
            <div className="flex justify-between items-center">
              <dt className="text-muted-2">{t.settings.about.language}</dt>
              {/* Además de informar, deja cambiarlo aquí mismo: es donde el usuario lo busca. */}
              <dd className="flex items-center gap-2">
                <span className="text-text">{LOCALE_LABELS[locale]}</span>
                <LocaleSwitcher />
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-2">{t.settings.about.encryption}</dt>
              <dd className="text-text">X25519 · XChaCha20-Poly1305</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-2">{t.settings.about.code}</dt>
              <dd className="text-accent">{t.settings.about.codeValue}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-2">{t.settings.about.audit}</dt>
              <dd className="text-status-p2p">{t.settings.about.auditValue}</dd>
            </div>
          </dl>
        </section>
        </div>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <DashboardShell>
      <Settings />
    </DashboardShell>
  );
}
