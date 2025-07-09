// SmartCodePrompts/js/prompt.js
import {show_loading, hide_loading, post_data} from './utils.js';
import {get_current_project, set_last_smart_prompt, save_current_project_state} from './state.js';
import {refresh_prompt_display, ensure_file_is_visible, update_selected_content} from './file_tree.js';
import {perform_reanalysis} from './analysis.js';
import {show_alert} from './modal-alert.js';
import {show_confirm} from './modal-confirm.js';
// MODIFIED: Import functions to interact with the editor tabs.
import {switchToTab, getPromptTabId, getActiveTabId} from './editor.js';
import { get_all_settings } from './settings.js'; // NEW: Import settings manager

/**
 * Adjusts the height of the bottom prompt textarea to fit its content.
 */
function adjust_prompt_textarea_height() {
	const textarea = document.getElementById('prompt-input');
	if (!textarea) return;
	textarea.style.height = 'auto';
	textarea.style.height = `${textarea.scrollHeight}px`;
}

/**
 * Initializes the auto-expanding textarea feature.
 */
export function initialize_auto_expand_textarea() {
	const prompt_input = document.getElementById('prompt-input');
	if (prompt_input) {
		// Set initial height
		adjust_prompt_textarea_height();
		// Add listener for input changes
		prompt_input.addEventListener('input', adjust_prompt_textarea_height);
	}
}

/**
 * Performs the "smart prompt" action to select relevant files using an LLM.
 * This function was moved from the old modals.js to centralize prompt logic.
 * @param {string} user_prompt - The user's high-level request.
 */
async function perform_smart_prompt (user_prompt) {
	const trimmed_prompt = user_prompt.trim();
	if (!trimmed_prompt) {
		show_alert('Please enter a prompt.');
		return;
	}
	const llm_id = document.getElementById('llm-dropdown-smart-prompt').value;
	if (!llm_id) {
		show_alert('Please select an LLM for Smart Prompts from the dropdown.');
		return;
	}
	
	set_last_smart_prompt(user_prompt);
	
	const project_settings = get_all_settings();
	
	show_loading('Asking LLM to select relevant files...');
	try {
		const current_project = get_current_project();
		const response = await post_data({
			action: 'get_relevant_files_from_prompt',
			project_path: current_project.path,
			user_prompt: trimmed_prompt,
			llm_id: llm_id,
			project_settings: project_settings, // NEW: Pass settings
			temperature: document.getElementById('temperature-slider').value
		});
		
		if (response.relevant_files && response.relevant_files.length > 0) {
			document.querySelectorAll('#file-tree input[type="checkbox"]').forEach(cb => (cb.checked = false));
			
			let checked_count = 0;
			for (const file_path of response.relevant_files) {
				const is_visible = await ensure_file_is_visible(file_path);
				if (is_visible) {
					const checkbox = document.querySelector(`#file-tree input[type="checkbox"][data-path="${file_path}"]`);
					if (checkbox) {
						checkbox.checked = true;
						checked_count++;
					}
				}
			}
			
			await update_selected_content();
			save_current_project_state();
			show_alert(`LLM selected ${checked_count} relevant file(s). Prompt has been built.`);
		} else {
			show_alert("The LLM did not identify any relevant files from the project's analyzed files. No changes were made.");
		}
	} catch (error) {
		console.error('Failed to get relevant files from prompt:', error);
		show_alert(`An error occurred: ${error.message}`, 'Error');
	} finally {
		hide_loading();
	}
}

/**
 * The core logic for submitting a smart prompt. Checks for modified files
 * and asks the user if they want to re-analyze before proceeding.
 * @param {string} prompt_text The user's prompt.
 */
async function handle_smart_prompt_submission(prompt_text) {
	if (!prompt_text) {
		show_alert('Please enter a prompt first.');
		return;
	}
	
	const llm_id = document.getElementById('llm-dropdown-smart-prompt').value;
	const current_project = get_current_project();
	
	if (!current_project) {
		show_alert('Please select a project.');
		return;
	}
	if (!llm_id) {
		show_alert('Please select an LLM for Smart Prompts.');
		return;
	}
	
	show_loading('Checking for modified files...');
	try {
		// This is a new backend action we assume exists.
		// It should return { needs_reanalysis: boolean, count: number }
		const check_response = await post_data({
			action: 'check_for_modified_files',
			project_path: current_project.path
		});
		
		hide_loading();
		
		if (check_response.needs_reanalysis) {
			const modal = document.getElementById('reanalysis_prompt_modal');
			const count_element = document.getElementById('reanalysis-file-count');
			const run_anyway_btn = document.getElementById('run-without-reanalysis-button');
			const reanalyze_and_run_btn = document.getElementById('run-with-reanalysis-button');
			
			count_element.textContent = `${check_response.count} file(s) have been modified.`;
			
			// Use .cloneNode and .replaceWith to clear any previous listeners, preventing multiple triggers
			const new_run_anyway_btn = run_anyway_btn.cloneNode(true);
			run_anyway_btn.parentNode.replaceChild(new_run_anyway_btn, run_anyway_btn);
			
			const new_reanalyze_and_run_btn = reanalyze_and_run_btn.cloneNode(true);
			reanalyze_and_run_btn.parentNode.replaceChild(new_reanalyze_and_run_btn, reanalyze_and_run_btn);
			
			// Add a one-time listener to run without re-analyzing
			new_run_anyway_btn.addEventListener('click', async () => {
				modal.close();
				await perform_smart_prompt(prompt_text);
			}, {once: true});
			
			// MODIFIED: Add a one-time listener to re-analyze then run, using the new polling-based function.
			new_reanalyze_and_run_btn.addEventListener('click', async () => {
				modal.close();
				try {
					// This will show the progress modal and wait for the backend process to complete.
					await perform_reanalysis(false);
					
					// After successful re-analysis, perform the smart prompt.
					await perform_smart_prompt(prompt_text);
				} catch (error) {
					// This catches failures or cancellations from perform_reanalysis.
					console.error('Failed to re-analyze and run:', error);
					show_alert(`The process could not be completed: ${error.message}`, 'Error');
				}
			}, {once: true});
			
			modal.showModal();
		} else {
			// No re-analysis needed, just run the prompt directly
			await perform_smart_prompt(prompt_text);
		}
	} catch (error) {
		hide_loading();
		console.error('Failed to check for modified files:', error);
		// MODIFIED: Use custom confirm modal instead of native confirm().
		const confirmed = await show_confirm(`Could not check for modified files: ${error.message}\n\nDo you want to run the prompt anyway?`, 'Error Checking Files');
		if (confirmed) {
			await perform_smart_prompt(prompt_text);
		}
	}
}

/**
 * Sets up event listeners for the main prompt bar actions.
 */
export function setup_prompt_bar_listeners() {
	const prompt_input = document.getElementById('prompt-input');
	const run_button = document.getElementById('smart-prompt-run-button');
	
	// Debounced listener for the prompt input to update content and save state.
	let prompt_input_debounce_timer;
	prompt_input.addEventListener('input', (e) => {
		// NEW: Automatically switch to the 'Prompt' tab when the user starts typing.
		const promptTabId = getPromptTabId();
		if (promptTabId && getActiveTabId() !== promptTabId) {
			switchToTab(promptTabId);
			prompt_input.focus(); // Ensure the input is focused after switching tabs
		}
		
		clearTimeout(prompt_input_debounce_timer);
		prompt_input_debounce_timer = setTimeout(() => {
			const prompt_text = e.target.value;
			set_last_smart_prompt(prompt_text);
			refresh_prompt_display();
		}, 1000);
	});
	
	// A single action handler for both button click and Ctrl+Enter.
	const run_action = () => {
		const prompt_text = prompt_input.value.trim();
		handle_smart_prompt_submission(prompt_text);
	};
	
	// Listener for the main "Run" button.
	if (run_button) {
		run_button.addEventListener('click', run_action);
	}
	
	// Listener for Ctrl+Enter keyboard shortcut in the textarea.
	if (prompt_input) {
		prompt_input.addEventListener('keydown', (e) => {
			if (e.key === 'Enter' && e.ctrlKey) {
				e.preventDefault(); // Prevent adding a new line
				run_action();
			}
		});
	}
}
