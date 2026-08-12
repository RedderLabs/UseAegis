import { getDictionary, type Locale } from "@/lib/i18n";

/** El NOMBRE del primitivo no se traduce: es un identificador criptográfico, no copy. */
const PRIMITIVES = [
  { name: "XChaCha20-Poly1305", key: "aead" },
  { name: "Ed25519 · X25519", key: "identity" },
  { name: "crypto_secretstream", key: "stream" },
  { name: "Sealed sender", key: "sealed" },
] as const;

export function Protects({ locale }: { locale: Locale }) {
  const t = getDictionary(locale);

  return (
    <section id="protege" className="max-w-shell mx-auto px-5 md:px-8 py-24">
      <div className="mb-12">
        <p className="label text-accent-dim mb-3">{t.protects.eyebrow}</p>
        <h2 className="text-2xl md:text-3xl font-semibold tracking-tight text-text">
          {t.protects.title}
        </h2>
        <p className="mt-3 text-[15px] text-muted max-w-2xl">{t.protects.body}</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-line border border-line rounded-md overflow-hidden">
        {PRIMITIVES.map((p) => (
          <div key={p.name} className="bg-surface p-6">
            <p className="font-mono text-accent text-sm font-semibold mb-2">{p.name}</p>
            <h3 className="text-text text-[15px] mb-2">{t.protects.items[p.key].title}</h3>
            <p className="text-[13px] leading-relaxed text-muted">
              {t.protects.items[p.key].body}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
