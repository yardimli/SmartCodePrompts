// SmartCodePrompts/js/prompt.js
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
 * NEW: The core logic for submitting a smart prompt. Checks for modified files
 * and asks the user if they want to re-analyze before proceeding.
 * @param {string} promptText The user's prompt.
 */
async function handleSmartPromptSubmission(promptText) {
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
	
	showLoading('Checking for modified files...');
	try {
		// This is a new backend action we assume exists.
		// It should return { needsReanalysis: boolean, count: number }
		const checkResponse = await postData({
			action: 'check_for_modified_files',
			rootIndex: currentProject.rootIndex,
			projectPath: currentProject.path
		});
		
		hideLoading();
		
		if (checkResponse.needsReanalysis) {
			const modal = document.getElementById('reanalysisPromptModal');
			const countElement = document.getElementById('reanalysis-file-count');
			const runAnywayBtn = document.getElementById('run-without-reanalysis-button');
			const reanalyzeAndRunBtn = document.getElementById('run-with-reanalysis-button');
			
			countElement.textContent = `${checkResponse.count} file(s) have been modified.`;
			
			// Use .cloneNode and .replaceWith to clear any previous listeners, preventing multiple triggers
			const newRunAnywayBtn = runAnywayBtn.cloneNode(true);
			runAnywayBtn.parentNode.replaceChild(newRunAnywayBtn, runAnywayBtn);
			
			const newReanalyzeAndRunBtn = reanalyzeAndRunBtn.cloneNode(true);
			reanalyzeAndRunBtn.parentNode.replaceChild(newReanalyzeAndRunBtn, reanalyzeAndRunBtn);
			
			// Add a one-time listener to run without re-analyzing
			newRunAnywayBtn.addEventListener('click', async () => {
				modal.close();
				await performSmartPrompt(promptText);
			}, {once: true});
			
			// Add a one-time listener to re-analyze then run
			newReanalyzeAndRunBtn.addEventListener('click', async () => {
				modal.close();
				showLoading('Re-analyzing modified files...');
				try {
					await postData({
						action: 'reanalyze_modified_files',
						rootIndex: currentProject.rootIndex,
						projectPath: currentProject.path,
						llmId: llmId,
						force: false, // Only re-analyze modified files
						temperature: parseFloat(temperature)
					});
					// After re-analysis is complete, perform the smart prompt
					await performSmartPrompt(promptText);
				} catch (error) {
					console.error('Failed to re-analyze and run:', error);
					alert(`An error occurred during the process: ${error.message}`);
				} finally {
					hideLoading();
				}
			}, {once: true});
			
			modal.showModal();
		} else {
			// No re-analysis needed, just run the prompt directly
			await performSmartPrompt(promptText);
		}
	} catch (error) {
		hideLoading();
		console.error('Failed to check for modified files:', error);
		// Inform the user, but suggest they can still run the prompt
		if (confirm(`Could not check for modified files: ${error.message}\n\nDo you want to run the prompt anyway?`)) {
			await performSmartPrompt(promptText);
		}
	}
}

/**
 * Sets up event listeners for the main prompt bar actions.
 * MODIFIED: This function is completely refactored for the new single-button workflow.
 */
export function setupPromptBarListeners() {
	const promptInput = document.getElementById('prompt-input');
	const runButton = document.getElementById('smart-prompt-run-button');
	
	// Debounced listener for the prompt input to update content and save state.
	let promptInputDebounceTimer;
	promptInput.addEventListener('input', (e) => {
		clearTimeout(promptInputDebounceTimer);
		promptInputDebounceTimer = setTimeout(() => {
			const promptText = e.target.value;
			setLastSmartPrompt(promptText);
			refreshPromptDisplay();
		}, 1000);
	});
	
	// A single action handler for both button click and Ctrl+Enter.
	const runAction = () => {
		const promptText = promptInput.value.trim();
		handleSmartPromptSubmission(promptText);
	};
	
	// Listener for the main "Run" button.
	if (runButton) {
		runButton.addEventListener('click', runAction);
	}
	
	// Listener for Ctrl+Enter keyboard shortcut in the textarea.
	if (promptInput) {
		promptInput.addEventListener('keydown', (e) => {
			if (e.key === 'Enter' && e.ctrlKey) {
				e.preventDefault(); // Prevent adding a new line
				runAction();
			}
		});
	}
}
