<script lang="ts">
	import type { TdApi } from '$lib/types/td_api';
	import TdClient from 'tdweb';
	import DocumentItem from '$lib/components/messages/DocumentItem.svelte';
	import TextItem from '$lib/components/messages/TextItem.svelte';
	import VideoItem from '$lib/components/messages/VideoItem.svelte';

	let { messageItem, client } = $props<{ messageItem: TdApi.message, client: TdClient }>();
	let message = $derived(messageItem as TdApi.message);
</script>

<div class="w-full">
	{#if message.content['@type'] === 'messageDocument'}
		<DocumentItem messageItem={message} client={client} />
	{/if}{#if message.content['@type'] === 'messageVideo'}
		<VideoItem messageItem={message} client={client} />
	{/if}
	{#if message.content['@type'] === 'messageText'}
		<TextItem messageItem={message} client={client} />
	{/if}
</div>
