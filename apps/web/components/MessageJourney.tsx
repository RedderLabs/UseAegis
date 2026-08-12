"use client";

/**
 * Momento de bienvenida de la landing (idea del usuario, 2026-07-22): en vez de un aviso de
 * cookies — que Aegis no necesita, la analítica Umami es sin cookies — un popup opcional que ENSEÑA
 * qué ve, y qué NO ve, cada actor cuando envías un mensaje. Estilo "circuito de Tor".
 *
 * Se muestra en CADA visita hasta que el usuario marca «No volver a mostrar» (flag en localStorage).
 * Solo en la landing. `JourneyTrigger` (footer) lo reabre a demanda vía evento de ventana.
 *
 * Honra el sistema de diseño (Terminal Chic, @aegis/ui-kit/tokens): el acento Cyber Lime aparece
 * SOLO como señal criptográfica (= tu mensaje legible), nunca como decoración. El ruido cifrado va
 * en `muted-2` (apagado, no es señal); la puerta .onion en Signal Blue (capa de red).
 *
 * Es una VISUALIZACIÓN: dibuja la tubería real (sellado en el dispositivo → el relay solo ve ruido →
 * descifrado solo en el destino). No hace criptografía; no toca claves.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { colors } from "@aegis/ui-kit/tokens";
import { useT } from "@/lib/i18n/provider";

const HIDE_KEY = "aegis.journey.hide.v1";
const OPEN_EVENT = "aegis:open-journey";
const NOISE = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz0123456789+/";

type NodeKey = "a" | "o" | "r" | "b";

function rnd(n: number): string {
  let s = "";
  for (let i = 0; i < n; i++) s += NOISE.charAt(Math.floor(Math.random() * NOISE.length));
  return s;
}
function noiseFor(text: string): string {
  return rnd(Math.min(Math.max(text.length + 2, 8), 22));
}

/** Enlace discreto (footer) que reabre el demo. Cliente: emite el evento que escucha MessageJourney. */
export function JourneyTrigger({ className = "" }: { className?: string }) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent(OPEN_EVENT))}
      className={`label text-muted hover:text-accent transition-colors ${className}`}
    >
      {t.journey.trigger}
    </button>
  );
}

const IconUser = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
    <circle cx="12" cy="8" r="3.4" />
    <path d="M5.5 20a6.5 6.5 0 0 1 13 0" strokeLinecap="round" />
  </svg>
);
const IconOnion = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="5.4" />
    <circle cx="12" cy="12" r="1.8" fill="currentColor" stroke="none" />
  </svg>
);
const IconServer = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
    <rect x="3.5" y="4.5" width="17" height="6" rx="1.6" />
    <rect x="3.5" y="13.5" width="17" height="6" rx="1.6" />
    <circle cx="7" cy="7.5" r="1" fill="currentColor" stroke="none" />
    <circle cx="7" cy="16.5" r="1" fill="currentColor" stroke="none" />
  </svg>
);
const IconLock = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <rect x="5" y="10.5" width="14" height="9" rx="2" />
    <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
  </svg>
);

export function MessageJourney() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"invite" | "demo">("invite");
  const [dontShow, setDontShow] = useState(false);

  const [caption, setCaption] = useState(t.journey.captions.idle);
  const [captionSoft, setCaptionSoft] = useState(true);
  const [lit, setLit] = useState<Record<NodeKey, boolean>>({ a: true, o: false, r: false, b: false });
  const [relaySeen, setRelaySeen] = useState(false);
  const [onionOn, setOnionOn] = useState(false);
  const [peekOn, setPeekOn] = useState(false);
  const [peekText, setPeekText] = useState("");
  const [packetMode, setPacketMode] = useState<"plain" | "noise">("plain");
  const [sendLabel, setSendLabel] = useState(t.journey.send);
  const [sending, setSending] = useState(false);

  const trackRef = useRef<HTMLDivElement>(null);
  const packetRef = useRef<HTMLDivElement>(null);
  const packetTextRef = useRef<HTMLSpanElement>(null);
  const msgRef = useRef<HTMLInputElement>(null);
  const nodesRef = useRef<Record<NodeKey, HTMLDivElement | null>>({ a: null, o: null, r: null, b: null });

  const runningRef = useRef(false);
  const peekTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reducedRef = useRef(false);
  const onionRef = useRef(false);
  const currentRef = useRef<NodeKey>("a");

  onionRef.current = onionOn;

  /* ---- helpers de animación (estables; usan refs) ---- */
  const setText = useCallback((t: string) => {
    if (packetTextRef.current) packetTextRef.current.textContent = t;
  }, []);

  const centerX = useCallback((k: NodeKey) => {
    const track = trackRef.current;
    const disc = nodesRef.current[k]?.querySelector(".jd-disc") as HTMLElement | null;
    if (!track || !disc) return 0;
    const d = disc.getBoundingClientRect();
    const t = track.getBoundingClientRect();
    return d.left + d.width / 2 - t.left;
  }, []);

  const layout = useCallback(() => {
    const track = trackRef.current;
    const packet = packetRef.current;
    const disc = nodesRef.current.a?.querySelector(".jd-disc") as HTMLElement | null;
    const wire = track?.querySelector(".jd-wire") as HTMLElement | null;
    if (!track || !packet || !disc) return;
    const d = disc.getBoundingClientRect();
    const t = track.getBoundingClientRect();
    const cy = d.top - t.top + d.height / 2;
    if (wire) wire.style.top = `${cy - 1}px`;
    packet.style.top = `${cy - packet.offsetHeight / 2}px`;
  }, []);

  const moveTo = useCallback(
    (k: NodeKey, dur: number) => {
      const packet = packetRef.current;
      if (!packet) return;
      const x = centerX(k) - packet.offsetWidth / 2;
      packet.style.transitionDuration = `${reducedRef.current ? 0 : dur}ms`;
      packet.style.transform = `translateX(${x}px)`;
    },
    [centerX],
  );

  const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

  const scramble = useCallback(
    (target: string, dur: number) =>
      new Promise<void>((res) => {
        if (reducedRef.current) {
          setText(target);
          res();
          return;
        }
        const len = target.length;
        const total = Math.round(dur / 40);
        const settle: number[] = [];
        for (let i = 0; i < len; i++) settle[i] = Math.floor(total * (0.28 + 0.62 * (i / len)));
        let frame = 0;
        const timer = setInterval(() => {
          let out = "";
          for (let j = 0; j < len; j++) {
            const s = settle[j] ?? 0;
            out += frame >= s ? target.charAt(j) : NOISE.charAt(Math.floor(Math.random() * NOISE.length));
          }
          setText(out);
          frame++;
          if (frame > total) {
            clearInterval(timer);
            setText(target);
            res();
          }
        }, 40);
      }),
    [setText],
  );

  const stopPeek = useCallback(() => {
    if (peekTimerRef.current) {
      clearInterval(peekTimerRef.current);
      peekTimerRef.current = null;
    }
    setPeekOn(false);
    setRelaySeen(false);
  }, []);

  const startPeek = useCallback(() => {
    setPeekOn(true);
    setRelaySeen(true);
    const tick = () => setPeekText(`${rnd(30)} ${rnd(26)}`);
    tick();
    if (!reducedRef.current) peekTimerRef.current = setInterval(tick, 130);
  }, []);

  const litOnly = useCallback((keys: NodeKey[]) => {
    setLit({ a: keys.includes("a"), o: keys.includes("o"), r: keys.includes("r"), b: keys.includes("b") });
  }, []);

  const play = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    setSending(true);
    stopPeek();

    const text = (msgRef.current?.value || t.journey.defaultMessage).slice(0, 40);
    const on = onionRef.current;
    const red = reducedRef.current;

    litOnly(["a"]);
    setPacketMode("plain");
    setText(text);
    currentRef.current = "a";
    moveTo("a", 0);
    setCaptionSoft(false);
    setCaption(t.journey.captions.plain);
    await wait(red ? 500 : 850);

    setCaption(t.journey.captions.encrypt);
    await scramble(noiseFor(text), 720);
    setPacketMode("noise");
    moveTo("a", 0);
    await wait(red ? 350 : 480);

    const labels = on
      ? { tor: "②", relay: "③", arrive: "④", open: "⑤" }
      : { relay: "②", arrive: "③", open: "④" };

    if (on) {
      setCaption(t.journey.captions.onion);
      currentRef.current = "o";
      moveTo("o", 850);
      await wait(red ? 400 : 850);
      setLit({ a: true, o: true, r: false, b: false });
      await wait(red ? 200 : 400);
    }

    setCaption(t.journey.captions.toServer(labels.relay));
    currentRef.current = "r";
    moveTo("r", 950);
    await wait(red ? 300 : 950);
    startPeek();
    setCaption(t.journey.captions.serverBlind);
    await wait(red ? 900 : 1600);

    setCaption(t.journey.captions.arrive(labels.arrive));
    currentRef.current = "b";
    moveTo("b", 950);
    await wait(red ? 300 : 950);
    setLit((l) => ({ ...l, b: true }));
    await wait(red ? 150 : 300);

    setCaption(t.journey.captions.decrypt(labels.open));
    await scramble(text, 720);
    setPacketMode("plain");
    moveTo("b", 0);
    await wait(red ? 300 : 550);

    setCaption(t.journey.captions.done);
    runningRef.current = false;
    setSending(false);
    setSendLabel(t.journey.replay);
  }, [litOnly, moveTo, scramble, setText, startPeek, stopPeek, t]);

  /* ---- apertura / cierre ---- */
  useEffect(() => {
    reducedRef.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let hidden = false;
    try {
      hidden = localStorage.getItem(HIDE_KEY) === "1";
    } catch {
      /* almacenamiento no disponible */
    }
    if (!hidden) setOpen(true);
    const onReopen = () => {
      setView("invite");
      setOpen(true);
    };
    window.addEventListener(OPEN_EVENT, onReopen);
    return () => window.removeEventListener(OPEN_EVENT, onReopen);
  }, []);

  const persistHide = useCallback((hide: boolean) => {
    setDontShow(hide);
    try {
      if (hide) localStorage.setItem(HIDE_KEY, "1");
      else localStorage.removeItem(HIDE_KEY);
    } catch {
      /* almacenamiento no disponible */
    }
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    stopPeek();
    runningRef.current = false;
  }, [stopPeek]);

  /* Al entrar al demo: recoloca y auto-reproduce. Limpia timers al salir. */
  useEffect(() => {
    if (!open || view !== "demo") return;
    setSendLabel(t.journey.send);
    const timer = setTimeout(
      () => {
        layout();
        play();
      },
      reducedRef.current ? 60 : 280,
    );
    return () => {
      clearTimeout(timer);
      stopPeek();
      runningRef.current = false;
    };
  }, [open, view, layout, play, stopPeek, t]);

  /* Recolocar en resize y al conmutar .onion (cambia el layout de la vía). */
  useEffect(() => {
    if (!open || view !== "demo") return;
    const onResize = () => {
      layout();
      if (!runningRef.current) moveTo(currentRef.current, 0);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [open, view, layout, moveTo]);

  useEffect(() => {
    if (open && view === "demo" && !runningRef.current) {
      layout();
      moveTo(currentRef.current, 0);
    }
  }, [onionOn, open, view, layout, moveTo]);

  /* Escape cierra */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  if (!open) return null;

  const discStyle = (k: NodeKey): React.CSSProperties => {
    if (k === "r" && relaySeen) {
      return { borderColor: colors["muted-2"], color: colors["muted-2"], boxShadow: `0 0 0 4px ${colors["muted-2"]}22` };
    }
    if (lit[k]) {
      const c = k === "o" ? colors.secondary : colors.accent;
      return { borderColor: c, color: c, boxShadow: `0 0 0 4px ${c}22` };
    }
    return { borderColor: colors.line, color: colors.muted };
  };

  const packetStyle: React.CSSProperties =
    packetMode === "plain"
      ? { color: colors.accent, borderColor: colors.accent, boxShadow: `0 0 0 4px ${colors.accent}1f, 0 6px 20px -8px ${colors.accent}55` }
      : { color: colors["muted-2"], borderColor: colors.line, boxShadow: `0 0 0 4px ${colors["muted-2"]}18` };

  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center p-4 sm:p-6 overflow-y-auto"
      style={{ background: "rgba(9,9,9,.72)", backdropFilter: "blur(3px)" }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t.journey.dialogLabel}
        className="w-full bg-surface border border-line rounded-lg shadow-2xl my-auto"
        style={{ maxWidth: view === "demo" ? 660 : 460 }}
      >
        {view === "invite" ? (
          <div className="p-7 sm:p-8">
            <p className="label text-accent-dim mb-3">{t.journey.inviteEyebrow}</p>
            <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-text text-balance">
              {t.journey.inviteTitle}
            </h2>
            <p className="mt-3 text-[15px] leading-relaxed text-muted">
              {t.journey.inviteBodyStart}
              <span className="text-text">{t.journey.inviteBodyNot}</span>
              {t.journey.inviteBodyEnd}
            </p>
            <div className="mt-6 flex flex-col gap-2.5">
              <button
                type="button"
                onClick={() => setView("demo")}
                className="w-full bg-accent text-bg font-semibold font-mono text-sm rounded-md px-5 py-3 hover:brightness-110 transition"
              >
                {t.journey.inviteCta}
              </button>
              <button
                type="button"
                onClick={close}
                className="w-full border border-line text-muted hover:text-text hover:border-muted-2 font-mono text-sm rounded-md px-5 py-3 transition-colors"
              >
                {t.journey.inviteSkip}
              </button>
            </div>
            <label className="mt-5 flex items-center gap-2.5 text-[13px] text-muted-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={dontShow}
                onChange={(e) => persistHide(e.target.checked)}
                style={{ accentColor: colors.accent, width: 15, height: 15 }}
              />
              {t.journey.dontShowAgain}
            </label>
            <p className="mt-4 label text-muted-2 text-center">{t.journey.noCookies}</p>
          </div>
        ) : (
          <div className="p-5 sm:p-7">
            <div className="flex items-start justify-between gap-4 mb-5">
              <div>
                <p className="label text-accent-dim mb-2">{t.journey.demoEyebrow}</p>
                <h2 className="text-lg sm:text-xl font-semibold tracking-tight text-text">
                  {t.journey.demoTitleStart}
                  <span className="text-accent">{t.journey.demoTitleNot}</span>
                  {t.journey.demoTitleEnd}
                </h2>
              </div>
              <button
                type="button"
                onClick={close}
                aria-label={t.common.close}
                className="shrink-0 text-muted-2 hover:text-text transition-colors font-mono text-lg leading-none px-1"
              >
                ✕
              </button>
            </div>

            <div className="flex flex-wrap items-end gap-3 sm:gap-4">
              <label className="flex-1 min-w-0 flex flex-col gap-1.5">
                <span className="label text-muted-2">{t.journey.yourMessage}</span>
                <input
                  ref={msgRef}
                  type="text"
                  defaultValue={t.journey.defaultMessage}
                  maxLength={40}
                  autoComplete="off"
                  spellCheck={false}
                  onInput={() => {
                    if (!runningRef.current) {
                      setText((msgRef.current?.value || t.journey.defaultMessage).slice(0, 40));
                      moveTo(currentRef.current, 0);
                    }
                  }}
                  className="w-full bg-surface-2 border border-line rounded-md px-3 py-2.5 font-mono text-sm text-text focus:outline-none focus:border-accent transition-colors"
                />
              </label>
              <label className="flex items-center gap-2 pb-2.5 font-mono text-[13px] text-muted cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={onionOn}
                  onChange={(e) => setOnionOn(e.target.checked)}
                  style={{ accentColor: colors.secondary, width: 15, height: 15 }}
                />
                {t.journey.viaOnion}
              </label>
              <button
                type="button"
                onClick={() => play()}
                disabled={sending}
                className="bg-accent text-bg font-semibold font-mono text-sm rounded-md px-5 py-2.5 hover:brightness-110 transition disabled:opacity-50 disabled:cursor-default"
              >
                {sendLabel}
              </button>
            </div>

            <div className="flex flex-wrap gap-x-5 gap-y-2 mt-4 font-mono text-[12px] text-muted">
              <span className="inline-flex items-center gap-2">
                <i className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: colors.accent, boxShadow: `0 0 0 4px ${colors.accent}22` }} />
                {t.journey.legendPlain}
              </span>
              <span className="inline-flex items-center gap-2">
                <i className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: colors["muted-2"], boxShadow: `0 0 0 4px ${colors["muted-2"]}22` }} />
                {t.journey.legendNoise}
              </span>
            </div>

            <div className="mt-6 overflow-x-auto">
              <div ref={trackRef} className="relative flex justify-between items-start pt-1.5" style={{ minWidth: 288 }}>
                <div
                  className="jd-wire absolute h-0.5"
                  style={{
                    left: 20,
                    right: 20,
                    top: 33,
                    background: `repeating-linear-gradient(90deg, ${colors.line} 0 7px, transparent 7px 13px)`,
                  }}
                />
                <div
                  ref={packetRef}
                  className="absolute left-0 z-[4] font-mono text-[12px] sm:text-[13px] whitespace-nowrap px-2.5 py-1.5 rounded-md border bg-surface"
                  style={{ top: 15, transitionProperty: "transform", transitionTimingFunction: "cubic-bezier(.5,.05,.2,1)", ...packetStyle }}
                >
                  <span ref={packetTextRef}>{t.journey.defaultMessage}</span>
                </div>

                {(
                  [
                    { k: "a" as NodeKey, icon: IconUser, label: t.journey.nodeYou, sub: null },
                    {
                      k: "o" as NodeKey,
                      icon: IconOnion,
                      label: t.journey.nodeOnion,
                      sub: t.journey.nodeOnionSub,
                    },
                    {
                      k: "r" as NodeKey,
                      icon: IconServer,
                      label: t.journey.nodeServer,
                      sub: t.journey.nodeServerSub,
                    },
                    { k: "b" as NodeKey, icon: IconUser, label: t.journey.nodePeer, sub: null },
                  ] as const
                ).map(({ k, icon, label, sub }) => (
                  <div
                    key={k}
                    ref={(el) => {
                      nodesRef.current[k] = el;
                    }}
                    className={`relative z-[2] flex flex-col items-center gap-2.5 ${k === "o" && !onionOn ? "hidden" : ""}`}
                    style={{ width: 62 }}
                  >
                    <div
                      className="jd-disc grid place-items-center border rounded-[13px] bg-surface-2 transition-all duration-300"
                      style={{ width: 46, height: 46, ...discStyle(k) }}
                    >
                      <span className="w-[22px] h-[22px] block">{icon}</span>
                    </div>
                    <div className="font-mono text-[11px] leading-tight text-center text-muted">
                      {label}
                      {sub ? (
                        <>
                          <br />
                          <span className="text-muted-2 text-[10px]">{sub}</span>
                        </>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div
              className="mx-auto mt-2 max-w-[440px] rounded-md p-3.5 transition-all duration-300"
              style={{
                border: `1px dashed ${colors["muted-2"]}`,
                background: colors["surface-2"],
                opacity: peekOn ? 1 : 0,
                transform: peekOn ? "none" : "translateY(6px)",
              }}
              aria-hidden={!peekOn}
            >
              <div className="flex items-center gap-2 label mb-2" style={{ color: colors["muted-2"] }}>
                <span className="w-3.5 h-3.5 block">{IconLock}</span>
                {t.journey.serverSees}
              </div>
              <div className="font-mono text-[12px] break-all leading-relaxed" style={{ color: colors["muted-2"] }}>
                {peekText || " "}
              </div>
              <div className="font-mono text-[11px] mt-2 text-muted-2">
                {t.journey.serverSeesDetailStart}
                <s>—</s>
                {t.journey.serverSeesDetailMiddle}
                <s>—</s>
                {t.journey.serverSeesDetailEnd}
                <span className="text-muted">{t.journey.serverSeesNoise}</span>
              </div>
            </div>

            <p className={`font-mono text-[13px] text-center mt-5 min-h-[1.5em] ${captionSoft ? "text-muted-2" : "text-text"}`}>
              {caption}
            </p>

            <div className="mt-5 pt-4 border-t border-line flex items-center justify-between gap-4">
              <label className="flex items-center gap-2 text-[12px] text-muted-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={dontShow}
                  onChange={(e) => persistHide(e.target.checked)}
                  style={{ accentColor: colors.accent, width: 14, height: 14 }}
                />
                {t.journey.dontShowAgain}
              </label>
              <button type="button" onClick={close} className="label text-muted hover:text-text transition-colors">
                {t.common.close}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
