"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { IconMic, IconSend, IconTrash } from "./Icons";

// Candidatos de contenedor/códec por orden de preferencia (Opus donde se pueda).
const MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/mp4",
];

function pickMime(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m));
}

function extFor(mime: string): string {
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("mp4")) return "m4a";
  return "webm";
}

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Grabador de nota de voz. Captura del micrófono con MediaRecorder y, al parar, entrega un File
 * (Opus/WebM donde se pueda) y la duración medida. NO cifra ni envía: eso lo hace el llamador con
 * la misma tubería de adjuntos (sendFile kind="audio"). Libera el micrófono al parar/cancelar.
 */
export function VoiceRecorder({
  onRecorded,
  disabled,
}: {
  onRecorded: (file: File, durationMs: number) => void;
  disabled?: boolean;
}) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const cancelledRef = useRef(false);

  const cleanup = useCallback(() => {
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
  }, []);

  // Libera el micrófono si el componente se desmonta grabando.
  useEffect(() => cleanup, [cleanup]);

  const start = useCallback(async () => {
    if (disabled || recording) return;
    setError(null);
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("Este navegador no permite grabar audio.");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("No se pudo acceder al micrófono (permiso denegado).");
      return;
    }
    const mime = pickMime();
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    } catch {
      stream.getTracks().forEach((t) => t.stop());
      setError("Este navegador no soporta la grabación de audio.");
      return;
    }
    chunksRef.current = [];
    cancelledRef.current = false;
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const durationMs = performance.now() - startRef.current;
      const type = recorder.mimeType || mime || "audio/webm";
      const blob = new Blob(chunksRef.current, { type });
      cleanup();
      setRecording(false);
      setElapsed(0);
      if (cancelledRef.current || blob.size === 0) return;
      const file = new File([blob], `nota-de-voz.${extFor(type)}`, { type });
      onRecorded(file, durationMs);
    };

    streamRef.current = stream;
    recorderRef.current = recorder;
    startRef.current = performance.now();
    recorder.start();
    setRecording(true);
    setElapsed(0);
    timerRef.current = window.setInterval(() => {
      setElapsed((performance.now() - startRef.current) / 1000);
    }, 200);
  }, [disabled, recording, cleanup, onRecorded]);

  const stopAndSend = useCallback(() => {
    if (!recorderRef.current) return;
    cancelledRef.current = false;
    recorderRef.current.stop(); // dispara onstop → onRecorded
  }, []);

  const cancel = useCallback(() => {
    if (!recorderRef.current) return;
    cancelledRef.current = true;
    recorderRef.current.stop(); // onstop verá cancelled → descarta
  }, []);

  if (recording) {
    return (
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={cancel}
          className="w-9 h-9 rounded-sm flex items-center justify-center text-muted hover:text-error transition-colors"
          title="Cancelar grabación"
        >
          <IconTrash className="w-5 h-5" />
        </button>
        <span className="inline-flex items-center gap-1.5 font-mono text-[12px] text-error">
          <span className="w-2 h-2 rounded-full bg-error animate-pulse" />
          {fmt(elapsed)}
        </span>
        <button
          onClick={stopAndSend}
          className="w-10 h-10 rounded-sm flex items-center justify-center bg-accent text-bg hover:brightness-110 active:scale-95 transition-all"
          title="Enviar nota de voz"
        >
          <IconSend className="w-5 h-5" />
        </button>
      </div>
    );
  }

  return (
    <div className="relative shrink-0 flex items-center">
      <button
        onClick={() => void start()}
        disabled={disabled}
        className="w-9 h-9 rounded-sm flex items-center justify-center text-muted hover:text-accent transition-colors disabled:opacity-40"
        title="Grabar nota de voz (cifrada de extremo a extremo)"
      >
        <IconMic className="w-5 h-5" />
      </button>
      {error && (
        <span className="absolute bottom-full right-0 mb-1 whitespace-nowrap text-[10px] text-error bg-surface border border-line rounded-sm px-2 py-1">
          {error}
        </span>
      )}
    </div>
  );
}
