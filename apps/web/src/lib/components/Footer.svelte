<script lang="ts">
  import { SITE } from "$lib/content";
  import Wordmark from "./Wordmark.svelte";

  let footerEl: HTMLElement | undefined = $state();

  $effect(() => {
    if (!footerEl) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) {
      footerEl.classList.add("footer--visible");
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            footerEl!.classList.add("footer--visible");
            observer.disconnect();
          }
        });
      },
      { threshold: 0.1 }
    );

    observer.observe(footerEl);

    return () => observer.disconnect();
  });

  const phoneRaw = SITE.phoneHref.replace("tel:", "");
</script>

<footer
  bind:this={footerEl}
  class="footer"
  data-testid="footer"
  aria-label="Pied de page"
>
  <div class="footer__inner">
    <!-- Left column: brand + contact -->
    <div class="footer__brand" data-testid="footer-brand">
      <Wordmark size="sm" variant="dark" />
      <address class="footer__address" data-testid="footer-address">
        <p class="footer__address-line" data-testid="footer-address-street">
          {SITE.address.street}
        </p>
        <p class="footer__address-line" data-testid="footer-address-city">
          {SITE.address.city}
        </p>
        <a
          href="tel:{phoneRaw}"
          class="footer__phone"
          data-testid="footer-phone"
          aria-label="Téléphone: {SITE.phone}"
        >
          {SITE.phone}
        </a>
      </address>
    </div>

    <!-- Right column: footer-only nav -->
    <nav
      class="footer__nav"
      aria-label="Navigation secondaire"
      data-testid="footer-nav"
    >
      <a
        href="/politiques"
        class="footer__link"
        data-testid="footer-link-politiques"
      >
        Politiques de l'établissement
      </a>
      <a
        href="/confidentialite"
        class="footer__link"
        data-testid="footer-link-confidentialite"
      >
        Politique de confidentialité
      </a>
    </nav>
  </div>

  <!-- Bottom strip: copyright -->
  <div class="footer__copy" data-testid="footer-copy">
    <span class="footer__copy-text" data-testid="footer-copy-text">
      © {new Date().getFullYear()} {SITE.name}. Tous droits réservés.
    </span>
  </div>
</footer>

<style>
  .footer {
    border-top: 1px solid var(--color-outline-variant);
    background-color: var(--color-surface);
    padding: var(--space-2xl) var(--space-xl);

    opacity: 0;
    transition: opacity 600ms cubic-bezier(0.33, 1, 0.68, 1);
  }

  /* svelte-ignore css_unused_selector */
  .footer.footer--visible {
    opacity: 1;
  }

  @media (prefers-reduced-motion: reduce) {
    .footer {
      opacity: 1;
      transition: none;
    }
  }

  /* ── Inner grid ── */
  .footer__inner {
    max-width: 1280px;
    margin: 0 auto;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-2xl);
    align-items: start;
    margin-bottom: var(--space-xl);
  }

  @media (max-width: 767px) {
    .footer__inner {
      grid-template-columns: 1fr;
      gap: var(--space-xl);
    }
  }

  /* ── Brand column ── */
  .footer__brand {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
  }

  /* ── Address ── */
  .footer__address {
    font-style: normal;
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .footer__address-line {
    font-family: var(--font-sans);
    font-size: 13px;
    font-weight: 400;
    line-height: 1.5;
    color: var(--color-ink-variant);
    margin: 0;
  }

  .footer__phone {
    font-family: var(--font-sans);
    font-size: 13px;
    font-weight: 400;
    line-height: 1.5;
    color: var(--color-ink-variant);
    text-decoration: none;
    display: inline-block;
    margin-top: var(--space-xs);

    background-image: linear-gradient(currentColor, currentColor);
    background-size: 0% 1px;
    background-repeat: no-repeat;
    background-position: left bottom;
    transition: background-size 240ms ease, color 200ms ease;
  }

  .footer__phone:hover {
    color: var(--color-ink);
    background-size: 100% 1px;
  }

  .footer__phone:focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: 3px;
    border-radius: var(--radius-sm);
  }

  @media (prefers-reduced-motion: reduce) {
    .footer__phone {
      transition: none;
      background-image: none;
      text-decoration: underline;
    }
  }

  /* ── Footer nav ── */
  .footer__nav {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
    padding-top: var(--space-xs);
  }

  @media (min-width: 768px) {
    .footer__nav {
      align-items: flex-end;
      text-align: right;
    }
  }

  .footer__link {
    font-family: var(--font-sans);
    font-size: 13px;
    font-weight: 400;
    line-height: 1.5;
    color: var(--color-ink-variant);
    text-decoration: none;
    display: inline-block;
    min-height: 44px;
    display: flex;
    align-items: center;

    position: relative;
  }

  .footer__link::after {
    content: '';
    position: absolute;
    bottom: 8px;
    left: 0;
    right: 0;
    height: 1px;
    background: var(--color-ink-variant);
    transform: scaleX(0);
    transform-origin: left center;
    transition: transform 240ms ease;
  }

  @media (min-width: 768px) {
    .footer__link::after {
      transform-origin: right center;
    }
  }

  .footer__link:hover {
    color: var(--color-ink);
  }

  .footer__link:hover::after {
    transform: scaleX(1);
  }

  .footer__link:focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: 3px;
    border-radius: var(--radius-sm);
  }

  @media (prefers-reduced-motion: reduce) {
    .footer__link::after {
      transition: none;
      transform: none;
    }
    .footer__link:hover::after,
    .footer__link:focus-visible::after {
      transform: scaleX(1);
    }
  }

  /* ── Copyright strip ── */
  .footer__copy {
    max-width: 1280px;
    margin: 0 auto;
    border-top: 1px solid var(--color-outline-variant);
    padding-top: var(--space-lg);
  }

  .footer__copy-text {
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 400;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--color-ink-variant);
    display: block;
  }
</style>
