/**
 * Diccionario EN. `satisfies Dictionary` obliga a que tenga EXACTAMENTE las mismas claves que el
 * español: si se añade una cadena en `es.ts` y falta aquí, `pnpm typecheck` falla.
 */
import type { Dictionary } from "../types";

const en = {
  common: {
    cancel: "Cancel",
    close: "Close",
    copy: "Copy",
    copied: "Copied",
    copiedShort: "Copied",
    download: "Download",
    add: "Add",
    retry: "Retry",
    loading: "Loading…",
    checking: "Checking…",
    saving: "Saving…",
    pending: "Pending",
    language: "Language",
    switchLanguage: "Switch language",
  },

  nav: {
    howItProtects: "How it protects",
    transport: "Transport",
    torSession: "Tor session",
    limits: "What it doesn't protect",
    login: "Sign in",
    createIdentity: "Create identity",
  },

  hero: {
    badge: "Open source · External audit pending",
    titleLine1: "The server never sees the sender,",
    titleLine2: "the recipient, or the content.",
    titleAccent: "It only carries noise.",
    body: "Use Aegis does exactly one thing, precisely: deliver an end-to-end encrypted message. No profiles, no statuses, no telemetry. The less time you spend looking at it, the better it's working.",
    ctaPrimary: "Create identity",
    ctaSecondary: "How it works",
    noAccount: "No account · No phone number · No email",
    fingerprintLabel: "Identity fingerprint",
    verified: "Verified",
    fingerprintNote:
      "Ed25519. You compare it in person or over a channel you already trust — verifying is your action, not something software can force.",
    sealedSenderActive: "Sealed sender active",
  },

  protects: {
    eyebrow: "Encryption layer",
    title: "How your content is protected",
    body: "Audited libsodium primitives. No home-grown cryptography. The encryption is identical no matter which path the message takes.",
    items: {
      aead: {
        title: "Authenticated payload encryption",
        body: "Text, audio and —later— files. Authenticated: any tampering with the message is detected.",
      },
      identity: {
        title: "Identity and key agreement",
        body: "A key pair is your stable identity. Per-session key agreement over ECDH. No accounts, no central directory.",
      },
      stream: {
        title: "Chunked streaming encryption",
        body: "Long audio and files are encrypted and decrypted in chunks, without loading the whole blob. Reordering and truncation are detected.",
      },
      sealed: {
        title: "The relay doesn't know the sender",
        body: "The server delivers encrypted blobs without knowing who originated them. If it gets seized, there is no content and no identity to hand over.",
      },
    },
  },

  transports: {
    eyebrow: "Swappable transport",
    title: "Three paths, one encryption",
    body: "The transport only decides availability and latency, never the security of the content. If one goes down, the next takes over with nothing for you to do. The status dot in the header changes colour; that's all.",
    relay: {
      name: "Relay",
      body: "Redder Labs' central server. Best latency, immediate delivery. A queue of encrypted blobs: no private keys, no plaintext. Also reachable as a .onion service (Tor v3), resistant to DNS/IP blocking.",
    },
    p2p: {
      name: "P2P · libp2p",
      body: "No central relay: browser to browser over WebRTC, encrypted with Noise. Your contact is located by their PeerID —derived from their public key, with no directory to query— through a signalling node that never sees the content. It kicks in automatically if the relay is blocked or censored.",
    },
    mesh: {
      name: "Local mesh",
      body: "BLE / Wi-Fi Aware. No internet, no infrastructure: the message hops from device to device until it reaches its destination.",
    },
  },

  secureSession: {
    eyebrow: "Protected session",
    title: "For a safer conversation, come in over Tor",
    bodyStart: "On the normal door (clearnet) your content is still end-to-end encrypted, but your ",
    bodyIpVisible: "IP is visible to the relay",
    bodyMiddle: ". For maximum privacy, come in through our ",
    bodyEnd: ": traffic goes over Tor and your IP stops being visible. You'll need the ",
    torBrowser: "Tor Browser",
    steps: {
      install: {
        title: "Install Tor Browser",
        body: "Download it from the official Tor Project site. It's free and open source.",
      },
      open: {
        title: "Open our .onion",
        body: "Paste the .onion address into Tor Browser. The whole app loads over Tor.",
      },
      import: {
        title: "Import your identity and sign in",
        body: "With your recovery phrase. Same identity = same conversation.",
      },
    },
    downloadTor: "Download Tor Browser ↗",
    openOnion: "Open the .onion (with Tor)",
    copyOnion: "Copy .onion address",
    copiedOnion: "Copied ✓",
    onionInSettings: "The .onion address is shown in Settings once you're in.",
  },

  handshake: {
    eyebrow: "Handshake",
    title: "Nothing you can't verify",
    body1:
      "The client is open source and the build is reproducible: anyone can compile from source and compare hashes against the published binary. A scanning hook slipped in quietly would be detectable in the next release.",
    body2Start:
      "There is no independent external audit report yet. When there is one, it will be cited here. Until then, the honest status is: ",
    body2Status: "pending",
    terminal: {
      command: "useaegis handshake --verbose",
      kex: "Key agreement: X25519 (ephemeral ECDH per session)",
      aead: "Payload: XChaCha20-Poly1305",
      id: "Ed25519 fingerprint: 4F9A·22C1·88E0·B301·7D6F·12AA",
      seal: "Sealed sender: relay holds no sender identity",
      active: "> Encryption active — transport: relay",
      oob: "> Out-of-band verification: awaiting your action",
    },
  },

  limits: {
    eyebrow: "Threat model",
    title: "What Use Aegis does not protect",
    body: "This list matters as much as the previous one. It's all spelled out in THREAT_MODEL.md, not buried in fine print. No scheme protects what it cannot protect, and saying so is part of the product.",
    items: {
      metadata: {
        title: "Connection metadata with the relay",
        body: "The operator sees your IP and when you connect —though not who you write to. Mitigated with Tor; not yet integrated into the relay by default.",
      },
      timing: {
        title: "Message size and timing",
        body: "A network observer can infer that a conversation is happening and how much is sent, not the content. No size padding in v1.",
      },
      device: {
        title: "Compromised device",
        body: "Malware, a keylogger or unlocked physical access read the message where it's in the clear: on your screen. Encryption in transit doesn't help there.",
      },
      coercion: {
        title: "Coercion",
        body: "No cryptography protects you from being forced to unlock your device or hand over your key under threat. Use Aegis protects data, not people.",
      },
    },
    footnote: "Full detail and the actors considered → THREAT_MODEL.md",
  },

  cta: {
    title: "Your conversations are yours alone.",
    body: "No ads, no trackers, no accounts. Come in, do what you came for, leave.",
    primary: "Create identity",
    secondary: "I already have an identity",
  },

  footer: {
    tagline:
      "One job, no detours: encrypted messages that arrive. The server only carries noise.",
    project: "Project",
    sourceCode: "Source code",
    threatModel: "Threat model",
    reproducibleBuilds: "Reproducible builds",
    community: "Community",
    contribute: "Contribute",
    announcements: "Announcements",
    reportBug: "Report a bug",
    security: "Security (disclosure)",
    status: "Status",
    relayUp: "Relay operational",
    publicStats: "Public statistics →",
    externalAudit: "External audit: pending",
    hiddenService: "Hidden service (Tor)",
    openInTor: "Open in Tor Browser",
    copyright: "© 2026 Redder Labs · Open source and auditable",
    privacy: "Privacy",
    terms: "Terms",
  },

  journey: {
    trigger: "How a message travels →",
    dialogLabel: "How your message travels in Use Aegis",
    inviteEyebrow: "First visit",
    inviteTitle: "Before you go in, can we show you something?",
    inviteBodyStart:
      "Use Aegis doesn't use cookies. But there is one thing we'd like you to see: what each actor sees —and what they ",
    inviteBodyNot: "don't",
    inviteBodyEnd: " see— when you send a message.",
    inviteCta: "See how a message travels →",
    inviteSkip: "Go straight in",
    dontShowAgain: "Don't show this again",
    noCookies: "No cookies · No tracking · Anonymous analytics",
    demoEyebrow: "Transparency",
    demoTitleStart: "Look at what the server ",
    demoTitleNot: "doesn't",
    demoTitleEnd: " see",
    yourMessage: "Your message",
    defaultMessage: "Hello",
    viaOnion: "Over .onion (Tor)",
    send: "Send ▷",
    replay: "Replay ↻",
    legendPlain: "your message (readable)",
    legendNoise: "encrypted noise",
    nodeYou: "You",
    nodeOnion: ".onion",
    nodeOnionSub: "Tor",
    nodeServer: "Server",
    nodeServerSub: "relay",
    nodePeer: "Your contact",
    serverSees: "What the server sees",
    serverSeesDetailStart: "text: ",
    serverSeesDetailMiddle: " · sender: ",
    serverSeesDetailEnd: " · only ",
    serverSeesNoise: "noise with a TTL",
    captions: {
      idle: "Press “Send” to watch the journey.",
      plain: "Your message, in the clear, here on your device.",
      encrypt: "① Encrypted right here. Only your contact can open it.",
      onion: "② You leave through the .onion door — Tor hides your IP.",
      toServer: (step: string) => `${step} Travelling to the server…`,
      serverBlind: "The server only sees noise. Not the text, not who it's from.",
      arrive: (step: string) => `${step} Arriving at your contact's device…`,
      decrypt: (step: string) => `${step} Decrypted only here. It's your message again.`,
      done: "Done. All along the way, only noise travelled.",
    },
  },

  privacy: {
    eyebrow: "Privacy",
    title: "What Use Aegis sees and what it doesn't",
    introStart:
      "Privacy isn't a marketing promise: it's what the technical design allows and what it doesn't. Here it is, without fine print. The formal detail lives in the ",
    introLink: "threat model",
    introEnd: ".",
    draft:
      "Honest draft — it describes the software's real behaviour, not a settled legal text. It will be hardened with review before a definitive public version.",
    cannotSee: {
      title: "What the server CANNOT see",
      contentLead: "The content of your messages.",
      contentBody:
        "They are end-to-end encrypted on your device (XChaCha20-Poly1305); the server only stores an opaque block. Nobody on the server can read them.",
      senderLead: "Who writes to you (sealed sender).",
      senderBody:
        "The mailbox doesn't store the sender: their identity travels encrypted inside the message itself (“sealed sender”).",
      identityLead: "Your personal identity.",
      identityBody:
        "We don't ask for an email, a phone number or a real name. Your identity is a cryptographic key generated on your device. Your private key never leaves it, unless you export your recovery code yourself.",
      attachmentsLead: "Attachments.",
      attachmentsBody:
        "Files and voice notes are encrypted with their own per-attachment key before upload; storage only ever sees encrypted data — never the name, the type or the content.",
    },
    canSee: {
      title: "What the server DOES see (and why)",
      intro:
        "Being honest about the limits matters as much as encrypting. Over a normal connection, the server operator can observe:",
      metadataLead: "Connection metadata:",
      metadataBodyStart:
        " your IP and when you connect. This goes away over the Tor-protected connection (the app offers it as its own ",
      metadataBodyEnd: " address).",
      timingLead: "Message size and timing:",
      timingBody:
        " an observer can infer that a conversation is happening and how much is sent, never the content. The v1 app does not pad message size.",
      mailboxLead: "Which mailbox a message is delivered to at send time:",
      mailboxBody:
        " sending is authenticated (anti-spam), so the server could correlate at that moment. Connecting over Tor mitigates this; blind tokens are future hardening.",
    },
    retention: {
      title: "Retention",
      body: "Encrypted messages are retained for a limited time (~30 days by default) so you can pick a conversation back up when you switch device or door (normal connection ↔ Tor), and are then deleted automatically. Attachments follow the same expiry. There are no extra copies for us: we cannot read what is retained.",
    },
    analytics: {
      title: "Analytics and third parties",
      body: "The messaging app carries no analytics and no telemetry whatsoever. The public marketing site may use Umami (self-hosted, cookieless analytics with no individual profiling); if it isn't configured, no script is loaded at all. We don't sell data and we don't embed third-party trackers.",
    },
    noBackdoor: {
      title: "No backdoor",
      body: "There is no way for us to recover your account or your messages for you: we don't have your keys. If you lose your recovery code, nobody —us included— can reach your identity. That's the price of nobody else being able to either.",
    },
    contact: {
      title: "Contact",
      bodyStart: "Privacy questions or a security problem: use the ",
      disclosureLink: "disclosure process",
      bodyMiddle: " or open an ",
      issueLink: "issue in the repository",
      bodyEnd: ".",
    },
  },

  terms: {
    eyebrow: "Terms",
    title: "Terms of use",
    intro:
      "Use Aegis is free software and a best-effort service. These terms say what you can expect from it and what you can't. In short: your identity is yours, and the code is auditable.",
    draft:
      "Honest draft — it does not replace a reviewed legal text. It will be hardened before a definitive public version.",
    foss: {
      title: "Free software",
      bodyStart: "The Use Aegis code is open and auditable, published under the licence in the ",
      link: "repository",
      bodyEnd:
        ". You can read it, verify it, run it yourself and contribute. You don't have to take our word for it: you can check.",
    },
    noWarranty: {
      title: "No warranty",
      body: "The software and the service are provided “as is”, without warranty of any kind. Although we take care with the cryptography and the security, we do not guarantee that the service will always be available or free of defects. We are not liable for damages arising from its use, to the extent permitted by law.",
    },
    bestEffort: {
      title: "Best-effort service",
      body: "The public relay is a best-effort service with no service level agreement (SLA): it may go down, restart or change. Since the code is open, anyone can host their own relay if they need guarantees of their own.",
    },
    identity: {
      title: "Your identity and your keys",
      body: "Your identity and your keys are generated on, and live on, your device. You are responsible for safeguarding your password and your recovery code: we hold no copy and cannot recover them for you. There is no backdoor —not even for us—. Losing the recovery code means losing access to that identity.",
    },
    acceptableUse: {
      title: "Acceptable use",
      body: "Use Aegis protects the privacy of your communications; using it responsibly is on you. Do not use it for illegal activity or to harm others. The tool protects data, it does not shelter conduct.",
    },
    userContent: {
      title: "User content and conduct",
      body: "Use Aegis does not create, host, publish or distribute content of its own: it carries encrypted messages between the people who choose to talk to each other. Whatever is written, sent or shared —text, files, audio— is the sole responsibility of the person who originates it and the person who transmits it.",
      body2:
        "Neither the project, nor those who develop it, nor those who operate a relay accept any liability whatsoever —civil, criminal, administrative or of any other kind— for the content, the conduct or the damages arising from the use third parties make of the tool, including unlawful or fraudulent use.",
    },
    intermediary: {
      title: "We are transport, not a publisher",
      body: "Messages are end-to-end encrypted: the relay sees envelopes, not letters. Neither the project nor a relay operator can read, review, filter or moderate what passes through, because they do not hold the keys. That impossibility is technical, not a policy we could lift at anyone's request.",
      body2:
        "The service therefore acts as a mere technical intermediary —transmission and temporary storage—: it does not select, originate or modify messages, nor choose their recipients. This is the role that intermediary-service law reserves for carriers of data, and under which the corresponding liability exemption is claimed. Upon actual knowledge of manifestly unlawful content held on a relay we operate, we will act diligently to remove it.",
    },
    selfHosting: {
      title: "Your own instances and .onion",
      body: "Use Aegis is published precisely so that anyone can run it themselves, including as a .onion hidden service. Whoever deploys their own instance becomes its operator: legal compliance in their jurisdiction is theirs, and so is responsibility for that instance and its users.",
      body2:
        "The authors of the software are not party to that relationship and have no control over, access to or visibility into third-party instances. Publishing a tool does not make whoever wrote it answerable for what others do with it.",
    },
    liability: {
      title: "Limitation of liability",
      body: "To the fullest extent permitted by applicable law, neither the authors, nor contributors to the code, nor relay operators shall be liable for any damages —direct, indirect, incidental, special or consequential, including lost profits, loss of data or reputational harm— arising from the use of, or the inability to use, Use Aegis, even if advised of the possibility of such damages.",
      body2:
        "Anyone using the service does so at their own risk and will hold authors and operators harmless against third-party claims arising from that use or from the content they transmit.",
    },
    authorities: {
      title: "Requests from authorities and third parties",
      body: "The project will honour requests that are legally binding on it from a competent authority, within whatever technically exists. It is worth knowing in advance what does exist: there are no phone numbers, no email addresses, no real names; content is end-to-end encrypted and the keys live only on devices; the system is designed to retain the minimum.",
      body2:
        "Cooperation here is not a matter of willingness but of possibility: what is not held cannot be handed over, and what cannot be decrypted cannot be decrypted. Requests may be sent to the contact published in the repository.",
    },
    changes: {
      title: "Changes",
      body: "These terms may be updated as the project matures. Relevant changes will be reflected here and in the repository history, which is public.",
    },
  },

  login: {
    subtitle: "Sign in",
    checkingDevice: "Checking device…",
    show: "Show",
    hide: "Hide",
    password: "Password",
    passwordPlaceholder: "Your password",
    repeatPassword: "Repeat the password",
    repeatPasswordPlaceholder: "Confirm it",
    passwordsDontMatchYet: "The passwords don't match yet.",
    gatewaySecure: "Protected connection (Tor)",
    gatewaySecureBody: " — traffic goes over Tor and your IP is not visible to the server.",
    gatewayNormal: "Normal connection",
    gatewayNormalBody: " — your IP is visible to the server.",
    gatewayNormalOnionStart: " If you're facing censorship or want anonymity, open our ",
    gatewayNormalOnionEnd: " in Tor Browser.",
    file: {
      title: "Your keys from a file (USB)",
      bodyStart: "Choose your ",
      bodyEnd:
        " file. In portable mode the identity only lives in memory for this session: nothing is left on this machine when you close it.",
      choose: "Choose file",
      none: "no file selected",
      remember: "Remember on this machine",
      rememberOn: "Your keys will be stored here",
      rememberOff: "Portable mode: nothing is stored",
      submit: "Sign in",
      submitBusy: "Unlocking…",
    },
    locked: {
      title: "Identity protected on this device",
      body: "Your identity is encrypted. Enter your password to unlock it for this session — nobody else can use this identity without it.",
      submit: "Unlock and sign in",
      submitBusy: "Unlocking…",
    },
    legacy: {
      title: "Unencrypted identity detected",
      bodyStart: "This identity was stored ",
      bodyUnprotected: "unprotected",
      bodyEnd:
        ": anyone with access to this machine could use it. Protect it now with a password to encrypt it. From then on it will be asked for at sign-in.",
      newPassword: "New password",
      submit: "Protect and sign in",
      submitBusy: "Encrypting…",
    },
    import: {
      label: "Recovery phrase",
      attachFile: "Attach file",
      placeholder: "Paste your 24 words, or attach your recovery .txt file",
      passwordLabel: "Password to protect this identity",
      submit: "Import and sign in",
      submitBusy: "Importing…",
    },
    empty: {
      body: "There is no identity on this device. Create a new one or import yours with your recovery phrase.",
      create: "Create identity",
      importPhrase: "Import with a recovery phrase",
      fromFile: "Sign in from a file (USB)",
    },
    useAnother: "Use another identity",
    crypto: "E2E · X25519 / XChaCha20-Poly1305",
    errors: {
      minPassphrase: (n: number) => `The password must be at least ${n} characters long.`,
      passwordsDontMatch: "The passwords don't match.",
      signatureRejected: "Signature rejected by the server.",
      serverError: (status: number) => `The server responded with an error (${status}).`,
      unknown: "Unknown error.",
      cannotReadFile: "The file could not be read.",
      wrongFileIsPhrase:
        "That file is your recovery PHRASE, not a keystore. I've filled your 24 words in below: create a password and sign in.",
    },
  },

  register: {
    title: "Create your identity",
    subtitle: "No personal data",
    logoAlt: "Use Aegis — home",
    imgAlt: "Use Aegis Secure Messaging",
    fixed: "Identity fixed",
    generated: "Generated · fixed when you confirm",
    algo: "Ed25519 · 256b",
    controlTitle: "You alone are in control",
    controlBodyStart:
      "Your identity is a 256-bit Ed25519 key pair generated on this device. The private key is stored ",
    controlBodyEncrypted: "encrypted with your password",
    controlBodyMiddle:
      " (Argon2id): without it, what's stored is noise and nobody else can use your identity. These 16 letters are its ",
    controlBodyFingerprint: "public fingerprint",
    controlBodyEnd:
      ": they're for recognising it, not for signing in by typing them. Keep your recovery phrase (24 words) to restore it on another device, or export your keys to a USB stick.",
    handshake: "Handshake",
    handshakeInit: [
      "> Initialising E2E protocols…",
      "> Seeding entropy from the system CSPRNG…",
      "> Deriving Ed25519 key pair (256 bits)…",
    ],
    logKeyDerived: (fp: string) => `> Public key derived · fingerprint ${fp}`,
    logEncrypted: "> IDENTITY ENCRYPTED · protected with your password (Argon2id)",
    logStored: "> Private key encrypted in local storage · never leaves the device",
    logSaveError: (msg: string) => `> ERROR while saving: ${msg}`,
    logRecoveryExported: "> Recovery phrase export: OK",
    logKeystoreExported: "> Encrypted keys export (USB): OK",
    logKeystoreError: (msg: string) => `> ERROR while exporting your keys: ${msg}`,
    protectTitle: "Protect your identity",
    protectBodyStart:
      "The private key is encrypted with this password (Argon2id) before being stored. It will be asked for every time you sign in. ",
    protectBodyStrong: "There is no way to recover it if you forget it",
    protectBodyEnd: " — that's what the recovery phrase is for.",
    generatorTitle: "Generate a strong password",
    recommended: "recommended",
    length: "Length",
    symbols: "Symbols (!&*)",
    generate: "Generate password",
    generatorNote:
      "It's filled in above and shown so you can copy it. Save it in your password manager: there is no way to recover it if you lose it.",
    showPassword: "Show password",
    hidePassword: "Hide password",
    passwordPlaceholder: (n: number) => `Password (min. ${n} characters)`,
    repeatPlaceholder: "Repeat the password",
    phraseTitle: "Your recovery phrase",
    phraseCopied: "Copied ✓",
    phraseBodyStart: "These ",
    phraseBodyStrong: "24 words, in this order",
    phraseBodyEnd:
      ", ARE your identity. Write them down on paper and keep them somewhere safe: it's the only way to restore it on another device, and nobody —us included— can recover it if you lose them.",
    downloadRecovery: "Download recovery",
    confirm: "Confirm identity",
    confirmed: "Identity established ✓",
    regenerate: "Regenerate identity",
    exportKeystore: "Export your encrypted keys to a file (USB)",
    goLogin: "Sign in →",
    haveIdentity: "← I already have an identity",
    recoveryFile: {
      header: "USE AEGIS — Identity recovery phrase",
      fingerprint: (fp: string) => `Public fingerprint: ${fp}`,
      phraseLabel: "Recovery phrase (24 words — keep it secret, it is your private key):",
      footer1:
        "With these 24 words, IN THIS ORDER, you can restore your identity on another device.",
      footer2: "No server holds your keys: if you lose it, nobody can recover it for you.",
      filename: (fp: string) => `useaegis-recovery-${fp}.txt`,
    },
  },

  gate: {
    acceso: {
      phase: "Step 1 · Access",
      title: "Verifying identity",
      subtitle: "Checking that the session and the local store are valid.",
    },
    canal: {
      phase: "Step 2 · Channel",
      title: "Securing the channel",
      subtitle: "Establishing end-to-end encryption and checking the session.",
    },
    checks: {
      sessionStarted: "Session started on this device",
      validIdentity: "Valid 16-character identity",
      localStorage: "Local storage available",
      csprng: "Secure randomness generator available",
      e2e: "End-to-end encryption · X25519 / XChaCha20-Poly1305",
      sealedSender: "Sealed sender active",
      protectedSession: "Protected session · no trace when you close it",
      protectedSessionHint: "Enabled by coming in over Tor",
    },
    verifying: "Checking…",
    verified: "Verified",
    verifiedWithWarnings: "Verified · no protected connection",
  },

  shell: {
    nav: {
      channel: "Channel",
      contacts: "Contacts",
      vault: "Vault",
      transport: "Transport",
      settings: "Settings",
    },
    sessionVerified: "Session verified",
    sessionUnprotected: "Unprotected session",
    secureSession: "Secure session",
    encryptionVerified: "Encryption verified",
    noAutoWipe: "No automatic wipe",
    yourIdentity: "Your identity",
    copyId: "Copy id",
    lockSession: "Lock session",
  },

  channel: {
    conversationWith: "Conversation with",
    noContactsYet: "No contacts yet",
    addContact: "+ Add",
    byName: "By name",
    byQr: "By QR",
    handlePlaceholder: "username (e.g. alice)",
    searching: "Searching…",
    addNote:
      "We download their encryption key and check it really is theirs before saving it. The mailbox is the same over the normal and the protected (Tor) connection.",
    pendingRequests: (n: number) =>
      n === 1 ? "You have 1 contact request" : `You have ${n} contact requests`,
    seeRequests: "View →",
    e2eBanner: "Only you and your contact can read this · end-to-end encrypted · XChaCha20-Poly1305",
    emptyNoContacts: "You don't have any contacts yet.",
    emptyNoContactsHint: "Press “+ Add” and enter someone's username to get started.",
    emptyNoMessages: (who: string) => `No messages with ${who} yet.`,
    emptyNoMessagesHint: "Type below to send the first one.",
    sent: "Sent",
    received: "Received",
    encryptedHere: "Encrypted on your device · XChaCha20-Poly1305",
    attachTitle: "Attach a file (end-to-end encrypted)",
    sendTitle: "Send",
    placeholderAttaching: "Encrypting and sending file…",
    placeholderReady: "Transmit message…",
    placeholderNoContact: "Pick or add a contact to get started",
    voiceNote: "Voice note",
    decrypting: "Decrypting…",
    playHint: "play",
    downloadHint: "download",
    playTitle: "Play (downloads and decrypts)",
    downloadTitle: "Download and decrypt",
    aside: {
      title: "Session status",
      connection: "Connection",
      connectionSecure: "Protected (Tor)",
      connectionNormal: "Normal",
      contentEncryption: "Content encryption",
      sender: "Sender",
      senderSealed: "Sealed sender",
      verifiedContacts: "Verified contacts",
    },
    errors: {
      loadVoiceNote: "The voice note could not be loaded.",
      downloadFile: "The file could not be downloaded.",
      sendMessage: "The message could not be sent.",
      sendFile: "The file could not be sent.",
      tooLarge: (name: string, max: string) => `⚠️ “${name}” exceeds the ${max} limit.`,
      usernameNotFound: (handle: string) => `There is no user with the username “${handle}”.`,
      addContact: "The contact could not be added.",
      noSession: "Session not available.",
      ownQr: "That QR is your own: you can't add yourself.",
      qrIdentityNotFound:
        "We couldn't find that identity. Is the QR correct, and has that person registered yet?",
    },
  },

  contacts: {
    title: "Contacts",
    subtitle:
      "Your address book is local to this device; blocks are enforced by the server (they apply over both the normal and the protected connection).",
    requests: (n: number) => `Contact requests · ${n}`,
    requestsHint:
      "These people have written to you and aren't in your contacts yet. Accept them so you can reply, or block them.",
    accept: "Accept",
    block: "Block",
    mine: (n: number) => `My contacts · ${n}`,
    emptyTitle: "You don't have any contacts yet.",
    emptyHint: "Add someone from the Channel by their username, or accept a request.",
    write: "Write",
    remove: "Remove",
    blockedTitle: (n: number) => `Blocked · ${n}`,
    blockedHint: "They can't leave you messages. They don't know they're blocked.",
    unblock: "Unblock",
    actionFailed: "The action could not be completed.",
    noSession: "Session not available.",
  },

  vault: {
    title: "Privacy vault",
    serverDataLabel: "Data the server keeps: ",
    serverDataValue: "minimal",
    plaintextStored: "Plaintext content stored",
    zeroBytes: "0 bytes",
    healthTitle: "Encryption health",
    health: {
      content: "Content encryption",
      kex: "Key agreement",
      kexValue: "X25519 (per-session ECDH)",
      identity: "Identity / signature",
      sender: "Sender, as seen by the server",
    },
    healthNote:
      "We use standard, audited cryptography (libsodium). We don't invent our own. The encryption is the same whichever path the message takes.",
    backupTitle: "Identity backup",
    downloadIdentity: "Download identity",
    backupNote: "No centralised recovery: if you lose it, there is no way to regenerate it.",
    keysTitle: "Active keys",
    keys: {
      identityTag: "IDENTITY",
      identityNote: "stable, your identity",
      sessionTag: "SESSION",
      sessionNote: "ephemeral, per conversation",
    },
    keysNote:
      "No server stores your keys: they live only on your device. No RSA, no special hardware — just modern cryptography (elliptic curves).",
    file: {
      header: "USE AEGIS — Identity",
      line1: "Keep it somewhere safe. It is your only way to recover access.",
      line2: "No server holds your keys: nobody can regenerate it for you.",
      filename: (id: string) => `useaegis-identity-${id}.txt`,
    },
  },

  transportPage: {
    title: "Transport status",
    checkedAt: (time: string) => ` · checked ${time}`,
    statusOk: "Operational",
    statusDown: "Unreachable",
    statusProbing: "Probing…",
    tileGateway: "Door",
    tileRelay: "Relay",
    tileDb: "Database",
    tileTtl: "Session expires in",
    expired: "expired",
    onionUnreachableTitle: ".onion circuit unavailable",
    onionUnreachableBodyStart: "You're on the ",
    onionUnreachableBodyMiddle:
      " door but the relay isn't answering over Tor. The circuit can take a few seconds to open after the page loads: try again. If you opened this ",
    onionUnreachableBodyEnd:
      " outside Tor Browser, there will be no circuit. It doesn't mean the relay is down.",
    relayDownTitle: "Relay unreachable",
    relayDownNoResponse:
      "No response from the relay on this door. Try again; if it persists, check that the node is up.",
    relayDownGeneric: "Error contacting the relay.",
    disclosureStart:
      "Content travels end-to-end encrypted (XChaCha20-Poly1305) and the relay knows neither sender nor recipient (sealed sender). ",
    disclosureOnionStart: "Your connection goes over ",
    disclosureOnionEnd: ": your IP is not visible to the relay.",
    disclosureClearStart: "Your IP is visible to the relay",
    disclosureClearEnd: " unless you use the ",
    disclosureClearTail: " door over Tor.",
    cards: {
      contentTitle: "Content",
      contentBody:
        "An encrypted payload indistinguishable from random bytes; the transport only moves noise.",
      senderTitle: "Sender",
      senderBody: "Sealed sender: the relay delivers the blob without knowing who originated it.",
      recipientTitle: "Recipient",
      recipientBody:
        "The destination is an ephemeral session key (X25519), not an account or a directory entry.",
    },
  },

  settings: {
    title: "Settings",
    username: {
      title: "Your username",
      bodyStart:
        "This is the public name people use to add you as a contact. We generate it for you (a word + a number) so it's unique. ",
      bodyStrong: "It's chosen once and then fixed: it cannot be changed later.",
      current: "Right now",
      none: "You don't have a name yet. Pick one so people can add you.",
      fixedStart: "Your username is ",
      fixedWord: "final",
      fixedMiddle: ". Share your full ",
      fixedEnd: " so people can add you as a contact.",
      proposed: "Your proposed name",
      regenerate: "Regenerate",
      useThis: "Use this one",
      warning: "Take your time: once you confirm with “Use this one”, you can't change it.",
      saved: "Saved ✓ · share your full @name so people can add you.",
      noFreeName: "We couldn't reserve a free name. Try “Regenerate” and go again.",
      saveFailed: "The name could not be saved.",
    },
    qr: {
      title: "Your QR code",
      body: "Someone adds you by scanning it with their phone (or uploading a photo). Your key travels inside the code, so it doesn't depend on the server telling the truth: your encryption key is checked when they add you.",
      unavailable: "Not available.",
      noHandleWarning:
        "You don't have an @name yet: the QR already works, but pick one above so your name shows to whoever adds you.",
      copyCode: "Copy code",
      copiedCode: "Copied",
      downloadQr: "Download QR",
    },
    connection: {
      title: "Connection",
      bodyStart:
        "It's decided by the address you opened the app on: there's nothing to switch on. For protected mode, open the ",
      bodyEnd: " in Tor Browser.",
      secure: "Protected connection (Tor)",
      normal: "Normal connection",
      secureNote: "Your connection goes over Tor; your IP is not visible to the server.",
      normalNote: "Your IP is visible to the server.",
      onionInviteStart: " For more anonymity, or if you're facing censorship, open our ",
      onionInviteEnd: " in Tor Browser.",
    },
    identity: {
      title: "Your identity",
      copyId: "Copy id",
    },
    about: {
      title: "About",
      language: "Language",
      encryption: "Encryption",
      code: "Code",
      codeValue: "Open and auditable",
      audit: "External audit",
      auditValue: "Pending",
    },
    file: {
      header: "USE AEGIS — Public identity fingerprint",
      body: "This is the PUBLIC fingerprint of your identity (it's for recognising you or sharing you).\nIt does NOT recover access: that's what the recovery phrase\n(24 words) you saved when creating the identity is for.",
      filename: (id: string) => `useaegis-fingerprint-${id}.txt`,
    },
  },

  qr: {
    generating: "Generating QR…",
    generateFailed: "The QR could not be generated.",
    pastePlaceholder: "Paste the QR code (aegis://contact…)",
    uploadImage: "Upload an image of the QR",
    note: "The image is read on your device (it isn't uploaded anywhere). We check their encryption key before saving.",
    invalidCode: "That code isn't a valid Use Aegis contact QR.",
    noQrInImage: "We couldn't find a readable QR in that image.",
    unreadableImage: "We couldn't read that image.",
    addFailed: "The contact could not be added.",
  },

  voice: {
    recordTitle: "Record a voice note (end-to-end encrypted)",
    cancelTitle: "Cancel recording",
    sendTitle: "Send voice note",
    filename: "voice-note",
    noRecording: "This browser doesn't allow audio recording.",
    micDenied: "Could not access the microphone (permission denied).",
    unsupported: "This browser doesn't support audio recording.",
  },

  errors: {
    relayUnreachableOnion:
      "Could not reach the server over Tor. The .onion circuit can take a few seconds to open; try again. A browser blocker may also be cutting the request.",
    relayUnreachableClearnet:
      "Could not reach the server. Check your connection and that no browser blocker is cutting the request.",
    serverStatus: (status: number) => `The server responded ${status}.`,
    genericStatus: (status: number) => `Error ${status}`,
    unknown: "Unknown error.",
    mediaTooLarge: "The file is too large to send through the relay.",
    mediaUnconfigured: "This server has attachments disabled; it only accepts text messages.",
    storageUnavailable: "The attachment store didn't respond. Try again in a few seconds.",
    rateLimited: "Too many requests in a row. Wait a few seconds and try again.",
    gatewayOnion:
      "You're on the protected connection (Tor): traffic goes over Tor and your IP is not visible to the server.",
    gatewayClearnetWithOnion:
      "You're on the normal connection. If you're facing censorship or want anonymity, open our .onion in Tor Browser.",
    gatewayClearnet: "You're on the normal connection. Your IP is visible to the server.",
    identityLocked: "Identity locked. Unlock it with your passphrase.",
    wrongPassphrase: "Incorrect passphrase.",
    noKeystore: "There is no encrypted keystore on this device.",
    noKeystoreToExport: "There is no encrypted keystore to export.",
    noLegacyIdentity: "There is no unencrypted identity to migrate.",
    keystoreCorrupt: "The keystore is corrupt (the key doesn't match).",
    keystoreCorruptKey: "Corrupt keystore (invalid public key).",
    notAKeystore: "That file is not a valid Use Aegis keystore.",
    invalidSeed: "Invalid seed (32 bytes expected).",
    invalidRecoveryCode: "Invalid recovery code.",
    invalidRecoveryCodeBytes: "Invalid recovery code (32 bytes expected).",
    invalidPhrase: "That recovery phrase is not valid. Check the words and their order.",
    phraseWrongLength: (n: number) => `A Use Aegis recovery phrase has ${n} words.`,
    phraseNotAegis: "That phrase does not correspond to a Use Aegis identity.",
    phraseNotFoundInFile:
      "No recovery phrase was found in the file. Paste your 24 words or attach your recovery file (.txt).",
    invalidPublicKey: "Invalid public key: not a 32-byte Ed25519 identity.",
    invalidPeerKey: "Invalid peer X25519 public key (32 bytes expected).",
    invalidSenderSignature: "Invalid sender signature.",
    noPrekey: "That user hasn't published their encryption key yet; they can't be added.",
  },

  quota: {
    decimalSeparator: ".",
    months: [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ],
    /** "on 12 September" */
    day: (dayOfMonth: number, month: string) => `on ${dayOfMonth} ${month}`,
    exceeded: (cap: string) =>
      `You've filled your attachment space${cap}. Your text messages keep working ` +
      `normally: this only affects files and voice notes.`,
    recovers: (base: string, amount: string, day: string) =>
      `${base} You get ${amount} back ${day}, when your oldest attachments expire.`,
    recoversGeneric: (base: string) =>
      `${base} Space frees itself up as your oldest attachments expire.`,
    dailyLimit: (cap: string) =>
      `You've hit the upload limit${cap}. You can keep sending text; attachments resume tomorrow.`,
    dailyCapToday: (size: string) => ` for today (${size})`,
    dailyCapTodayPlain: " for today",
  },

  metadata: {
    home: {
      title: "Use Aegis — The server only carries noise",
      description:
        "Open-source, auditable end-to-end encrypted messaging. The alternative to WhatsApp and Telegram: no profiles, no telemetry, no accounts. The server only carries noise.",
      ogDescription:
        "Open-source, auditable end-to-end encrypted messaging. No profiles, no telemetry, no accounts.",
    },
    privacy: {
      title: "Privacy · Use Aegis",
      description:
        "What Use Aegis sees and what it doesn't. End-to-end encryption, sealed sender and no personal data.",
    },
    terms: {
      title: "Terms · Use Aegis",
      description:
        "Use Aegis terms of use: free software, no warranty, and your identity under your control.",
    },
    keywords: [
      "encrypted messaging",
      "end-to-end encryption",
      "open source",
      "auditable",
      "WhatsApp alternative",
      "Telegram alternative",
      "closed-source app alternative",
      "private messaging",
      "open source messenger",
      "no metadata",
      "no telemetry",
      "privacy",
      "secure communication",
      "Tor",
      ".onion",
      "sealed sender",
      "anonymous messaging",
      "auditable messaging",
      "self-hosted messenger",
      "libsodium",
      "use aegis app",
      "aegis app",
      "use aegis",
      "useaegis",
      "useaegis.app",
    ],
  },
} satisfies Dictionary;

export default en;
