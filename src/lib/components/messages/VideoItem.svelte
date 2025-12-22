<script lang="ts">
	import type { TdApi } from '$lib/types/td_api';
	import TdClient, { type TdObject } from 'tdweb';
	import { onDestroy, onMount } from 'svelte';
	import { TelegramUtils } from '$lib/utils/TelegramUtils';
	import { goto, pushState } from '$app/navigation';

	let thumbImg: string = $state('../placeholder.svg');
	let { messageItem, client } = $props<{ messageItem: TdApi.message, client: TdClient }>();
	let message = $derived(messageItem as TdApi.message);
	let messageVideo = $derived(message.content as TdApi.messageVideo);
	let colorTitle = $derived.by(() => {
		return `hsl(${[messageSender].reduce((acc, char) => (acc + char.charCodeAt(0)), 0) % 256}, 60%, 70%)`;
	});
	let messageSender = $state('');
	onMount(async () => {
		if (message.sender_id['@type'] == 'messageSenderUser') {
			let user = await client.send({
				'@type': 'getUser',
				user_id: (message.sender_id as TdApi.messageSenderUser).user_id
			} as TdApi.getUser) as TdApi.user;
			messageSender = user.first_name + ' ' + user.last_name;
		}


	});


	function setDocImage(file: TdApi.file) {
		client.send({
			'@type': 'readFilePart',
			file_id: file.id,
			offset: 0,
			limit: 0
		} as TdApi.readFilePart as TdObject).then((response: TdObject) => {
			if (response['@type'] === 'filePart') {
				const filePart = response as unknown as TdApi.filePart;
				try {
					const blob = filePart.data;
					thumbImg = URL.createObjectURL(blob);
				} catch (e) {
					console.error('Error reading file content:', e);
				}
			}
		});
	}

	function downloadAndSetDocImg(profileFile: TdApi.file) {
		client.send({
			'@type': 'downloadFile',
			file_id: profileFile.id,
			priority: 1,
			synchronous: true
		} as TdApi.downloadFile as TdObject).then((r: TdObject) => {
			console.log(r);
			if (r['@type'] === 'file') {
				const file = (r as unknown as TdApi.file);
				console.log(file);
				if (profileFile && !thumbImg.startsWith('blob:')) {
					setDocImage(file);
				}
			}
		});
	}

	function showImage(imageFile: TdApi.file) {
		if (client && imageFile?.id) {
			if (imageFile.local.is_downloading_completed) {
				if (imageFile && !thumbImg.startsWith('blob:')) {
					setDocImage(imageFile);
				}
			} else {
				if (!imageFile.local.is_downloading_active) {
					downloadAndSetDocImg(imageFile);
				}
			}
		}
	}


	onMount(() => {
		if (messageVideo.video.thumbnail) {
			showImage(messageVideo.video.thumbnail.file);
		}
	});
	onDestroy(() => {
		if (thumbImg && thumbImg.startsWith('blob:')) {
			URL.revokeObjectURL(thumbImg);
		}
	});

	function formatSize(bytes: number) {
		const units = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
		let unitIndex = 0;
		let size = bytes;

		while (size >= 1024 && unitIndex < units.length - 1) {
			size /= 1024;
			unitIndex++;
		}

		return `${size.toFixed(2)} ${units[unitIndex]}`;
	}

	function playMessage() {
		if (messageVideo.video.mime_type.startsWith("video")) {
			localStorage.setItem("currentPlayMessage", JSON.stringify(message));
			pushState('', {
				showChat: true,
				showPlayer: true,
			});
		}
	}
</script>

<div class="w-full rounded-xl p-2 bg-[#ffffff11] flex flex-col">
	<p class="w-full font-semibold pl-2 pb-1  truncate" style={`color: ${colorTitle};`}>{messageSender}</p>
	<div class="w-full rounded-2xl bg-[#ffffff11] h-20 flex flex-row items-center px-4">
		<div class="w-12 h-12 rounded-full block relative">
			<img class="absolute w-12 h-12 rounded-full mask-alpha opacity-70" alt="profile" src={thumbImg} />
			<button aria-label="play" class="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-[url('../play.svg')] w-5 h-5 rounded-full"
							onclick={playMessage}></button>
		</div>
		<div class="px-2 flex-1 h-max overflow-hidden">
			<p class="font-semibold text-[0.9rem] text-white">{messageVideo.video.file_name}</p>
			<p class="text-xs text-gray-300 truncate"> {formatSize(messageVideo.video.video.size)+ " - " + messageVideo.video.mime_type} </p>
		</div>
	</div>
	<pre class="text-gray-300 text-[0.9rem] m-2">{TelegramUtils.getTagFromMsg(message)}</pre>
	<p class="text-xs w-full text-right pr-2 text-gray-300">{TelegramUtils.getTimeFromMsg(message)}</p>
</div>
