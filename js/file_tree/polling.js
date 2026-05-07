// js/file_tree/polling.js

import { post_data } from '../utils.js';
import { get_current_project } from '../state.js';
import { updateTabGitStatus } from '../editor.js';
import { load_folders } from './renderer.js';
import { restore_state } from './state.js';

let file_tree_update_interval = null;

/**
 * Handles file system update notifications from the backend.
 * If files were added or deleted, it performs a full, state-preserving refresh of the tree.
 * Otherwise, it applies non-disruptive icon updates for modified files.
 * @param {object} updates - An object with `updates`, `deleted`, and `added` file arrays.
 */
async function handle_file_system_updates (updates) {
	const file_tree = document.getElementById('file-tree');
	if (!file_tree) return;
	
	// If files were added or deleted, perform a full refresh. This is the most reliable
	// way to handle structural changes to the file tree.
	if (updates.added.length > 0 || updates.deleted.length > 0) {
		console.log('File system additions/deletions detected, performing full file tree refresh.');
		
		// Preserve the current state (open folders and selected files) before reloading.
		const open_folders = Array.from(document.querySelectorAll('#file-tree .folder.open'))
			.map(el => el.dataset.path);
		const selected_files = Array.from(document.querySelectorAll('#file-tree input[type="checkbox"]:checked'))
			.map(el => el.dataset.path);
		const state_to_restore = { open_folders, selected_files };
		
		// Reload the entire file tree from the root.
		await load_folders('.', null);
		
		// Restore the state, which re-opens folders and re-selects files.
		await restore_state(state_to_restore);
	} else {
		// Otherwise, if only file statuses changed, perform surgical DOM updates for icons.
		// This avoids a full refresh and the associated UI flicker.
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
};

/**
 * Starts periodic polling for file system changes.
 */
export function start_file_tree_polling () {
	stop_file_tree_polling();
	
	const poll_interval = 30000; // Poll every 30 seconds.
	
	file_tree_update_interval = setInterval(async () => {
		const current_project = get_current_project();
		if (!current_project) {
			stop_file_tree_polling();
			return;
		}
		
		try {
			// MODIFIED: The backend now handles state, so we no longer need to send the list of known files.
			const updates = await post_data({
				action: 'check_folder_updates',
				project_path: current_project.path
			});
			
			// Only trigger the handler if there are actual changes to process.
			if (updates.added.length > 0 || updates.deleted.length > 0 || updates.updates.length > 0) {
				await handle_file_system_updates(updates);
			}
		} catch (error) {
			console.error('Error polling for file tree updates:', error);
		}
	}, poll_interval);
	console.log('File tree polling started.');
};

/**
 * Stops the periodic polling for file tree updates.
 */
export function stop_file_tree_polling () {
	if (file_tree_update_interval) {
		clearInterval(file_tree_update_interval);
		file_tree_update_interval = null;
		console.log('File tree polling stopped.');
	}
};
