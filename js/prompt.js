// llm-php-helper/js/prompt.js
import {showLoading, hideLoading, postData} from './utils.js';
import {getCurrentProject, setLastSmartPrompt} from './state.js';
import {performSmartPrompt} from './modals.js';
import {refreshPromptDisplay} from './fileTree.js';

/**
 * Adjusts the height of the bottom prompt textarea to fit its content.
 */
function adjustPromptTextareaHeight() {
	const textarea = document.getElementById('prompt-input');
	if (!textarea) return;
	textarea.style.height = 'auto';
	textarea.style.height = `${textarea.scrollHeight}px`;
}

/**
 * Initializes the auto-expanding textarea feature.
 */
export function initializeAutoExpandTextarea() {
	const promptInput = document.getElementById('prompt-input');
	if (promptInput) {
		// Set initial height
		adjustPromptTextareaHeight();
		// Add listener for input changes
		promptInput.addEventListener('input', adjustPromptTextareaHeight);
	}
}

/**
 * Sets up event listeners for the main prompt bar actions.
 */
export function setupPromptBarListeners() {
	// Debounced listener for the prompt input to update content and save state.
	let promptInputDebounceTimer;
	document.getElementById('prompt-input').addEventListener('input', (e) => {
		clearTimeout(promptInputDebounceTimer);
		promptInputDebounceTimer = setTimeout(() => {
			const promptText = e.target.value;
			setLastSmartPrompt(promptText);
			refreshPromptDisplay();
		}, 1000);
	});
	
	// Listener for the main "Run" button.
	document.getElementById('bottom-run-button').addEventListener('click', () => {
		const promptInput = document.getElementById('prompt-input');
		const promptText = promptInput.value.trim();
		if (!promptText) {
			alert('Please enter a prompt first.');
			return;
		}
		performSmartPrompt(promptText);
	});
	
	// Listener for the "Re-Analyze and Run" button.
	document.getElementById('reanalyze-and-run-button').addEventListener('click', async () => {
		const promptInput = document.getElementById('prompt-input');
		const promptText = promptInput.value.trim();
		if (!promptText) {
			alert('Please enter a prompt first.');
			return;
		}
		
		const llmId = document.getElementById('llm-dropdown').value;
		const currentProject = getCurrentProject();
		const temperature = document.getElementById('temperature-slider').value;
		
		if (!llmId || !currentProject) {
			alert('Please select a project and an LLM.');
			return;
		}
		
		showLoading('Re-analyzing modified files...');
		try {
			await postData({
				action: 'reanalyze_modified_files',
				rootIndex: currentProject.rootIndex,
				projectPath: currentProject.path,
				llmId: llmId,
				force: false,
				temperature: parseFloat(temperature)
			});
			await performSmartPrompt(promptText);
		} catch (error) {
			console.error('Failed to re-analyze and run:', error);
			alert(`An error occurred during the process: ${error.message}`);
		} finally {
			hideLoading();
		}
	});
}
