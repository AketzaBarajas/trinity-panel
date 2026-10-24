<script lang="ts">
	let { size = 22 }: { size?: number } = $props();
</script>

<svg
	class="logo"
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	stroke-width="2.2"
	stroke-linecap="round"
	role="img"
	aria-label="TRINITY"
>
	<line x1="3" y1="20.5" x2="12" y2="4" stroke="var(--m-1FA374)" />
	<line x1="12" y1="4" x2="21" y2="20.5" stroke="var(--m-3A70F0)" />
	<line x1="21" y1="20.5" x2="3" y2="20.5" stroke="var(--m-CB62C2)" />
</svg>

<style>
	.logo {
		flex: 0 0 auto;
		display: block;
	}
</style>
