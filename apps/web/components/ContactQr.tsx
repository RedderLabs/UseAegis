"use client";

/**
 * QR de contacto — dos piezas reutilizables:
 *
 *  - `ContactQR`: pinta MI URI de contacto como código QR (SVG negro sobre blanco, legible en
 *    cualquier tema y por cualquier lector). Otra persona lo escanea con su móvil y me añade.
 *  - `AddByQr`: añade a alguien a partir de SU QR SIN cámara — pegando el código o subiendo una
 *    imagen (se decodifica en local con jsQR). Evitar la cámara es deliberado: en el Navegador Tor
 *    `getUserMedia`/`BarcodeDetector` no están o son problemáticos, y pedir la cámara añade
 *    superficie de fingerprinting. Pegar/subir imagen funciona en todas las puertas.
 *
 * La clave pública viaja en el QR (fuera de banda); la verificación anti-MITM la hace quien añade,
 * al descargar y comprobar el key bundle (ver `lib/contacts.ts`).
 */
import { useEffect, useRef, useState } from "react";
import { parseContactUri, type ContactUri } from "@/lib/contact-uri";
import { IconImage } from "@/components/Icons";

// `qrcode` (~generar) y `jsqr` (~decodificar imagen) se cargan BAJO DEMANDA: no entran en el
// bundle inicial del dashboard, solo cuando de verdad se pinta/escanea un QR (importa por Tor).

// --- Mi QR ----------------------------------------------------------------------------

/** Pinta `uri` como QR SVG dentro de una caja blanca (contraste garantizado para el lector). */
export function ContactQR({ uri, size = 208 }: { uri: string; size?: number }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    setSvg(null);
    setFailed(false);
    void (async () => {
      try {
        const QRCode = (await import("qrcode")).default;
        const out = await QRCode.toString(uri, {
          type: "svg",
          margin: 1,
          errorCorrectionLevel: "M",
          color: { dark: "#0a0a0aff", light: "#ffffffff" },
        });
        // Quita width/height fijos del <svg> para que escale al contenedor (conserva el viewBox).
        if (alive) setSvg(out.replace(/\s(width|height)="[^"]*"/g, ""));
      } catch {
        if (alive) setFailed(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [uri]);

  if (failed) {
    return <p className="font-mono text-[11px] text-error">No se pudo generar el QR.</p>;
  }
  return (
    <div
      className="bg-white rounded-md p-3 [&_svg]:block [&_svg]:w-full [&_svg]:h-full"
      style={{ width: size, height: size }}
      // El SVG lo genera qrcode a partir de datos locales; no hay HTML de usuario aquí.
      dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
    >
      {svg ? undefined : <span className="sr-only">Generando QR…</span>}
    </div>
  );
}

// --- Añadir por QR --------------------------------------------------------------------

/** Decodifica un QR de un fichero de imagen en local (sin red, sin cámara). null si no hay QR. */
async function decodeImageFile(file: File): Promise<string | null> {
  const jsQR = (await import("jsqr")).default;
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0);
    const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return jsQR(data, width, height)?.data ?? null;
  } finally {
    bitmap.close();
  }
}

/**
 * Panel para añadir a alguien por su QR. `onAdd` recibe la identidad ya parseada y debe hacer la
 * verificación/alta real (y lanzar con un mensaje si algo falla, p. ej. "eres tú" o "sin prekey").
 */
export function AddByQr({
  onAdd,
  disabled = false,
}: {
  onAdd: (contact: ContactUri) => Promise<void>;
  disabled?: boolean;
}) {
  const [pasted, setPasted] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function submit(contact: ContactUri | null) {
    if (!contact) {
      setError("Ese código no es un QR de contacto de Aegis válido.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onAdd(contact);
      setPasted("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo añadir el contacto.");
    } finally {
      setBusy(false);
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite reelegir el mismo fichero
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const decoded = await decodeImageFile(file);
      if (!decoded) {
        setError("No encontramos ningún QR legible en esa imagen.");
        setBusy(false);
        return;
      }
      await submit(parseContactUri(decoded));
    } catch {
      setError("No pudimos leer esa imagen.");
      setBusy(false);
    }
  }

  const locked = disabled || busy;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <input
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !locked && void submit(parseContactUri(pasted))}
          placeholder="Pega el código del QR (aegis://contact…)"
          className="flex-1 bg-surface-2 border border-line rounded-sm px-3 py-2 font-mono text-[12px] text-text placeholder:text-muted-2 focus:outline-none focus:border-accent/50"
        />
        <button
          onClick={() => void submit(parseContactUri(pasted))}
          disabled={!pasted.trim() || locked}
          className="label text-bg bg-accent rounded-sm px-3 py-2 hover:brightness-110 disabled:opacity-40 transition-all"
        >
          {busy ? "…" : "Añadir"}
        </button>
      </div>

      <button
        onClick={() => fileRef.current?.click()}
        disabled={locked}
        className="inline-flex items-center justify-center gap-1.5 label py-2 border border-line text-muted hover:text-text hover:border-accent-dim rounded-sm transition-colors disabled:opacity-40"
      >
        <IconImage className="w-4 h-4" /> Subir una imagen del QR
      </button>
      <input ref={fileRef} type="file" accept="image/*" onChange={onFile} className="hidden" />

      {error && <p className="text-[12px] text-error">{error}</p>}
      <p className="font-mono text-[10px] text-muted-2 leading-relaxed">
        La imagen se lee en tu dispositivo (no se sube a ningún sitio). Comprobamos su llave de
        cifrado antes de guardar.
      </p>
    </div>
  );
}
