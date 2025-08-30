<script lang="ts">
	import { onMount } from 'svelte';
	import TdClient, { type TdObject } from 'tdweb';
	import { type TdApi } from '$lib/types/td_api';
	import { goto } from '$app/navigation';
	import type TdClientManager from '$lib/TdClientManager';

	import type { LayoutLoad } from '../$lib/types';
	let { data } = $props<{data:LayoutLoad}>();
	let tdClientManager: TdClientManager = data.tdClientManager as TdClientManager;

	let client = data.client as TdClient;
	let btnFunc = $state('Get Otp');
	let phoneNumber = $state('');
	let otpNumber = $state('');
	let otpSent = $state(false);

	onMount(async () => {
		tdClientManager.setCallback((update) => {
			if (update['@type'] === 'updateAuthorizationState') {
				let updateType = (update['authorization_state']) as TdApi.AuthorizationState;
				if (updateType['@type'] === 'authorizationStateWaitPhoneNumber') {
						otpSent = false;
				}
				if (updateType['@type'] === 'authorizationStateWaitCode') {
						otpSent = true;
				}
				if (updateType['@type'] === 'authorizationStateReady') {
						goto("../home",{replaceState:true});
				}
			}
		});
	})
	let onMainBtnClick = async () => {
		console.log(otpSent);
		console.log(otpNumber);
		if(phoneNumber.length === 10){
			phoneNumber = '91'+phoneNumber;
		}
		let formattedPhone = (phoneNumber.includes('+')) ?  phoneNumber : '+'+phoneNumber;
		if (!otpSent && phoneNumber.length >= 10) {
			console.log("Sending otp to"+formattedPhone);
			client.send({ '@type': 'setAuthenticationPhoneNumber', phone_number: formattedPhone }).then((r) => {
				console.log(r);
				console.log("sent otp");
				otpSent = true;
				btnFunc = 'Verify Otp';
			});
		} else if (otpSent && otpNumber.length >= 2) {
			console.log("verifying otp");
			client.send({ '@type': 'checkAuthenticationCode', code: otpNumber } as TdApi.checkAuthenticationCode as TdObject).then((r) => {
				console.log(r);
			});
		}
	};
</script>

<div class="h-dvh w-dvw flex flex-col md:flex-row bg-gradient-to-b from-[#334242] to-[#181918]">
	<div class="flex-1 flex flex-row md:flex-col items-center justify-center gap-4 md:gap-10">
		<img class="shadow-[0_0_100px_#A7BA88] object-cover rounded-full size-10 md:size-50" src="./logo.svg" alt="logo">
		<p class="text-white text-2xl md:text-5xl font-semibold">Login Existing Account</p>
	</div>
	<div class="flex-6 -translate-y-10 md:translate-y-0 flex-col gap-6 md:flex-1 justify-center items-center flex">
		<p class="text-white md:mb-20 text-2xl md:text-5xl font-semibold">Mobile login</p>
		{#if !otpSent}
			<input bind:value={phoneNumber} placeholder="mobile number with country code"
						 class="w-[90%] h-12 bg-[#D9D9D950] rounded-full pl-4 text-white placeholder-gray-400">

		{:else}
			<input bind:value={otpNumber} type="string" placeholder="enter otp sent on telegram"
						 class="w-[90%] h-12 bg-[#D9D9D950] rounded-full pl-4 text-white placeholder-gray-400">
		{/if}
		<button onclick={onMainBtnClick}
						class="w-[90%] h-12 bg-primary-400 rounded-full pl-4 text-white placeholder-gray-400">
			{btnFunc}
		</button>
	</div>
</div>