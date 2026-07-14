const LIMITS = [
  {
    title: "Metadata de conexión con el relay",
    body: "El operador ve tu IP y el momento de conexión —aunque no a quién escribes. Mitigable con Tor; no integrado por defecto en el relay todavía.",
  },
  {
    title: "Tamaño y timing de los mensajes",
    body: "Un observador de red puede inferir cuándo hay conversación y cuánto se envía, no el contenido. Sin padding de tamaño en v1.",
  },
  {
    title: "Dispositivo comprometido",
    body: "Malware, keylogger o acceso físico desbloqueado leen el mensaje donde está en claro: en tu pantalla. El cifrado en tránsito no ayuda ahí.",
  },
  {
    title: "Coerción",
    body: "Ninguna criptografía protege contra que te obliguen a desbloquear tu dispositivo o entregar tu clave bajo amenaza. Aegis protege datos, no personas.",
  },
];

export function Limits() {
  return (
    <section id="limites" className="bg-surface border-y border-line">
      <div className="max-w-shell mx-auto px-5 md:px-8 py-24">
        <div className="mb-12 max-w-2xl">
          <p className="label text-accent-dim mb-3">Modelo de amenaza</p>
          <h2 className="text-2xl md:text-3xl font-semibold tracking-tight text-text">
            Lo que Aegis no protege
          </h2>
          <p className="mt-3 text-[15px] text-muted">
            Esta lista importa tanto como la anterior. Todo está explícito en
            THREAT_MODEL.md, no en la letra pequeña. Ningún esquema protege lo
            que no puede proteger, y decirlo es parte del producto.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {LIMITS.map((l) => (
            <div key={l.title} className="border border-line rounded-md p-6 bg-bg">
              <h3 className="text-text text-[15px] mb-2">{l.title}</h3>
              <p className="text-[13px] leading-relaxed text-muted">{l.body}</p>
            </div>
          ))}
        </div>
        <p className="mt-6 label text-muted-2">
          Detalle completo y actores considerados → THREAT_MODEL.md
        </p>
      </div>
    </section>
  );
}
