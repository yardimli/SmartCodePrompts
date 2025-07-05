// SmartCodePrompts/js/direct_prompt.js
import { post_data, simple_markdown_to_html } from './utils.js';

let direct_prompt_modal = null;
let direct_prompt_response = null;

/**
 * Initializes references to the Direct Prompt modal and its elements.
 */
export function initialize_direct_prompt_modal() {
	direct_prompt_modal = document.getElementById('direct_prompt_modal');
	direct_prompt_response = document.getElementById('direct-prompt-response');
}

/**
 * Handles the direct prompt submission by taking content from the main
 * textarea, sending it to the LLM, and displaying the response in a modal.
 */
async function handle_direct_prompt() {
	const prompt_content = document.getElementById('selected-content').value.trim();
	if (!prompt_content) {
		alert('The selected content is empty. Please select files to generate a prompt.');
		return;
	}
	
	const llm_id = document.getElementById('llm-dropdown').value;
	const temperature = document.getElementById('temperature-slider').value;
	
	if (!llm_id) {
		alert('Please select an LLM before sending a prompt.');
		return;
	}
	
	// Show modal and loading state
	direct_prompt_modal.showModal();
	direct_prompt_response.innerHTML = '<div class="flex justify-center items-center h-full"><span class="loading loading-dots loading-lg"></span></div>';
	
	try {
		const response = await post_data({
			action: 'direct_prompt',
			prompt: prompt_content,
			llm_id: llm_id,
			temperature: parseFloat(temperature)
		});
		
		// Render the markdown response to HTML using the shared utility function
		direct_prompt_response.innerHTML = simple_markdown_to_html(response.answer);
		
	} catch (error) {
		console.error('Error during direct prompt:', error);
		direct_prompt_response.innerHTML = `<div class="p-4 text-error"><strong>An error occurred:</strong><br>${error.message}</div>`;
	}
}

/**
 * Sets up the event listener for the direct prompt trigger button in the sidebar
 * and adds event delegation for copy buttons in the response modal.
 */
export function setup_direct_prompt_listeners() {
	const button = document.getElementById('direct-prompt-button');
	if (button) {
		button.addEventListener('click', (e) => {
			e.preventDefault();
			handle_direct_prompt();
		});
	}
	
	// NEW: Event delegation for copy-to-clipboard buttons on code blocks.
	if (direct_prompt_response) {
		direct_prompt_response.addEventListener('click', (e) => {
			const copy_button = e.target.closest('.copy-code-button');
			if (!copy_button) return;
			
			// The <pre> element is the button's next sibling in our structure.
			const pre = copy_button.next_element_sibling;
			if (pre && pre.tag_name === 'PRE') {
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
						alert('Failed to copy code to clipboard.');
					});
				}
			}
		});
	}
}
