<script lang="ts">
	import TdClientManager from '$lib/TdClientManager.js';
	import { onMount } from 'svelte';
	import { type TdApi } from '$lib/types/td_api';
	import { PlayerUtils } from '$lib/utils/PlayerUtils';
	import type { TdObject } from 'tdweb';
	import MessageItemWrapper from '$lib/components/messages/MessageItemWrapper.svelte';
	import { error } from '@sveltejs/kit';

	let chunkSize = $state(
		typeof localStorage !== "undefined"
			? Number.parseInt(localStorage.getItem("chunkSize") ?? "100000", 10)
			: 100000
	);

	let {tdClientManager}:{tdClientManager:TdClientManager} = $props();

	let currentPlayMessage = JSON.parse(localStorage.getItem('currentPlayMessage') || '{}') as TdApi.message;
	let tdPlayer: PlayerUtils | undefined;

	let status = $state('VLC VideoPlayer is required to play the video.');

	async function readCurrentVideoFile(offset: number, length: number): Promise<ArrayBuffer> {
		if (tdPlayer) {
			return tdPlayer.getFileChunkOfVideo(offset, length);
		}
		return Promise.reject(new Error('Player is not initialized'));
	}

	async function downloadTest() {
		try {
			const offset = 3 * 1024 * 1024; // 3 MB mark
			const length = 1024 * 1024; // 1 MB chunk
			const chunk = await readCurrentVideoFile(offset, length);
			const blob = new Blob([chunk], { type: "application/octet-stream" });
			console.log("Download started: 1MB chunk from 3MB mark");
			console.log(chunk);
		} catch (err) {
			console.error("Failed to download chunk:", err);
		}
	}


	onMount(async () => {
		console.log(tdClientManager.isInitialized() ? 'TDLib is initialized' : 'TDLib is not initialized');
		while (!tdClientManager.isInitialized()) {
			await new Promise(resolve => setTimeout(resolve, 400));
		}
		tdPlayer = new PlayerUtils(tdClientManager, currentPlayMessage,(sta:string)=>{
			status = sta;
		});
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
					let fileId = 0;
					if(msg.content['@type'] == "messageDocument") fileId = (msg.content as TdApi.messageDocument).document.document.id;
					if(msg.content['@type'] == "messageVideo") fileId = (msg.content as TdApi.messageVideo).video.video.id;
					console.log(fileId);
					if(fileId>0){
						tdClientManager.getClient().send({
							'@type': 'getFile',
							file_id: fileId,
						} as TdApi.getFile as TdObject).then((r)=>{
							console.log(r);
							let file = r as unknown as TdApi.File ;
							try {
								window.electronAPI.videoReady(file.size);
							} catch (e) {
								console.log(e);
								status = 'Browser is not supported. Please use Windows Client to play the video.';
							}
						});

						console.log('File id dasdopjasdjapsdjaskjdalksj', fileId);

					}else {
						status = 'File not supported or corrupted.';
					}
				}
			});
	}

	function saveChunk() {
		localStorage.setItem('chunkSize', chunkSize.toString());
		status = 'Chunk size saved';
	}
</script>

<div
	class="h-full w-full bg-secondary-500 justify-center items-center flex flex-col md:flex-row bg-gradient-to-b from-[#334242] to-[#181918]">
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
				<button onclick={downloadTest} class="px-6 h-12 bg-primary-400 rounded-full text-white placeholder-gray-400">
					DOWNLOAD TEST
				</button>
			</div>

		</div>
	</div>

</div>