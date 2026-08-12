/**
 * Diccionario ES — FUENTE DE VERDAD del tipo `Dictionary`.
 *
 * El resto de idiomas se declaran `satisfies Dictionary`, así que si aquí se añade una clave y
 * falta en otro idioma, el `tsc --noEmit` del CI falla. No hay claves "perdidas" en runtime ni
 * cadenas sin traducir que solo se descubran en producción.
 *
 * Las cadenas con datos dentro son FUNCIONES (no plantillas con `{placeholders}`): el tipado las
 * comprueba en compilación y el plural se resuelve en el idioma, no en el sitio de uso.
 */

const es = {
  common: {
    cancel: "Cancelar",
    close: "Cerrar",
    copy: "Copiar",
    copied: "Copiada",
    copiedShort: "Copiado",
    download: "Descargar",
    add: "Añadir",
    retry: "Reintentar",
    loading: "Cargando…",
    checking: "Comprobando…",
    saving: "Guardando…",
    pending: "Pendiente",
    language: "Idioma",
    switchLanguage: "Cambiar idioma",
  },

  nav: {
    howItProtects: "Cómo protege",
    transport: "Transporte",
    torSession: "Sesión por Tor",
    limits: "Qué no protege",
    login: "Entrar",
    createIdentity: "Crear identidad",
  },

  hero: {
    badge: "Código abierto · Auditoría externa pendiente",
    titleLine1: "El servidor nunca ve remitente,",
    titleLine2: "destinatario ni contenido.",
    titleAccent: "Solo transporta ruido.",
    body: "Use Aegis hace una sola cosa con precisión total: enviar un mensaje cifrado extremo a extremo que llegue. Sin perfiles, sin estados, sin telemetría. Cuanto menos tiempo pasas mirándolo, mejor está funcionando.",
    ctaPrimary: "Crear identidad",
    ctaSecondary: "Cómo funciona",
    noAccount: "Sin cuenta · Sin número de teléfono · Sin email",
    fingerprintLabel: "Fingerprint de identidad",
    verified: "Verificada",
    fingerprintNote:
      "Ed25519. Se compara en persona o por canal verificado — verificar es una acción tuya, no algo que el software pueda forzar.",
    sealedSenderActive: "Sealed sender activo",
  },

  protects: {
    eyebrow: "Capa de cifrado",
    title: "Cómo protege el contenido",
    body: "Primitivos auditados de libsodium. Sin implementaciones criptográficas propias. El cifrado es idéntico viaje por donde viaje el mensaje.",
    items: {
      aead: {
        title: "Cifrado autenticado del payload",
        body: "Texto, audio y —más adelante— archivos. Autenticado: detecta cualquier manipulación del mensaje.",
      },
      identity: {
        title: "Identidad y acuerdo de claves",
        body: "Un par de claves es tu identidad estable. Acuerdo de clave por sesión vía ECDH. No hay cuentas ni directorio central.",
      },
      stream: {
        title: "Cifrado en streaming por chunks",
        body: "Audio largo y archivos se cifran y descifran en fragmentos, sin cargar el blob completo. Detecta reordenamiento o truncamiento.",
      },
      sealed: {
        title: "El relay no conoce al remitente",
        body: "El servidor entrega blobs cifrados sin saber quién los originó. Si lo embargan, no hay contenido ni identidad que entregar.",
      },
    },
  },

  transports: {
    eyebrow: "Transporte intercambiable",
    title: "Tres caminos, un mismo cifrado",
    body: "El transporte solo decide disponibilidad y latencia, nunca la seguridad del contenido. Si uno cae, el siguiente entra sin que tengas que hacer nada. El punto de estado en el header cambia de color; nada más.",
    relay: {
      name: "Relay",
      body: "Servidor central de Redder Labs. Mejor latencia, entrega inmediata. Cola de blobs cifrados: sin claves privadas, sin contenido en claro. También alcanzable por servicio .onion (Tor v3), resistente a bloqueos de DNS/IP.",
    },
    p2p: {
      name: "P2P · libp2p",
      body: "Sin relay central: navegador a navegador por WebRTC, cifrado con Noise. El contacto se localiza por su PeerID —derivado de su clave pública, sin directorio que consultar— a través de un nodo de señalización que nunca ve el contenido. Entra automáticamente si el relay se bloquea o se censura.",
    },
    mesh: {
      name: "Mesh local",
      body: "BLE / Wi-Fi Aware. Sin internet ni infraestructura: el mensaje salta de dispositivo en dispositivo hasta llegar al destino.",
    },
  },

  secureSession: {
    eyebrow: "Sesión protegida",
    title: "Para conversar más seguro, entra por Tor",
    bodyStart: "En la puerta normal (clearnet) tu contenido va cifrado de extremo a extremo, pero tu ",
    bodyIpVisible: "IP es visible para el relay",
    bodyMiddle: ". Para máxima privacidad entra por nuestra ",
    bodyEnd: ": el tráfico va por Tor y tu IP deja de ser visible. Necesitas el ",
    torBrowser: "Navegador Tor",
    steps: {
      install: {
        title: "Instala el Navegador Tor",
        body: "Descárgalo del sitio oficial del proyecto Tor. Es gratis y de código abierto.",
      },
      open: {
        title: "Abre nuestra .onion",
        body: "Pega la dirección .onion en el Navegador Tor. La app carga entera por Tor.",
      },
      import: {
        title: "Importa tu identidad y entra",
        body: "Con tu frase de recuperación. Tu misma identidad = tu misma conversación.",
      },
    },
    downloadTor: "Descargar el Navegador Tor ↗",
    openOnion: "Abrir la .onion (con Tor)",
    copyOnion: "Copiar dirección .onion",
    copiedOnion: "Copiada ✓",
    onionInSettings: "La dirección .onion aparece en Ajustes una vez dentro.",
  },

  handshake: {
    eyebrow: "Handshake",
    title: "Nada que no puedas verificar",
    body1:
      "El cliente es de código abierto y el build es reproducible: cualquiera puede compilar desde el código y comparar hashes contra el binario publicado. Un hook de escaneo insertado en silencio sería detectable en el siguiente release.",
    body2Start:
      "Aún no existe un informe de auditoría externa independiente. Cuando lo haya, se cita aquí. Hasta entonces, el estado honesto es: ",
    body2Status: "pendiente",
    terminal: {
      command: "useaegis handshake --verbose",
      kex: "Acuerdo de claves: X25519 (ECDH efímero por sesión)",
      aead: "Payload: XChaCha20-Poly1305",
      id: "Fingerprint Ed25519: 4F9A·22C1·88E0·B301·7D6F·12AA",
      seal: "Sealed sender: relay sin identidad de remitente",
      active: "> Cifrado activo — transporte: relay",
      oob: "> Verificación fuera de banda: pendiente de tu acción",
    },
  },

  limits: {
    eyebrow: "Modelo de amenaza",
    title: "Lo que Use Aegis no protege",
    body: "Esta lista importa tanto como la anterior. Todo está explícito en THREAT_MODEL.md, no en la letra pequeña. Ningún esquema protege lo que no puede proteger, y decirlo es parte del producto.",
    items: {
      metadata: {
        title: "Metadata de conexión con el relay",
        body: "El operador ve tu IP y el momento de conexión —aunque no a quién escribes. Mitigable con Tor; no integrado por defecto en el relay todavía.",
      },
      timing: {
        title: "Tamaño y timing de los mensajes",
        body: "Un observador de red puede inferir cuándo hay conversación y cuánto se envía, no el contenido. Sin padding de tamaño en v1.",
      },
      device: {
        title: "Dispositivo comprometido",
        body: "Malware, keylogger o acceso físico desbloqueado leen el mensaje donde está en claro: en tu pantalla. El cifrado en tránsito no ayuda ahí.",
      },
      coercion: {
        title: "Coerción",
        body: "Ninguna criptografía protege contra que te obliguen a desbloquear tu dispositivo o entregar tu clave bajo amenaza. Use Aegis protege datos, no personas.",
      },
    },
    footnote: "Detalle completo y actores considerados → THREAT_MODEL.md",
  },

  cta: {
    title: "Tus conversaciones son solo tuyas.",
    body: "Sin anuncios, sin rastreadores, sin cuentas. Entra, actúa, sal.",
    primary: "Crear identidad",
    secondary: "Ya tengo identidad",
  },

  footer: {
    tagline: "Una función, sin desvíos: mensajes cifrados que llegan. El servidor solo transporta ruido.",
    project: "Proyecto",
    sourceCode: "Código fuente",
    threatModel: "Modelo de amenaza",
    reproducibleBuilds: "Reproducible builds",
    community: "Comunidad",
    contribute: "Contribuir",
    announcements: "Anuncios",
    reportBug: "Reportar un fallo",
    security: "Seguridad (divulgación)",
    status: "Estado",
    relayUp: "Relay operativo",
    publicStats: "Estadísticas públicas →",
    externalAudit: "Auditoría externa: pendiente",
    hiddenService: "Servicio oculto (Tor)",
    openInTor: "Abrir en Tor Browser",
    copyright: "© 2026 Redder Labs · Código abierto y auditable",
    privacy: "Privacidad",
    terms: "Términos",
  },

  journey: {
    trigger: "Cómo viaja un mensaje →",
    dialogLabel: "Cómo viaja tu mensaje en Use Aegis",
    inviteEyebrow: "Primera visita",
    inviteTitle: "Antes de entrar, ¿te enseñamos algo?",
    inviteBodyStart: "Use Aegis no usa cookies. Pero sí queremos que veas una cosa: qué ve —y qué ",
    inviteBodyNot: "no",
    inviteBodyEnd: " ve— cada actor cuando envías un mensaje.",
    inviteCta: "Ver cómo viaja un mensaje →",
    inviteSkip: "Entrar directo",
    dontShowAgain: "No volver a mostrar",
    noCookies: "Sin cookies · Sin rastreo · Analítica anónima",
    demoEyebrow: "Transparencia",
    demoTitleStart: "Mira lo que el servidor ",
    demoTitleNot: "no",
    demoTitleEnd: " ve",
    yourMessage: "Tu mensaje",
    defaultMessage: "Hola",
    viaOnion: "Por .onion (Tor)",
    send: "Enviar ▷",
    replay: "Repetir ↻",
    legendPlain: "tu mensaje (legible)",
    legendNoise: "ruido cifrado",
    nodeYou: "Tú",
    nodeOnion: ".onion",
    nodeOnionSub: "Tor",
    nodeServer: "Servidor",
    nodeServerSub: "relay",
    nodePeer: "Tu contacto",
    serverSees: "Lo que ve el servidor",
    serverSeesDetailStart: "texto: ",
    serverSeesDetailMiddle: " · remitente: ",
    serverSeesDetailEnd: " · solo ",
    serverSeesNoise: "ruido con TTL",
    captions: {
      idle: "Pulsa “Enviar” para ver el viaje.",
      plain: "Tu mensaje, en claro, aquí en tu dispositivo.",
      encrypt: "① Se cifra aquí. Solo tu contacto podrá abrirlo.",
      onion: "② Sales por la puerta .onion — Tor oculta tu IP.",
      toServer: (step: string) => `${step} Viaja al servidor…`,
      serverBlind: "El servidor solo ve ruido. Ni el texto, ni de quién viene.",
      arrive: (step: string) => `${step} Llega al dispositivo de tu contacto…`,
      decrypt: (step: string) => `${step} Se descifra solo aquí. Vuelve a ser tu mensaje.`,
      done: "Listo. En todo el camino, solo viajó ruido.",
    },
  },

  privacy: {
    eyebrow: "Privacidad",
    title: "Qué ve y qué no ve Use Aegis",
    introStart:
      "La privacidad no es una promesa de marketing: es lo que el diseño técnico permite y lo que no. Aquí está sin letra pequeña. El detalle formal está en el ",
    introLink: "modelo de amenaza",
    introEnd: ".",
    draft:
      "Borrador honesto — describe el comportamiento real del software, no un texto legal cerrado. Se endurecerá con revisión antes de una versión pública definitiva.",
    cannotSee: {
      title: "Lo que el servidor NO puede ver",
      contentLead: "El contenido de tus mensajes.",
      contentBody:
        "Se cifran de extremo a extremo en tu dispositivo (XChaCha20-Poly1305); el servidor solo almacena un bloque opaco. Nadie en el servidor puede leerlos.",
      senderLead: "Quién te escribe (remitente oculto).",
      senderBody:
        "El buzón no guarda el remitente: su identidad viaja cifrada dentro del propio mensaje («sealed sender»).",
      identityLead: "Tu identidad personal.",
      identityBody:
        "No pedimos correo, teléfono ni nombre real. Tu identidad es una clave criptográfica generada en tu dispositivo. Tu clave privada nunca sale de él, salvo que tú exportes tu código de recuperación.",
      attachmentsLead: "Los adjuntos.",
      attachmentsBody:
        "Archivos y notas de voz se cifran con una clave propia por adjunto antes de subirse; el almacenamiento solo ve datos cifrados, nunca el nombre, el tipo ni el contenido.",
    },
    canSee: {
      title: "Lo que el servidor SÍ ve (y por qué)",
      intro:
        "Ser honestos sobre los límites importa tanto como cifrar. Con la conexión normal, el operador del servidor puede observar:",
      metadataLead: "Metadatos de conexión:",
      metadataBodyStart: " tu IP y el momento en que te conectas. Se elimina usando la conexión protegida por Tor (la app la ofrece como su propia dirección ",
      metadataBodyEnd: ").",
      timingLead: "Tamaño y momento de los mensajes:",
      timingBody:
        " un observador puede inferir que hay conversación y cuánto se envía, nunca el contenido. La app v1 no rellena el tamaño (padding).",
      mailboxLead: "A qué buzón se entrega en el instante del envío:",
      mailboxBody:
        " el envío va autenticado (anti-spam), así que el servidor podría correlacionar en ese momento. La conexión por Tor lo mitiga; los tokens ciegos son endurecimiento futuro.",
    },
    retention: {
      title: "Retención",
      body: "Los mensajes cifrados se retienen un tiempo limitado (por defecto ~30 días) para que puedas retomar la conversación al cambiar de dispositivo o de puerta (conexión normal ↔ Tor), y luego se borran automáticamente. Los adjuntos siguen la misma caducidad. No hay copias adicionales para nosotros: no podemos leer lo que se retiene.",
    },
    analytics: {
      title: "Analítica y terceros",
      body: "La app de mensajería no lleva ninguna analítica ni telemetría. La web pública de presentación puede usar Umami (analítica auto-hospedada, sin cookies y sin perfilado individual); si no está configurada, no se carga ningún script. No vendemos datos ni incluimos rastreadores de terceros.",
    },
    noBackdoor: {
      title: "Sin puerta trasera",
      body: "No hay forma de que recuperemos tu cuenta ni tus mensajes por ti: no tenemos tus claves. Si pierdes tu código de recuperación, nadie —tampoco nosotros— puede acceder a tu identidad. Es el precio de que nadie más pueda tampoco.",
    },
    contact: {
      title: "Contacto",
      bodyStart: "Dudas de privacidad o un problema de seguridad: usa el ",
      disclosureLink: "proceso de divulgación",
      bodyMiddle: " o abre una ",
      issueLink: "incidencia en el repositorio",
      bodyEnd: ".",
    },
  },

  terms: {
    eyebrow: "Términos",
    title: "Condiciones de uso",
    intro:
      "Use Aegis es software libre y un servicio best-effort. Estas condiciones dicen qué puedes esperar de él y qué no. En resumen: tu identidad es tuya, y el código es auditable.",
    draft:
      "Borrador honesto — no sustituye a un texto legal revisado. Se endurecerá antes de una versión pública definitiva.",
    foss: {
      title: "Software libre",
      bodyStart: "El código de Use Aegis es abierto y auditable, publicado bajo la licencia del ",
      link: "repositorio",
      bodyEnd:
        ". Puedes leerlo, verificarlo, ejecutarlo por tu cuenta y contribuir. No tienes que confiar en nuestra palabra: puedes comprobarlo.",
    },
    noWarranty: {
      title: "Sin garantías",
      body: "El software y el servicio se ofrecen «tal cual», sin garantías de ningún tipo. Aunque ponemos cuidado en la criptografía y la seguridad, no garantizamos que el servicio esté siempre disponible ni libre de errores. No respondemos por daños derivados del uso, en la medida que permita la ley.",
    },
    bestEffort: {
      title: "Servicio best-effort",
      body: "El relay público es un servicio de mejor esfuerzo, sin acuerdo de nivel de servicio (SLA): puede caerse, reiniciarse o cambiar. Como el código es abierto, cualquiera puede alojar su propio relay si necesita garantías propias.",
    },
    identity: {
      title: "Tu identidad y tus claves",
      body: "Tu identidad y tus claves se generan y viven en tu dispositivo. Eres responsable de custodiar tu contraseña y tu código de recuperación: no tenemos copia y no podemos recuperarlos por ti. No hay puerta trasera —ni para nosotros—. Perder el código de recuperación significa perder el acceso a esa identidad.",
    },
    acceptableUse: {
      title: "Uso aceptable",
      body: "Use Aegis protege la privacidad de tus comunicaciones; su uso responsable es cosa tuya. No lo utilices para actividades ilegales ni para dañar a terceros. La herramienta protege datos, no ampara conductas.",
    },
    userContent: {
      title: "Contenido y conducta de los usuarios",
      body: "Use Aegis no crea, aloja, publica ni distribuye contenido propio: transporta mensajes cifrados entre las personas que eligen comunicarse. Lo que se escribe, se envía o se comparte —textos, ficheros, audio— es responsabilidad exclusiva de quien lo origina y de quien lo transmite.",
      body2:
        "Ni el proyecto, ni quienes lo desarrollan, ni quienes operan un relay asumen responsabilidad alguna, civil, penal, administrativa o de cualquier otra índole, por el contenido, la conducta o los daños derivados del uso que terceros hagan de la herramienta, incluido su uso ilícito o fraudulento.",
    },
    intermediary: {
      title: "Somos transporte, no editor",
      body: "Los mensajes van cifrados de extremo a extremo: el relay ve sobres, no cartas. Ni el proyecto ni el operador de un relay pueden leer, revisar, filtrar ni moderar lo que circula, porque no tienen las claves. Esa imposibilidad es técnica, no una política que podamos levantar a petición de nadie.",
      body2:
        "El servicio actúa por tanto como mero intermediario técnico —transmisión y almacenamiento temporal—: no selecciona, no origina, no modifica los mensajes ni elige a sus destinatarios. Es el papel que la normativa de servicios de intermediación reserva a los transportistas de datos, y bajo el que se acoge a la exención de responsabilidad correspondiente. Ante el conocimiento efectivo de un contenido manifiestamente ilícito alojado en un relay propio, se actuará con diligencia para retirarlo.",
    },
    selfHosting: {
      title: "Instancias propias y .onion",
      body: "Use Aegis se publica precisamente para que cualquiera lo ejecute por su cuenta, incluso como servicio oculto .onion. Quien despliega su propia instancia pasa a ser su operador: le corresponde el cumplimiento legal de su jurisdicción y responde de esa instancia y de sus usuarios.",
      body2:
        "Los autores del software no son parte de esa relación y no tienen control, acceso ni visibilidad sobre instancias de terceros. Publicar una herramienta no convierte a quien la escribe en responsable de lo que otros hagan con ella.",
    },
    liability: {
      title: "Limitación de responsabilidad",
      body: "En la máxima medida que permita la ley aplicable, ni los autores, ni quienes contribuyen al código, ni quienes operan un relay responderán de daño alguno —directo, indirecto, incidental, especial o consecuente, incluidos lucro cesante, pérdida de datos o daño reputacional— derivado del uso o de la imposibilidad de uso de Use Aegis, aun habiendo sido advertidos de esa posibilidad.",
      body2:
        "Quien usa el servicio lo hace bajo su propia responsabilidad y mantendrá indemnes a autores y operadores frente a reclamaciones de terceros que traigan causa de su uso o del contenido que transmita.",
    },
    authorities: {
      title: "Requerimientos de autoridades y terceros",
      body: "El proyecto atenderá los requerimientos que le sean legalmente exigibles por una autoridad competente, dentro de lo que técnicamente exista. Conviene saber de antemano qué existe: no hay teléfonos, ni correos, ni nombres reales; el contenido va cifrado de extremo a extremo y las claves viven solo en los dispositivos; el sistema está diseñado para retener lo mínimo.",
      body2:
        "Colaborar no es aquí una cuestión de voluntad sino de posibilidad: no se puede entregar lo que no se tiene, ni descifrar lo que no se puede descifrar. Las solicitudes pueden dirigirse al contacto publicado en el repositorio.",
    },
    changes: {
      title: "Cambios",
      body: "Estas condiciones pueden actualizarse a medida que el proyecto madura. Los cambios relevantes se reflejarán aquí y en el historial del repositorio, que es público.",
    },
  },

  login: {
    subtitle: "Iniciar sesión",
    checkingDevice: "Comprobando dispositivo…",
    show: "Mostrar",
    hide: "Ocultar",
    password: "Contraseña",
    passwordPlaceholder: "Tu contraseña",
    repeatPassword: "Repite la contraseña",
    repeatPasswordPlaceholder: "Confírmala",
    passwordsDontMatchYet: "Las contraseñas no coinciden todavía.",
    gatewaySecure: "Conexión protegida (Tor)",
    gatewaySecureBody: " — el tráfico va por Tor y tu IP no es visible para el servidor.",
    gatewayNormal: "Conexión normal",
    gatewayNormalBody: " — tu IP es visible para el servidor.",
    gatewayNormalOnionStart: " Si hay censura o quieres anonimato, abre nuestra ",
    gatewayNormalOnionEnd: " en el Navegador Tor.",
    file: {
      title: "Tus llaves desde fichero (USB)",
      bodyStart: "Elige tu fichero ",
      bodyEnd:
        ". En modo portátil la identidad solo vive en memoria durante esta sesión: al cerrar no queda nada en este equipo.",
      choose: "Elegir fichero",
      none: "ningún fichero seleccionado",
      remember: "Recordar en este equipo",
      rememberOn: "Se guardarán tus llaves aquí",
      rememberOff: "Modo portátil: no se guarda nada",
      submit: "Entrar",
      submitBusy: "Desbloqueando…",
    },
    locked: {
      title: "Identidad protegida en este dispositivo",
      body: "Tu identidad está cifrada. Introduce tu contraseña para desbloquearla en esta sesión — nadie más puede usar esta identidad sin ella.",
      submit: "Desbloquear e iniciar sesión",
      submitBusy: "Desbloqueando…",
    },
    legacy: {
      title: "Identidad sin cifrar detectada",
      bodyStart: "Esta identidad estaba guardada ",
      bodyUnprotected: "sin protección",
      bodyEnd:
        ": cualquiera con acceso al equipo podía usarla. Protégela ahora con una contraseña para cifrarla. A partir de entonces se pedirá al entrar.",
      newPassword: "Nueva contraseña",
      submit: "Proteger e iniciar sesión",
      submitBusy: "Cifrando…",
    },
    import: {
      label: "Frase de recuperación",
      attachFile: "Adjuntar fichero",
      placeholder: "Pega tus 24 palabras, o adjunta tu fichero de recuperación (.txt)",
      passwordLabel: "Contraseña para proteger esta identidad",
      submit: "Importar y entrar",
      submitBusy: "Importando…",
    },
    empty: {
      body: "No hay ninguna identidad en este dispositivo. Crea una nueva o importa la tuya con tu frase de recuperación.",
      create: "Crear identidad",
      importPhrase: "Importar con frase de recuperación",
      fromFile: "Entrar desde fichero (USB)",
    },
    useAnother: "Usar otra identidad",
    crypto: "E2E · X25519 / XChaCha20-Poly1305",
    errors: {
      minPassphrase: (n: number) => `La contraseña debe tener al menos ${n} caracteres.`,
      passwordsDontMatch: "Las contraseñas no coinciden.",
      signatureRejected: "Firma rechazada por el servidor.",
      serverError: (status: number) => `El servidor respondió con un error (${status}).`,
      unknown: "Error desconocido.",
      cannotReadFile: "No se pudo leer el fichero.",
      wrongFileIsPhrase:
        "Ese fichero es tu FRASE de recuperación, no un keystore. He puesto tus 24 palabras aquí abajo: crea una contraseña y entra.",
    },
  },

  register: {
    title: "Crea tu identidad",
    subtitle: "Sin datos personales",
    logoAlt: "Use Aegis — inicio",
    imgAlt: "Use Aegis Secure Messaging",
    fixed: "Identidad fijada",
    generated: "Generada · se fija al confirmar",
    algo: "Ed25519 · 256b",
    controlTitle: "Solo tú tienes el control",
    controlBodyStart:
      "Tu identidad es un par de claves Ed25519 de 256 bits generado en este dispositivo. La clave privada se guarda ",
    controlBodyEncrypted: "cifrada con tu contraseña",
    controlBodyMiddle:
      " (Argon2id): sin ella, lo almacenado es ruido y nadie más puede usar tu identidad. Estas 16 letras son su ",
    controlBodyFingerprint: "huella pública",
    controlBodyEnd:
      ": sirven para reconocerla, no para iniciar sesión tecleándolas. Guarda tu frase de recuperación (24 palabras) para restaurarla en otro dispositivo, o exporta tus llaves a un USB.",
    handshake: "Handshake",
    handshakeInit: [
      "> Inicializando protocolos E2E…",
      "> Sembrando entropía desde el CSPRNG del sistema…",
      "> Derivando par de claves Ed25519 (256 bits)…",
    ],
    logKeyDerived: (fp: string) => `> Clave pública derivada · huella ${fp}`,
    logEncrypted: "> IDENTIDAD CIFRADA · protegida con tu contraseña (Argon2id)",
    logStored: "> Clave privada cifrada en almacén local · nunca sale del dispositivo",
    logSaveError: (msg: string) => `> ERROR al guardar: ${msg}`,
    logRecoveryExported: "> Exportación de la frase de recuperación: OK",
    logKeystoreExported: "> Exportación de tus llaves cifradas (USB): OK",
    logKeystoreError: (msg: string) => `> ERROR al exportar tus llaves: ${msg}`,
    protectTitle: "Protege tu identidad",
    protectBodyStart:
      "La clave privada se cifra con esta contraseña (Argon2id) antes de guardarse. Se pedirá cada vez que inicies sesión. ",
    protectBodyStrong: "No hay forma de recuperarla si la olvidas",
    protectBodyEnd: " — para eso está la frase de recuperación.",
    generatorTitle: "Generar contraseña segura",
    recommended: "recomendado",
    length: "Longitud",
    symbols: "Símbolos (!&*)",
    generate: "Generar contraseña",
    generatorNote:
      "Se rellena arriba y se muestra para que la copies. Guárdala en tu gestor de contraseñas: no hay forma de recuperarla si la pierdes.",
    showPassword: "Mostrar contraseña",
    hidePassword: "Ocultar contraseña",
    passwordPlaceholder: (n: number) => `Contraseña (mín. ${n} caracteres)`,
    repeatPlaceholder: "Repite la contraseña",
    phraseTitle: "Tu frase de recuperación",
    phraseCopied: "Copiada ✓",
    phraseBodyStart: "Estas ",
    phraseBodyStrong: "24 palabras, en este orden",
    phraseBodyEnd:
      ", SON tu identidad. Anótalas en papel y guárdalas en un sitio seguro: es la única forma de restaurarla en otro dispositivo, y nadie —tampoco nosotros— puede recuperarla si las pierdes.",
    downloadRecovery: "Descargar recuperación",
    confirm: "Confirmar identidad",
    confirmed: "Identidad establecida ✓",
    regenerate: "Regenerar identidad",
    exportKeystore: "Exportar tus llaves cifradas a fichero (USB)",
    goLogin: "Iniciar sesión →",
    haveIdentity: "← Ya tengo una identidad",
    recoveryFile: {
      header: "USE AEGIS — Frase de recuperación de identidad",
      fingerprint: (fp: string) => `Huella pública: ${fp}`,
      phraseLabel: "Frase de recuperación (24 palabras — mantenla en secreto, es tu clave privada):",
      footer1:
        "Con estas 24 palabras, EN ESTE ORDEN, puedes restaurar tu identidad en otro dispositivo.",
      footer2: "No hay servidor con tus claves: si la pierdes, nadie puede recuperarla por ti.",
      filename: (fp: string) => `useaegis-recuperacion-${fp}.txt`,
    },
  },

  gate: {
    acceso: {
      phase: "Fase 1 · Acceso",
      title: "Verificando identidad",
      subtitle: "Comprobando que la sesión y el almacén local son válidos.",
    },
    canal: {
      phase: "Fase 2 · Canal",
      title: "Asegurando el canal",
      subtitle: "Estableciendo el cifrado extremo a extremo y comprobando la sesión.",
    },
    checks: {
      sessionStarted: "Sesión iniciada en este dispositivo",
      validIdentity: "Identidad de 16 caracteres válida",
      localStorage: "Guardado local disponible",
      csprng: "Generador seguro de aleatoriedad disponible",
      e2e: "Cifrado de extremo a extremo · X25519 / XChaCha20-Poly1305",
      sealedSender: "Remitente oculto activo",
      protectedSession: "Sesión protegida · sin rastro al cerrar",
      protectedSessionHint: "Se activa entrando por Tor",
    },
    verifying: "Comprobando…",
    verified: "Verificado",
    verifiedWithWarnings: "Verificado · sin conexión protegida",
  },

  shell: {
    nav: {
      channel: "Canal",
      contacts: "Contactos",
      vault: "Bóveda",
      transport: "Transporte",
      settings: "Ajustes",
    },
    sessionVerified: "Sesión verificada",
    sessionUnprotected: "Sesión sin proteger",
    secureSession: "Sesión segura",
    encryptionVerified: "Cifrado verificado",
    noAutoWipe: "Sin borrado automático",
    yourIdentity: "Tu identidad",
    copyId: "Copiar id",
    lockSession: "Bloquear sesión",
  },

  channel: {
    conversationWith: "Conversación con",
    noContactsYet: "Sin contactos todavía",
    addContact: "+ Añadir",
    byName: "Por nombre",
    byQr: "Por QR",
    handlePlaceholder: "nombre de usuario (p. ej. alicia)",
    searching: "Buscando…",
    addNote:
      "Descargamos su llave de cifrado y comprobamos que es de verdad suya antes de guardarla. El buzón es el mismo por conexión normal y protegida (Tor).",
    pendingRequests: (n: number) =>
      `Tienes ${n} ${n === 1 ? "solicitud" : "solicitudes"} de contacto`,
    seeRequests: "Ver →",
    e2eBanner:
      "Solo tú y tu contacto podéis leerlo · cifrado de extremo a extremo · XChaCha20-Poly1305",
    emptyNoContacts: "No tienes contactos todavía.",
    emptyNoContactsHint:
      "Pulsa «+ Añadir» e introduce el nombre de usuario de otra persona para empezar.",
    emptyNoMessages: (who: string) => `Sin mensajes con ${who} todavía.`,
    emptyNoMessagesHint: "Escribe abajo para enviar el primero.",
    sent: "Enviado",
    received: "Recibido",
    encryptedHere: "Se cifra en tu dispositivo · XChaCha20-Poly1305",
    attachTitle: "Adjuntar archivo (cifrado de extremo a extremo)",
    sendTitle: "Enviar",
    placeholderAttaching: "Cifrando y enviando archivo…",
    placeholderReady: "Transmitir mensaje…",
    placeholderNoContact: "Elige o añade un contacto para empezar",
    voiceNote: "Nota de voz",
    decrypting: "Descifrando…",
    playHint: "reproducir",
    downloadHint: "descargar",
    playTitle: "Reproducir (descarga y descifra)",
    downloadTitle: "Descargar y descifrar",
    aside: {
      title: "Estado de la sesión",
      connection: "Conexión",
      connectionSecure: "Protegida (Tor)",
      connectionNormal: "Normal",
      contentEncryption: "Cifrado de contenido",
      sender: "Remitente",
      senderSealed: "Remitente oculto",
      verifiedContacts: "Contactos verificados",
    },
    errors: {
      loadVoiceNote: "No se pudo cargar la nota de voz.",
      downloadFile: "No se pudo descargar el archivo.",
      sendMessage: "No se pudo enviar el mensaje.",
      sendFile: "No se pudo enviar el archivo.",
      tooLarge: (name: string, max: string) => `⚠️ «${name}» supera el límite de ${max}.`,
      usernameNotFound: (handle: string) =>
        `No existe ningún usuario con el nombre de usuario «${handle}».`,
      addContact: "No se pudo añadir el contacto.",
      noSession: "Sesión no disponible.",
      ownQr: "Ese QR es el tuyo: no puedes añadirte a ti mismo.",
      qrIdentityNotFound:
        "No encontramos esa identidad. ¿El QR es correcto y esa persona ya se registró?",
    },
  },

  contacts: {
    title: "Contactos",
    subtitle:
      "Tu libreta es local a este dispositivo; los bloqueos los impone el servidor (valen por conexión normal y protegida).",
    requests: (n: number) => `Solicitudes de contacto · ${n}`,
    requestsHint:
      "Estas personas te han escrito y aún no las tienes en contactos. Acéptalas para poder responder, o bloquéalas.",
    accept: "Aceptar",
    block: "Bloquear",
    mine: (n: number) => `Mis contactos · ${n}`,
    emptyTitle: "No tienes contactos todavía.",
    emptyHint: "Añade a alguien desde el Canal por su nombre de usuario, o acepta una solicitud.",
    write: "Escribir",
    remove: "Eliminar",
    blockedTitle: (n: number) => `Bloqueados · ${n}`,
    blockedHint: "No pueden dejarte mensajes. Ellos no saben que están bloqueados.",
    unblock: "Desbloquear",
    actionFailed: "No se pudo completar la acción.",
    noSession: "Sesión no disponible.",
  },

  vault: {
    title: "Bóveda de privacidad",
    serverDataLabel: "Datos que guarda el servidor: ",
    serverDataValue: "mínimos",
    plaintextStored: "Contenido en claro guardado",
    zeroBytes: "0 bytes",
    healthTitle: "Salud del cifrado",
    health: {
      content: "Cifrado de contenido",
      kex: "Acuerdo de claves",
      kexValue: "X25519 (ECDH por sesión)",
      identity: "Identidad / firma",
      sender: "Remitente frente al servidor",
    },
    healthNote:
      "Usamos criptografía estándar y auditada (libsodium). No inventamos cifrado propio. El cifrado es el mismo vaya por donde vaya el mensaje.",
    backupTitle: "Respaldo de identidad",
    downloadIdentity: "Descargar identidad",
    backupNote: "Sin recuperación centralizada: si la pierdes, no hay forma de regenerarla.",
    keysTitle: "Claves activas",
    keys: {
      identityTag: "IDENTIDAD",
      identityNote: "estable, tu identidad",
      sessionTag: "SESIÓN",
      sessionNote: "efímera, por conversación",
    },
    keysNote:
      "Ningún servidor guarda tus claves: viven solo en tu dispositivo. Sin RSA ni hardware especial, solo criptografía moderna (curvas elípticas).",
    file: {
      header: "USE AEGIS — Identidad",
      line1: "Guárdala en un lugar seguro. Es tu única forma de recuperar el acceso.",
      line2: "No hay servidor con tus claves: nadie puede regenerarla por ti.",
      filename: (id: string) => `useaegis-identidad-${id}.txt`,
    },
  },

  transportPage: {
    title: "Estado del transporte",
    checkedAt: (time: string) => ` · comprobado ${time}`,
    statusOk: "Operativo",
    statusDown: "Inalcanzable",
    statusProbing: "Sondeando…",
    tileGateway: "Puerta",
    tileRelay: "Relay",
    tileDb: "Base de datos",
    tileTtl: "Sesión expira en",
    expired: "expirada",
    onionUnreachableTitle: "Circuito .onion no disponible",
    onionUnreachableBodyStart: "Estás en la puerta ",
    onionUnreachableBodyMiddle:
      " pero el relay no responde por Tor. El circuito puede tardar unos segundos en abrir tras cargar la página: reintenta. Si abriste esta ",
    onionUnreachableBodyEnd:
      " fuera del Navegador Tor, no habrá circuito. No es que el relay esté caído.",
    relayDownTitle: "Relay inalcanzable",
    relayDownNoResponse:
      "No hubo respuesta del relay por esta puerta. Reintenta; si persiste, comprueba que el nodo está levantado.",
    relayDownGeneric: "Error contactando con el relay.",
    disclosureStart:
      "El contenido viaja cifrado extremo a extremo (XChaCha20-Poly1305) y el relay no conoce remitente ni destinatario (sealed sender). ",
    disclosureOnionStart: "Tu conexión va por ",
    disclosureOnionEnd: ": tu IP no es visible para el relay.",
    disclosureClearStart: "Tu IP sí es visible para el relay",
    disclosureClearEnd: " salvo que uses la puerta ",
    disclosureClearTail: " bajo Tor.",
    cards: {
      contentTitle: "Contenido",
      contentBody:
        "Payload cifrado indistinguible de bytes aleatorios; el transporte solo mueve ruido.",
      senderTitle: "Remitente",
      senderBody: "Sealed sender: el relay entrega el blob sin saber quién lo originó.",
      recipientTitle: "Destinatario",
      recipientBody:
        "El destino es una clave de sesión efímera (X25519), no una cuenta ni un directorio.",
    },
  },

  settings: {
    title: "Ajustes",
    username: {
      title: "Tu nombre de usuario",
      bodyStart:
        "Es el nombre público con el que te añaden como contacto. Lo generamos por ti (una palabra + un número) para que sea único. ",
      bodyStrong: "Se elige una sola vez y queda fijo: no se puede cambiar después.",
      current: "Ahora mismo",
      none: "Todavía no tienes nombre. Elige uno para que puedan añadirte.",
      fixedStart: "Tu nombre de usuario es ",
      fixedWord: "definitivo",
      fixedMiddle: ". Comparte tu ",
      fixedEnd: " completo para que te añadan como contacto.",
      proposed: "Tu nombre propuesto",
      regenerate: "Regenerar",
      useThis: "Usar este",
      warning: "Elige con calma: una vez lo confirmes con «Usar este», no podrás cambiarlo.",
      saved: "Guardado ✓ · comparte tu @nombre completo para que te añadan.",
      noFreeName: "No conseguimos reservar un nombre libre. Prueba «Regenerar» y de nuevo.",
      saveFailed: "No se pudo guardar el nombre.",
    },
    qr: {
      title: "Tu código QR",
      body: "Otra persona te añade escaneándolo con su móvil (o subiendo una foto). Tu llave viaja dentro del código, así que no depende de que el servidor diga la verdad: al añadirte se comprueba tu llave de cifrado.",
      unavailable: "No disponible.",
      noHandleWarning:
        "Aún no tienes @nombre: el QR ya funciona, pero elige uno arriba para que tu nombre se muestre a quien te añada.",
      copyCode: "Copiar código",
      copiedCode: "Copiado",
      downloadQr: "Descargar QR",
    },
    connection: {
      title: "Conexión",
      bodyStart:
        "La decide la dirección por la que abriste la app: no hay nada que activar. Para el modo protegido, abre la ",
      bodyEnd: " en el Navegador Tor.",
      secure: "Conexión protegida (Tor)",
      normal: "Conexión normal",
      secureNote: "Tu conexión va por Tor; tu IP no es visible para el servidor.",
      normalNote: "Tu IP es visible para el servidor.",
      onionInviteStart: " Para más anonimato o si hay censura, abre nuestra ",
      onionInviteEnd: " en el Navegador Tor.",
    },
    identity: {
      title: "Tu identidad",
      copyId: "Copiar id",
    },
    about: {
      title: "Acerca de",
      language: "Idioma",
      encryption: "Cifrado",
      code: "Código",
      codeValue: "Abierto y auditable",
      audit: "Auditoría externa",
      auditValue: "Pendiente",
    },
    file: {
      header: "USE AEGIS — Huella pública de identidad",
      body: "Esta es la huella PÚBLICA de tu identidad (sirve para reconocerte o compartirte).\nNO sirve para recuperar el acceso: para eso está la frase de recuperación\n(24 palabras) que guardaste al crear la identidad.",
      filename: (id: string) => `useaegis-huella-${id}.txt`,
    },
  },

  qr: {
    generating: "Generando QR…",
    generateFailed: "No se pudo generar el QR.",
    pastePlaceholder: "Pega el código del QR (aegis://contact…)",
    uploadImage: "Subir una imagen del QR",
    note: "La imagen se lee en tu dispositivo (no se sube a ningún sitio). Comprobamos su llave de cifrado antes de guardar.",
    invalidCode: "Ese código no es un QR de contacto de Use Aegis válido.",
    noQrInImage: "No encontramos ningún QR legible en esa imagen.",
    unreadableImage: "No pudimos leer esa imagen.",
    addFailed: "No se pudo añadir el contacto.",
  },

  voice: {
    recordTitle: "Grabar nota de voz (cifrada de extremo a extremo)",
    cancelTitle: "Cancelar grabación",
    sendTitle: "Enviar nota de voz",
    filename: "nota-de-voz",
    noRecording: "Este navegador no permite grabar audio.",
    micDenied: "No se pudo acceder al micrófono (permiso denegado).",
    unsupported: "Este navegador no soporta la grabación de audio.",
  },

  /** Errores lanzados desde `lib/` (fuera de React). Ver `lib/i18n/runtime.ts`. */
  errors: {
    relayUnreachableOnion:
      "No se pudo contactar con el servidor por Tor. El circuito .onion puede tardar unos segundos en abrir; reintenta. Un bloqueador del navegador también puede estar cortando la petición.",
    relayUnreachableClearnet:
      "No se pudo contactar con el servidor. Comprueba tu conexión y que ningún bloqueador del navegador corta la petición.",
    serverStatus: (status: number) => `El servidor respondió ${status}.`,
    genericStatus: (status: number) => `Error ${status}`,
    unknown: "Error desconocido.",
    mediaTooLarge: "El archivo es demasiado grande para enviarlo por el relay.",
    mediaUnconfigured: "Este servidor no tiene los adjuntos habilitados; solo admite mensajes de texto.",
    storageUnavailable: "El almacén de adjuntos no respondió. Vuelve a intentarlo en unos segundos.",
    rateLimited: "Demasiadas peticiones seguidas. Espera unos segundos y reintenta.",
    gatewayOnion:
      "Estás en la conexión protegida (Tor): el tráfico va por Tor y tu IP no es visible para el servidor.",
    gatewayClearnetWithOnion:
      "Estás en la conexión normal. Si hay censura o quieres anonimato, abre nuestra .onion en el Navegador Tor.",
    gatewayClearnet: "Estás en la conexión normal. Tu IP es visible para el servidor.",
    identityLocked: "Identidad bloqueada. Desbloquea con tu passphrase.",
    wrongPassphrase: "Passphrase incorrecta.",
    noKeystore: "No hay un keystore cifrado en este dispositivo.",
    noKeystoreToExport: "No hay un keystore cifrado que exportar.",
    noLegacyIdentity: "No hay una identidad sin cifrar que migrar.",
    keystoreCorrupt: "El keystore está corrupto (la clave no coincide).",
    keystoreCorruptKey: "Keystore corrupto (clave pública inválida).",
    notAKeystore: "El fichero no es un keystore de Use Aegis válido.",
    invalidSeed: "Semilla inválida (se esperan 32 bytes).",
    invalidRecoveryCode: "Código de recuperación inválido.",
    invalidRecoveryCodeBytes: "Código de recuperación inválido (se esperan 32 bytes).",
    invalidPhrase: "La frase de recuperación no es válida. Revisa las palabras y su orden.",
    phraseWrongLength: (n: number) => `Una frase de recuperación de Use Aegis tiene ${n} palabras.`,
    phraseNotAegis: "La frase no corresponde a una identidad de Use Aegis.",
    phraseNotFoundInFile:
      "No se encontró una frase de recuperación en el fichero. Pega tus 24 palabras o adjunta tu fichero de recuperación (.txt).",
    invalidPublicKey: "Clave pública inválida: no es una identidad Ed25519 de 32 bytes.",
    invalidPeerKey: "Clave pública X25519 del peer inválida (se esperan 32 bytes).",
    invalidSenderSignature: "Firma del remitente inválida.",
    noPrekey: "Ese usuario aún no ha publicado su llave de cifrado; no se puede añadir.",
  },

  /**
   * Cuota de almacenamiento de adjuntos. Regla de producto (§2 y §8 del diseño de cuotas): lo
   * PRIMERO que se dice es que la mensajería no está rota —el límite solo afecta a los adjuntos—
   * y lo segundo, la salida gratuita con fecha. Nunca se amenaza con borrar la cuenta.
   */
  quota: {
    /** Separador decimal para tamaños ("1,5 GB" en español, "1.5 GB" en inglés). */
    decimalSeparator: ",",
    months: [
      "enero",
      "febrero",
      "marzo",
      "abril",
      "mayo",
      "junio",
      "julio",
      "agosto",
      "septiembre",
      "octubre",
      "noviembre",
      "diciembre",
    ],
    /** "el 12 de septiembre" */
    day: (dayOfMonth: number, month: string) => `el ${dayOfMonth} de ${month}`,
    exceeded: (cap: string) =>
      `Has llenado tu espacio de adjuntos${cap}. Tus mensajes de texto siguen funcionando ` +
      `con normalidad: esto solo afecta a archivos y notas de voz.`,
    recovers: (base: string, amount: string, day: string) =>
      `${base} Recuperas ${amount} ${day}, cuando expiren tus adjuntos más antiguos.`,
    recoversGeneric: (base: string) =>
      `${base} El espacio se libera solo según van expirando tus adjuntos más antiguos.`,
    dailyLimit: (cap: string) =>
      `Has alcanzado el límite de subida${cap}. Puedes seguir enviando texto; los adjuntos se reanudan mañana.`,
    dailyCapToday: (size: string) => ` de hoy (${size})`,
    dailyCapTodayPlain: " de hoy",
  },

  metadata: {
    home: {
      title: "Use Aegis — El servidor solo transporta ruido",
      description:
        "Mensajería cifrada extremo a extremo, de código abierto y auditable. La alternativa a WhatsApp y Telegram: sin perfiles, sin telemetría, sin cuentas. El servidor solo transporta ruido.",
      ogDescription:
        "Mensajería cifrada extremo a extremo, de código abierto y auditable. Sin perfiles, sin telemetría, sin cuentas.",
    },
    privacy: {
      title: "Privacidad · Use Aegis",
      description:
        "Qué ve y qué no ve Use Aegis. Cifrado de extremo a extremo, remitente oculto y sin datos personales.",
    },
    terms: {
      title: "Términos · Use Aegis",
      description:
        "Condiciones de uso de Use Aegis: software libre, sin garantías, y tu identidad bajo tu control.",
    },
    keywords: [
      "mensajería cifrada",
      "cifrado de extremo a extremo",
      "código abierto",
      "auditable",
      "alternativa a WhatsApp",
      "alternativa a Telegram",
      "alternativa a apps de código cerrado",
      "mensajería privada",
      "mensajería de código abierto",
      "sin metadatos",
      "sin telemetría",
      "privacidad",
      "comunicación segura",
      "Tor",
      ".onion",
      "encrypted messaging",
      "end-to-end encryption",
      "open source messenger",
      "auditable messaging",
      "WhatsApp alternative",
      "Telegram alternative",
      "use aegis app",
      "aegis app",
      "use aegis",
      "useaegis",
      "useaegis.app",
    ],
  },
};

// SIN `as const` a propósito: así los literales se ensanchan a `string` y `Dictionary` describe la
// FORMA, no los textos concretos. Con `as const`, `en` tendría que repetir el castellano literal.
export default es;
