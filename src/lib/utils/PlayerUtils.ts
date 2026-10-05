import type { TdApi } from '$lib/types/td_api';
import TdClient, { type TdObject } from 'tdweb';
import type TdClientManager from '$lib/TdClientManager';

export interface StreamStats {
	totalStreamed: number;
	currentOffset: number;
	lastChunkSize: number;
	progressPercent: number;
	statusMessage: string;
}

export class PlayerUtils {
	client: TdClient;
	msg: TdApi.message | undefined;
	filesize: number = 0;
	fileId: number = 0;
	fileName: string = 'video.mkv';
	mimeType: string = 'video/mp4';

	private clientManager: TdClientManager;
	private readonly updateStatus: (status: string, stats?: StreamStats) => void = () => {};
	private totalStreamed: number = 0;

	constructor(
		clientManager: TdClientManager,
		msg: TdApi.message,
		updateStatus: (status: string, stats?: StreamStats) => void
	) {
		this.clientManager = clientManager;
		this.client = clientManager.getClient();
		this.updateStatus = updateStatus;
		this.msg = msg;

		this.extractFileDetails(msg);

		// Refresh message in background to ensure latest remote locations
		this.client
			.send({
				'@type': 'getMessage',
				chat_id: msg.chat_id,
				message_id: msg.id
			} as TdApi.getMessage as TdObject)
			.then((r) => {
				if (r && r['@type'] === 'message') {
					this.msg = r as unknown as TdApi.message;
					this.extractFileDetails(this.msg);
				}
			})
			.catch((e) => console.warn('Could not refresh message details:', e));
	}

	private extractFileDetails(msg: TdApi.message) {
		if (!msg || !msg.content) return;
		const content = msg.content as any;

		if (content['@type'] === 'messageVideo') {
			const vid = (content as TdApi.messageVideo).video;
			this.filesize = vid.video.size;
			this.fileId = vid.video.id;
			this.fileName = vid.file_name || 'video.mp4';
			this.mimeType = vid.mime_type || 'video/mp4';
		} else if (content['@type'] === 'messageDocument') {
			const doc = (content as TdApi.messageDocument).document;
			this.filesize = doc.document.size;
			this.fileId = doc.document.id;
			this.fileName = doc.file_name || 'video.mkv';
			this.mimeType = doc.mime_type || 'video/x-matroska';
		}
	}

	async getFileChunkOfVideo(offset: number, length: number): Promise<ArrayBuffer> {
		if (!this.fileId) {
			this.extractFileDetails(this.msg!);
		}

		if (!this.fileId) {
			console.error('No valid fileId found for media item');
			return new ArrayBuffer(0);
		}

		return await this.readFilePart(this.fileId, offset, length);
	}

	private async readFilePart(file_id: number, offset: number, count: number): Promise<ArrayBuffer> {
		if (offset < 0) offset = 0;
		if (this.filesize > 0 && offset >= this.filesize) {
			return new ArrayBuffer(0);
		}

		// Ensure we do not ask beyond the file boundary
		let actualCount = count;
		if (this.filesize > 0 && offset + actualCount > this.filesize) {
			actualCount = this.filesize - offset;
		}

		if (actualCount <= 0) {
			return new ArrayBuffer(0);
		}

		const offsetMb = (offset / (1024 * 1024)).toFixed(1);
		const totalMb = (this.filesize / (1024 * 1024)).toFixed(1);
		const percent = this.filesize > 0 ? Math.min(100, Math.round((offset / this.filesize) * 100)) : 0;

		const stats: StreamStats = {
			totalStreamed: this.totalStreamed,
			currentOffset: offset,
			lastChunkSize: actualCount,
			progressPercent: percent,
			statusMessage: `Streaming to VLC: ${offsetMb} MB / ${totalMb} MB (${percent}%)`
		};

		this.updateStatus(stats.statusMessage, stats);

		// Step 1: Ensure chunk is prioritized and downloaded into TDLib file cache
		try {
			await this.client.send({
				'@type': 'downloadFile',
				file_id: file_id,
				priority: 32,
				offset: offset,
				limit: actualCount,
				synchronous: true
			} as TdApi.downloadFile as TdObject);
		} catch (err: any) {
			// If canceled by another seek or already downloaded, ignore and proceed to read
			if (err?.code !== 200) {
				console.warn('downloadFile notice:', err?.message || err);
			}
		}

		// Step 2: Read the downloaded chunk from TDLib
		try {
			const r = await this.client.send({
				'@type': 'readFilePart',
				file_id: file_id,
				offset: offset,
				count: actualCount
			} as TdApi.readFilePart as TdObject);

			let buffer: ArrayBuffer = new ArrayBuffer(0);

			if (r && r['@type'] === 'filePart') {
				const filePart = r as any;
				const data = filePart.data;

				if (data instanceof Blob) {
					buffer = await data.arrayBuffer();
				} else if (data instanceof Uint8Array) {
					const copy = new Uint8Array(data.byteLength);
					copy.set(data);
					buffer = copy.buffer;
				} else if (data instanceof ArrayBuffer) {
					buffer = data;
				} else if (typeof data === 'string') {
					const binary = atob(data);
					const len = binary.length;
					const bytes = new Uint8Array(len);
					for (let i = 0; i < len; i++) {
						bytes[i] = binary.charCodeAt(i);
					}
					buffer = bytes.buffer;
				}
			} else if (r && r['@type'] === 'data') {
				const dataObj = r as any;
				if (typeof dataObj.data === 'string') {
					const binary = atob(dataObj.data);
					const len = binary.length;
					const bytes = new Uint8Array(len);
					for (let i = 0; i < len; i++) {
						bytes[i] = binary.charCodeAt(i);
					}
					buffer = bytes.buffer;
				}
			}

			this.totalStreamed += buffer.byteLength;
			return buffer;
		} catch (readErr: any) {
			console.error(`readFilePart failed at offset ${offset}:`, readErr?.message || readErr);
			this.updateStatus(`Buffering error at ${offsetMb} MB: ${readErr?.message || 'Retrying...'}`);
			return new ArrayBuffer(0);
		}
	}
}
