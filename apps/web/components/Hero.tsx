export function Hero() {
  return (
    <section className="max-w-shell mx-auto px-5 md:px-8 pt-20 pb-24 md:pt-28 md:pb-28">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
        <div className="lg:col-span-7">
          <div className="inline-flex items-center gap-2 label text-muted border border-line rounded-full px-3 py-1.5 mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-muted" />
            Código abierto · Auditoría externa pendiente
          </div>
          <h1 className="text-3xl md:text-[44px] leading-[1.15] font-semibold tracking-tight text-text">
            El servidor nunca ve remitente,
            <br className="hidden md:block" /> destinatario ni contenido.
            <span className="block mt-2 text-accent">Solo transporta ruido.</span>
          </h1>
          <p className="mt-7 text-[15px] leading-relaxed text-muted max-w-xl">
            Aegis hace una sola cosa con precisión total: enviar un mensaje
            cifrado extremo a extremo que llegue. Sin perfiles, sin estados, sin
            telemetría. Cuanto menos tiempo pasas mirándolo, mejor está
            funcionando.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <a
              className="group inline-flex items-center gap-2 bg-accent text-bg font-mono font-semibold text-[13px] px-5 py-3 rounded-sm hover:brightness-110 transition"
              href="/register"
            >
              Crear identidad
              <svg
                className="w-4 h-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </a>
            <a
              className="inline-flex items-center gap-2 border border-line text-text text-[13px] px-5 py-3 rounded-sm hover:border-muted transition-colors"
              href="#protege"
            >
              Cómo funciona
            </a>
          </div>
          <p className="mt-5 label text-muted-2">
            Sin cuenta · Sin número de teléfono · Sin email
          </p>
        </div>

        {/* Identidad criptográfica: única metadata que protege al usuario */}
        <div className="lg:col-span-5">
          <div className="bg-surface border border-line rounded-md p-5">
            <div className="flex items-center justify-between mb-4">
              <span className="label text-muted">Fingerprint de identidad</span>
              <span className="inline-flex items-center gap-1.5 label text-secondary">
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: "#adc6ff", boxShadow: "0 0 8px #adc6ff" }}
                />
                Verificada
              </span>
            </div>
            <div className="bg-surface-2 border border-line rounded-sm p-4 font-mono text-secondary text-sm tracking-[0.12em]">
              4F9A · 22C1 · 88E0
              <br />
              B301 · 7D6F · 12AA
            </div>
            <p className="mt-4 text-[13px] leading-relaxed text-muted">
              Ed25519. Se compara en persona o por canal verificado — verificar
              es una acción tuya, no algo que el software pueda forzar.
            </p>
            <div className="mt-4 pt-4 border-t border-line flex items-center justify-between label text-muted-2">
              <span>Sealed sender activo</span>
              <span>libsodium</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
