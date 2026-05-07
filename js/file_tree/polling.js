// js/file_tree/polling.js

import { post_data } from '../utils.js';
import { get_current_project } from '../state.js';
import { updateTabGitStatus } from '../editor.js';
import { get_filetype_class, load_folders } from './renderer.js'; // MODIFIED: Import load_folders
import { restore_state, update_selected_content } from './state.js'; // MODIFIED: Import restore_state

// A handle for the file tree update polling interval.
let file_tree_update_interval = null;

/**
 * This function is called by the polling mechanism and performs surgical DOM updates
 * to reflect filesystem changes (added, deleted, modified files) without a full refresh.
 * If files are added or deleted, it triggers a full refresh of the tree to ensure consistency.
 * @param {object} updates - An object with `updates`, `deleted`, and `added` file arrays.
 */
async function handle_file_system_updates (updates) { // MODIFIED: Made function async
	const file_tree = document.getElementById('file-tree');
	if (!file_tree) return;
	
	// MODIFIED: If files were added or deleted, perform a full refresh of the file tree
	// to ensure the UI is perfectly in sync with the file system. This is more robust
	// than surgical DOM updates for additions and deletions.
	if (updates.added.length > 0 || updates.deleted.length > 0) {
		console.log('File system changes detected, performing full file tree refresh.');
		
		// Preserve current state (open folders and selected files) before reloading.
		const open_folders = Array.from(document.querySelectorAll('#file-tree .folder.open'))
			.map(el => el.dataset.path);
		const selected_files = Array.from(document.querySelectorAll('#file-tree input[type="checkbox"]:checked'))
			.map(el => el.dataset.path);
		const state_to_restore = { open_folders, selected_files };
		
		// Reload the entire file tree from the root.
		await load_folders('.', null);
		
		// Restore the preserved state, which also updates the prompt content.
		await restore_state(state_to_restore);
	}
	
	// Always process status updates for files, as they can change independently.
	(updates.updates || []).forEach(file_update => {
		updateTabGitStatus(file_update.file_path, file_update.has_git_diff);
		
		const file_li = file_tree.querySelector(`input[type="checkbox"][data-path="${file_update.file_path}"]`)?.closest('li');
		if (!file_li) return;
		
		// --- Handle Reanalysis Icon (stale analysis) ---
		const existing_reanalysis_icon = file_li.querySelector('.reanalysis-alert-icon');
		if (file_update.needs_reanalysis && !existing_reanalysis_icon) {
			file_li.querySelector('.file-entry')?.insertAdjacentHTML('afterend', ' <i class="bi bi-exclamation-triangle-fill reanalysis-alert-icon align-middle" title="File has been modified since last analysis"></i>');
		} else if (!file_update.needs_reanalysis && existing_reanalysis_icon) {
			existing_reanalysis_icon.remove();
		}
		
		// --- Handle Git Diff Icon ---
		const existing_diff_icon = file_li.querySelector('.diff-icon');
		if (file_update.has_git_diff && !existing_diff_icon) {
			file_li.insertAdjacentHTML('beforeend', ` <i class="bi bi-git diff-icon text-info hover:text-info-focus cursor-pointer align-middle ml-1" data-path="${file_update.file_path}" title="View Changes (Diff)"></i>`);
		} else if (!file_update.has_git_diff && existing_diff_icon) {
			existing_diff_icon.remove();
		}
	});
}

/**
 * Stops the periodic polling for file tree updates.
 */
export function stop_file_tree_polling () {
	if (file_tree_update_interval) {
		clearInterval(file_tree_update_interval);
		file_tree_update_interval = null;
		console.log('File tree polling stopped.');
	}
}

/**
 * Starts periodic polling for file system changes.
 * This uses a surgical update approach to avoid UI flickering.
 */
export function start_file_tree_polling () {
	stop_file_tree_polling();
	
	const poll_interval = 15000; // Poll every 15 seconds for better responsiveness
	
	file_tree_update_interval = setInterval(async () => { // MODIFIED: Callback is now async
		const current_project = get_current_project();
		if (!current_project) {
			stop_file_tree_polling();
			return;
		}
		
		try {
			const updates = await post_data({
				action: 'check_folder_updates',
				project_path: current_project.path
			});
			
			// Only process if there are actual changes to report
			if (updates.added.length > 0 || updates.deleted.length > 0 || updates.updates.length > 0) {
				console.log('File system changes detected:', updates);
				await handle_file_system_updates(updates); // MODIFIED: Await the async handler
			}
		} catch (error) {
			console.error('Error polling for file tree updates:', error);
		}
	}, poll_interval);
	console.log('File tree polling started for surgical updates.');
}
