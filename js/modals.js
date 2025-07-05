// SmartCodePrompts/js/modals.js
import {show_loading, hide_loading, post_data} from './utils.js';
import {get_current_project, save_current_project_state, get_last_smart_prompt, set_last_smart_prompt} from './state.js';
import {ensure_file_is_visible, update_selected_content} from './file_tree.js';
import {update_status_bar} from './status_bar.js';

let search_modal = null;
let log_modal = null;
let reanalysis_prompt_modal = null;
let project_modal = null; // NEW: Reference for the project browser modal
let current_search_folder_path = null;
let current_browser_path = null; // NEW: To track the current path in the project browser

/**
 * Initializes the modal element references.
 */
export function initialize_modals() {
	search_modal = document.getElementById('search_modal');
	log_modal = document.getElementById('log_modal');
	reanalysis_prompt_modal = document.getElementById('reanalysis_prompt_modal');
	project_modal = document.getElementById('project_modal'); // NEW: Initialize the project modal
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
			html += `<a href="#" class="block p-2 rounded-md hover:bg-base-300" data-path="${data.parent}"><i class="bi bi-arrow-90deg-up mr-2"></i>..</a>`;
		}
		
		// Add subdirectories
		data.directories.forEach(dir => {
			const separator = current_browser_path && (current_browser_path.includes('\\')) ? '\\' : '/';
			const is_root = !current_browser_path || current_browser_path.endsWith(separator);
			const full_path = current_browser_path ? `${current_browser_path}${is_root ? '' : separator}${dir}` : dir;
			html += `<a href="#" class="block p-2 rounded-md hover:bg-base-300 truncate" data-path="${full_path}" title="${full_path}"><i class="bi bi-folder mr-2"></i>${dir}</a>`;
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
 * Handles the click event on a file's analysis icon.
 * This now injects the analysis content directly into the #analysis-view div.
 */
export async function handle_analysis_icon_click(target) {
	const file_path = target.dataset.path;
	const analysis_view = document.getElementById('analysis-view');
	const prompt_textarea = document.getElementById('selected-content');
	
	prompt_textarea.classList.add('hidden');
	analysis_view.innerHTML = '<div class="text-center p-4"><span class="loading loading-lg"></span></div>';
	analysis_view.classList.remove('hidden');
	
	try {
		const current_project = get_current_project();
		const data = await post_data({
			action: 'get_file_analysis',
			project_path: current_project.path,
			file_path: file_path
		});
		
		let body_content = '<p>No analysis data found for this file.</p>';
		if (data.file_overview || data.functions_overview) {
			body_content = '';
			const render_json = (title, json_string) => {
				let content;
				try {
					const parsed = JSON.parse(json_string);
					content = JSON.stringify(parsed, null, 2);
				} catch (err) {
					content = json_string;
				}
				return `<h6 class="font-bold mt-2">${title}</h6><pre class="bg-base-300 p-2 rounded-md text-xs overflow-auto">${content}</pre>`;
			};
			if (data.file_overview) {
				body_content += render_json('File Overview', data.file_overview);
			}
			if (data.functions_overview) {
				body_content += render_json('Functions & Logic', data.functions_overview);
			}
		}
		
		analysis_view.innerHTML = `
            <div class="p-4 h-full flex flex-col">
                <div id="analysis-view-header" class="flex justify-between items-center mb-2 flex-shrink-0">
                    <h2 id="analysis-view-title" class="text-lg font-bold truncate" title="Analysis for ${file_path}">Analysis for ${file_path}</h2>
                    <button id="close-analysis-view" class="btn btn-sm btn-ghost">
                        <i class="bi bi-x-lg"></i> Close
                    </button>
                </div>
                <div id="analysis-view-body" class="flex-grow overflow-y-auto">
                    ${body_content}
                </div>
            </div>
        `;
		
	} catch (error) {
		analysis_view.innerHTML = `<p class="text-error p-4">Error fetching analysis: ${error.message}</p>`;
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
	const llm_id = document.getElementById('llm-dropdown').value;
	if (!llm_id) {
		alert('Please select an LLM from the dropdown.');
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
	
	// Analysis View Close Button Listener (delegated)
	document.getElementById('workspace').addEventListener('click', (e) => {
		if (e.target.closest('#close-analysis-view')) {
			document.getElementById('analysis-view').classList.add('hidden');
			document.getElementById('selected-content').classList.remove('hidden');
		}
	});
	
	// NEW: Project Modal Listeners
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
}
