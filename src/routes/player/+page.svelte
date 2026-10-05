<script lang="ts">
	import TdClientManager from '$lib/TdClientManager.js';
	import { onMount } from 'svelte';
	import { type TdApi } from '$lib/types/td_api';
	import { PlayerUtils, type StreamStats } from '$lib/utils/PlayerUtils';
	import type { LayoutLoad } from '../$lib/types';
	import type { TdObject } from 'tdweb';
	import MessageItemWrapper from '$lib/components/messages/MessageItemWrapper.svelte';
	import { goto } from '$app/navigation';

	let { data } = $props<{ data: LayoutLoad }>();
	let tdClientManager: TdClientManager = data.tdClientManager as TdClientManager;

	let currentPlayMessage = JSON.parse(
		(typeof localStorage !== 'undefined' ? localStorage.getItem('currentPlayMessage') : null) || '{}'
	) as TdApi.message;

	let tdPlayer: PlayerUtils | undefined;

	let statusText = $state('Ready to stream. Click "Play in VLC" to start.');
	let streamState = $state<'idle' | 'buffering' | 'streaming' | 'error'>('idle');
	let streamProgress = $state(0);
	let copied = $state(false);

	const STREAM_URL = 'http://localhost:30030/video.mkv';

	let fileName = $derived.by(() => {
		if (!currentPlayMessage || !currentPlayMessage.content) return 'video.mkv';
		const content = currentPlayMessage.content as any;
		if (content['@type'] === 'messageVideo') {
			return content.video?.file_name || 'video.mp4';
		}
		if (content['@type'] === 'messageDocument') {
			return content.document?.file_name || 'video.mkv';
		}
		return 'video.mkv';
	});

	let fileSize = $derived.by(() => {
		if (!currentPlayMessage || !currentPlayMessage.content) return 0;
		const content = currentPlayMessage.content as any;
		if (content['@type'] === 'messageVideo') {
			return content.video?.video?.size || 0;
		}
		if (content['@type'] === 'messageDocument') {
			return content.document?.document?.size || 0;
		}
		return 0;
	});

	let mimeType = $derived.by(() => {
		if (!currentPlayMessage || !currentPlayMessage.content) return 'video/mp4';
		const content = currentPlayMessage.content as any;
		if (content['@type'] === 'messageVideo') {
			return content.video?.mime_type || 'video/mp4';
		}
		if (content['@type'] === 'messageDocument') {
			return content.document?.mime_type || 'video/x-matroska';
		}
		return 'video/mp4';
	});

	function formatBytes(bytes: number): string {
		if (bytes <= 0) return '0 B';
		const k = 1024;
		const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
	}

	async function readCurrentVideoFile(offset: number, length: number): Promise<ArrayBuffer> {
		if (tdPlayer) {
			streamState = 'streaming';
			return tdPlayer.getFileChunkOfVideo(offset, length);
		}
		streamState = 'error';
		return Promise.reject(new Error('Player is not initialized'));
	}

	onMount(async () => {
		while (!tdClientManager.isInitialized()) {
			await new Promise((resolve) => setTimeout(resolve, 200));
		}

		tdPlayer = new PlayerUtils(tdClientManager, currentPlayMessage, (status: string, stats?: StreamStats) => {
			statusText = status;
			if (stats) {
				streamProgress = stats.progressPercent;
				streamState = 'streaming';
			}
		});

		window.readCurrentVideoFile = readCurrentVideoFile;
	});

	function openVlc() {
		streamState = 'buffering';
		statusText = 'Preparing stream for VLC...';

		tdClientManager
			.getClient()
			.send({
				'@type': 'getMessage',
				chat_id: currentPlayMessage.chat_id,
				message_id: currentPlayMessage.id
			} as TdApi.getMessage as TdObject)
			.then((r) => {
				if (r && r['@type'] === 'message') {
					const msg = r as unknown as TdApi.message;
					let fileId = 0;
					let size = 0;

					if (msg.content['@type'] === 'messageDocument') {
						const doc = msg.content as TdApi.messageDocument;
						fileId = doc.document.document.id;
						size = doc.document.document.size;
					} else if (msg.content['@type'] === 'messageVideo') {
						const vid = msg.content as TdApi.messageVideo;
						fileId = vid.video.video.id;
						size = vid.video.video.size;
					}

					if (fileId > 0 && size > 0) {
						try {
							window.electronAPI.videoReady(size);
							statusText = 'Stream active. Launching VLC...';
							streamState = 'streaming';
						} catch (e) {
							console.error(e);
							streamState = 'error';
							statusText = 'Desktop client required to launch VLC automatically.';
						}
					} else {
						streamState = 'error';
						statusText = 'Unsupported media format or corrupted file metadata.';
					}
				}
			})
			.catch((err) => {
				streamState = 'error';
				statusText = `Failed to retrieve media: ${err?.message || 'Network error'}`;
			});
	}

	function copyStreamUrl() {
		navigator.clipboard.writeText(STREAM_URL).then(() => {
			copied = true;
			setTimeout(() => {
				copied = false;
			}, 2000);
		});
	}

	function goBack() {
		goto('/home');
	}
</script>

<div class="h-dvh w-dvw justify-center items-center flex flex-col bg-gradient-to-b from-[#334242] to-[#181918] p-4">
	<div class="w-full max-w-xl flex flex-col bg-[#1c2222] border border-[#ffffff15] rounded-3xl overflow-hidden shadow-2xl">
		<!-- Header Bar -->
		<div class="px-6 py-4 flex flex-row items-center justify-between border-b border-[#ffffff10] bg-[#222a2a]">
			<div class="flex items-center gap-2.5">
				<span
					class="w-2.5 h-2.5 rounded-full {streamState === 'streaming'
						? 'bg-[#82a366]'
						: streamState === 'buffering'
							? 'bg-[#d1a657]'
							: streamState === 'error'
								? 'bg-[#c95b5b]'
								: 'bg-gray-500'}"
				></span>
				<span class="text-white text-sm font-semibold tracking-wide">VLC Media Stream</span>
			</div>
			<div class="flex items-center gap-2">
				<span class="text-[11px] font-mono text-gray-400 bg-[#ffffff0a] px-2 py-0.5 rounded border border-[#ffffff0a]">
					PORT 30030
				</span>
				<button
					onclick={goBack}
					class="text-gray-400 hover:text-white px-2 py-1 text-sm rounded-lg hover:bg-[#ffffff10] transition-colors"
					aria-label="Back to Home"
				>
					✕
				</button>
			</div>
		</div>

		<!-- Content Area -->
		<div class="p-6 flex flex-col gap-5">
			<!-- Message Preview Item -->
			<div class="w-full">
				<MessageItemWrapper client={tdClientManager.getClient()} messageItem={currentPlayMessage} />
			</div>

			<!-- File Details Grid -->
			<div class="grid grid-cols-2 gap-3 p-3.5 bg-[#171c1c] border border-[#ffffff0c] rounded-2xl text-xs font-mono">
				<div class="flex flex-col gap-1">
					<span class="text-gray-500 font-sans text-[11px]">Filename</span>
					<span class="text-gray-200 truncate font-mono">{fileName}</span>
				</div>
				<div class="flex flex-col gap-1">
					<span class="text-gray-500 font-sans text-[11px]">Size / Format</span>
					<span class="text-gray-200 font-mono">{formatBytes(fileSize)} ({mimeType.split('/')[1] || 'media'})</span>
				</div>
			</div>

			<!-- Stream URL Box -->
			<div class="flex flex-col gap-1.5">
				<span class="text-gray-400 text-xs font-medium pl-1">HTTP Stream Endpoint</span>
				<div class="flex flex-row items-center justify-between p-2.5 pl-3.5 bg-[#171c1c] border border-[#ffffff0c] rounded-xl">
					<span class="text-gray-300 font-mono text-xs select-all">{STREAM_URL}</span>
					<button
						onclick={copyStreamUrl}
						class="px-3 py-1 text-xs font-medium rounded-lg transition-colors {copied
							? 'bg-[#6b8253] text-white'
							: 'bg-[#ffffff10] hover:bg-[#ffffff18] text-gray-300'}"
					>
						{copied ? 'Copied' : 'Copy'}
					</button>
				</div>
			</div>

			<!-- Live Stream Progress -->
			<div class="flex flex-col gap-2 p-4 bg-[#171c1c] border border-[#ffffff0c] rounded-2xl">
				<div class="flex flex-row justify-between items-center text-xs">
					<span class="text-gray-400">Transfer Status</span>
					<span class="text-gray-300 font-mono">{streamProgress}%</span>
				</div>
				<div class="w-full h-2 bg-[#ffffff10] rounded-full overflow-hidden">
					<div
						class="h-full bg-[#6b8253] transition-all duration-300 rounded-full"
						style="width: {streamProgress}%;"
					></div>
				</div>
				<span class="text-xs text-gray-400 font-mono truncate">{statusText}</span>
			</div>

			<!-- Action Buttons -->
			<div class="flex flex-row gap-3 pt-2">
				<button
					onclick={openVlc}
					class="flex-1 py-3.5 px-6 bg-[#6b8253] hover:bg-[#7b9660] active:scale-[0.99] rounded-xl text-white font-semibold text-sm tracking-wide transition-all shadow-md"
				>
					Play in VLC
				</button>
				<button
					onclick={goBack}
					class="py-3.5 px-6 bg-[#ffffff0d] hover:bg-[#ffffff15] active:scale-[0.99] rounded-xl text-gray-300 font-medium text-sm transition-all border border-[#ffffff0a]"
				>
					Back
				</button>
			</div>
		</div>
	</div>
</div>
