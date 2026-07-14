import { StatusDot } from "./StatusDot";

const MODES = [
  {
    mode: "relay" as const,
    name: "Relay",
    body: "Servidor central de Redder Labs. Mejor latencia, entrega inmediata. Cola de blobs cifrados: sin claves privadas, sin contenido en claro. También alcanzable por servicio .onion (Tor v3), resistente a bloqueos de DNS/IP.",
  },
  {
    mode: "p2p" as const,
    name: "P2P · libp2p",
    body: "Sin relay central. Descubrimiento por DHT y store-and-forward. Failover automático si el relay es bloqueado o censurado.",
  },
  {
    mode: "mesh" as const,
    name: "Mesh local",
    body: "BLE / Wi-Fi Aware. Sin internet ni infraestructura: el mensaje salta de dispositivo en dispositivo hasta llegar al destino.",
  },
];

export function Transports() {
  return (
    <section id="transporte" className="bg-surface border-y border-line">
      <div className="max-w-shell mx-auto px-5 md:px-8 py-24">
        <div className="mb-12">
          <p className="label text-accent-dim mb-3">Transporte intercambiable</p>
          <h2 className="text-2xl md:text-3xl font-semibold tracking-tight text-text">
            Tres caminos, un mismo cifrado
          </h2>
          <p className="mt-3 text-[15px] text-muted max-w-2xl">
            El transporte solo decide disponibilidad y latencia, nunca la
            seguridad del contenido. Si uno cae, el siguiente entra sin que
            tengas que hacer nada. El punto de estado en el header cambia de
            color; nada más.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {MODES.map((m) => (
            <div key={m.mode} className="bg-bg border border-line rounded-md p-6">
              <div className="flex items-center gap-2 mb-4">
                <StatusDot mode={m.mode} glow={m.mode === "relay"} />
                <span className="label text-text">{m.name}</span>
              </div>
              <p className="text-[13px] leading-relaxed text-muted">{m.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
