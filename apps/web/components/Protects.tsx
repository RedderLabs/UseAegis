const PRIMITIVES = [
  {
    name: "XChaCha20-Poly1305",
    title: "Cifrado autenticado del payload",
    body: "Texto, audio y —más adelante— archivos. Autenticado: detecta cualquier manipulación del mensaje.",
  },
  {
    name: "Ed25519 · X25519",
    title: "Identidad y acuerdo de claves",
    body: "Un par de claves es tu identidad estable. Acuerdo de clave por sesión vía ECDH. No hay cuentas ni directorio central.",
  },
  {
    name: "crypto_secretstream",
    title: "Cifrado en streaming por chunks",
    body: "Audio largo y archivos se cifran y descifran en fragmentos, sin cargar el blob completo. Detecta reordenamiento o truncamiento.",
  },
  {
    name: "Sealed sender",
    title: "El relay no conoce al remitente",
    body: "El servidor entrega blobs cifrados sin saber quién los originó. Si lo embargan, no hay contenido ni identidad que entregar.",
  },
];

export function Protects() {
  return (
    <section id="protege" className="max-w-shell mx-auto px-5 md:px-8 py-24">
      <div className="mb-12">
        <p className="label text-accent-dim mb-3">Capa de cifrado</p>
        <h2 className="text-2xl md:text-3xl font-semibold tracking-tight text-text">
          Cómo protege el contenido
        </h2>
        <p className="mt-3 text-[15px] text-muted max-w-2xl">
          Primitivos auditados de libsodium. Sin implementaciones criptográficas
          propias. El cifrado es idéntico viaje por donde viaje el mensaje.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-line border border-line rounded-md overflow-hidden">
        {PRIMITIVES.map((p) => (
          <div key={p.name} className="bg-surface p-6">
            <p className="font-mono text-accent text-sm font-semibold mb-2">
              {p.name}
            </p>
            <h3 className="text-text text-[15px] mb-2">{p.title}</h3>
            <p className="text-[13px] leading-relaxed text-muted">{p.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
