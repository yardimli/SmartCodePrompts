// SmartCodePrompts/js/prompt.js
import {show_loading, hide_loading, post_data} from './utils.js';
import {get_current_project, set_last_smart_prompt} from './state.js';
import {perform_smart_prompt} from './modals.js';
import {refresh_prompt_display} from './file_tree.js';

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
 * The core logic for submitting a smart prompt. Checks for modified files
 * and asks the user if they want to re-analyze before proceeding.
 * @param {string} prompt_text The user's prompt.
 */
async function handle_smart_prompt_submission(prompt_text) {
	if (!prompt_text) {
		alert('Please enter a prompt first.');
		return;
	}
	
	const llm_id = document.getElementById('llm-dropdown-smart-prompt').value;
	const current_project = get_current_project();
	const temperature = document.getElementById('temperature-slider').value;
	
	if (!current_project) {
		alert('Please select a project.');
		return;
	}
	if (!llm_id) {
		alert('Please select an LLM for Smart Prompts.');
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
			
			// Add a one-time listener to re-analyze then run
			new_reanalyze_and_run_btn.addEventListener('click', async () => {
				modal.close();
				show_loading('Re-analyzing modified files...');
				try {
					// Use the dedicated Analysis LLM for re-analysis.
					const analysis_llm_id = document.getElementById('llm-dropdown-analysis').value;
					if (!analysis_llm_id) {
						alert('Please select an LLM for Analysis to proceed.');
						hide_loading();
						return;
					}
					await post_data({
						action: 'reanalyze_modified_files',
						project_path: current_project.path,
						llm_id: analysis_llm_id,
						force: false, // Only re-analyze modified files
						temperature: parseFloat(temperature)
					});
					// After re-analysis is complete, perform the smart prompt
					await perform_smart_prompt(prompt_text);
				} catch (error) {
					console.error('Failed to re-analyze and run:', error);
					alert(`An error occurred during the process: ${error.message}`);
				} finally {
					hide_loading();
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
		// Inform the user, but suggest they can still run the prompt
		if (confirm(`Could not check for modified files: ${error.message}\n\nDo you want to run the prompt anyway?`)) {
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
