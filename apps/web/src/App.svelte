<script lang="ts">
  type Message = { id: number; body: string; created_at: string };

  let apiOk = $state<boolean | null>(null);
  let messages = $state<Message[]>([]);
  let draft = $state("");
  let submitting = $state(false);
  let error = $state<string | null>(null);

  async function checkHealth() {
    try {
      const res = await fetch("/api/health");
      apiOk = res.ok;
    } catch {
      apiOk = false;
    }
  }

  async function loadMessages() {
    try {
      const res = await fetch("/api/messages");
      if (!res.ok) throw new Error(`Failed to load messages (${res.status})`);
      const data = (await res.json()) as { messages: Message[] };
      messages = data.messages;
    } catch (e) {
      error = e instanceof Error ? e.message : "Unknown error";
    }
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    const body = draft.trim();
    if (!body) return;
    submitting = true;
    error = null;
    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      if (!res.ok) throw new Error(`Failed to post message (${res.status})`);
      draft = "";
      await loadMessages();
    } catch (e) {
      error = e instanceof Error ? e.message : "Unknown error";
    } finally {
      submitting = false;
    }
  }

  function formatTime(value: string): string {
    const parsed = new Date(value.includes("T") ? value : value.replace(" ", "T") + "Z");
    return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
  }

  // Runs once on mount (no reactive dependencies are read).
  $effect(() => {
    checkHealth();
    loadMessages();
  });
</script>

<main class="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
  <div class="mx-auto flex max-w-2xl flex-col gap-8 px-6 py-16">
    <header class="flex flex-col gap-3">
      <div class="flex items-center justify-between gap-4">
        <h1 class="text-3xl font-bold tracking-tight">Site&#8209;web</h1>
        {#if apiOk === null}
          <span class="rounded-full bg-slate-200 px-3 py-1 text-sm font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            Checking API…
          </span>
        {:else if apiOk}
          <span class="inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1 text-sm font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
            <span class="h-2 w-2 rounded-full bg-emerald-500"></span>
            API connected
          </span>
        {:else}
          <span class="inline-flex items-center gap-2 rounded-full bg-red-100 px-3 py-1 text-sm font-medium text-red-700 dark:bg-red-950 dark:text-red-300">
            <span class="h-2 w-2 rounded-full bg-red-500"></span>
            API unreachable
          </span>
        {/if}
      </div>
      <p class="text-slate-500 dark:text-slate-400">
        Full-stack starter — Svelte&nbsp;+&nbsp;Tailwind frontend talking to a Cloudflare Worker&nbsp;+&nbsp;D1 API.
      </p>
    </header>

    <section class="flex flex-col gap-4">
      <h2 class="text-lg font-semibold">Messages</h2>

      <form onsubmit={submit} class="flex gap-2">
        <input
          type="text"
          bind:value={draft}
          placeholder="Write a message…"
          class="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10 dark:border-slate-700 dark:bg-slate-900 dark:focus:border-slate-100"
        />
        <button
          type="submit"
          disabled={submitting || draft.trim() === ""}
          class="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
        >
          {submitting ? "Sending…" : "Send"}
        </button>
      </form>

      {#if error}
        <p class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">
          {error}
        </p>
      {/if}

      {#if messages.length === 0}
        <p class="rounded-lg border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-400 dark:border-slate-700">
          No messages yet. Post the first one above.
        </p>
      {:else}
        <ul class="flex flex-col gap-2">
          {#each messages as message (message.id)}
            <li class="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <p class="text-sm">{message.body}</p>
              <p class="mt-1 text-xs text-slate-400">{formatTime(message.created_at)}</p>
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  </div>
</main>
