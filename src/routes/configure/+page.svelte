<script>
	import { EncryptedStorage } from '$lib/storage/EncryptedStorage.js';
	import { goto } from '$app/navigation';

	let btnFunc = $state('Save API Keys');

	let apiId = $state('');
	let apiHash = $state('');

	function onMainBtnClick() {
		if (apiId.length < 3 || apiHash.length < 3) {
			alert('Please enter both API ID and API Hash to save.');
			return;
		}

		EncryptedStorage.saveEncrypted('api_id', apiId);
		EncryptedStorage.saveEncrypted('api_hash', apiHash);
		alert('API ID and API Hash saved successfully!');
		btnFunc = 'Saved!';
		setTimeout(() => {
			goto("../",{replaceState : true});
		}, 200);
	}
</script>

<div class="h-dvh w-dvw flex flex-col md:flex-row bg-gradient-to-b from-[#334242] to-[#181918]">
	<div class="flex-1 flex flex-row md:flex-col items-center justify-center gap-4 md:gap-10">
		<img class="object-cover rounded-full size-10 md:size-50 border border-slate-700/50 shadow-md" src="./logo.svg" alt="logo">
		<p class="text-white text-2xl md:text-3xl font-semibold">Setup The Telegram Web Play</p>
	</div>
	<div class="flex-6 -translate-y-10 md:translate-y-0 flex-col gap-6 md:flex-1 justify-center items-center flex">
		<p class="text-white md:mb-5 text-2xl md:text-4xl font-semibold">Connect With Telegram your Application</p>
		<input
			type="number"
			placeholder="Api Id"
			class="w-[90%] h-12 bg-[#D9D9D950] rounded-full pl-4 text-white placeholder-gray-400"
			bind:value={apiId}
		>
		<input
			placeholder="Api Hash"
			class="w-[90%] h-12 bg-[#D9D9D950] rounded-full pl-4 text-white placeholder-gray-400"
			bind:value={apiHash}
		>
		<button onclick={onMainBtnClick} class="w-[90%] h-12 bg-primary-400 rounded-full pl-4 text-white placeholder-gray-400">
			{btnFunc}
		</button>
		<p class="text-white text-xs md:text-xl font-semibold">Visit <a class="text-primary-400" href="https://my.telegram.org/auth?to=apps">https://my.telegram.org/auth?to=apps</a> for Api</p>
	</div>
</div>