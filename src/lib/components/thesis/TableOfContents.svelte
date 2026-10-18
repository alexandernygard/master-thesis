<script lang="ts">
	import { slide } from 'svelte/transition';
	import { nav, navById, type NavEntry } from '#lib/content/index.js';
	import { cn } from '#lib/utils.js';

	let { active, onnavigate }: { active: string | null; onnavigate?: () => void } = $props();

	/** The active heading and all of its ancestors. */
	const trail = $derived.by(() => {
		const ids = new Set<string>();
		let id = active;
		while (id) {
			ids.add(id);
			id = navById.get(id)?.parent ?? null;
		}
		return ids;
	});

	const groups = $derived(
		nav.map((g) => ({
			group: g.group,
			entries: g.entries.filter((e) => e.depth === 0 || (e.parent && trail.has(e.parent)))
		}))
	);

	let list: HTMLElement | undefined = $state();

	// Keep the active entry in view inside the scrolling sidebar.
	$effect(() => {
		if (!active || !list) return;
		const el = list.querySelector<HTMLElement>(`[data-toc-id="${CSS.escape(active)}"]`);
		if (!el) return;
		const box = list.getBoundingClientRect();
		const r = el.getBoundingClientRect();
		if (r.top < box.top + 40 || r.bottom > box.bottom - 40) {
			list.scrollTo({ top: list.scrollTop + r.top - box.top - box.height / 3, behavior: 'smooth' });
		}
	});

	function label(e: NavEntry) {
		return e.number ? `${e.number} ${e.label}` : e.label;
	}
</script>

<nav
	aria-label="Table of contents"
	bind:this={list}
	class="toc h-full overflow-y-auto overscroll-contain pr-2 pb-10"
>
	{#each groups as g (g.group)}
		<div class="mt-6 first:mt-0">
			<p
				class="mb-2 px-3 font-sans text-[0.68rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase"
			>
				{g.group}
			</p>
			<ul class="space-y-px">
				{#each g.entries as e (e.id)}
					{@const isActive = active === e.id}
					{@const inTrail = trail.has(e.id)}
					<li transition:slide={{ duration: 180 }}>
						<a
							href="#{e.id}"
							data-toc-id={e.id}
							onclick={() => onnavigate?.()}
							aria-current={isActive ? 'location' : undefined}
							title={label(e)}
							class={cn(
								'group relative flex items-baseline gap-2.5 rounded-md py-1.5 pr-2 font-sans leading-snug transition-colors',
								e.depth === 0 && 'pl-3 text-[0.86rem]',
								e.depth === 1 && 'pl-7 text-[0.8rem]',
								e.depth === 2 && 'pl-11 text-[0.76rem]',
								isActive
									? 'bg-brand-soft font-medium text-foreground'
									: inTrail
										? 'text-foreground'
										: 'text-muted-foreground hover:bg-muted hover:text-foreground'
							)}
						>
							{#if isActive}
								<span
									class="absolute top-1.5 bottom-1.5 left-0 w-[2px] rounded-full bg-brand"
									aria-hidden="true"
								></span>
							{/if}
							{#if e.number}
								<span
									class={cn(
										'shrink-0 tabular-nums',
										e.depth === 0 ? 'w-4 text-[0.78rem]' : 'text-[0.72rem]',
										inTrail ? 'text-brand' : 'text-muted-foreground/80'
									)}>{e.number}</span
								>
							{/if}
							<span class={cn(e.depth === 0 && 'font-medium', e.depth > 0 && 'line-clamp-2')}
								>{e.label}</span
							>
						</a>
					</li>
				{/each}
			</ul>
		</div>
	{/each}
</nav>
