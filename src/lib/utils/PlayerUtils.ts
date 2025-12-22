import type { TdApi } from '$lib/types/td_api';
import TdClient, { type TdObject } from 'tdweb';
import type TdClientManager from '$lib/TdClientManager';

export class PlayerUtils {
	client: TdClient;
	msg: TdApi.message | undefined;
	private clientManager: TdClientManager;
	private readonly updateStatus: (status: string) => void = () => {};
	filesize: number = 0;

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
					let msgCont = msg.content as unknown as TdApi.MessageContent;
					if(msgCont['@type'] === 'messageDocument') {
						let doc = msgCont as unknown as TdApi.Document;
						this.filesize = doc.document.size;
						console.log("File size is " + this.filesize);
					}
					if(msgCont['@type'] === 'messageVideo') {
						let vid = msgCont as unknown as TdApi.Video;
						this.filesize = vid.video.size;
						console.log("File size is " + this.filesize);
					}
					console.log('player utils created with ' + this.msg);
				}
			});
	}

	async getFileChunkOfVideo(offset: number, length: number) {
		if(this.msg && this.msg.content['@type'] === 'messageDocument') {
			const msgDoc = this.msg?.content as TdApi.messageDocument;
			const arrayBuffer = await this.readFilePart(msgDoc.document.document.id, offset, length);
			console.log(arrayBuffer.byteLength + ' bytes sent');
			return arrayBuffer;
		}
		if(this.msg && this.msg.content['@type'] === 'messageVideo') {
			const msgDoc = this.msg?.content as TdApi.messageVideo;
			const arrayBuffer = await this.readFilePart(msgDoc.video.video.id, offset, length);
			console.log(arrayBuffer.byteLength + ' bytes sent');
			return arrayBuffer;
		}
		return {} as ArrayBuffer;
	}

	private async readFilePart(file_id: number, offset: number, count: number) {
		console.log('downloading for ', offset, count);

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

		if(offset+count > this.filesize){
			count = 0;
		}

		await this.client.send({
			'@type': 'downloadFile',
			file_id: file_id,
			priority: 32,
			offset: offset,
			limit: count,
			synchronous: true
		} as TdApi.downloadFile as TdObject);

		const r = await this.client.send({
			'@type': 'readFilePart',
			file_id: file_id,
			offset: offset,
			count: count
		} as TdApi.readFilePart as TdObject);
		const filePart = r as unknown as TdApi.filePart;
		console.log(file_id, offset, count, filePart.data.size);
		return await filePart.data.arrayBuffer();
	}
}
