<script lang="ts">
	import TdClientManager from '$lib/TdClientManager.js';
	import { onMount } from 'svelte';
	import { type TdApi } from '$lib/types/td_api';
	import { PlayerUtils } from '$lib/utils/PlayerUtils';

	import type { LayoutLoad } from '../$lib/types';
	import type { TdObject } from 'tdweb';
	import MessageItemWrapper from '$lib/components/messages/MessageItemWrapper.svelte';

	let chunkSize = $state(
		typeof localStorage !== "undefined"
			? Number.parseInt(localStorage.getItem("chunkSize") ?? "100000", 10)
			: 100000
	);

	let { data } = $props<{ data: LayoutLoad }>();
	let tdClientManager: TdClientManager = data.tdClientManager as TdClientManager;

	let currentPlayMessage = JSON.parse(localStorage.getItem('currentPlayMessage') || '{}') as TdApi.message;
	let tdPlayer: PlayerUtils | undefined;

	let status = $state('VLC VideoPlayer is required to play the video.');

	function readCurrentVideoFile(offset: number, length: number): Promise<ArrayBuffer> {
		if (tdPlayer) {
			return tdPlayer.getFileChunkOfVideo(offset, length);
		}
		return Promise.reject(new Error('Player is not initialized'));
	}

	onMount(async () => {
		console.log(tdClientManager.isInitialized() ? 'TDLib is initialized' : 'TDLib is not initialized');
		while (!tdClientManager.isInitialized()) {
			await new Promise(resolve => setTimeout(resolve, 400));
		}
		tdPlayer = new PlayerUtils(tdClientManager, currentPlayMessage,(sta:string)=>{
			status = sta;
		});
		tdPlayer.setChunkSize(chunkSize);
		window.readCurrentVideoFile = readCurrentVideoFile;
		console.log('Player is initialized');
	});

	function openVlc() {
		tdClientManager.getClient()
			.send({
				'@type': 'getMessage',
				chat_id: currentPlayMessage.chat_id,
				message_id: currentPlayMessage.id
			} as TdApi.getMessage as TdObject)
			.then((r) => {
				if (r['@type'] === 'message') {
					let msg = r as unknown as TdApi.message;
					const msgDoc = msg?.content as TdApi.messageDocument;
					try {
						window.electronAPI.videoReady(msgDoc.document.document.size);
					} catch (e) {
						console.log(e);
						status = 'Browser is not supported. Please use Windows Client to play the video.';
					}
				}
			});
	}

	function saveChunk() {
		tdPlayer?.setChunkSize(chunkSize);
		localStorage.setItem('chunkSize', chunkSize.toString());
		status = 'Chunk size saved';
	}
</script>

<div
	class="h-dvh w-dvw justify-center items-center flex flex-col md:flex-row bg-gradient-to-b from-[#334242] to-[#181918]">
	<div class="flex-col gap-4 flex items-center justify-center">
		<MessageItemWrapper client={tdClientManager.getClient()} messageItem={currentPlayMessage} />

		<button onclick={openVlc}
						class="text-3xl w-full bg-primary-400 px-10 py-4 rounded-full text-secondary-500 hover:scale-101">Play in VLC
		</button>
		<div class="p-4 w-full bg-[#ffffff11] rounded-2xl text-center text-gray-400 hover:scale-101">
			<p class="">{status}</p>
		</div>
		<div class="p-4 w-full flex gap-3 flex-col bg-[#ffffff11] rounded-2xl text-center text-gray-400 hover:scale-101">
			<p class="">Set Chunk Size (Bytes) : </p>
			<div class="flex flex-row gap-2">
				<input
					placeholder="Default 100000 (100 KB)"
					class="w-[90%] h-12 bg-[#D9D9D950] rounded-full pl-4 text-white placeholder-gray-400"
					bind:value={chunkSize}
				>
				<button onclick={saveChunk} class="px-6 h-12 bg-primary-400 rounded-full text-white placeholder-gray-400">
					SAVE
				</button>
			</div>

		</div>
	</div>

</div>