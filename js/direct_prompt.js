// SmartCodePrompts/js/direct_prompt.js
import { post_data, simple_markdown_to_html } from './utils.js';
import { show_alert } from './modal-alert.js';

let direct_prompt_modal = null;
let direct_prompt_response = null;

export function initialize_direct_prompt_modal() {
	direct_prompt_modal = document.getElementById('direct_prompt_modal');
	direct_prompt_response = document.getElementById('direct-prompt-response');
}

/**
 * Handles the direct prompt submission by taking content from the main
 * textarea, sending it to the LLM, and displaying the streamed response in a modal.
 */
async function handle_direct_prompt() {
	const prompt_content = document.getElementById('selected-content').value.trim();
	if (!prompt_content) {
		show_alert('The selected content is empty. Please select files to generate a prompt.');
		return;
	}
	
	const llm_id = document.getElementById('llm-dropdown-direct-prompt').value;
	const temperature = document.getElementById('temperature-slider').value;
	
	if (!llm_id) {
		show_alert('Please select an LLM for Direct Prompts before sending a prompt.');
		return;
	}
	
	direct_prompt_modal.showModal();
	direct_prompt_response.innerHTML = ''; // Start with an empty response area for streaming
	
	let fullResponse = '';
	let cleanupListener = null;
	
	try {
		const { streamId, success } = await post_data({
			action: 'direct_prompt_stream',
			prompt: prompt_content,
			llm_id: llm_id,
			temperature: parseFloat(temperature)
		});
		
		if (!success || !streamId) {
			throw new Error('Failed to initiate the prompt stream from the server.');
		}
		
		const streamHandler = (event) => {
			if (event.streamId !== streamId) return; // Ensure we're handling the correct stream
			
			if (event.type === 'chunk') {
				fullResponse += event.content;
				direct_prompt_response.innerHTML = simple_markdown_to_html(fullResponse);
				// Auto-scroll to the bottom as content is added
				direct_prompt_response.scrollTop = direct_prompt_response.scrollHeight;
			} else if (event.type === 'end') {
				// Final render to catch any remaining markdown, and highlight code
				direct_prompt_response.innerHTML = simple_markdown_to_html(fullResponse);
				if (typeof hljs !== 'undefined') {
					direct_prompt_response.querySelectorAll('pre code').forEach((block) => {
						hljs.highlightElement(block);
					});
				}
				if (cleanupListener) cleanupListener();
			} else if (event.type === 'error') {
				console.error('Error from stream:', event.message);
				direct_prompt_response.innerHTML = `<div class="p-4 text-error"><strong>An error occurred during the stream:</strong><br>${event.message}</div>`;
				if (cleanupListener) cleanupListener();
			}
		};
		
		cleanupListener = window.electronAPI.onLLMStream(streamHandler);
		
	} catch (error) {
		console.error('Error during direct prompt:', error);
		direct_prompt_response.innerHTML = `<div class="p-4 text-error"><strong>An error occurred:</strong><br>${error.message}</div>`;
		if (cleanupListener) cleanupListener();
	}
}

export function setup_direct_prompt_listeners() {
	const button = document.getElementById('direct-prompt-button');
	if (button) {
		button.addEventListener('click', (e) => {
			e.preventDefault();
			handle_direct_prompt();
		});
	}
	
	if (direct_prompt_response) {
		direct_prompt_response.addEventListener('click', (e) => {
			const copy_button = e.target.closest('.copy-code-button');
			if (!copy_button) return;
			
			// The <pre> element is the button's next sibling in our structure.
			const pre = copy_button.nextElementSibling;
			if (pre && pre.tagName === 'PRE') {
				const code = pre.querySelector('code');
				if (code) {
					navigator.clipboard.writeText(code.innerText).then(() => {
						const original_html = copy_button.innerHTML;
						copy_button.innerHTML = '<i class="bi bi-check-lg"></i> Copied!';
						copy_button.disabled = true;
						setTimeout(() => {
							copy_button.innerHTML = original_html;
							copy_button.disabled = false;
						}, 2000);
					}).catch(err => {
						console.error('Failed to copy code: ', err);
						show_alert('Failed to copy code to clipboard.');
					});
				}
			}
		});
	}
}
