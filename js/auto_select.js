// SmartCodePrompts/js/auto_select.js
import {show_loading, hide_loading, post_data} from './utils.js';
import {get_current_project, save_current_project_state} from './state.js';
import {show_progress_modal, hide_progress_modal, update_progress} from './modal-progress.js';
import {show_alert} from './modal-alert.js';
import {show_confirm} from './modal-confirm.js';
import {load_folders, update_selected_content} from './file_tree.js';
import {perform_selection_analysis} from './analysis.js';

/**
 * Recursively expands all folders in the file tree UI.
 * @returns {Promise<void>}
 */
async function expand_all_folders () {
	show_loading('Expanding all folders...');
	try {
		let closed_folders;
		// Keep looping as long as we find closed folders to open.
		while ((closed_folders = document.querySelectorAll('#file-tree .folder:not(.open)')).length > 0) {
			// Create a promise for each folder to be opened at the current depth.
			const expansion_promises = Array.from(closed_folders).map(folder_element => {
				folder_element.classList.add('open'); // Mark as open immediately to avoid re-processing in the same loop
				return load_folders(folder_element.dataset.path, folder_element).catch(err => {
					console.error(`Failed to expand folder ${folder_element.dataset.path}`, err);
					folder_element.classList.remove('open'); // Revert on error so it can be tried again
				});
			});
			// Wait for all folders at the current level to be loaded before finding newly added closed folders.
			await Promise.all(expansion_promises);
		}
	} finally {
		hide_loading();
	}
}

/**
 * Orchestrates the process of using an LLM to identify and select project-specific files.
 */
export async function handle_auto_select_click () {
	const current_project = get_current_project();
	const llm_id = document.getElementById('llm-dropdown-analysis').value; // Use the same LLM as analysis for consistency
	const temperature = document.getElementById('temperature-slider').value;
	
	if (!current_project) {
		show_alert('Please select a project first.');
		return;
	}
	if (!llm_id) {
		show_alert('Please select an LLM for Analysis to perform this action.');
		return;
	}
	
	const confirmed = await show_confirm(
		'This will expand all folders and use an LLM to identify project-specific source files. This may incur costs. Do you want to continue?',
		'Auto-Select Project Files'
	);
	if (!confirmed) return;
	
	await expand_all_folders();
	
	const all_file_checkboxes = document.querySelectorAll('#file-tree input[type="checkbox"]');
	if (all_file_checkboxes.length === 0) {
		show_alert('No files found in the project to select from.');
		return;
	}
	const all_file_paths = Array.from(all_file_checkboxes).map(cb => cb.dataset.path);
	
	let poll_interval;
	const stop_callback = () => {
		console.log('Requesting auto-select cancellation.');
		post_data({action: 'cancel_auto_select'}).catch(err => console.error('Failed to send cancel signal:', err));
		if (poll_interval) clearInterval(poll_interval);
		// The polling loop will handle hiding the modal.
	};
	show_progress_modal('Identifying Project Files', stop_callback);
	
	// Fire-and-forget the backend request
	post_data({
		action: 'identify_project_files',
		project_path: current_project.path,
		all_files: JSON.stringify(all_file_paths),
		llm_id: llm_id,
		temperature: parseFloat(temperature)
	}).catch(error => {
		console.error('Failed to start auto-select process:', error);
		if (poll_interval) clearInterval(poll_interval);
		hide_progress_modal();
		show_alert(`Error starting process: ${error.message}`);
	});
	
	// Start polling for progress
	poll_interval = setInterval(async () => {
		try {
			const stats = await post_data({action: 'get_session_stats'});
			const progress = stats.auto_select;
			
			if (!progress) {
				// This can happen if the server restarts or the state is cleared.
				throw new Error('Auto-select progress tracking is not available.');
			}
			
			if (progress.running) {
				update_progress(progress.current, progress.total, progress.message);
			} else {
				// Process finished or was cancelled
				clearInterval(poll_interval);
				hide_progress_modal();
				
				const summary = progress.summary;
				if (summary) {
					if (summary.errors && summary.errors.length > 0) {
						const error_msg = `Process finished with errors:\n- ${summary.errors.join('\n- ')}`;
						show_alert(error_msg, 'Auto-Select Failed');
						return;
					}
					
					const identified_files = summary.identified_files || [];
					
					// Uncheck all files first
					document.querySelectorAll('#file-tree input[type="checkbox"]').forEach(cb => { cb.checked = false; });
					
					// Check the identified files
					let checked_count = 0;
					for (const file_path of identified_files) {
						const checkbox = document.querySelector(`#file-tree input[type="checkbox"][data-path="${file_path}"]`);
						if (checkbox) {
							checkbox.checked = true;
							checked_count++;
						}
					}
					
					update_selected_content();
					save_current_project_state();
					
					if (checked_count > 0) {
						const analyze_confirmed = await show_confirm(
							`The LLM identified and selected ${checked_count} project files. Would you like to analyze them now?`,
							'Analysis Confirmation'
						);
						if (analyze_confirmed) {
							await perform_selection_analysis();
						}
					} else {
						show_alert('The LLM did not identify any project-specific files from the list.');
					}
				} else {
					show_alert('The auto-select process finished, but no summary was returned. It might have been cancelled by the user.');
				}
			}
		} catch (error) {
			console.error('Error polling for auto-select status:', error);
			clearInterval(poll_interval);
			hide_progress_modal();
			show_alert(`An error occurred while checking status: ${error.message}`, 'Polling Error');
		}
	}, 1500);
}

/**
 * Sets up the event listener for the auto-select button.
 */
export function setup_auto_select_listeners () {
	const auto_select_btn = document.getElementById('auto-select-project-files-btn');
	if (auto_select_btn) {
		auto_select_btn.addEventListener('click', handle_auto_select_click);
	}
}
