<script lang="ts">
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import Download from '@lucide/svelte/icons/download';
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import { thesis } from '#lib/content/index.js';

	let { open = $bindable(false), page = 1 }: { open?: boolean; page?: number } = $props();

	const src = $derived(`${thesis.meta.pdf.src}#page=${page}&view=FitH`);
	const size = thesis.meta.pdf.bytes
		? `${(thesis.meta.pdf.bytes / 1024 / 1024).toFixed(1)} MB`
		: '';
</script>

<Dialog.Root bind:open>
	<Dialog.Content
		class="flex h-[92dvh] w-[min(96vw,72rem)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none"
		showCloseButton={false}
	>
		<div class="flex items-center gap-3 border-b px-4 py-2.5 font-sans">
			<div class="min-w-0 flex-1">
				<Dialog.Title class="truncate text-sm font-semibold">{thesis.meta.title}</Dialog.Title>
				<Dialog.Description class="text-xs text-muted-foreground">
					Original typeset PDF{size ? ` · ${size}` : ''}{page > 1
						? ` · opened at page ${page}`
						: ''}
				</Dialog.Description>
			</div>
			<Button variant="ghost" size="sm" href={src} target="_blank" rel="noreferrer">
				<ExternalLink />
				<span class="hidden sm:inline">New tab</span>
			</Button>
			<Button
				variant="outline"
				size="sm"
				href={thesis.meta.pdf.src}
				download="Nygard-MSc-thesis-2026.pdf"
			>
				<Download />
				<span class="hidden sm:inline">Download</span>
			</Button>
			<Dialog.Close>
				{#snippet child({ props })}
					<Button variant="ghost" size="sm" {...props}>Close</Button>
				{/snippet}
			</Dialog.Close>
		</div>
		{#if open}
			{#key src}
				<iframe title="Thesis PDF" {src} class="min-h-0 w-full flex-1 bg-muted"></iframe>
			{/key}
		{/if}
	</Dialog.Content>
</Dialog.Root>
