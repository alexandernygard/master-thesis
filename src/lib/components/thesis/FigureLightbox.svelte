<script lang="ts">
	import * as Dialog from '#lib/components/ui/dialog/index.js';

	/** Opens any figure image inside `root` full-size. */
	let { root }: { root: HTMLElement | undefined } = $props();

	let open = $state(false);
	let src = $state('');
	let label = $state('');
	let caption = $state('');

	$effect(() => {
		if (!root) return;
		const el = root;
		const click = (e: MouseEvent) => {
			const img = (e.target as HTMLElement).closest<HTMLImageElement>('figure img');
			if (!img || !el.contains(img) || img.closest('.center')) return;
			const fig = img.closest('figure.figure') ?? img.closest('figure');
			const cap = (img.closest('figure.subfigure') ?? fig)
				?.querySelector(':scope > figcaption')
				?.cloneNode(true) as HTMLElement | undefined;
			const l = cap?.querySelector('.caption-label');
			label = l?.textContent ?? '';
			l?.remove();
			caption = cap?.innerHTML ?? '';
			src = img.currentSrc || img.src;
			open = true;
		};
		el.addEventListener('click', click);
		return () => el.removeEventListener('click', click);
	});
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="w-[min(96vw,90rem)] max-w-none gap-3 p-3 sm:max-w-none sm:p-5">
		<Dialog.Title class="sr-only">{label || 'Figure'}</Dialog.Title>
		<div class="flex max-h-[78dvh] items-center justify-center overflow-auto rounded-lg bg-white">
			<img {src} alt={label} class="max-h-[78dvh] w-auto max-w-full object-contain" />
		</div>
		{#if caption}
			<Dialog.Description
				class="mx-auto max-w-3xl font-sans text-[0.82rem] leading-relaxed text-muted-foreground"
			>
				<span class="mr-1 font-semibold text-foreground">{label}</span>
				{@html caption}
			</Dialog.Description>
		{/if}
	</Dialog.Content>
</Dialog.Root>
