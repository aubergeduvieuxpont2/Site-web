<script lang="ts">
  import { reveal } from "../lib/motion";
  import { ROOMS, SITE } from "../lib/content";
  import Button from "../lib/components/Button.svelte";
  import Contour from "../lib/components/Contour.svelte";
  import PageHeader from "../lib/components/PageHeader.svelte";
  import SectionLabel from "../lib/components/SectionLabel.svelte";

  // Réservation request form state — Svelte 5 runes.
  let form = $state({
    name: "",
    email: "",
    phone: "",
    room: "",
    arrive: "",
    depart: "",
    people: 1,
    message: "",
  });

  let status = $state<"idle" | "sending" | "sent" | "error">("idle");
  let errorMsg = $state("");

  const inputClass =
    "w-full rounded-[var(--radius-blueprint)] border border-hairline-2 bg-surface px-4 py-3 text-ink outline-none transition focus:border-terracotta focus:ring-1 focus:ring-terracotta";

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    if (status === "sending") return;

    errorMsg = "";

    if (!form.name.trim() || !form.email.trim()) {
      status = "error";
      errorMsg =
        "Il nous faut au moins votre nom et un courriel pour vous répondre.";
      return;
    }

    status = "sending";

    try {
      const res = await fetch("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (res.ok) {
        status = "sent";
      } else {
        status = "error";
        errorMsg =
          "L'envoi a échoué de notre côté. Réessayez ou appelez-nous directement.";
      }
    } catch {
      status = "error";
      errorMsg =
        "Connexion impossible pour le moment. Réessayez ou appelez-nous directement.";
    }
  }
</script>

<PageHeader
  code="04"
  kicker="Réservation & contact"
  title="Parlons de votre séjour."
  lead="Disponibilités, tarifs de groupe, horaires de quart — écrivez-nous ou appelez. On répond vite, en français."
>
  {#snippet children()}
    <div class="flex flex-wrap items-center gap-3">
      <Button href={SITE.phoneHref} variant="primary">{SITE.phone}</Button>
      <Button href={"mailto:" + SITE.email} variant="ghost">Écrire un courriel →</Button>
    </div>
  {/snippet}
</PageHeader>

<!-- ===================== FORM + COORDINATES ===================== -->
<section class="bg-surface">
  <div class="mx-auto max-w-[1280px] px-5 py-16 md:px-10 md:py-24">
    <div class="grid gap-10 lg:grid-cols-5 lg:gap-12">
      <!-- ============ LEFT — RESERVATION REQUEST FORM ============ -->
      <div use:reveal={{ y: 22 }} class="lg:col-span-3">
        <div
          class="rounded-[var(--radius-blueprint)] border border-hairline-2 p-6 md:p-9"
          style="background:#ffffff"
        >
          {#if status === "sent"}
            <!-- ============ SUCCESS CONFIRMATION ============ -->
            <div class="relative overflow-hidden">
              <div class="flex items-center gap-3">
                <span class="tech-label text-terracotta">CONF-01</span>
                <span class="h-px w-10 bg-hairline" aria-hidden="true"></span>
                <span class="tech-label text-ink-soft">Demande reçue</span>
              </div>
              <div
                class="mt-6 flex h-12 w-12 items-center justify-center rounded-[var(--radius-blueprint)] border border-terracotta bg-surface text-terracotta"
              >
                <span class="h-3 w-3 bg-terracotta" aria-hidden="true"></span>
              </div>
              <h2
                class="mt-6 font-sans text-[2rem] font-semibold leading-[1.05] tracking-[-0.02em] text-ink md:text-[2.6rem]"
              >
                C'est noté, {form.name.split(" ")[0] || "merci"}.
              </h2>
              <p class="mt-4 max-w-md text-lg text-ink-soft">
                On a bien reçu votre demande. Un membre de l'équipe vous revient
                sous peu pour confirmer les disponibilités et les tarifs.
              </p>
              <div
                class="mt-7 rounded-[var(--radius-blueprint)] border border-hairline-2 bg-surface-2 p-5"
              >
                <span class="tech-label text-ink-mute">Une nuit à bloquer vite ?</span>
                <a
                  href={SITE.phoneHref}
                  class="mt-2 block font-mono text-2xl font-semibold tracking-[-0.01em] text-ink transition-opacity hover:opacity-80 md:text-3xl"
                  >{SITE.phone}</a
                >
              </div>
            </div>
          {:else}
            <!-- ============ FORM ============ -->
            <div class="flex items-center gap-3">
              <span class="tech-label text-terracotta">REQ</span>
              <span class="h-px w-10 bg-hairline" aria-hidden="true"></span>
              <span class="tech-label text-ink-soft">Demande de réservation</span>
            </div>
            <p class="mt-4 text-sm leading-relaxed text-ink-soft">
              Remplissez la fiche, on revient avec les disponibilités. Aucun
              paiement à cette étape.
            </p>

            <form class="mt-8 flex flex-col gap-5" onsubmit={handleSubmit} novalidate>
              <div class="flex flex-col gap-2">
                <label class="tech-label text-ink-mute" for="field-name"
                  >Nom complet</label
                >
                <input
                  id="field-name"
                  type="text"
                  required
                  autocomplete="name"
                  bind:value={form.name}
                  class={inputClass}
                  placeholder="Votre nom"
                />
              </div>

              <div class="grid gap-5 sm:grid-cols-2">
                <div class="flex flex-col gap-2">
                  <label class="tech-label text-ink-mute" for="field-email"
                    >Courriel</label
                  >
                  <input
                    id="field-email"
                    type="email"
                    required
                    autocomplete="email"
                    bind:value={form.email}
                    class={inputClass}
                    placeholder="vous@exemple.com"
                  />
                </div>
                <div class="flex flex-col gap-2">
                  <label class="tech-label text-ink-mute" for="field-phone"
                    >Téléphone</label
                  >
                  <input
                    id="field-phone"
                    type="tel"
                    autocomplete="tel"
                    bind:value={form.phone}
                    class={inputClass}
                    placeholder="418 000-0000"
                  />
                </div>
              </div>

              <div class="flex flex-col gap-2">
                <label class="tech-label text-ink-mute" for="field-room"
                  >Type de chambre</label
                >
                <select id="field-room" bind:value={form.room} class={inputClass}>
                  <option value="">Indifférent</option>
                  {#each ROOMS as r (r.id)}
                    <option value={r.name}>{r.name}</option>
                  {/each}
                </select>
              </div>

              <div class="grid grid-cols-2 gap-5">
                <div class="flex flex-col gap-2">
                  <label class="tech-label text-ink-mute" for="field-arrive"
                    >Date d'arrivée</label
                  >
                  <input
                    id="field-arrive"
                    type="date"
                    bind:value={form.arrive}
                    class={inputClass}
                  />
                </div>
                <div class="flex flex-col gap-2">
                  <label class="tech-label text-ink-mute" for="field-depart"
                    >Date de départ</label
                  >
                  <input
                    id="field-depart"
                    type="date"
                    bind:value={form.depart}
                    class={inputClass}
                  />
                </div>
              </div>

              <div class="flex flex-col gap-2">
                <label class="tech-label text-ink-mute" for="field-people"
                  >Nombre de personnes</label
                >
                <input
                  id="field-people"
                  type="number"
                  min="1"
                  bind:value={form.people}
                  class={inputClass}
                />
              </div>

              <div class="flex flex-col gap-2">
                <label class="tech-label text-ink-mute" for="field-message"
                  >Message</label
                >
                <textarea
                  id="field-message"
                  rows="4"
                  bind:value={form.message}
                  class={inputClass + " resize-y"}
                  placeholder="Crew de chantier, peloton, horaire de quart, équipement à ranger… dites-nous tout."
                ></textarea>
              </div>

              {#if status === "error"}
                <div
                  class="rounded-[var(--radius-blueprint)] border border-terracotta/40 bg-terracotta/5 p-4"
                  role="alert"
                >
                  <p class="text-sm font-medium text-ember">{errorMsg}</p>
                  <p class="mt-2 text-sm text-ink-soft">
                    En attendant, appelez-nous :
                    <a
                      href={SITE.phoneHref}
                      class="font-mono font-semibold text-ink underline decoration-1 underline-offset-2 hover:text-terracotta"
                      >{SITE.phone}</a
                    >
                  </p>
                </div>
              {/if}

              <div class="mt-1" aria-busy={status === "sending"}>
                <Button type="submit" variant="primary" block>
                  {status === "sending" ? "Envoi en cours…" : "Envoyer la demande"}
                </Button>
              </div>
            </form>
          {/if}
        </div>
      </div>

      <!-- ============ RIGHT — COORDINATES PANEL ============ -->
      <div use:reveal={{ y: 22, delay: 0.1 }} class="lg:col-span-2">
        <div class="flex flex-col gap-8">
          <div>
            <SectionLabel text="Coordonnées" />

            <div class="mt-6 flex flex-col gap-6">
              <div>
                <span class="tech-label text-ink-mute">Adresse</span>
                <address class="mt-2 not-italic text-ink-soft">
                  <span class="block text-ink">{SITE.address.street}</span>
                  <span class="block"
                    >{SITE.address.city}, {SITE.address.province}</span
                  >
                  <span class="block">{SITE.address.postal} · {SITE.address.country}</span>
                </address>
              </div>

              <div class="h-px w-full bg-hairline-2" aria-hidden="true"></div>

              <div>
                <span class="tech-label text-ink-mute">Téléphone</span>
                <a
                  href={SITE.phoneHref}
                  class="mt-2 block font-mono text-2xl font-semibold tracking-[-0.01em] text-ink transition-opacity hover:opacity-80 md:text-[1.75rem]"
                  >{SITE.phone}</a
                >
              </div>

              <div>
                <span class="tech-label text-ink-mute">Courriel</span>
                <a
                  href={"mailto:" + SITE.email}
                  class="mt-2 block break-all text-ink-soft underline decoration-1 underline-offset-[5px] decoration-hairline transition-colors hover:text-terracotta hover:decoration-terracotta"
                  >{SITE.email}</a
                >
              </div>

              <div class="h-px w-full bg-hairline-2" aria-hidden="true"></div>

              <div>
                <span class="tech-label text-ink-mute">Horaires</span>
                <dl class="mt-3 flex flex-col gap-2 font-mono text-sm">
                  <div class="flex items-center justify-between border-b border-hairline pb-2">
                    <dt class="text-ink-soft">Arrivée</dt>
                    <dd class="text-ink">15 h</dd>
                  </div>
                  <div class="flex items-center justify-between border-b border-hairline pb-2">
                    <dt class="text-ink-soft">Départ</dt>
                    <dd class="text-ink">11 h</dd>
                  </div>
                  <div class="flex items-center justify-between">
                    <dt class="text-ink-soft">Réception</dt>
                    <dd class="text-ink">7 h–22 h</dd>
                  </div>
                </dl>
              </div>

              <div
                class="rounded-[var(--radius-blueprint)] border border-hairline-2 bg-surface-2 p-4"
              >
                <span class="tech-label text-terracotta">Tarifs entreprise</span>
                <p class="mt-2 text-sm leading-relaxed text-ink-soft">
                  Crew de chantier ou réservation récurrente ? On monte une
                  entente contractuelle avec facturation simplifiée. Mentionnez-le
                  dans votre demande.
                </p>
              </div>
            </div>
          </div>

          <!-- ============ STYLIZED MAP PLACEHOLDER ============ -->
          <div>
            <SectionLabel text="Repère" />
            <div
              class="relative mt-5 aspect-[4/3] overflow-hidden rounded-[var(--radius-blueprint)] border border-hairline-2 bg-surface-2"
            >
              <Contour
                class="pointer-events-none absolute inset-0 h-full w-full text-outline/20"
              />
              <div
                class="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-terracotta via-hairline to-transparent"
              ></div>
              <div
                class="relative flex h-full w-full flex-col items-center justify-center text-center"
              >
                <span class="flex h-4 w-4 items-center justify-center">
                  <span class="h-3 w-3 rotate-45 border border-terracotta bg-terracotta/30"></span>
                </span>
                <span class="mt-4 font-mono text-sm font-semibold tracking-[0.06em] text-ink"
                  >N 46.9° · O 71.8°</span
                >
                <span class="mt-1.5 font-mono text-[0.7rem] uppercase tracking-[0.18em] text-ink-mute"
                  >Saint-Raymond, Québec</span
                >
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- ===================== SLIM PHONE CTA STRIP ===================== -->
<section class="border-t border-hairline-2 bg-charcoal text-on-charcoal">
  <div
    class="mx-auto flex max-w-[1280px] flex-col items-start gap-5 px-5 py-10 md:flex-row md:items-center md:justify-between md:px-10"
  >
    <div use:reveal={{ x: -16 }} class="flex items-center gap-4">
      <span class="tech-label text-terracotta">Ligne directe</span>
      <p class="text-on-charcoal-soft">
        Préférez la parole ? On répond entre 7 h et 22 h, en français.
      </p>
    </div>
    <a
      href={SITE.phoneHref}
      class="font-sans text-2xl font-semibold tracking-[-0.01em] text-on-charcoal transition-opacity hover:opacity-80 md:text-3xl"
      >{SITE.phone}</a
    >
  </div>
</section>
