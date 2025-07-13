import {show_loading, hide_loading, get_parent_path, post_data, estimate_tokens} from './utils.js';
import {get_current_project, get_content_footer_prompt, get_last_smart_prompt, save_current_project_state} from './state.js';
import {handle_analysis_icon_click} from './modal-analysis.js';
import { show_diff_modal } from './modal-diff.js';
import {update_estimated_prompt_tokens} from './status_bar.js';
import { openFileInTab, setTabContent, getPromptTabId, updateTabGitStatus } from './editor.js';
// Imported update_project_settings to refresh frontend state after changing settings.yaml
import { get_all_settings, update_project_settings } from './settings.js';
import { show_confirm } from './modal-confirm.js';
import { show_prompt } from './modal-prompt.js';
import { show_alert } from './modal-alert.js';

// A cache for the content of all selected files to avoid re-fetching on prompt changes.
let cached_file_content_string = '';
// A handle for the file tree update polling interval.
let file_tree_update_interval = null;
// State for the file tree context menu.
let contextMenuTargetPath = null;

/**
 * Gets a specific filetype class for styling based on the filename's extension.
 * @param {string} filename - The name of the file.
 * @returns {string} The CSS class for the filetype, or an empty string if no specific icon is found.
 */
function get_filetype_class (filename) {
	const extension = filename.split('.').pop().toLowerCase();
	const extension_map = {
		js: 'filetype-js',
		mjs: 'filetype-js',
		ts: 'filetype-ts',
		tsx: 'filetype-tsx',
		css: 'filetype-css',
		scss: 'filetype-scss',
		html: 'filetype-html',
		json: 'filetype-json',
		md: 'filetype-md',
		py: 'filetype-py',
		php: 'filetype-php',
		sql: 'filetype-sql',
		yml: 'filetype-yml',
		yaml: 'filetype-yml',
		sh: 'filetype-sh',
		java: 'filetype-java',
		cs: 'filetype-cs',
		svg: 'filetype-svg',
		txt: 'filetype-txt'
	};
	return extension_map[extension] || ''; // Return mapped class or empty string
}

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
 * Fetches and displays the contents of a folder in the file tree.
 * @param {string} path - The path of the folder to load.
 * @param {HTMLElement|null} element - The folder element that was clicked. For root load, this is null.
 * @returns {Promise<void>}
 */
export function load_folders (path, element) {
	return new Promise(async (resolve, reject) => {
		const current_project = get_current_project();
		if (!current_project) return reject(new Error('No project selected'));
		
		// Get settings to check for excluded folders.
		const project_settings = get_all_settings();
		const excluded_folders_list = project_settings.excluded_folders || [];
		
		try {
			const response = await post_data({
				action: 'get_folders',
				path: path,
				project_path: current_project.path
			});
			const file_tree = document.getElementById('file-tree');
			
			// MODIFIED: Handle initial root load by creating a root folder element.
			if (element) {
				// This is a subfolder expansion/refresh. Remove its old content.
				const next_ul = element.closest('li').nextElementSibling;
				if (next_ul && next_ul.tagName === 'UL') {
					next_ul.remove();
				}
			} else if (path === '.') {
				// This is the root load. Clear the entire tree.
				file_tree.innerHTML = '';
			}
			
			// MODIFIED: If this is the root load, create the main project folder structure first.
			// The content will be appended to it.
			if (!element && path === '.') {
				const project_name = current_project.path.split(/[\\/]/).pop();
				const root_html = `
					<ul>
						<li>
							<span class="folder open" data-path="." data-excluded="false">
								<span class="folder-name" title="${current_project.path}">${project_name}</span>
								<span class="folder-controls inline-block align-middle ml-2">
									<i class="bi bi-check2-square folder-toggle-select-icon text-base-content/40 hover:text-base-content/80 cursor-pointer" title="Toggle selection in this folder"></i>
								</span>
							</span>
						</li>
					</ul>`;
				file_tree.innerHTML = root_html;
				// Now, find this newly created element to append content to it.
				element = file_tree.querySelector('.folder[data-path="."]');
			}
			
			if (!response || (!response.folders.length && !response.files.length)) {
				return resolve(); // Nothing to display in this folder.
			}
			
			const ul = document.createElement('ul');
			ul.style.display = 'none';
			// MODIFIED: The list of files/folders is always a sub-list, so it's always indented.
			ul.className = 'pl-4';
			let content = '';
			
			// Helper to check if a path is in an excluded folder.
			const is_path_excluded = (p) => excluded_folders_list.some(ex => p === ex || p.startsWith(ex + '/'));
			
			response.folders.forEach(folder => {
				const full_path = (path === '.') ? folder : `${path}/${folder}`;
				const is_excluded = is_path_excluded(full_path);
				content += `
                    <li>
                        <span class="folder ${is_excluded ? 'italic text-base-content/50' : ''}" data-path="${full_path}" data-excluded="${is_excluded}">
                            <span class="folder-name" title="${full_path}">${folder}</span>
                            <span class="folder-controls inline-block align-middle ml-2">
                                <i class="bi bi-check2-square folder-toggle-select-icon text-base-content/40 hover:text-base-content/80 cursor-pointer" title="Toggle selection in this folder"></i>
                            </span>
                        </span>
                    </li>`;
			});
			response.files.forEach(file_info => {
				const is_excluded = is_path_excluded(file_info.path);
				const filetype_class = get_filetype_class(file_info.name);
				const analysis_icon = file_info.has_analysis ? `<i class="bi bi-info-circle analysis-icon text-info hover:text-info-focus cursor-pointer align-middle mr-1" data-path="${file_info.path}" title="View Analysis"></i>` : '';
				
				const reanalysis_icon = file_info.needs_reanalysis ? `<i class="bi bi-exclamation-triangle-fill reanalysis-alert-icon align-middle" title="File has been modified since last analysis"></i>` : '';
				
				const diff_icon = file_info.has_git_diff ? `<i class="bi bi-git diff-icon text-info hover:text-info-focus cursor-pointer align-middle ml-1" data-path="${file_info.path}" title="View Changes (Diff)"></i>` : '';
				
				let title_attr = file_info.path;
				if (typeof file_info.size === 'number') {
					const size_kb = (file_info.size / 1024).toFixed(1);
					title_attr = `${file_info.path} (${size_kb} KB)`;
				}
				
				content += `
                    <li>
                        <div class="checkbox-wrapper">
                            <input type="checkbox" data-path="${file_info.path}" class="checkbox checkbox-xs checkbox-primary align-middle" data-has_analysis="${file_info.has_analysis ? 'true' : 'false'}" ${is_excluded ? 'disabled' : ''}>
                        </div>
                        ${analysis_icon}
                        <div class="file-entry ${is_excluded ? 'italic text-base-content/50' : ''} align-middle" data-path="${file_info.path}">
                            <span class="file ${filetype_class}"></span>
                            <span class="file-name" title="${title_attr}">${file_info.name}</span>
                        </div>
                        ${reanalysis_icon}
                        ${diff_icon}
                    </li>`;
			});
			ul.innerHTML = content;
			
			// MODIFIED: Append content to an existing folder element (which now includes the root).
			if (element) {
				element.closest('li').after(ul);
				ul.style.display = 'block';
			} else {
				// This case should not be hit anymore.
				console.error('load_folders: Could not find an element to append content to.');
				return reject(new Error('Could not find an element to append content to.'));
			}
			
			resolve();
		} catch (error) {
			console.error(`Error loading folders for path ${path}:`, error);
			if (element) element.classList.remove('open');
			reject(error);
		}
	});
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
		console.log(file_info);
		
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
	console.log('end');
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
	
	const poll_interval = 5000; // Poll every 5 seconds for better responsiveness
	
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

async function handle_diff_icon_click(filePath) {
	show_loading(`Opening diff for ${filePath}...`);
	try {
		await show_diff_modal(filePath);
	} catch (error) {
		console.error(`Error opening diff modal for file ${filePath}:`, error);
	} finally {
		hide_loading();
	}
}


async function handle_file_click(filePath) {
	show_loading(`Opening ${filePath}...`);
	try {
		const current_project = get_current_project();
		if (!current_project) {
			throw new Error('No project is currently selected.');
		}
		const data = await post_data({
			action: 'get_file_for_editor',
			project_path: current_project.path,
			path: filePath
		});
		
		const currentContent = data.currentContent ?? `/* File not found or is empty: ${filePath} */`;
		const isGitModified = data.originalContent !== null;
		
		// Pass the file's modification time to the tab for external change detection.
		openFileInTab(filePath, currentContent, null, isGitModified, data.mtimeMs);
		
	} catch (error) {
		console.error(`Error opening file ${filePath}:`, error);
	} finally {
		hide_loading();
	}
}

/**
 * Refreshes the contents of a specific folder in the file tree UI.
 * This is used after file operations like create, delete, or rename to update the view immediately,
 * without waiting for the polling mechanism.
 * @param {string} folderPath - The path of the folder to refresh. Use '.' for the root.
 */
async function refresh_folder_view (folderPath) {
	const pathToRefresh = folderPath || '.'; // Default to root if path is null/undefined
	
	// Find the DOM element for the folder.
	const folderElement = (pathToRefresh === '.')
		? null // For the root, there is no specific folder element, so we pass null to load_folders.
		: document.querySelector(`#file-tree .folder[data-path="${pathToRefresh}"]`);
	
	// If we are refreshing a subfolder, we only need to do so if it's currently open.
	// If it's closed, the new content will be loaded automatically when it's next opened.
	// If we are refreshing the root, we always proceed. Note that this will collapse any open subfolders.
	if (pathToRefresh === '.' || (folderElement && folderElement.classList.contains('open'))) {
		try {
			// `load_folders` will handle removing the old list of files/folders and loading the new one.
			await load_folders(pathToRefresh, folderElement);
		} catch (error) {
			console.error(`Failed to refresh folder view for "${pathToRefresh}":`, error);
			show_alert(`Could not refresh the file tree for "${pathToRefresh}".`, 'Error');
		}
	}
}

// Added documentation for new HTML elements and new event listeners.
// This function sets up all the click handlers for the file tree context menu items.
function initialize_file_tree_context_menu() {
	const menu = document.getElementById('file-tree-context-menu');
	if (!menu) return;
	
	
	// --- Menu Item Event Listeners ---
	
	document.getElementById('context-menu-new-file').addEventListener('click', async () => {
		if (!contextMenuTargetPath) return;
		const filename = await show_prompt('Enter the new file name:', 'New File');
		if (filename) {
			const newFilePath = `${contextMenuTargetPath}/${filename}`;
			try {
				await post_data({
					action: 'create_file',
					project_path: get_current_project().path,
					file_path: newFilePath
				});
				
				await refresh_folder_view(contextMenuTargetPath);
			} catch (error) {
				show_alert(`Failed to create file: ${error.message}`, 'Error');
			}
		}
		contextMenuTargetPath = null;
	});
	
	document.getElementById('context-menu-new-folder').addEventListener('click', async () => {
		if (!contextMenuTargetPath) return;
		const folderName = await show_prompt('Enter the new folder name:', 'New Folder');
		if (folderName) {
			const newFolderPath = `${contextMenuTargetPath}/${folderName}`;
			try {
				await post_data({
					action: 'create_folder',
					project_path: get_current_project().path,
					folder_path: newFolderPath
				});
				
				await refresh_folder_view(contextMenuTargetPath);
			} catch (error) {
				show_alert(`Failed to create folder: ${error.message}`, 'Error');
			}
		}
		contextMenuTargetPath = null;
	});
	
	document.getElementById('context-menu-rename').addEventListener('click', async () => {
		if (!contextMenuTargetPath) return;
		const currentName = contextMenuTargetPath.split('/').pop();
		const newName = await show_prompt('Enter the new name:', 'Rename', currentName);
		if (newName && newName !== currentName) {
			// Determine parent path, defaulting to '.' for root items.
			const parentPath = get_parent_path(contextMenuTargetPath) || '.';
			const newPath = parentPath === '.' ? newName : `${parentPath}/${newName}`;
			try {
				await post_data({
					action: 'rename_path',
					project_path: get_current_project().path,
					old_path: contextMenuTargetPath,
					new_path: newPath
				});
				
				await refresh_folder_view(parentPath);
			} catch (error) {
				show_alert(`Failed to rename: ${error.message}`, 'Error');
			}
		}
		contextMenuTargetPath = null;
	});
	
	document.getElementById('context-menu-delete').addEventListener('click', async () => {
		if (!contextMenuTargetPath) return;
		const confirmed = await show_confirm(`Are you sure you want to permanently delete "${contextMenuTargetPath}"? This cannot be undone.`, 'Confirm Deletion');
		if (confirmed) {
			// Determine parent path before deletion to use for refresh.
			const parentPath = get_parent_path(contextMenuTargetPath) || '.';
			try {
				await post_data({
					action: 'delete_path',
					project_path: get_current_project().path,
					path_to_delete: contextMenuTargetPath
				});
				
				await refresh_folder_view(parentPath);
			} catch (error) {
				show_alert(`Failed to delete: ${error.message}`, 'Error');
			}
		}
		contextMenuTargetPath = null;
	});
	
	document.getElementById('context-menu-git-reset').addEventListener('click', async (e) => {
		if (!contextMenuTargetPath || e.currentTarget.parentElement.classList.contains('disabled')) return;
		const confirmed = await show_confirm(`Are you sure you want to reset all changes to "${contextMenuTargetPath}"? This will discard your local modifications.`, 'Confirm Git Reset');
		if (confirmed) {
			try {
				await post_data({
					action: 'git_reset_file',
					project_path: get_current_project().path,
					file_path: contextMenuTargetPath
				});
				
				const parentPath = get_parent_path(contextMenuTargetPath) || '.';
				await refresh_folder_view(parentPath);
			} catch (error) {
				show_alert(`Failed to reset file: ${error.message}`, 'Error');
			}
		}
		contextMenuTargetPath = null;
	});
	
	// --- NEW: Listeners for folder exclusion ---
	document.getElementById('context-menu-exclude-folder').addEventListener('click', async () => {
		if (!contextMenuTargetPath) return;
		const parentPath = get_parent_path(contextMenuTargetPath) || '.';
		try {
			const result = await post_data({
				action: 'add_to_excluded_folders',
				project_path: get_current_project().path,
				folder_path: contextMenuTargetPath
			});
			if (result.success && result.new_settings_yaml) {
				await update_project_settings(result.new_settings_yaml);
				await refresh_folder_view(parentPath);
			} else {
				throw new Error(result.error || 'Backend did not return new settings.');
			}
		} catch (error) {
			show_alert(`Failed to exclude folder: ${error.message}`, 'Error');
		}
		contextMenuTargetPath = null;
	});
	
	document.getElementById('context-menu-include-folder').addEventListener('click', async () => {
		if (!contextMenuTargetPath) return;
		const parentPath = get_parent_path(contextMenuTargetPath) || '.';
		try {
			const result = await post_data({
				action: 'remove_from_excluded_folders',
				project_path: get_current_project().path,
				folder_path: contextMenuTargetPath
			});
			if (result.success && result.new_settings_yaml) {
				await update_project_settings(result.new_settings_yaml);
				await refresh_folder_view(parentPath);
			} else {
				throw new Error(result.error || 'Backend did not return new settings.');
			}
		} catch (error) {
			show_alert(`Failed to include folder: ${error.message}`, 'Error');
		}
		contextMenuTargetPath = null;
	});
}


/**
 * Sets up delegated event listeners for the file tree container and its controls.
 */
export function setup_file_tree_listeners () {
	const file_tree = document.getElementById('file-tree');
	initialize_file_tree_context_menu();
	
	file_tree.addEventListener('click', async (e) => {
		const folder = e.target.closest('.folder');
		const toggle_select_icon = e.target.closest('.folder-toggle-select-icon');
		const analysis_icon = e.target.closest('.analysis-icon');
		const file_entry = e.target.closest('.file-entry');
		const diff_icon = e.target.closest('.diff-icon');
		
		if (analysis_icon) {
			handle_analysis_icon_click(analysis_icon);
			return;
		}
		
		if (diff_icon) {
			await handle_diff_icon_click(diff_icon.dataset.path);
			return;
		}
		
		if (file_entry) {
			await handle_file_click(file_entry.dataset.path);
			return;
		}
		
		if (toggle_select_icon) {
			const folder_path = toggle_select_icon.closest('.folder').dataset.path;
			if (!folder_path) return;
			
			const selector = `input[type="checkbox"][data-path^="${folder_path}/"]`;
			const checkboxes = document.querySelectorAll(selector);
			
			if (checkboxes.length === 0) return;
			
			const all_currently_checked = Array.from(checkboxes).every(cb => cb.checked);
			const new_checked_state = !all_currently_checked;
			let changed_count = 0;
			
			checkboxes.forEach(cb => {
				if (cb.checked !== new_checked_state) {
					cb.checked = new_checked_state;
					changed_count++;
				}
			});
			
			if (changed_count > 0) {
				update_selected_content();
				save_current_project_state();
			}
			return;
		}
		
		if (folder) {
			const li = folder.closest('li');
			const ul = li.nextElementSibling;
			
			if (folder.classList.contains('open')) {
				folder.classList.remove('open');
				if (ul && ul.tagName === 'UL') ul.style.display = 'none';
				save_current_project_state();
			} else {
				if (ul && ul.tagName === 'UL') {
					folder.classList.add('open');
					ul.style.display = 'block';
					save_current_project_state();
				} else {
					show_loading('Loading folder...');
					folder.classList.add('open');
					try {
						await load_folders(folder.dataset.path, folder);
						save_current_project_state();
					} catch (err) {
						folder.classList.remove('open');
					} finally {
						hide_loading();
					}
				}
			}
		}
	});
	
	// MODIFIED: Context menu logic now handles clicks on empty space vs. items.
	file_tree.addEventListener('contextmenu', (e) => {
		const target = e.target.closest('.folder, .file-entry');
		
		e.preventDefault();
		e.stopPropagation();
		
		// Hide both menus to start fresh
		document.getElementById('file-tree-context-menu').classList.add('hidden');
		
		if (target) {
			// User right-clicked on a file or folder
			contextMenuTargetPath = target.dataset.path;
			
			const menu = document.getElementById('file-tree-context-menu');
			const isFolder = target.classList.contains('folder');
			const isExcluded = target.dataset.excluded === 'true';
			
			// Define all menu items for easier management
			const menuItems = {
				newFile: document.getElementById('context-menu-new-file-li'),
				newFolder: document.getElementById('context-menu-new-folder-li'),
				rename: document.getElementById('context-menu-rename-li'),
				delete: document.getElementById('context-menu-delete-li'),
				gitReset: document.getElementById('context-menu-git-reset-li'),
				excludeFolder: document.getElementById('context-menu-exclude-folder-li'),
				includeFolder: document.getElementById('context-menu-include-folder-li')
			};
			
			// Hide all by default, then show relevant ones
			Object.values(menuItems).forEach(item => item && (item.style.display = 'none'));
			
			if (isFolder) {
				if (isExcluded) {
					// If folder is excluded, only show "Include" option
					menuItems.includeFolder.style.display = 'block';
				} else {
					// If folder is not excluded, show normal folder options
					menuItems.newFile.style.display = 'block';
					menuItems.newFolder.style.display = 'block';
					menuItems.rename.style.display = 'block';
					menuItems.delete.style.display = 'block';
					menuItems.excludeFolder.style.display = 'block';
				}
			} else { // It's a file-entry
				menuItems.rename.style.display = 'block';
				menuItems.delete.style.display = 'block';
				menuItems.gitReset.style.display = 'block';
			}
			
			// Special handling for the 'Git Reset' item.
			if (!isFolder) {
				const fileLiElement = target.closest('li');
				const hasDiff = fileLiElement && fileLiElement.querySelector('.diff-icon');
				menuItems.gitReset.classList.toggle('disabled', !hasDiff);
			}
			
			menu.style.top = `${e.pageY}px`;
			menu.style.left = `${e.pageX}px`;
			menu.classList.remove('hidden');
		}
	});
	
	// MODIFIED: Global click listener now hides both context menus.
	document.addEventListener('click', () => {
		document.getElementById('file-tree-context-menu')?.classList.add('hidden');
	});
	
	// MODIFIED: Global keydown listener now hides both context menus on 'Escape'.
	document.addEventListener('keydown', (e) => {
		if (e.key === 'Escape') {
			const menu1 = document.getElementById('file-tree-context-menu');
			let menuWasVisible = false;
			
			if (menu1 && !menu1.classList.contains('hidden')) {
				menu1.classList.add('hidden');
				menuWasVisible = true;
			}
			
			if (menuWasVisible) {
				contextMenuTargetPath = null;
			}
		}
	});
	
	file_tree.addEventListener('change', (e) => {
		if (e.target.matches('input[type="checkbox"]')) {
			update_selected_content();
			save_current_project_state();
		}
	});
	
	document.getElementById('unselect-all').addEventListener('click', function () {
		document.querySelectorAll('#file-tree input[type="checkbox"]').forEach(cb => (cb.checked = false));
		update_selected_content();
		save_current_project_state();
	});
	
	document.getElementById('select-unanalyzed').addEventListener('click', function () {
		let checked_count = 0;
		document.querySelectorAll('#file-tree input[type="checkbox"]').forEach(cb => {
			// Only interact with non-disabled checkboxes (which filters out excluded files).
			if (!cb.disabled) {
				if (!cb.checked && cb.dataset.has_analysis === 'false') {
					cb.checked = true;
					checked_count++;
				} else if (cb.checked && cb.dataset.has_analysis === 'true') {
					cb.checked = false;
				}
			}
		});
		if (checked_count > 0) {
			update_selected_content();
			save_current_project_state();
		}
	});
}
