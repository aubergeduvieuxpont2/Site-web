---
name: Industrial Zen
colors:
  surface: '#f7f9fb'
  surface-dim: '#d8dadc'
  surface-bright: '#f7f9fb'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f4f6'
  surface-container: '#eceef0'
  surface-container-high: '#e6e8ea'
  surface-container-highest: '#e0e3e5'
  on-surface: '#191c1e'
  on-surface-variant: '#45464d'
  inverse-surface: '#2d3133'
  inverse-on-surface: '#eff1f3'
  outline: '#76777d'
  outline-variant: '#c6c6cd'
  surface-tint: '#565e74'
  primary: '#000000'
  on-primary: '#ffffff'
  primary-container: '#131b2e'
  on-primary-container: '#7c839b'
  inverse-primary: '#bec6e0'
  secondary: '#9d4300'
  on-secondary: '#ffffff'
  secondary-container: '#fd761a'
  on-secondary-container: '#5c2400'
  tertiary: '#000000'
  on-tertiary: '#ffffff'
  tertiary-container: '#0d1c2f'
  on-tertiary-container: '#76859b'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dae2fd'
  primary-fixed-dim: '#bec6e0'
  on-primary-fixed: '#131b2e'
  on-primary-fixed-variant: '#3f465c'
  secondary-fixed: '#ffdbca'
  secondary-fixed-dim: '#ffb690'
  on-secondary-fixed: '#341100'
  on-secondary-fixed-variant: '#783200'
  tertiary-fixed: '#d5e3fd'
  tertiary-fixed-dim: '#b9c7e0'
  on-tertiary-fixed: '#0d1c2f'
  on-tertiary-fixed-variant: '#3a485c'
  background: '#f7f9fb'
  on-background: '#191c1e'
  surface-variant: '#e0e3e5'
typography:
  headline-lg:
    fontFamily: IBM Plex Sans
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: IBM Plex Sans
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  headline-md:
    fontFamily: IBM Plex Sans
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  headline-sm:
    fontFamily: IBM Plex Sans
    fontSize: 20px
    fontWeight: '500'
    lineHeight: 28px
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
  label-md:
    fontFamily: IBM Plex Sans
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.05em
  label-sm:
    fontFamily: IBM Plex Sans
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  unit: 4px
  gutter: 24px
  margin-mobile: 16px
  margin-desktop: 48px
  container-max: 1200px
---

## Brand & Style

The design system is built on the philosophy of **Utility-Driven Minimalism**. It serves a workforce that operates in demanding physical environments (forestry, hydro, mining), providing a digital experience that mirrors a well-organized workshop: efficient, sturdy, and free of clutter.

The aesthetic blends **Corporate/Modern** reliability with a **Minimalist** airy structure. It prioritizes high legibility and rapid information retrieval. The interface should feel "breathable" to provide a mental reprieve from heavy industrial work, yet remain anchored by solid, structural elements that imply safety and professional standards. 

Key attributes include:
- **Structural Integrity:** Use of clear divisions and purposeful alignment.
- **Airy Precision:** Generous white space to prevent cognitive overload.
- **Pragmatic Beauty:** Visual interest is derived from functional elements (typography, status indicators) rather than decoration.

## Colors

The palette is designed to be high-contrast and functional. The base is an "Airy White" to provide a sense of cleanliness and space.

- **Primary (Deep Slate):** Used for core navigation, headings, and heavy structural elements. It conveys the weight and reliability of industrial machinery.
- **Secondary (Safety Orange):** Reserved strictly for action-oriented elements, alerts, and critical status indicators. It mimics the visibility requirements of a job site.
- **Tertiary (Steel Blue):** Used for secondary actions and supporting information.
- **Neutral (Cloud Gray):** Provides the vast, open background surfaces and subtle borders that define the "Zen" aspect of the system.

## Typography

This design system uses **IBM Plex Sans** exclusively to leverage its engineered, technical character. The typeface strikes a perfect balance between the human and the machine, making it ideal for a workforce that bridges the gap between the two.

- **Headlines:** Use tight letter-spacing and semi-bold weights to create a sense of presence.
- **Body:** Standardized at 16px for optimal readability across all ages and lighting conditions.
- **Labels:** Uppercase labels with slight tracking are used for "metadata" (e.g., room numbers, gear status, shift times) to evoke industrial stamping or signage.

## Layout & Spacing

The layout follows a **Fixed Grid** philosophy on desktop to ensure a controlled, organized environment. On mobile, it transitions to a fluid, single-column stack.

- **The 4px Rhythm:** All spacing (padding, margins, gap) must be a multiple of 4px.
- **Desktop:** A 12-column grid with 24px gutters. Content is centered with wide "Zen" margins to create air.
- **Tablet:** 8-column grid with 16px gutters.
- **Mobile:** 4-column grid with 16px margins.
- **Whitespace:** Use "negative space" aggressively between major sections to emphasize the "Airy" brand pillar. Avoid tight grouping of disparate information.

## Elevation & Depth

To maintain the "Minimalist but Sturdy" feel, the design system avoids heavy shadows in favor of **Tonal Layers** and **Low-contrast Outlines**.

- **Surfaces:** Depth is achieved by placing elements on top of a `neutral-100` background using pure white (`#FFFFFF`) containers.
- **Borders:** Use 1px solid borders in `Slate-200` to define boundaries. This mimics architectural blueprints and technical drawings.
- **Interaction Depth:** Only use a very subtle, tight shadow (4px blur, 10% opacity) for "Active" states or floating action buttons to indicate they are physically pressable.

## Shapes

The shape language is "Soft-Industrial." We avoid perfectly sharp corners to keep the UI approachable and modern, but we avoid large radii that feel too "consumer-tech" or bubbly.

- **Standard Radius (4px):** Used for buttons, inputs, and small components.
- **Large Radius (8px):** Used for cards and main content containers.
- **Strictness:** Do not use fully rounded "pill" shapes; rectangles with subtle rounding imply better structural stability.

## Components

### Buttons
- **Primary:** Deep Slate background, White text. High-contrast, no gradient.
- **Secondary:** Transparent background, Deep Slate 1px border.
- **Action:** Safety Orange background, White text. Used for "Book Now," "Emergency," or "Submit."

### Input Fields
- Use a 1px border. When focused, the border thickens to 2px in Deep Slate, never Orange (unless there is an error). Labels should always be visible above the field in the `label-md` style.

### Cards
- White background, 1px `Slate-200` border, 8px corner radius. No shadow. Padding should be generous (24px) to maintain the "Airy" feel.

### Chips/Status Indicators
- Use small, rectangular tags with 2px radius. 
- **Status Colors:** Use "Hydro Blue" for active, "Slate" for inactive, and "Safety Orange" for urgent/attention required.

### Lists
- Use horizontal dividers (1px hair-lines) rather than boxed containers for long lists of data to maintain a clean, vertical flow.

### Icons
- Use stroke-based icons (2px weight) to match the technical feel of IBM Plex Sans. Avoid filled or "cutesy" iconography.