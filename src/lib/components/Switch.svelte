<script lang="ts">
	let {
		checked,
		label,
		disabled = false,
		onchange
	}: { checked: boolean; label: string; disabled?: boolean; onchange?: (v: boolean) => void } = $props();
</script>

<button
	type="button"
	class="switch"
	role="switch"
	aria-checked={checked}
	aria-label={label}
	{disabled}
	onclick={() => onchange?.(!checked)}
>
	<span class="thumb" aria-hidden="true"></span>
</button>

<style>
	.switch {
		position: relative;
		flex: 0 0 auto;
		width: 34px;
		height: 20px;
		padding: 0;
		border: 1px solid var(--line-2);
		border-radius: 999px;
		background: var(--bg-sunken);
		cursor: pointer;
		transition:
			background-color 180ms ease,
			border-color 180ms ease;
	}

	.switch[aria-checked='true'] {
		background: var(--go);
		border-color: transparent;
	}

	.switch:disabled {
		cursor: default;
		opacity: 0.55;
	}

	.thumb {
		position: absolute;
		top: 2px;
		left: 2px;
		width: 14px;
		height: 14px;
		border-radius: 50%;
		background: var(--ink-2);
		transition:
			transform 220ms var(--ease-out),
			background-color 180ms ease;
	}

	.switch[aria-checked='true'] .thumb {
		transform: translateX(14px);
		background: var(--go-ink);
	}

	:global([data-theme='light']) .switch[aria-checked='true'] .thumb {
		background: #fff;
	}

	.switch:active:not(:disabled) .thumb {
		width: 17px;
	}

	.switch[aria-checked='true']:active:not(:disabled) .thumb {
		transform: translateX(11px);
	}

	@media (prefers-reduced-motion: reduce) {
		.thumb {
			transition: none;
		}
	}
</style>
