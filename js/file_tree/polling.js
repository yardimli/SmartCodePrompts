// js/file_tree/polling.js

import { post_data } from '../utils.js';
import { get_current_project } from '../state.js';
import { updateTabGitStatus } from '../editor.js';
import { get_filetype_class } from './renderer.js';
import { update_selected_content } from './state.js';

// A handle for the file tree update polling interval.
let file_tree_update_interval = null;

/**
 * This function is called by the polling mechanism and performs surgical DOM updates
 * to reflect filesystem changes (added, deleted, modified files) without a full refresh.
 * @param {object} updates - An object with `updates`, `deleted`, and `added` file arrays.
 */
function handle_file_system_updates (updates) {
	const file_tree = document.getElementById('file-tree');
	if (!file_tree) return;
	
	let content_needs_update = false;
	
	// 1. Handle icon/status UPDATES on existing files
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
	
	// 2. Handle DELETED files
	(updates.deleted || []).forEach(file_path => {
		const file_li = file_tree.querySelector(`input[type="checkbox"][data-path="${file_path}"]`)?.closest('li');
		if (file_li) {
			const checkbox = file_li.querySelector('input[type="checkbox"]');
			if (checkbox && checkbox.checked) {
				content_needs_update = true;
			}
			file_li.remove();
		}
	});
	
	// 3. Handle ADDED files
	(updates.added || []).forEach(file_info => {
		const parent_folder_element = file_tree.querySelector(`.folder[data-path="${file_info.parent_path}"]`);
		
		// Only add the file to the DOM if its parent folder is currently open
		if (parent_folder_element && parent_folder_element.classList.contains('open')) {
			const parent_li = parent_folder_element.closest('li');
			let parent_ul = parent_li.nextElementSibling;
			
			if (!parent_ul || parent_ul.tagName !== 'UL') {
				parent_ul = document.createElement('ul');
				parent_ul.className = 'pl-4';
				parent_li.after(parent_ul);
			}
			
			if (parent_ul.querySelector(`[data-path="${file_info.path}"]`)) {
				return; // Avoid duplicating if already present
			}
			
			const filetype_class = get_filetype_class(file_info.name);
			const new_li_html = `
                <li>
                    <div class="checkbox-wrapper">
                        <input type="checkbox" data-path="${file_info.path}" class="checkbox checkbox-xs checkbox-primary align-middle" data-has_analysis="false">
                    </div>
                    <div class="file-entry align-middle" data-path="${file_info.path}">
                        <span class="file ${filetype_class}"></span>
                        <span class="file-name" title="${file_info.path}">${file_info.name}</span>
                    </div>
                </li>`;
			
			// Append the new file. Imperfect sorting is acceptable to avoid the blink.
			parent_ul.insertAdjacentHTML('beforeend', new_li_html);
		}
	});
	
	if (content_needs_update) {
		update_selected_content();
	}
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
	
	const poll_interval = 60000; // Poll every 5 seconds for better responsiveness
	
	file_tree_update_interval = setInterval(async () => {
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
				handle_file_system_updates(updates);
			}
		} catch (error) {
			console.error('Error polling for file tree updates:', error);
		}
	}, poll_interval);
	console.log('File tree polling started for surgical updates.');
}
