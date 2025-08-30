import TdClient, { type TdObject, type TdOptions } from 'tdweb';
import options from '$lib/options';
import { EncryptedStorage } from '$lib/storage/EncryptedStorage';
import { goto } from '$app/navigation';
import type { TdApi } from '$lib/types/td_api';
import type { OrderedChat } from '$lib/utils/TelegramUtils';

class TdClientManager {
	public static myInstance: TdClientManager | null = null;
	private tdClient: TdClient;
	public chatList: OrderedChat[] = [];

	public callback = (update: TdObject) => {
		if (update['@type'] === 'updateAuthorizationState') {
			console.log(update['@type']);
		}
	};
	private initStatus: boolean = false;

	private constructor() {
		const options_tg = options as TdOptions;
		options_tg.onUpdate = (update) => this.onUpdate(update);
		this.tdClient = new TdClient(options_tg);
	}

	public isInitialized(): boolean {
		return this.initStatus;
	}

	static async getSingletonInstance(): Promise<TdClientManager> {
		if (!TdClientManager.myInstance) {
			TdClientManager.myInstance = new TdClientManager();
			console.log('New TDLib instance created.');
		} else {
			console.log('Returning existing TDLib instance.');
		}
		return TdClientManager.myInstance;
	}

	public getClient(): TdClient {
		return this.tdClient;
	}

	sortOrderedChat() {
		this.chatList = this.chatList.sort((a, b) => {
			const orderA = parseInt(a.order, 10);
			const orderB = parseInt(b.order, 10);
			return orderB - orderA;
		});
	}

	async onUpdate(update: TdObject) {
		this.callback(update);
		switch (update['@type']) {
			case 'updateAuthorizationState':
				await this.handleAuthorizationState(update['authorization_state'] as TdObject);
				console.log(update);
				break;
		}
		if (update['@type'] === 'updateNewChat') {
			const newChat = update.chat as unknown as TdApi.Chat;

			if (!this.chatList.some((chat) => chat.chatItem.id === newChat.id)) {
				this.chatList = [...this.chatList, { order: '0', chatItem: newChat } as OrderedChat];
			}
			this.sortOrderedChat();
		} else if (update['@type'] === 'updateChatLastMessage') {
			const chatId = update.chat_id;
			const updatedLastMessage = update.last_message as unknown as TdApi.Message;
			this.chatList = this.chatList.map((chat) => {
				if (chat.chatItem.id === chatId) {
					const updatedChatItem = {
						...chat.chatItem,
						last_message: updatedLastMessage
					};
					return { ...chat, chatItem: updatedChatItem };
				}
				return chat;
			});
			this.sortOrderedChat();
		} else if (update['@type'] === 'updateChatPosition') {
			const updateChatPosition = update as unknown as TdApi.updateChatPosition;
			this.chatList = this.chatList.map((chat) => {
				if (chat.chatItem.id === update.chat_id) {
					return { ...chat, order: updateChatPosition.position.order };
				}
				return chat;
			});
			this.sortOrderedChat();
		}
	}

	async handleAuthorizationState(authState: TdObject) {
		if (authState['@type'] === 'authorizationStateWaitTdlibParameters') {
			this.initStatus = false;
			await this.sentTdlibParameters();
		}
		if (authState['@type'] === 'authorizationStateWaitPhoneNumber') {
			await goto('../login', { replaceState: true });
		}
		if (authState['@type'] === 'authorizationStateReady') {
			this.initStatus = true;
		}
	}

	private async sentTdlibParameters() {
		const tdlibParameters: TdApi.setTdlibParameters = {
			'@type': 'setTdlibParameters',
			use_test_dc: false,
			api_id: Number.parseInt((await EncryptedStorage.loadDecrypted('api_id')) || '0'),
			api_hash: (await EncryptedStorage.loadDecrypted('api_hash')) || '',
			system_language_code: navigator.language || 'en',
			device_model: 'Web Browser',
			system_version: 'web',
			application_version: '1.0.0',
			use_file_database: false,
			use_chat_info_database: true,
			use_message_database: true,
			use_secret_chats: true
		};
		this.tdClient.send(tdlibParameters as TdObject).then((r) => {
			console.log(r);
		});
		await this.tdClient
			.send({
				'@type': 'getOption',
				name: 'use_ipv6'
			} as TdApi.getOption as unknown as TdObject)
			.then((r) => {
				console.log(r);
			});
		await this.tdClient
			.send({
				'@type': 'getOption',
				name: ''
			} as TdApi.getOption as unknown as TdObject)
			.then((r) => {
				console.log(r);
			});
		await this.tdClient
			.send({
				'@type': 'getOption',
				name: 'use_ipv6'
			} as TdApi.getOption as unknown as TdObject)
			.then((r) => {
				console.log(r);
			});
	}

	public setCallback(callback: (update: TdObject) => void) {
		this.callback = callback;
	}
}

export default TdClientManager;
