---
name: Aegis Visual Identity
colors:
  surface: '#131313'
  surface-dim: '#131313'
  surface-bright: '#3a3939'
  surface-container-lowest: '#0e0e0e'
  surface-container-low: '#1c1b1b'
  surface-container: '#201f1f'
  surface-container-high: '#2a2a2a'
  surface-container-highest: '#353534'
  on-surface: '#e5e2e1'
  on-surface-variant: '#c4c9ac'
  inverse-surface: '#e5e2e1'
  inverse-on-surface: '#313030'
  outline: '#8e9379'
  outline-variant: '#444933'
  surface-tint: '#abd600'
  primary: '#ffffff'
  on-primary: '#283500'
  primary-container: '#c3f400'
  on-primary-container: '#556d00'
  inverse-primary: '#506600'
  secondary: '#adc6ff'
  on-secondary: '#002e69'
  secondary-container: '#4b8eff'
  on-secondary-container: '#00285c'
  tertiary: '#ffffff'
  on-tertiary: '#21323e'
  tertiary-container: '#d2e5f5'
  on-tertiary-container: '#556774'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#c3f400'
  primary-fixed-dim: '#abd600'
  on-primary-fixed: '#161e00'
  on-primary-fixed-variant: '#3c4d00'
  secondary-fixed: '#d8e2ff'
  secondary-fixed-dim: '#adc6ff'
  on-secondary-fixed: '#001a41'
  on-secondary-fixed-variant: '#004493'
  tertiary-fixed: '#d2e5f5'
  tertiary-fixed-dim: '#b6c9d8'
  on-tertiary-fixed: '#0b1d29'
  on-tertiary-fixed-variant: '#374956'
  background: '#131313'
  on-background: '#e5e2e1'
  surface-variant: '#353534'
typography:
  display:
    fontFamily: Hanken Grotesk
    fontSize: 40px
    fontWeight: '700'
    lineHeight: '1.1'
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Hanken Grotesk
    fontSize: 32px
    fontWeight: '600'
    lineHeight: '1.2'
  headline-md:
    fontFamily: Hanken Grotesk
    fontSize: 24px
    fontWeight: '600'
    lineHeight: '1.3'
  body-lg:
    fontFamily: Hanken Grotesk
    fontSize: 18px
    fontWeight: '400'
    lineHeight: '1.6'
  body-md:
    fontFamily: Hanken Grotesk
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.5'
  code-sm:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.4'
  code-xs:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: '1.4'
    letterSpacing: 0.05em
  label-caps:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '700'
    lineHeight: '1'
    letterSpacing: 0.1em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  base: 4px
  xs: 8px
  sm: 16px
  md: 24px
  lg: 40px
  xl: 64px
  gutter: 16px
  margin-mobile: 20px
  margin-desktop: 48px
---

## Brand & Style
The design system is engineered to evoke feelings of absolute privacy, technical superiority, and structural resilience. The brand personality is "The Invisible Fortress"—a silent, indestructible guardian of digital communication. 

The aesthetic is **"Terminal Chic,"** blending the utilitarian efficiency of a command-line interface with the sophisticated polish of modern minimalism. Key visual pillars include:
- **Technological Sovereignty:** High-tech visuals that reassure the user of the encryption's power.
- **Anonymity:** Minimalist, intentional friction that prevents accidental data exposure.
- **Indestructibility:** Heavy, geometric layouts tempered by the lightness of glassmorphism.

The style utilizes deep obsidian voids, subtle grid backdrops to imply structured data, and high-precision accents that mimic a digital signal or "pulse."

## Colors
The palette is rooted in the **Obsidian** dark mode—a near-black void that reduces light emission and maximizes privacy.

- **Primary (Cyber Lime):** Used for critical actions, encryption status, and active signal indicators. It represents high-visibility data flow.
- **Secondary (Signal Blue):** Used for passive information, secondary links, and verified identity badges.
- **Neutral:** A range of deep grays that define the architecture without breaking the immersion of the dark theme.
- **Surface Strategy:** Surfaces are layered using "Midnight" shades rather than pure black to allow for subtle depth and glass effects.

## Typography
The typography system follows a dual-purpose logic:
1. **Human Communication:** Uses **Hanken Grotesk** for its sharp, contemporary, and highly legible sans-serif qualities. It ensures messaging is effortless and clear.
2. **Technical Verification:** Uses **JetBrains Mono** for all system-level data, public keys, timestamps, and encryption logs. This reinforces the "Terminal Chic" aesthetic and ensures that technical strings are easy to inspect.

Headlines should remain tight and impactful, while body text requires generous line heights to ensure comfort during long-form encrypted exchanges.

## Layout & Spacing
The layout is governed by a **fixed-column grid** within a fluid container, reminiscent of a motherboard or architectural blueprint. 

- **Desktop:** 12-column grid with a maximum content width of 1440px.
- **Tablet:** 8-column grid with 24px margins.
- **Mobile:** 4-column grid with 20px margins.

Spacing follows a strict 4px baseline, ensuring all elements align with geometric precision. Use larger gaps (`lg` and `xl`) to create "breathing room" around sensitive data, emphasizing its importance and isolation.

## Elevation & Depth
In this design system, depth is not conveyed through traditional drop shadows but through **optical layering and translucency**.

- **Backdrop Blurs:** High-level containers (modals, navigation bars) use a 20px backdrop blur with a 70% opaque Obsidian fill.
- **Inner Glows:** Instead of shadows casting "down," active elements have a subtle 1px inner stroke or a faint Cyber Lime glow to simulate a screen emitting light.
- **The "Vault" Layer:** Backgrounds feature a subtle 16px square grid pattern at 3% opacity, suggesting a structured, encrypted environment beneath the UI.
- **Z-Index Strategy:** Higher elevation levels are indicated by increased saturation and lighter surface grays, never by traditional fuzzy shadows.

## Shapes
The shape language is **"Soft Industrial."** Elements use a consistent 4px (0.25rem) radius to maintain a sense of precision and "machined" engineering. 

- **Containers:** Standard cards and input fields use `rounded-md` (0.5rem).
- **Interactive Elements:** Buttons use a slightly more pronounced `rounded-lg` (0.75rem) to feel distinct from static containers.
- **System Indicators:** Status pips and identity avatars remain perfectly square or use extremely small radii to contrast with the softer message bubbles.

## Components
- **Buttons:** Primary buttons are solid Cyber Lime with black text (JetBrains Mono). Secondary buttons are "Ghost" style with a 1px Signal Blue border and subtle glow on hover.
- **Message Bubbles:** Outgoing messages have a 1px Cyber Lime border with a semi-transparent fill. Incoming messages are a neutral deep gray. No tails; bubbles are simple rectangles with rounded corners.
- **Input Fields:** Bottom-aligned labels using `label-caps`. The focus state triggers a full-width underline and a faint background glow.
- **Chips/Status:** Identity verification chips use `code-xs` typography and a Signal Blue "shield" icon.
- **Encryption Logs:** A collapsible technical drawer that shows real-time E2EE handshakes in `code-sm` JetBrains Mono.
- **Biometric Prompt:** A distinctive component featuring a high-contrast fingerprint or face-id glyph surrounded by a rotating "scanning" ring in Cyber Lime.