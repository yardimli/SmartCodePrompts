// SmartCodePrompts/js/directPrompt.js
import { postData, simpleMarkdownToHtml } from './utils.js';

let directPromptModal = null;
let directPromptResponse = null;

/**
 * Initializes references to the Direct Prompt modal and its elements.
 */
export function initializeDirectPromptModal() {
	directPromptModal = document.getElementById('directPromptModal');
	directPromptResponse = document.getElementById('direct-prompt-response');
}

/**
 * Handles the direct prompt submission by taking content from the main
 * textarea, sending it to the LLM, and displaying the response in a modal.
 */
async function handleDirectPrompt() {
	const promptContent = document.getElementById('selected-content').value.trim();
	if (!promptContent) {
		alert('The selected content is empty. Please select files to generate a prompt.');
		return;
	}
	
	const llmId = document.getElementById('llm-dropdown').value;
	const temperature = document.getElementById('temperature-slider').value;
	
	if (!llmId) {
		alert('Please select an LLM before sending a prompt.');
		return;
	}
	
	// Show modal and loading state
	directPromptModal.showModal();
	directPromptResponse.innerHTML = '<div class="flex justify-center items-center h-full"><span class="loading loading-dots loading-lg"></span></div>';
	
	try {
		const response = await postData({
			action: 'direct_prompt',
			prompt: promptContent,
			llmId: llmId,
			temperature: parseFloat(temperature)
		});
		
		// Render the markdown response to HTML using the shared utility function
		directPromptResponse.innerHTML = simpleMarkdownToHtml(response.answer);
		
	} catch (error) {
		console.error('Error during direct prompt:', error);
		directPromptResponse.innerHTML = `<div class="p-4 text-error"><strong>An error occurred:</strong><br>${error.message}</div>`;
	}
}

/**
 * Sets up the event listener for the direct prompt trigger button in the sidebar.
 */
export function setupDirectPromptListeners() {
	const button = document.getElementById('direct-prompt-button');
	if (button) {
		button.addEventListener('click', (e) => {
			e.preventDefault();
			handleDirectPrompt();
		});
	}
}
