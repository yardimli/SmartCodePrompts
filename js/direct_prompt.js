// SmartCodePrompts/js/direct_prompt.js
import { post_data } from './utils.js';
import { show_alert } from './modal-alert.js';
import { get_editor_content, createNewTab, setTabContent, appendToTabContent } from './editor.js';
import { get_all_settings } from './settings.js';
import { get_current_project } from './state.js'; // NEW: Import project state

let responseTabId = null;
let responseTabCounter = 0;

/**
 * Handles the direct prompt submission by taking content from the main
 * editor, sending it to the LLM, and streaming the response into a new editor tab.
 * MODIFIED: Streams response to a new Monaco Editor tab.
 */
async function handle_direct_prompt() {
	const prompt_content = get_editor_content().trim(); // Get content from active editor tab
	if (!prompt_content) {
		show_alert('The selected content is empty. Please select files to generate a prompt.');
		return;
	}
	
	const llm_id = document.getElementById('llm-dropdown-direct-prompt').value;
	const temperature = document.getElementById('temperature-slider').value;
	const current_project = get_current_project(); // NEW: Get the current project
	
	if (!llm_id) {
		show_alert('Please select an LLM for Direct Prompts before sending a prompt.');
		return;
	}
	
	// NEW: A project must be selected because the API key is project-specific.
	if (!current_project) {
		show_alert('Please select a project before sending a direct prompt.');
		return;
	}
	
	// Create a new tab for the response
	responseTabCounter++;
	const tabTitle = `Response ${responseTabCounter}`;
	responseTabId = createNewTab(tabTitle, '// Waiting for LLM response...', 'markdown', true);
	if (!responseTabId) {
		show_alert('Failed to create a new editor tab.');
		return;
	}
	
	let fullResponse = '';
	let cleanupListener = null;
	let isFirstChunk = true;
	
	try {
		const { streamId, success } = await post_data({
			action: 'direct_prompt_stream',
			prompt: prompt_content,
			llm_id: llm_id,
			project_path: current_project.path, // NEW: Pass the project path
			// REMOVED: project_settings is no longer sent from the frontend.
			temperature: parseFloat(temperature)
		});
		
		if (!success || !streamId) {
			throw new Error('Failed to initiate the prompt stream from the server.');
		}
		
		const streamHandler = (event) => {
			if (event.streamId !== streamId) return; // Ensure we're handling the correct stream
			
			if (event.type === 'chunk') {
				if (isFirstChunk) {
					setTabContent(responseTabId, event.content); // Replace placeholder with first chunk
					isFirstChunk = false;
				} else {
					appendToTabContent(responseTabId, event.content); // Append subsequent chunks
				}
				fullResponse += event.content; // Keep track of the full response for final processing if needed
			} else if (event.type === 'end') {
				// The content is already in the editor. We could do final processing
				// like formatting here if Monaco doesn't do it automatically.
				// For now, we'll just clean up.
				if (cleanupListener) cleanupListener();
			} else if (event.type === 'error') {
				console.error('Error from stream:', event.message);
				const errorText = `// An error occurred during the stream:\n// ${event.message}`;
				setTabContent(responseTabId, errorText);
				if (cleanupListener) cleanupListener();
			}
		};
		
		cleanupListener = window.electronAPI.onLLMStream(streamHandler);
		
	} catch (error) {
		console.error('Error during direct prompt:', error);
		const errorText = `// An error occurred:\n// ${error.message}`;
		setTabContent(responseTabId, errorText);
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
}
