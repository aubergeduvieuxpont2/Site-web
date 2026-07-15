---
name: Industrial Light
colors:
  surface: '#fbf9f8'
  surface-dim: '#dbd9d9'
  surface-bright: '#fbf9f8'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f5f3f3'
  surface-container: '#efeded'
  surface-container-high: '#eae8e7'
  surface-container-highest: '#e4e2e2'
  on-surface: '#1b1c1c'
  on-surface-variant: '#5b403b'
  inverse-surface: '#303030'
  inverse-on-surface: '#f2f0f0'
  outline: '#8f7069'
  outline-variant: '#e4beb6'
  surface-tint: '#b72304'
  primary: '#b32002'
  on-primary: '#ffffff'
  primary-container: '#d73b1c'
  on-primary-container: '#fffbff'
  inverse-primary: '#ffb4a4'
  secondary: '#5f5e5e'
  on-secondary: '#ffffff'
  secondary-container: '#e4e2e1'
  on-secondary-container: '#656464'
  tertiary: '#5b5c5c'
  on-tertiary: '#ffffff'
  tertiary-container: '#737575'
  on-tertiary-container: '#fcfcfc'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#ffdad3'
  primary-fixed-dim: '#ffb4a4'
  on-primary-fixed: '#3e0500'
  on-primary-fixed-variant: '#8d1600'
  secondary-fixed: '#e4e2e1'
  secondary-fixed-dim: '#c8c6c5'
  on-secondary-fixed: '#1b1c1c'
  on-secondary-fixed-variant: '#474746'
  tertiary-fixed: '#e2e2e2'
  tertiary-fixed-dim: '#c6c6c7'
  on-tertiary-fixed: '#1a1c1c'
  on-tertiary-fixed-variant: '#454747'
  background: '#fbf9f8'
  on-background: '#1b1c1c'
  surface-variant: '#e4e2e2'
typography:
  display:
    fontFamily: IBM Plex Sans
    fontSize: 48px
    fontWeight: '600'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: IBM Plex Sans
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: IBM Plex Sans
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 36px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: IBM Plex Sans
    fontSize: 24px
    fontWeight: '500'
    lineHeight: 32px
  body-lg:
    fontFamily: IBM Plex Sans
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: IBM Plex Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-lg:
    fontFamily: IBM Plex Sans
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.05em
  label-md:
    fontFamily: IBM Plex Sans
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
  code:
    fontFamily: monospace
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  unit: 8px
  container-max: 1440px
  gutter: 24px
  margin-desktop: 40px
  margin-mobile: 16px
---

## Brand & Style

The brand personality is authoritative, precise, and utilitarian. It targets professionals in logistics, engineering, and enterprise resource management who require high-density information environments that remain legible during long shifts. 

The design style is **Modern Industrial**. It draws from architectural drafting and technical documentation, emphasizing structural integrity and functional clarity. By shifting to a light mode execution, the design system gains an "engineered" feel—resembling high-quality technical manuals or instrumentation panels. The emotional response is one of reliability, systematic order, and focused productivity.

## Colors

The palette is anchored by a high-contrast foundation to ensure maximum readability in well-lit environments.

- **Primary Accent:** 'Safety Orange' (#EE4B2B) is reserved strictly for primary actions, critical alerts, and active states. It provides a sharp, industrial "warning" or "action" signal against the neutral base.
- **Background & Surface:** The primary canvas is a clean White (#FFFFFF). Secondary surfaces, such as sidebars or card backgrounds, utilize a subtle cool gray (#F9F9F9) to create a clear structural hierarchy without adding visual weight.
- **Typography & Ink:** Headlines use a deep charcoal (#262626) for maximum punch. Body text uses a slightly softer slate gray (#525252) to reduce eye strain during prolonged reading while maintaining high contrast ratios.
- **System States:** Success (Green), Warning (Amber), and Error (Red) should be desaturated slightly to fit the industrial aesthetic, but remain vibrant enough to catch the eye.

## Typography

This design system utilizes **IBM Plex Sans** exclusively to reinforce its engineering heritage. The typeface’s unique terminals and technical curves provide a distinct "built" look.

- **Scale:** A mathematical scaling system is used. Large displays use tighter letter spacing to maintain a compact, sturdy feel.
- **Hierarchy:** All-caps labels with slight letter spacing are used for metadata and categorization, mimicking industrial labeling systems.
- **Weight:** Medium (500) and Semi-bold (600) weights are used for semantic emphasis rather than purely aesthetic variation.
- **Readability:** On the white background, body text maintains a 1.5x line-height ratio to ensure data-heavy layouts remain approachable.

## Layout & Spacing

The layout is built on a rigorous **8px grid system**, reflecting a modular construction philosophy. 

- **Grid Model:** A 12-column fixed grid is used for desktop (max 1440px) to maintain control over line lengths. For mobile, a 4-column fluid grid is employed.
- **Rhythm:** Spacing follows a geometric progression (8, 16, 24, 32, 48, 64). Components are spaced using "Standard Units" (16px or 24px) to ensure consistent density.
- **Density:** The design system prioritizes high-density information. Vertical padding in lists and tables is kept tight to maximize visible data above the fold.

## Elevation & Depth

To maintain the "sturdy" feel, elevation is conveyed through **Tonal Layering** and **Structural Outlines** rather than soft shadows.

- **Surfaces:** Depth is created by stacking slightly darker gray surfaces (#F2F2F2) on top of the white background. 
- **Borders:** Instead of ambient shadows, use 1px solid borders (#D1D1D1) to define component boundaries. This mimics the look of blueprint sections or technical schematic blocks.
- **Active Elevation:** Only use shadows for "floating" elements like modals or dropdowns. These should be crisp, low-blur shadows with a subtle dark tint to suggest a small physical offset from the page.

## Shapes

The shape language is **Soft-Industrial**. While purely sharp corners feel too aggressive, overly rounded corners feel too consumer-facing. 

- **Base Radius:** A consistent 0.25rem (4px) radius is applied to buttons, input fields, and small components. This provides a "machined" edge that feels finished but precise.
- **Container Radius:** Larger containers like cards or modals may use up to 0.5rem (8px) to provide a clear visual container for grouped information.
- **Icons:** Use stroke-based icons with consistent 2px weights and slight corner rounding to match the typography.

## Components

- **Buttons:** Primary buttons are solid Safety Orange (#EE4B2B) with white text. Secondary buttons use a heavy 2px charcoal border. Tertiary buttons are text-only with heavy underlining on hover.
- **Inputs:** Form fields use a 1px border (#D1D1D1) and a white background. On focus, the border thickens and changes to Safety Orange.
- **Chips:** Used for status and tags. They should have a light gray background and bolded label text. Status-specific chips use a small colored "indicator dot" rather than full-color backgrounds.
- **Cards:** Cards should have no shadow; they are defined by a 1px border (#E0E0E0) or a subtle background fill (#F9F9F9).
- **Data Tables:** These are a core component. Use zebra-striping with #F9F9F9 and #FFFFFF. Headers must be bold, all-caps, and pinned to the top on scroll.
- **Tabs:** Use a "Folder Tab" style—horizontal lines with a 3px Safety Orange underline for the active state.