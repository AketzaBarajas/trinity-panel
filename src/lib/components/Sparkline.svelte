<script lang="ts">
	let {
		values,
		color = 'var(--live)',
		width = 112,
		height = 28,
		label
	}: { values: number[]; color?: string; width?: number; height?: number; label: string } = $props();

	const empty = $derived(values.every((v) => v === 0));
	const points = $derived.by(() => {
		const max = Math.max(...values, 1);
		const step = width / Math.max(values.length - 1, 1);
		return values.map((v, i) => [i * step, height - 3 - (v / max) * (height - 6)] as const);
	});
	const line = $derived(points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' '));
	const area = $derived(`0,${height} ${line} ${width},${height}`);
	const last = $derived(points[points.length - 1]);
</script>

<svg {width} {height} viewBox="0 0 {width} {height}" role="img" aria-label={label} class="spark">
	{#if empty}
		<line x1="0" y1={height - 3} x2={width} y2={height - 3} class="flat" />
	{:else}
		<polygon points={area} style:fill={color} fill-opacity="0.08" />
		<polyline points={line} fill="none" style:stroke={color} stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" />
		<circle cx={last[0]} cy={last[1]} r="2.5" style:fill={color} />
	{/if}
</svg>

<style>
	.spark {
		display: block;
		overflow: visible;
	}
	.flat {
		stroke: var(--line-2);
	}
</style>
