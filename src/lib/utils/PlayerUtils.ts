import type { TdApi } from '$lib/types/td_api';
import TdClient, { type TdObject } from 'tdweb';
import type TdClientManager from '$lib/TdClientManager';
import { DownloadedParts } from '$lib/utils/DownloadedParts';

export class PlayerUtils {
	client: TdClient;
	msg: TdApi.message | undefined;
	private clientManager: TdClientManager;
	private chunkSize: number = 100000;
	private reqNumber: number = 1;
	private dParts = new DownloadedParts();
	private updateStatus: (status: string) => void = () => {};

	constructor(
		clientManager: TdClientManager,
		msg: TdApi.message,
		updateStatus: (status: string) => void
	) {
		this.clientManager = clientManager;
		this.client = clientManager.getClient();
		this.updateStatus = updateStatus;
		this.client
			.send({
				'@type': 'getMessage',
				chat_id: msg.chat_id,
				message_id: msg.id
			} as TdApi.getMessage as TdObject)
			.then((r) => {
				if (r['@type'] === 'message') {
					this.msg = r as unknown as TdApi.message;
					console.log('player utils created with ' + this.msg);
				}
			});
		this.dParts = new DownloadedParts();
	}

	async getFileChunkOfVideo(offset: number, length: number) {
		length = Math.min(this.chunkSize * this.reqNumber, 10000000);
		const msgDoc = this.msg?.content as TdApi.messageDocument;
		const arrayBuffer = await this.readFilePart(msgDoc.document.document.id, offset, length);
		console.log(arrayBuffer.byteLength + ' bytes sent');
		return arrayBuffer;
	}

	private async readFilePart(file_id: number, offset: number, count: number) {
		console.log('downloading for ', offset, count);

		if (!this.dParts.checkPart(offset, offset + count)) {
			this.clientManager.setCallback((update) => {
				if (update['@type'] === 'updateFile') {
					console.log(update);
					const updateFile = (update as unknown as TdApi.updateFile).file;
					if (updateFile.id !== file_id) return;
					if (updateFile.local.is_downloading_active) {
						console.log('Download prog:', updateFile.local.path, updateFile.local.downloaded_size);
						this.updateStatus(
							'Loading video part ' +
								Math.round(updateFile.local.downloaded_prefix_size / 1024) +
								' KB'
						);
						if (updateFile.local.downloaded_size > count) {
							console.log('Pausing Download', updateFile.local.path);
						}
					} else if (
						!updateFile.local.is_downloading_active &&
						updateFile.local.downloaded_size > 100
					) {
						console.log('Download completed:', updateFile.local.path);
						this.updateStatus(
							'Playing video part in VLC ' +
								Math.round(updateFile.local.downloaded_prefix_size / 1024) +
								' KB'
						);
					}
				}
			});

			await this.client.send({
				'@type': 'downloadFile',
				file_id: file_id,
				priority: 32,
				offset: offset,
				limit: count,
				synchronous: true
			} as TdApi.downloadFile as TdObject);

			this.dParts.addPart(offset, offset + count);
		} else {
			console.log('already downloaded for ', offset, offset + count);
		}

		const r = await this.client.send({
			'@type': 'readFilePart',
			file_id: file_id,
			offset: offset,
			count: count
		} as TdApi.readFilePart as TdObject);
		const filePart = r as unknown as TdApi.filePart;
		console.log(file_id, offset, count, filePart.data.size);
		this.reqNumber *= 2;
		return await filePart.data.arrayBuffer();
	}

	setChunkSize(chunkSize: number) {
		this.chunkSize = Math.max(chunkSize, 100000);
	}
}
