export function Handshake() {
  return (
    <section className="max-w-shell mx-auto px-5 md:px-8 py-24">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
        <div>
          <p className="label text-accent-dim mb-3">Handshake</p>
          <h2 className="text-2xl md:text-3xl font-semibold tracking-tight text-text">
            Nada que no puedas verificar
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-muted">
            El cliente es de código abierto y el build es reproducible: cualquiera
            puede compilar desde el código y comparar hashes contra el binario
            publicado. Un hook de escaneo insertado en silencio sería detectable
            en el siguiente release.
          </p>
          <p className="mt-4 text-[15px] leading-relaxed text-muted">
            Aún no existe un informe de auditoría externa independiente. Cuando lo
            haya, se cita aquí. Hasta entonces, el estado honesto es:{" "}
            <span className="text-text">pendiente</span>.
          </p>
        </div>
        <div className="bg-surface border border-line rounded-md p-4 font-mono text-[13px]">
          <div className="flex items-center gap-2 pb-3 mb-3 border-b border-line">
            <span className="w-2.5 h-2.5 rounded-full bg-muted-2" />
            <span className="w-2.5 h-2.5 rounded-full bg-muted-2" />
            <span className="w-2.5 h-2.5 rounded-full bg-accent-dim" />
            <span className="ml-2 label text-muted-2">
              aegis handshake --verbose
            </span>
          </div>
          <div className="space-y-1.5 text-muted leading-relaxed">
            <p>
              <span className="text-accent-dim">[KEX ]</span> Acuerdo de claves:
              X25519 (ECDH efímero por sesión)
            </p>
            <p>
              <span className="text-accent-dim">[AEAD]</span> Payload:
              XChaCha20-Poly1305
            </p>
            <p>
              <span className="text-accent-dim">[ID&nbsp;&nbsp;]</span> Fingerprint
              Ed25519: 4F9A·22C1·88E0·B301·7D6F·12AA
            </p>
            <p>
              <span className="text-accent-dim">[SEAL]</span> Sealed sender: relay
              sin identidad de remitente
            </p>
            <p className="text-accent">&gt; Cifrado activo — transporte: relay</p>
            <p className="text-muted-2">
              &gt; Verificación fuera de banda: pendiente de tu acción
            </p>
            <p className="caret text-muted" />
          </div>
        </div>
      </div>
    </section>
  );
}
