<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import TdClientManager from '$lib/TdClientManager';
	import { goto } from '$app/navigation';
	import type { TdApi } from '$lib/types/td_api';

	let isStuck = $state(false);
	let errorMessage = $state<string | null>(null);
	let isResetting = $state(false);
	let receivedAuthUpdate = false;

	async function handleResetDatabase() {
		isResetting = true;
		try {
			await TdClientManager.resetLocalDatabase();
			window.location.reload();
		} catch (err: any) {
			console.error('Failed to reset database:', err);
			errorMessage = err?.message || 'Failed to reset database';
			isResetting = false;
		}
	}

	let watchdogTimer: any = null;

	onDestroy(() => {
		if (watchdogTimer) {
			clearTimeout(watchdogTimer);
		}
	});

	onMount(() => {
		if (!localStorage.getItem('api_id')) {
			goto('../configure', { replaceState: true });
			return;
		}

		// Fallback watchdog: if TDLib worker crashes or hangs for 5 seconds, prompt recovery
		watchdogTimer = setTimeout(() => {
			if (!receivedAuthUpdate) {
				isStuck = true;
			}
		}, 5000);

		(async () => {
			try {
				const tdClientManager = await TdClientManager.getSingletonInstance();

				tdClientManager.onError((err) => {
					errorMessage = err;
					isStuck = true;
				});

				tdClientManager.setCallback((update) => {
					if (update['@type'] === 'updateAuthorizationState') {
						receivedAuthUpdate = true;
						if (watchdogTimer) clearTimeout(watchdogTimer);
						const updateType = update['authorization_state'] as TdApi.AuthorizationState;
						if (updateType['@type'] === 'authorizationStateWaitPhoneNumber') {
							goto('../login', { replaceState: true });
						} else if (updateType['@type'] === 'authorizationStateWaitCode') {
							goto('../home', { replaceState: true });
						} else if (updateType['@type'] === 'authorizationStateReady') {
							goto('../home', { replaceState: true });
						}
					}
				});
			} catch (e: any) {
				console.error('Failed to get TDLib client instance:', e);
				errorMessage = e?.message || 'Client initialization failed';
				isStuck = true;
			}
		})();
	});
</script>

<div class="h-dvh w-dvw flex flex-col justify-center items-center bg-[#181918] text-center p-6 select-none">
	{#if !isStuck}
		<div class="flex flex-col items-center gap-4">
			<div class="w-10 h-10 border-2 border-primary-400 border-t-transparent rounded-full animate-spin"></div>
			<h1 class="text-slate-300 text-lg font-medium tracking-wide">Initializing TG Play</h1>
			<p class="text-xs text-slate-500 font-mono">Mounting database and connecting to TDLib...</p>
		</div>
	{:else}
		<div class="flex flex-col items-center gap-4 max-w-md w-full p-6 bg-[#212626] border border-[#3e4848] rounded-xl shadow-2xl">
			<div class="w-full flex items-center justify-between border-b border-[#323c3c] pb-3">
				<span class="text-xs uppercase tracking-wider text-amber-400 font-semibold">Startup Alert</span>
				<span class="text-[11px] font-mono text-slate-400">TDLib FS</span>
			</div>

			<p class="text-sm text-slate-300 text-left w-full leading-relaxed">
				TDLib initialization timed out or encountered a database CRC corruption (common after an ungraceful reload or browser kill).
			</p>

			{#if errorMessage}
				<div class="w-full p-2.5 bg-red-950/40 border border-red-900/50 rounded text-xs font-mono text-red-300 break-all text-left">
					{errorMessage}
				</div>
			{/if}

			<div class="flex gap-3 w-full mt-2">
				<button
					onclick={handleResetDatabase}
					disabled={isResetting}
					class="flex-1 py-2.5 px-4 bg-primary-400 hover:bg-opacity-90 active:scale-[0.98] text-white text-xs font-medium uppercase tracking-wider rounded-lg transition disabled:opacity-50"
				>
					{isResetting ? 'Resetting Database...' : 'Reset Database & Restart'}
				</button>
				<button
					onclick={() => goto('/configure')}
					class="py-2.5 px-4 bg-[#2a3333] hover:bg-[#343e3e] text-slate-300 text-xs font-medium rounded-lg transition"
				>
					API Keys
				</button>
			</div>
			<p class="text-[11px] text-slate-500 w-full text-left">
				Resetting will wipe the corrupted local binlog while keeping your saved API credentials intact.
			</p>
		</div>
	{/if}
</div>

