// SmartCodePrompts/js/modals.js
import {show_loading, hide_loading, post_data} from './utils.js';
import {get_current_project, save_current_project_state, get_last_smart_prompt, set_last_smart_prompt} from './state.js';
import {ensure_file_is_visible, update_selected_content} from './file_tree.js';
import {update_status_bar} from './status_bar.js';

let search_modal = null;
let log_modal = null;
let reanalysis_prompt_modal = null;
let project_modal = null;
let setup_modal = null;
let analysis_modal = null; // NEW: Reference for the analysis modal.
let file_view_modal = null; // NEW: Reference for the file view modal.
let about_modal = null; // NEW: Reference for the about modal.
let current_search_folder_path = null;
let current_browser_path = null;

/**
 * Initializes the modal element references.
 */
export function initialize_modals() {
	search_modal = document.getElementById('search_modal');
	log_modal = document.getElementById('log_modal');
	reanalysis_prompt_modal = document.getElementById('reanalysis_prompt_modal');
	project_modal = document.getElementById('project_modal');
	setup_modal = document.getElementById('setup_modal');
	analysis_modal = document.getElementById('analysis_modal'); // NEW: Initialize the analysis modal.
	file_view_modal = document.getElementById('file_view_modal'); // NEW: Initialize the file view modal.
	about_modal = document.getElementById('about_modal'); // NEW: Initialize the about modal.
}

/**
 * NEW: Opens the about modal.
 */
export function open_about_modal() {
	if (about_modal) {
		about_modal.showModal();
	}
}

/**
 * NEW: Checks if any projects exist and shows the 'About' modal as a welcome screen if not.
 * This should be called once on page load after projects are fetched.
 * @param {number} project_count - The number of configured projects.
 */
export function check_and_show_welcome_modal(project_count) {
	// Use sessionStorage to only show the welcome modal once per session if the user closes it without adding a project.
	if (project_count === 0 && !sessionStorage.getItem('welcome_modal_shown')) {
		open_about_modal();
		sessionStorage.setItem('welcome_modal_shown', 'true');
	}
}

/**
 * NEW: Fetches and displays a list of directories for the project browser modal.
 * @param {string|null} dir_path - The absolute path of the directory to browse. If null, starts at the top level.
 */
async function browse_directory(dir_path = null) {
	const list_el = document.getElementById('project-browser-list');
	const path_el = document.getElementById('project-browser-current-path');
	list_el.innerHTML = '<div class="text-center p-4"><span class="loading loading-lg"></span></div>';
	
	try {
		const data = await post_data({action: 'browse_directory', path: dir_path});
		current_browser_path = data.current;
		path_el.textContent = current_browser_path || 'Select a drive or directory';
		path_el.title = current_browser_path;
		
		let html = '';
		// Add "up" directory if a parent exists
		if (data.parent) {
			html += `<a href="#" class="block p-2 rounded-md hover:bg-accent" data-path="${data.parent}"><i class="bi bi-arrow-90deg-up mr-2"></i>..</a>`;
		}
		
		// Add subdirectories
		data.directories.forEach(dir => {
			// This logic correctly handles both full paths (like 'C:\' from a drive list) and relative names.
			// If current_browser_path is null, full_path becomes dir.
			// If current_browser_path is set, it correctly joins them.
			const separator = current_browser_path && (current_browser_path.includes('\\')) ? '\\' : '/';
			const is_root = !current_browser_path || current_browser_path.endsWith(separator);
			const full_path = current_browser_path ? `${current_browser_path}${is_root ? '' : separator}${dir}` : dir;
			html += `<a href="#" class="block p-2 rounded-md hover:bg-accent truncate" data-path="${full_path}" title="${full_path}"><i class="bi bi-folder mr-2"></i>${dir}</a>`;
		});
		
		list_el.innerHTML = html || '<p class="text-base-content/70 p-3">No subdirectories found.</p>';
		
	} catch (error) {
		console.error('Failed to browse directory:', error);
		list_el.innerHTML = `<p class="text-error p-3">Could not browse directory: ${error.message}</p>`;
		path_el.textContent = 'Error';
	}
}

/**
 * NEW: Opens the project browser modal and loads the initial directory list.
 */
export function open_project_modal() {
	project_modal.showModal();
	browse_directory(); // Start at the root (drives on Windows, home on others)
}

/**
 * NEW: Loads configuration data from the server and populates the setup form in the modal.
 */
async function load_setup_data() {
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
		document.getElementById('server-port-input').value = config.server_port || 3000;
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
 * NEW: Opens the setup modal and loads the current configuration.
 */
export function open_setup_modal() {
	if (setup_modal) {
		setup_modal.showModal();
		load_setup_data();
	}
}

/**
 * Handles the click on the LLM Log button in the status bar.
 * Fetches log data and displays the modal.
 */
export async function handle_log_button_click() {
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
 * Handles the click event on a folder's search icon.
 */
export function handle_search_icon_click(target) {
	current_search_folder_path = target.closest('.folder').dataset.path;
	document.getElementById('search_modal_folder_path').textContent = current_search_folder_path || 'Root';
	search_modal.showModal();
}

/**
 * MODIFIED: Handles the click event on a file's analysis icon.
 * This now opens a modal and displays the analysis content in a textarea.
 * @param {HTMLElement} target - The analysis icon element that was clicked.
 */
export async function handle_analysis_icon_click(target) {
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
 * NEW: Handles the click event on a file's name in the tree.
 * Opens a modal to display the file's content in a textarea.
 * @param {HTMLElement} target - The file-entry element that was clicked.
 */
export async function handle_file_name_click(target) {
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
export async function perform_smart_prompt(user_prompt) {
	const trimmed_prompt = user_prompt.trim();
	if (!trimmed_prompt) {
		alert('Please enter a prompt.');
		return;
	}
	// MODIFIED: Use the dedicated Smart Prompt LLM dropdown.
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

/**
 * Sets up event listeners for modal-related controls.
 */
export function setup_modal_event_listeners() {
	// Search Modal Listeners
	document.getElementById('search_term_input').addEventListener('keypress', e => {
		if (e.key === 'Enter') {
			document.getElementById('perform_search_button').click();
		}
	});
	
	document.getElementById('perform_search_button').addEventListener('click', async function () {
		const search_term = document.getElementById('search_term_input').value.trim();
		search_modal.close();
		if (!search_term || !current_search_folder_path) return;
		
		show_loading('Searching files...');
		try {
			const current_project = get_current_project();
			const response = await post_data({
				action: 'search_files',
				folder_path: current_search_folder_path,
				search_term: search_term,
				project_path: current_project.path
			});
			
			if (response.matching_files && response.matching_files.length > 0) {
				let successful_checks = 0;
				for (const file_path of response.matching_files) {
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
					update_selected_content();
					save_current_project_state();
					alert(`Selected ${successful_checks} new file(s) containing "${search_term}".`);
				} else {
					alert(`Found files containing "${search_term}", but no *new* files were selected.`);
				}
			} else {
				alert(`No files found containing "${search_term}" in "${current_search_folder_path}".`);
			}
		} catch (error) {
			alert(`Search failed: ${error.message || 'Unknown error'}`);
		} finally {
			hide_loading();
		}
	});
	
	// LLM Log Modal Listeners
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
	
	// Project Modal Listeners
	document.getElementById('add-project-button').addEventListener('click', open_project_modal);
	
	document.getElementById('project-browser-list').addEventListener('click', (e) => {
		e.preventDefault();
		const target = e.target.closest('a');
		if (target && target.dataset.path) {
			browse_directory(target.dataset.path);
		}
	});
	
	document.getElementById('select-project-folder-button').addEventListener('click', async () => {
		if (!current_browser_path) {
			alert('No folder is selected.');
			return;
		}
		show_loading('Adding project...');
		try {
			await post_data({action: 'add_project', path: current_browser_path});
			project_modal.close();
			// Reload the page to refresh the project list and load the new project.
			window.location.reload();
		} catch (error) {
			console.error('Failed to add project:', error);
			alert(`Failed to add project: ${error.message}`);
		} finally {
			hide_loading();
		}
	});
	
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
				server_port: document.getElementById('server-port-input').value,
				openrouter_api_key: document.getElementById('openrouter-api-key-input').value.trim(),
				prompt_file_overview: document.getElementById('prompt-file-overview-input').value,
				prompt_functions_logic: document.getElementById('prompt-functions-logic-input').value,
				prompt_content_footer: document.getElementById('prompt-content-footer-input').value,
				prompt_smart_prompt: document.getElementById('prompt-smart-prompt-input').value
			};
			await post_data(save_data);
			alert('Configuration saved successfully!\n\nApplication will now reload. Please restart the server for port changes to take effect.');
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
	
	// NEW: About Modal Listener
	// Note: This requires the main logo link in index.html to have id="about-modal-button"
	const about_button = document.getElementById('about-modal-button');
	if (about_button) {
		about_button.addEventListener('click', (e) => {
			e.preventDefault();
			open_about_modal();
		});
	}
}
