<script lang="ts">
	import ChatItem from '$lib/components/ChatItem.svelte';
	import { onMount } from 'svelte';
	import TdClientManager from '$lib/TdClientManager.js';
	import type { TdApi } from '$lib/types/td_api';
	import TdClient, { type TdObject } from 'tdweb';
	import { page } from '$app/state';
	import { goto, pushState } from '$app/navigation';
	import type { OrderedChat } from '$lib/utils/TelegramUtils';
	import ChatView from '$lib/components/ChatView.svelte';

	import type { LayoutLoad } from '../$lib/types';
	import Player from '$lib/components/Player.svelte';

	let { data } = $props<{ data: LayoutLoad }>();
	let tdClientManager: TdClientManager = data.tdClientManager as TdClientManager;
	let client = data.client as TdClient;
	let chatList: OrderedChat[] = $state([] as OrderedChat[]);


	let currentChat: TdApi.Chat | undefined = $state();

	function showList() {
		console.log('Fetching Chats');
		client.send({
			'@type': 'loadChats',
			chat_list: {
				'@type': 'chatListMain'
			},
			limit: 10
		} as TdApi.loadChats as TdObject).then((r) => {
			console.log(r);
		});
		chatList = tdClientManager.chatList;
	}


	function setCallBack() {
		tdClientManager.setCallback((update) => {
				if (update['@type'] === 'updateAuthorizationState') {
					let updateType = (update['authorization_state']) as TdApi.AuthorizationState;
					if ((updateType['@type'] === 'authorizationStateWaitPhoneNumber') || (updateType['@type'] === 'authorizationStateWaitCode')) {
						goto('../login', { replaceState: true });
					}
					if (updateType['@type'] === 'authorizationStateReady') {
						showList();
					}
				}
				if (update['@type'] === 'updateNewChat' || update['@type'] === 'updateChatLastMessage' || update['@type'] === 'updateChatPosition') {
					chatList = tdClientManager.chatList;
				}
				//console.log(update);
			}
		);

	}

	onMount(async () => {
		let retry = 10000;
		while (!tdClientManager.isInitialized() && retry > 0) {
			await new Promise(resolve => setTimeout(resolve, 100));
			console.log('Waiting for TDLib to initialize...');
			retry--;
		}
		pushState('', {
			showChat: false,
			showPlayer: false,
		});
		showList();
		setCallBack();

	});

	function onChatClicked(chatItem: TdApi.Chat) {
		currentChat = chatItem;
		console.log(chatItem);
		pushState('', {
			showChat: true,
			showPlayer: false
		});
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	function closeChat() {
		pushState('', {
			showChat: false,
			showPlayer: false
		});
	}

	function logout() {
		if (confirm('Are you sure you want to logout?')) {
			tdClientManager.getClient().send({
				'@type': 'logOut'
			} as TdApi.logOut as TdObject).then((r) => {
				console.log(r);
				goto('../login', { replaceState: true });
			});
			console.log('User confirmed the action.');
		}
	}
</script>

<div class="h-dvh w-dvw flex flex-col bg-gradient-to-b from-[#334242] to-[#181918]">
	<div
		class="px-9 pt-8 rounded-b-2xl absolute top-0 w-full pb-4 flex flex-row items-center gap-4 md:gap-10 backdrop-blur-2xl bg-[#22334422]">
		<img class="shadow-[0_0_100px_#A7BA88] object-cover rounded-full size-10" src="./logo.svg" alt="logo">
		<p class="text-white text-3xl pl-2 font-semibold">Chats</p>
		<button class="h-10 absolute bg-[#00000022] p-2 rounded-2xl text-red-200 right-10" onclick={logout}>Logout</button>
	</div>
	<div class="overflow-y-scroll pt-22 flex  flex-col">
		<div class="p-4 gap-4 flex flex-col">
			{#each chatList as chat (chat.chatItem.id)}
				<ChatItem onOpen={()=>onChatClicked(chat.chatItem)} client={client}
									chatItemProp={chat.chatItem} />
			{/each}
		</div>
	</div>
	{#if currentChat && page.state.showChat}
		<ChatView currentChat={currentChat} client={client}
							className="absolute w-svw h-svh bg-gradient-to-b from-[#334242] to-[#181918]" />
	{/if}
	{#if page.state.showPlayer}
		<div class="z-30 absolute p-4 bg-surface-dark rounded-3xl ">
			<Player tdClientManager={tdClientManager} />
		</div>
	{/if}
</div>