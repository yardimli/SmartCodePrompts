// js/file_tree/state.js

import { show_loading, hide_loading, post_data, estimate_tokens, get_parent_path } from '../utils.js';
import { get_current_project, get_content_footer_prompt, get_last_smart_prompt } from '../state.js';
import { update_estimated_prompt_tokens } from '../status_bar.js';
import { setTabContent, getPromptTabId } from '../editor.js';
import { load_folders } from './renderer.js';

// A cache for the content of all selected files to avoid re-fetching on prompt changes.
let cached_file_content_string = '';

/**
 * An internal helper to update the main editor from the cache and current prompts.
 */
function _updateEditorWithCachedContent () {
	const content_footer_prompt = get_content_footer_prompt();
	const user_prompt = get_last_smart_prompt();
	
	let final_content = cached_file_content_string + content_footer_prompt;
	
	const search_str = '${user_prompt}';
	const last_index = final_content.lastIndexOf(search_str);
	
	if (last_index !== -1) {
		final_content =
			final_content.substring(0, last_index) +
			user_prompt +
			final_content.substring(last_index + search_str.length);
	}
	
	const promptTabId = getPromptTabId();
	if (promptTabId) {
		setTabContent(promptTabId, final_content);
	} else {
		console.error("Could not find the 'Prompt' tab to update.");
	}
	
	const estimated_tokens = estimate_tokens(final_content);
	update_estimated_prompt_tokens(estimated_tokens);
}

/**
 * Gathers content from all selected files and displays it in the main editor.
 */
export async function update_selected_content () {
	const checked_boxes = document.querySelectorAll('#file-tree input[type="checkbox"]:checked');
	
	const promptTabId = getPromptTabId();
	
	if (checked_boxes.length === 0) {
		cached_file_content_string = '';
		if (promptTabId) {
			setTabContent(promptTabId, '// Select files from the left to build a prompt.');
		}
		update_estimated_prompt_tokens(0);
		return;
	}
	
	show_loading(`Loading ${checked_boxes.length} file(s)...`);
	
	const request_promises = Array.from(checked_boxes).map(box => {
		const path = box.dataset.path;
		return post_data({
			action: 'get_file_content',
			project_path: get_current_project().path,
			path: path
		})
			.then(response => {
				const firstLine = response.content.split('\n')[0];
				if (firstLine && firstLine.includes(path)) {
					return `${response.content}\n\n`;
				} else {
					return `${path}:\n\n${response.content}\n\n`;
				}
			})
			.catch(error => `/* --- ERROR loading ${path}: ${error.message || 'Unknown error'} --- */\n\n`);
	});
	
	try {
		const results = await Promise.all(request_promises);
		cached_file_content_string = results.join(''); // Update the cache.
		_updateEditorWithCachedContent();
	} catch (error) {
		console.error('Error updating content:', error);
		const error_message = '/* --- An unexpected error occurred while loading file contents. --- */';
		if (promptTabId) {
			setTabContent(promptTabId, error_message);
		}
		const estimated_tokens = estimate_tokens(error_message);
		update_estimated_prompt_tokens(estimated_tokens);
		cached_file_content_string = '';
	} finally {
		hide_loading();
	}
}

/**
 * Updates only the prompt portion of the main editor using cached file content.
 */
export function refresh_prompt_display () {
	_updateEditorWithCachedContent();
}

function restore_checked_states (selected_files) {
	document.querySelectorAll('#file-tree input[type="checkbox"]').forEach(cb => (cb.checked = false));
	selected_files.forEach(path => {
		const checkbox = document.querySelector(`#file-tree input[type="checkbox"][data-path="${path}"]`);
		if (checkbox) {
			checkbox.checked = true;
		} else {
			console.warn(`Checkbox not found during restore for path: ${path}`);
		}
	});
}

/**
 * Restores the UI state (open folders, checked files) from saved data.
 * @param {object} state - The state object with `open_folders` and `selected_files`.
 */
export async function restore_state (state) {
	console.log('Restoring state:', state);
	const current_project = get_current_project();
	const paths_to_ensure_open = new Set(state.open_folders || []);
	(state.selected_files || []).forEach(file_path => {
		let parent_path = get_parent_path(file_path);
		while (parent_path && parent_path !== '.') {
			paths_to_ensure_open.add(parent_path);
			parent_path = get_parent_path(parent_path);
		}
	});
	const sorted_paths = [...paths_to_ensure_open].sort((a, b) => a.split('/').length - b.split('/').length);
	for (const path of sorted_paths) {
		const folder_element = document.querySelector(`#file-tree .folder[data-path="${path}"]`);
		if (folder_element && !folder_element.classList.contains('open')) {
			folder_element.classList.add('open');
			await load_folders(path, folder_element);
		}
	}
	restore_checked_states(state.selected_files || []);
	update_selected_content();
}

/**
 * Ensures a file's parent folders are open in the tree, loading them if necessary.
 * @param {string} file_path - The path of the file to make visible.
 * @returns {Promise<boolean>} True if successful, false otherwise.
 */
export async function ensure_file_is_visible (file_path) {
	const parts = file_path.split('/');
	let current_path = '.'; // Start from root
	for (let i = 0; i < parts.length - 1; i++) {
		current_path = current_path === '.' ? parts[i] : `${current_path}/${parts[i]}`;
		const folder_element = document.querySelector(`#file-tree .folder[data-path="${current_path}"]`);
		if (folder_element && !folder_element.classList.contains('open')) {
			folder_element.classList.add('open');
			try {
				await load_folders(current_path, folder_element);
			} catch (error) {
				console.error(`Failed to open folder ${current_path} while ensuring visibility`, error);
				return false;
			}
		}
	}
	return true;
}
