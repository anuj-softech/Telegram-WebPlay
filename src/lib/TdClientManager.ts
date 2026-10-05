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
	private errorListeners: Array<(err: string) => void> = [];
	private workerError: string | null = null;
	private initStatus: boolean = false;

	private constructor() {
		const options_tg = options as TdOptions;
		options_tg.onUpdate = (update) => this.onUpdate(update);
		this.tdClient = new TdClient(options_tg);

		// Listen for Web Worker fatal crashes (e.g. Wasm abort or binlog CRC mismatch)
		const worker = (this.tdClient as any)?.worker as Worker | undefined;
		if (worker && typeof worker.addEventListener === 'function') {
			worker.addEventListener('error', (event: ErrorEvent) => {
				const errorMsg = event?.message || 'TDLib Web Worker fatal error (possible binlog CRC mismatch)';
				console.error('TDLib Web Worker error detected:', errorMsg, event);
				this.workerError = errorMsg;
				this.notifyError(errorMsg);
			});
		}

		if (typeof window !== 'undefined') {
			// Attach helper to window for quick console recovery
			(window as any).resetTdlibDatabase = TdClientManager.resetLocalDatabase;

			// Attempt graceful TDLib close on window unload to prevent binlog tear
			window.addEventListener('beforeunload', () => {
				try {
					if (this.tdClient && typeof (this.tdClient as any).close === 'function') {
						(this.tdClient as any).close();
					}
				} catch (e) {
					console.warn('Could not cleanly close TDLib on unload:', e);
				}
			});
		}
	}

	public getLastError(): string | null {
		return this.workerError;
	}

	public onError(cb: (err: string) => void): () => void {
		this.errorListeners.push(cb);
		if (this.workerError) {
			cb(this.workerError);
		}
		return () => {
			this.errorListeners = this.errorListeners.filter((listener) => listener !== cb);
		};
	}

	private notifyError(err: string) {
		for (const listener of this.errorListeners) {
			try {
				listener(err);
			} catch (e) {
				console.error('Error in error listener:', e);
			}
		}
	}

	public destroy(): void {
		try {
			const worker = (this.tdClient as any)?.worker as Worker | undefined;
			if (worker && typeof worker.terminate === 'function') {
				worker.terminate();
			}
		} catch (e) {
			console.warn('Failed to terminate worker:', e);
		}
	}

	public static async resetLocalDatabase(): Promise<void> {
		console.log('Initiating TDLib local database reset...');
		if (TdClientManager.myInstance) {
			TdClientManager.myInstance.destroy();
			TdClientManager.myInstance = null;
		}

		// 1. Electron-level storage purge if running in Electron
		if (typeof window !== 'undefined' && (window as any).electronAPI?.clearStorage) {
			try {
				await (window as any).electronAPI.clearStorage();
				console.log('Electron session storage cleared.');
			} catch (e) {
				console.warn('Could not clear Electron storage via IPC:', e);
			}
		}

		// 2. Delete all IndexedDB tables used by TDLib
		if (typeof window !== 'undefined' && window.indexedDB) {
			const targetDbs = new Set<string>([
				'/tdlib/dbfs',
				'tdlib',
				'/tdlib/inboundfs',
				'tdlib_files',
				'tdlib-dbfs'
			]);

			if (typeof window.indexedDB.databases === 'function') {
				try {
					const existingDbs = await window.indexedDB.databases();
					for (const db of existingDbs) {
						if (db.name && (db.name.includes('tdlib') || db.name.startsWith('/tdlib'))) {
							targetDbs.add(db.name);
						}
					}
				} catch (e) {
					console.warn('Failed to list indexedDB databases:', e);
				}
			}

			const deletions = Array.from(targetDbs).map((name) => {
				return new Promise<void>((resolve) => {
					try {
						const req = window.indexedDB.deleteDatabase(name);
						req.onsuccess = () => {
							console.log(`Deleted IndexedDB: ${name}`);
							resolve();
						};
						req.onerror = () => {
							console.warn(`Failed to delete IndexedDB: ${name}`);
							resolve();
						};
						req.onblocked = () => {
							console.warn(`Deletion blocked for IndexedDB: ${name}`);
							resolve();
						};
					} catch (e) {
						console.error(`Error requesting deletion for ${name}:`, e);
						resolve();
					}
				});
			});

			await Promise.all(deletions);
			console.log('All TDLib IndexedDB databases reset.');
		}
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
			use_file_database: true,
			use_chat_info_database: true,
			use_message_database: true,
			use_secret_chats: true
		};
		this.tdClient.send(tdlibParameters as TdObject).then((r) => {
			console.log(r);
		});
		await this.tdClient
			.send({
				'@type': 'setOption',
				name: 'use_ipv6',
				value: {value:true,'@type':'optionValueBoolean'} as  TdApi.optionValueBoolean
			} as TdApi.setOption as unknown as TdObject)
			.then((r) => {
				console.log(r);
			});
	}

	public setCallback(callback: (update: TdObject) => void) {
		this.callback = callback;
	}
}

export default TdClientManager;
