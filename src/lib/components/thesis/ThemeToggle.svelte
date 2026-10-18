<script lang="ts">
	import { toggleMode } from 'mode-watcher';
	import { Button } from '#lib/components/ui/button/index.js';
	import Sun from '@lucide/svelte/icons/sun';
	import Moon from '@lucide/svelte/icons/moon';

	let { class: className = '' }: { class?: string } = $props();
</script>

<Button
	variant="ghost"
	size="icon-sm"
	onclick={toggleMode}
	class={className}
	title="Toggle dark mode"
>
	<Sun class="dark:hidden" />
	<Moon class="hidden dark:block" />
	<span class="sr-only">Toggle dark mode</span>
</Button>
