// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		 interface PageState {
			 showChat: TdApi.Chat;
			 showPlayer:boolean;
		 }
		// interface Platform {}
	}

	interface Window {
		readCurrentVideoFile: (offset: number,length: number) => Promise<ArrayBuffer>;
		electronAPI: {
			videoReady: (size:number) => void;
		};
	}


}
export {};
