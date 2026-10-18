<script lang="ts">
	import { referencesByKey } from '#lib/content/index.js';
	import { fade } from 'svelte/transition';

	/**
	 * One floating card for every citation and cross-reference inside `root`.
	 * The thesis body is static HTML, so this listens with event delegation
	 * rather than mounting a component per link.
	 */
	let { root }: { root: HTMLElement | undefined } = $props();

	type Preview =
		| { kind: 'cite'; n: number; html: string; url: string | null }
		| { kind: 'figure'; label: string; img: string | null; caption: string }
		| { kind: 'section'; label: string; text: string };

	let preview = $state<Preview | null>(null);
	let pos = $state({ x: 0, y: 0, above: false });
	let card: HTMLElement | undefined = $state();
	let showTimer: ReturnType<typeof setTimeout>;
	let hideTimer: ReturnType<typeof setTimeout>;

	function build(a: HTMLAnchorElement): Preview | null {
		if (a.classList.contains('cite')) {
			const ref = referencesByKey.get(a.dataset.cite ?? '');
			return ref ? { kind: 'cite', n: ref.n, html: ref.html, url: ref.url } : null;
		}
		const id = decodeURIComponent(a.hash.slice(1));
		const target = document.getElementById(id);
		if (!target) return null;
		if (target.tagName === 'FIGURE') {
			const caption = target.querySelector(':scope > figcaption');
			const label = caption?.querySelector('.caption-label')?.textContent ?? '';
			const text = caption?.cloneNode(true) as HTMLElement | undefined;
			text?.querySelector('.caption-label')?.remove();
			return {
				kind: 'figure',
				label,
				img: target.querySelector('img')?.getAttribute('src') ?? null,
				caption: text?.innerHTML ?? ''
			};
		}
		const heading =
			target.tagName === 'SECTION'
				? target.querySelector(':scope > h2, :scope > h3, :scope > h4')
				: null;
		if (heading) {
			const para = target.querySelector(':scope > p');
			return {
				kind: 'section',
				label: heading.textContent?.trim() ?? '',
				text:
					(para?.textContent ?? '').slice(0, 260) +
					((para?.textContent?.length ?? 0) > 260 ? '…' : '')
			};
		}
		return null;
	}

	function place(a: HTMLElement) {
		const r = a.getBoundingClientRect();
		const width = Math.min(420, window.innerWidth - 24);
		const x = Math.max(
			12,
			Math.min(r.left + r.width / 2 - width / 2, window.innerWidth - width - 12)
		);
		const above = r.bottom > window.innerHeight * 0.62;
		pos = { x, y: above ? window.innerHeight - r.top + 8 : r.bottom + 8, above };
	}

	$effect(() => {
		if (!root) return;
		const el = root;

		const over = (e: PointerEvent) => {
			if (e.pointerType !== 'mouse') return;
			const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('a.cite, a.xref');
			if (!a || !el.contains(a)) return;
			clearTimeout(hideTimer);
			clearTimeout(showTimer);
			showTimer = setTimeout(() => {
				const p = build(a);
				if (!p) return;
				place(a);
				preview = p;
			}, 220);
		};
		const out = (e: PointerEvent) => {
			const a = (e.target as HTMLElement).closest('a.cite, a.xref');
			if (!a) return;
			clearTimeout(showTimer);
			hideTimer = setTimeout(() => (preview = null), 180);
		};
		const close = () => {
			clearTimeout(showTimer);
			preview = null;
		};

		el.addEventListener('pointerover', over);
		el.addEventListener('pointerout', out);
		window.addEventListener('scroll', close, { passive: true });
		el.addEventListener('click', close);
		return () => {
			el.removeEventListener('pointerover', over);
			el.removeEventListener('pointerout', out);
			window.removeEventListener('scroll', close);
			el.removeEventListener('click', close);
		};
	});
</script>

{#if preview}
	<div
		bind:this={card}
		role="tooltip"
		transition:fade={{ duration: 120 }}
		onpointerenter={() => clearTimeout(hideTimer)}
		onpointerleave={() => (hideTimer = setTimeout(() => (preview = null), 150))}
		class="fixed z-40 w-[min(420px,calc(100vw-24px))] rounded-xl border bg-popover p-4 font-sans text-[0.8rem] leading-relaxed text-popover-foreground shadow-xl shadow-black/10"
		style:left="{pos.x}px"
		style:top={pos.above ? undefined : `${pos.y}px`}
		style:bottom={pos.above ? `${pos.y}px` : undefined}
	>
		{#if preview.kind === 'cite'}
			<div class="flex gap-3">
				<span class="shrink-0 font-semibold text-brand tabular-nums">[{preview.n}]</span>
				<div class="reference min-w-0">{@html preview.html}</div>
			</div>
		{:else if preview.kind === 'figure'}
			{#if preview.img}
				<img
					src={preview.img}
					alt=""
					class="mb-3 max-h-56 w-full rounded-md bg-white object-contain p-1"
				/>
			{/if}
			<p class="line-clamp-5 text-muted-foreground">
				<span class="font-semibold text-foreground">{preview.label}</span>
				{@html preview.caption}
			</p>
		{:else}
			<p class="mb-1 font-semibold">{preview.label}</p>
			<p class="text-muted-foreground">{preview.text}</p>
		{/if}
	</div>
{/if}
