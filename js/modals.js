// SmartCodePrompts/js/modals.js
import {show_loading, hide_loading, post_data} from './utils.js';
import {get_current_project, save_current_project_state, get_last_smart_prompt, set_last_smart_prompt} from './state.js';
import {ensure_file_is_visible, update_selected_content} from './file_tree.js';
import {update_status_bar} from './status_bar.js';

let search_modal = null;
let log_modal = null;
let reanalysis_prompt_modal = null;
let setup_modal = null;
let analysis_modal = null; // NEW: Reference for the analysis modal.
let file_view_modal = null; // NEW: Reference for the file view modal.
let about_modal = null; // NEW: Reference for the about modal.
let current_project_search_results = []; // NEW: To store results from project search.
let current_search_matches = [];
let current_search_match_index = -1;

/**
 * Initializes the modal element references.
 */
export function initialize_modals () {
	search_modal = document.getElementById('search_modal');
	log_modal = document.getElementById('log_modal');
	reanalysis_prompt_modal = document.getElementById('reanalysis_prompt_modal');
	setup_modal = document.getElementById('setup_modal');
	analysis_modal = document.getElementById('analysis_modal');
	file_view_modal = document.getElementById('file_view_modal');
	about_modal = document.getElementById('about_modal');
}

export function open_about_modal () {
	if (about_modal) {
		about_modal.showModal();
	}
}


/**
 * Opens a native dialog to select a project folder and adds it to the application.
 */
export async function open_project_modal () {
	try {
		// Call the method exposed from the main process via the preload script.
		const selected_path = await window.electronAPI.openDirectoryDialog();
		
		if (selected_path) {
			show_loading('Adding project...');
			try {
				await post_data({action: 'add_project', path: selected_path});
				// Reload the page to refresh the project list and load the new project.
				window.location.reload();
			} catch (error) {
				console.error('Failed to add project:', error);
				alert(`Failed to add project: ${error.message}`);
			} finally {
				hide_loading();
			}
		}
	} catch (error) {
		console.error('Error opening directory dialog:', error);
		alert(`Could not open directory selector: ${error.message}`);
	}
}

/**
 * Loads configuration data from the server and populates the setup form in the modal.
 */
async function load_setup_data () {
	const form = document.getElementById('setup-form');
	const loading_indicator = document.getElementById('setup-loading-indicator');
	
	loading_indicator.style.display = 'block';
	form.style.display = 'none';
	
	try {
		const data = await post_data({action: 'get_setup'});
		const config = data.config;
		
		// Populate form fields
		document.getElementById('allowed-extensions-input').value = (config.allowed_extensions || []).join(', ');
		document.getElementById('excluded-folders-input').value = (config.excluded_folders || []).join(', ');
		// DELETED: Server port input is removed.
		document.getElementById('openrouter-api-key-input').value = config.openrouter_api_key || '';
		document.getElementById('prompt-file-overview-input').value = config.prompt_file_overview || '';
		document.getElementById('prompt-functions-logic-input').value = config.prompt_functions_logic || '';
		document.getElementById('prompt-content-footer-input').value = config.prompt_content_footer || '';
		document.getElementById('prompt-smart-prompt-input').value = config.prompt_smart_prompt || '';
		
		loading_indicator.style.display = 'none';
		form.style.display = 'block';
	} catch (error) {
		loading_indicator.innerHTML = `<p class="text-center text-error">Error loading setup data: ${error.message}</p>`;
	}
}

/**
 * Opens the setup modal and loads the current configuration.
 */
export function open_setup_modal () {
	if (setup_modal) {
		setup_modal.showModal();
		load_setup_data();
	}
}


export async function handle_log_button_click () {
	const modal_body = document.getElementById('log_modal_body');
	modal_body.innerHTML = '<div class="text-center p-4"><span class="loading loading-lg"></span></div>';
	log_modal.showModal();
	
	try {
		const log_data = await post_data({action: 'get_llm_log'});
		if (!log_data || log_data.length === 0) {
			modal_body.innerHTML = '<p class="text-base-content/70 p-3">No LLM calls have been made yet.</p>';
			return;
		}
		
		let table_html = `
            <div class="overflow-x-auto">
                <table class="table table-sm">
                    <thead>
                        <tr>
                            <th>Timestamp</th>
                            <th>Reason</th>
                            <th>Model</th>
                            <th class="text-right">Prompt Tokens</th>
                            <th class="text-right">Completion Tokens</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
		
		for (const entry of log_data) {
			const timestamp = new Date(entry.timestamp).toLocaleString();
			table_html += `
                <tr class="hover">
                    <td class="log-timestamp">${timestamp}</td>
                    <td class="log-reason">${entry.reason}</td>
                    <td class="log-model">${entry.model_id || 'N/A'}</td>
                    <td class="log-tokens text-right">${(entry.prompt_tokens || 0).toLocaleString()}</td>
                    <td class="log-tokens text-right">${(entry.completion_tokens || 0).toLocaleString()}</td>
                </tr>
            `;
		}
		
		table_html += '</tbody></table></div>';
		modal_body.innerHTML = table_html;
	} catch (error) {
		console.error("Failed to fetch LLM log:", error);
		modal_body.innerHTML = `<p class="text-error p-3">Could not load LLM log: ${error.message}</p>`;
	}
}

/**
 * This now opens a modal and displays the analysis content in a textarea.
 * @param {HTMLElement} target - The analysis icon element that was clicked.
 */
export async function handle_analysis_icon_click (target) {
	const file_path = target.dataset.path;
	const title_el = document.getElementById('analysis-modal-title');
	const content_el = document.getElementById('analysis-modal-content');
	
	title_el.textContent = `Analysis for ${file_path}`;
	content_el.value = 'Loading analysis data...';
	analysis_modal.showModal();
	
	try {
		const current_project = get_current_project();
		const data = await post_data({
			action: 'get_file_analysis',
			project_path: current_project.path,
			file_path: file_path
		});
		
		let body_content = 'No analysis data found for this file.';
		if (data.file_overview || data.functions_overview) {
			const content_parts = [];
			
			if (data.file_overview) {
				try {
					const parsed = JSON.parse(data.file_overview);
					content_parts.push('--- FILE OVERVIEW ---\n' + JSON.stringify(parsed, null, 2));
				} catch (e) {
					content_parts.push('--- FILE OVERVIEW ---\n' + data.file_overview);
				}
			}
			
			if (data.functions_overview) {
				try {
					const parsed = JSON.parse(data.functions_overview);
					content_parts.push('\n\n--- FUNCTIONS & LOGIC ---\n' + JSON.stringify(parsed, null, 2));
				} catch (e) {
					content_parts.push('\n\n--- FUNCTIONS & LOGIC ---\n' + data.functions_overview);
				}
			}
			body_content = content_parts.join('');
		}
		
		content_el.value = body_content;
		
	} catch (error) {
		content_el.value = `Error fetching analysis: ${error.message}`;
	}
}

/**
 * Opens a modal to display the file's content in a textarea.
 * @param {HTMLElement} target - The file-entry element that was clicked.
 */
export async function handle_file_name_click (target) {
	const file_path = target.dataset.path;
	const title_el = document.getElementById('file-view-modal-title');
	const content_el = document.getElementById('file-view-modal-content');
	
	title_el.textContent = `Content of ${file_path}`;
	content_el.value = 'Loading file content...';
	file_view_modal.showModal();
	
	try {
		const current_project = get_current_project();
		const data = await post_data({
			action: 'get_file_content',
			project_path: current_project.path,
			path: file_path
		});
		
		content_el.value = data.content || 'File is empty or could not be loaded.';
		
	} catch (error) {
		content_el.value = `Error fetching file content: ${error.message}`;
	}
}

/**
 * Performs the "smart prompt" action to select relevant files using an LLM.
 * @param {string} user_prompt - The user's high-level request.
 */
export async function perform_smart_prompt (user_prompt) {
	const trimmed_prompt = user_prompt.trim();
	if (!trimmed_prompt) {
		alert('Please enter a prompt.');
		return;
	}
	const llm_id = document.getElementById('llm-dropdown-smart-prompt').value;
	if (!llm_id) {
		alert('Please select an LLM for Smart Prompts from the dropdown.');
		return;
	}
	
	set_last_smart_prompt(user_prompt);
	
	show_loading('Asking LLM to select relevant files...');
	try {
		const current_project = get_current_project();
		const response = await post_data({
			action: 'get_relevant_files_from_prompt',
			project_path: current_project.path,
			user_prompt: trimmed_prompt,
			llm_id: llm_id,
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
			alert(`LLM selected ${checked_count} relevant file(s). Prompt has been built.`);
		} else {
			alert("The LLM did not identify any relevant files from the project's analyzed files. No changes were made.");
		}
	} catch (error) {
		console.error('Failed to get relevant files from prompt:', error);
		alert(`An error occurred: ${error.message}`);
	} finally {
		hide_loading();
	}
}

// Helper function to highlight the current match in the search preview and scroll to it.
function highlight_current_match () {
	if (!current_search_matches.length || current_search_match_index < 0) {
		return;
	}
	
	const content_el = document.getElementById('search-preview-content');
	const match = current_search_matches[current_search_match_index];
	

	setTimeout(() => {
		content_el.focus();
		content_el.setSelectionRange(match.start, match.end);
	}, 0);
	
	document.getElementById('search-preview-matches').textContent = `${current_search_match_index + 1} of ${current_search_matches.length}`;
}

async function show_search_preview (file_path, search_term) {
	const title_el = document.getElementById('search-preview-title');
	const content_el = document.getElementById('search-preview-content');
	const nav_el = document.getElementById('search-preview-nav');
	
	// Reset state for the new file preview.
	title_el.textContent = `Loading ${file_path}...`;
	content_el.value = 'Loading...'; // Use .value for textarea
	nav_el.classList.add('hidden');
	current_search_matches = [];
	current_search_match_index = -1;
	
	try {
		const current_project = get_current_project();
		const data = await post_data({
			action: 'get_file_content',
			project_path: current_project.path,
			path: file_path
		});
		
		const file_content = data.content || '';
		content_el.value = file_content; // Set the full content in the textarea
		
		// Create a regex to find all occurrences of the search term, case-insensitively.
		const search_regex = new RegExp(search_term.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'gi');
		
		let match;
		while ((match = search_regex.exec(file_content)) !== null) {
			current_search_matches.push({
				start: match.index,
				end: match.index + match[0].length
			});
		}
		
		title_el.textContent = file_path;
		
		// Set up navigation if matches were found.
		if (current_search_matches.length > 0) {
			nav_el.classList.remove('hidden');
			current_search_match_index = 0;
			highlight_current_match();
		} else {
			document.getElementById('search-preview-matches').textContent = '0 matches';
		}
		
	} catch (error) {
		title_el.textContent = `Error loading ${file_path}`;
		content_el.value = `Error: ${error.message}`;
	}
}

/**
 * Sets up event listeners for modal-related controls.
 */
export function setup_modal_event_listeners () {
	// Listener for the project-wide search modal button.
	document.getElementById('project-search-button').addEventListener('click', (e) => {
		e.preventDefault();
		// Reset the entire search UI when opening the modal.
		document.getElementById('search_term_input').value = '';
		document.getElementById('search-results-list').innerHTML = '<p class="text-base-content/60 text-center font-sans text-sm">Enter a search term and click "Find".</p>';
		document.getElementById('search-preview-title').textContent = 'Select a file to preview';
		document.getElementById('search-preview-content').value = ''; // Use .value for textarea
		document.getElementById('search-preview-nav').classList.add('hidden');
		document.getElementById('check_matching_files_button').disabled = true;
		current_project_search_results = [];
		current_search_matches = [];
		current_search_match_index = -1;
		search_modal.showModal();
		document.getElementById('search_term_input').focus();
	});
	
	// Async function to perform the project-wide search.
	const perform_search = async () => {
		const search_term = document.getElementById('search_term_input').value.trim();
		const results_list = document.getElementById('search-results-list');
		const check_button = document.getElementById('check_matching_files_button');
		
		// Reset preview pane on new search.
		document.getElementById('search-preview-title').textContent = 'Select a file to preview';
		document.getElementById('search-preview-content').value = ''; // Use .value for textarea
		document.getElementById('search-preview-nav').classList.add('hidden');
		
		if (!search_term) {
			results_list.innerHTML = '<p class="text-error text-center">Please enter a search term.</p>';
			check_button.disabled = true;
			return;
		}
		
		results_list.innerHTML = '<div class="text-center"><span class="loading loading-spinner"></span> Searching...</div>';
		check_button.disabled = true;
		
		try {
			const current_project = get_current_project();
			const response = await post_data({
				action: 'search_files',
				folder_path: '.', // Search from the project root.
				search_term: search_term,
				project_path: current_project.path
			});
			
			current_project_search_results = response.matching_files || [];
			
			if (current_project_search_results.length > 0) {
				// Populate the list with clickable items showing file path and match count.
				results_list.innerHTML = current_project_search_results.map(file => `
                    <div class="p-1.5 hover:bg-base-300 rounded cursor-pointer search-result-item" data-path="${file.path}" title="${file.path}">
                        <span class="badge badge-neutral badge-sm mr-2">${file.match_count}</span>
                        <span class="truncate">${file.path}</span>
                    </div>
                `).join('');
				check_button.disabled = false;
			} else {
				results_list.innerHTML = `<p class="text-base-content/80 text-center">No files found containing "${search_term}".</p>`;
			}
		} catch (error) {
			results_list.innerHTML = `<p class="text-error text-center">Search failed: ${error.message || 'Unknown error'}</p>`;
		}
	};
	
	// Trigger search on Enter key in the input field.
	document.getElementById('search_term_input').addEventListener('keypress', e => {
		if (e.key === 'Enter') {
			e.preventDefault();
			perform_search();
		}
	});
	
	// Trigger search on "Find" button click.
	document.getElementById('perform_search_button').addEventListener('click', perform_search);
	
	// Delegated listener for clicking on a file in the search results list.
	document.getElementById('search-results-list').addEventListener('click', e => {
		const item = e.target.closest('.search-result-item');
		if (item) {
			const file_path = item.dataset.path;
			const search_term = document.getElementById('search_term_input').value.trim();
			
			// Visually mark the selected item in the list.
			document.querySelectorAll('.search-result-item').forEach(el => el.classList.remove('bg-primary/50'));
			item.classList.add('bg-primary/50');
			
			if (file_path && search_term) {
				show_search_preview(file_path, search_term);
			}
		}
	});
	
	// Listeners for match navigation buttons.
	document.getElementById('search-next-match-btn').addEventListener('click', () => {
		if (current_search_matches.length > 0) {
			current_search_match_index = (current_search_match_index + 1) % current_search_matches.length;
			highlight_current_match();
		}
	});
	
	document.getElementById('search-prev-match-btn').addEventListener('click', () => {
		if (current_search_matches.length > 0) {
			current_search_match_index = (current_search_match_index - 1 + current_search_matches.length) % current_search_matches.length;
			highlight_current_match();
		}
	});
	
	// Listener for the "Check Matching Files" button now handles the new results format.
	document.getElementById('check_matching_files_button').addEventListener('click', async function () {
		if (current_project_search_results.length === 0) return;
		
		search_modal.close();
		show_loading(`Selecting ${current_project_search_results.length} file(s)...`);
		
		// Map the array of result objects to an array of file paths.
		const files_to_check = current_project_search_results.map(f => f.path);
		
		try {
			let successful_checks = 0;
			for (const file_path of files_to_check) {
				const is_visible = await ensure_file_is_visible(file_path);
				if (is_visible) {
					const checkbox = document.querySelector(`#file-tree input[type="checkbox"][data-path="${file_path}"]`);
					if (checkbox && !checkbox.checked) {
						checkbox.checked = true;
						successful_checks++;
					}
				}
			}
			if (successful_checks > 0) {
				await update_selected_content();
				save_current_project_state();
			}
			alert(`Selected ${successful_checks} new file(s) from search results.`);
		} catch (error) {
			alert(`An error occurred while selecting files: ${error.message || 'Unknown error'}`);
		} finally {
			hide_loading();
		}
	});
	
	document.getElementById('log-modal-button').addEventListener('click', handle_log_button_click);
	
	document.getElementById('reset-log-button').addEventListener('click', async () => {
		if (confirm('Are you sure you want to permanently delete the LLM call log and reset all token counters? This cannot be undone.')) {
			show_loading('Resetting log...');
			try {
				await post_data({action: 'reset_llm_log'});
				await handle_log_button_click();
				update_status_bar({prompt: 0, completion: 0});
			} catch (error) {
				console.error('Failed to reset log:', error);
				alert(`Failed to reset log: ${error.message}`);
			} finally {
				hide_loading();
			}
		}
	});
	

	document.getElementById('add-project-button').addEventListener('click', open_project_modal);
	
	// Setup Modal Listeners
	document.getElementById('setup-modal-button').addEventListener('click', open_setup_modal);
	
	document.getElementById('save-setup-button').addEventListener('click', async () => {
		const save_button = document.getElementById('save-setup-button');
		const original_text = save_button.textContent;
		save_button.disabled = true;
		save_button.innerHTML = '<span class="loading loading-spinner loading-xs"></span> Saving...';
		
		try {
			const save_data = {
				action: 'save_setup',
				allowed_extensions: JSON.stringify(document.getElementById('allowed-extensions-input').value.split(',').map(s => s.trim()).filter(Boolean)),
				excluded_folders: JSON.stringify(document.getElementById('excluded-folders-input').value.split(',').map(s => s.trim()).filter(Boolean)),
				// DELETED: Server port is no longer part of the setup.
				openrouter_api_key: document.getElementById('openrouter-api-key-input').value.trim(),
				prompt_file_overview: document.getElementById('prompt-file-overview-input').value,
				prompt_functions_logic: document.getElementById('prompt-functions-logic-input').value,
				prompt_content_footer: document.getElementById('prompt-content-footer-input').value,
				prompt_smart_prompt: document.getElementById('prompt-smart-prompt-input').value
			};
			await post_data(save_data);
			alert('Configuration saved successfully!\n\nApplication will now reload.');
			window.location.reload();
		} catch (error) {
			alert(`Failed to save configuration: ${error.message}`);
			save_button.disabled = false;
			save_button.innerHTML = original_text;
		}
	});
	
	document.getElementById('reset-prompts-btn').addEventListener('click', async () => {
		if (confirm('Are you sure you want to reset all prompts to their default values? This cannot be undone.')) {
			try {
				show_loading('Resetting prompts...');
				await post_data({action: 'reset_prompts'});
				await load_setup_data(); // Reload data in the modal
				hide_loading();
				alert('Prompts have been reset to their default values.');
			} catch (error) {
				hide_loading();
				alert(`Failed to reset prompts: ${error.message}`);
			}
		}
	});
	
	// About Modal Listener
	const about_button = document.getElementById('about-modal-button');
	if (about_button) {
		about_button.addEventListener('click', (e) => {
			e.preventDefault();
			open_about_modal();
		});
	}
}
