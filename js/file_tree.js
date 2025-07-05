// SmartCodePrompts/js/file_tree.js
import {show_loading, hide_loading, get_parent_path, post_data} from './utils.js';
import {get_current_project, get_content_footer_prompt, get_last_smart_prompt, save_current_project_state} from './state.js';
import {handle_analysis_icon_click, handle_search_icon_click} from './modals.js';

// A cache for the content of all selected files to avoid re-fetching on prompt changes.
let cached_file_content_string = '';
// A handle for the file tree update polling interval.
let file_tree_update_interval = null;

/**
 * NEW: Gets a specific filetype class for styling based on the filename's extension.
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
 * An internal helper to update the main textarea from the cache and current prompts.
 */
function _updateTextareaWithCachedContent () {
	const selected_content_el = document.getElementById('selected-content');
	if (!selected_content_el) return;
	
	const content_footer_prompt = get_content_footer_prompt();
	const user_prompt = get_last_smart_prompt();
	
	// Combine cached file content with the footer.
	selected_content_el.value = cached_file_content_string + content_footer_prompt;
	
	// The placeholder replacement logic.
	const search_str = '${user_prompt}';
	const last_index = selected_content_el.value.lastIndexOf(search_str);
	
	if (last_index !== -1) {
		selected_content_el.value =
			selected_content_el.value.substring(0, last_index) +
			user_prompt +
			selected_content_el.value.substring(last_index + search_str.length);
	}
}

/**
 * Fetches and displays the contents of a folder in the file tree.
 * @param {string} path - The path of the folder to load.
 * @param {HTMLElement|null} element - The folder element that was clicked.
 * @returns {Promise<void>}
 */
export function load_folders (path, element) {
	return new Promise(async (resolve, reject) => {
		const current_project = get_current_project();
		if (!current_project) return reject(new Error('No project selected'));
		try {
			const response = await post_data({
				action: 'get_folders',
				path: path,
				project_path: current_project.path
			});
			const file_tree = document.getElementById('file-tree');
			if (element) {
				const next_ul = element.closest('li').next_element_sibling; // MODIFIED: Look for sibling of <li>
				if (next_ul && next_ul.tag_name === 'UL') {
					next_ul.remove();
				}
			} else {
				file_tree.innerHTML = '';
			}
			if (!response || (!response.folders.length && !response.files.length)) {
				if (element) element.classList.remove('open');
				return resolve();
			}
			const ul = document.createElement('ul');
			ul.style.display = 'none';
			ul.className = 'pl-4'; // Tailwind class for padding-left
			let content = '';
			response.folders.sort((a, b) => a.localeCompare(b));
			response.files.sort((a, b) => a.name.localeCompare(b.name));
			response.folders.forEach(folder => {
				const full_path = `${path}/${folder}`;
				// MODIFIED: Wrapped folder name in a span for text-overflow ellipsis.
				content += `
                    <li>
                        <span class="folder" data-path="${full_path}">
                            <span class="folder-name" title="${full_path}">${folder}</span>
                            <span class="folder-controls inline-block align-middle ml-2">
                                <i class="bi bi-search folder-search-icon text-base-content/40 hover:text-base-content/80 cursor-pointer" title="Search in this folder"></i>
                                <i class="bi bi-eraser folder-clear-icon text-base-content/40 hover:text-base-content/80 cursor-pointer ml-1" title="Clear selection in this folder"></i>
                            </span>
                        </span>
                    </li>`;
			});
			response.files.forEach(file_info => {
				const filetype_class = get_filetype_class(file_info.name);
				// MODIFIED: Restructured file item HTML for proper text-overflow ellipsis.
				const analysis_icon = file_info.has_analysis ? `<i class="bi bi-info-circle analysis-icon text-info hover:text-info-focus cursor-pointer align-middle mr-1" data-path="${file_info.path}" title="View Analysis"></i>` : '';
				const modified_icon = file_info.is_modified ? `<i class="bi bi-exclamation-triangle-fill text-warning align-middle ml-1" title="File has been modified since last analysis"></i>` : '';
				// NEW: Added data-has_analysis attribute to the checkbox for easy selection.
				content += `
                    <li>
                        <div class="checkbox-wrapper">
                            <input type="checkbox" data-path="${file_info.path}" class="checkbox checkbox-xs checkbox-primary align-middle" data-has_analysis="${file_info.has_analysis ? 'true' : 'false'}">
                        </div>
                        ${analysis_icon}
                        <div class="file-entry align-middle">
                            <span class="file ${filetype_class}"></span>
                            <span class="file-name" title="${file_info.path}">${file_info.name}</span>
                        </div>
                        ${modified_icon}
                    </li>`;
			});
			ul.innerHTML = content;
			if (element) {
				// MODIFIED: Insert the new <ul> after the parent <li>, not inside it.
				// This is the key fix for the column layout issue.
				element.closest('li').after(ul);
			} else {
				file_tree.appendChild(ul);
			}
			ul.style.display = 'block';
			resolve();
		} catch (error) {
			console.error(`Error loading folders for path ${path}:`, error);
			if (element) element.classList.remove('open');
			reject(error);
		}
	});
}

/**
 * Gathers content from all selected files and displays it in the main textarea.
 * This function now caches file content and uses a helper to render the textarea.
 */
export async function update_selected_content () {
	const checked_boxes = document.querySelectorAll('#file-tree input[type="checkbox"]:checked');
	const selected_content_el = document.getElementById('selected-content');
	
	if (checked_boxes.length === 0) {
		cached_file_content_string = '';
		selected_content_el.value = '';
		return;
	}
	
	show_loading(`Loading ${checked_boxes.length} file(s)...`);
	
	const request_promises = Array.from(checked_boxes).map(box => {
		const path = box.dataset.path;
		return post_data({action: 'get_file_content', project_path: get_current_project().path, path: path})
			.then(response => `${path}:\n\n${response.content}\n\n`)
			.catch(error => `/* --- ERROR loading ${path}: ${error.message || 'Unknown error'} --- */\n\n`);
	});
	
	try {
		const results = await Promise.all(request_promises);
		cached_file_content_string = results.join(''); // Update the cache.
		_updateTextareaWithCachedContent();
	} catch (error) {
		console.error('Error updating content:', error);
		selected_content_el.value = '/* --- An unexpected error occurred while loading file contents. --- */';
		cached_file_content_string = '';
	} finally {
		hide_loading();
	}
}

/**
 * Updates only the prompt portion of the main textarea using cached file content.
 * This avoids re-fetching all file contents, making prompt updates fast.
 */
export function refresh_prompt_display () {
	_updateTextareaWithCachedContent();
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
		while (parent_path && parent_path !== '.') { // MODIFIED: Project path is now the root, represented as '.' in file tree
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
		// Build path part by part, avoiding leading './' for subsequent parts
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
 * MODIFIED: Replaced the old DOM-diffing function with a simpler one that only handles
 * modification status icons based on data for all analyzed files in the project.
 * This function is called by the polling mechanism.
 * @param {object} updates - An object with `modified`, `unmodified`, and `deleted` file path arrays.
 */
function handle_modification_status_updates (updates) {
	const file_tree = document.getElementById('file-tree');
	if (!file_tree) return;
	
	let has_changes = false;
	
	// Add 'modified' icon to files that have changed
	updates.modified.forEach(file_path => {
		const file_li = file_tree.querySelector(`input[type="checkbox"][data-path="${file_path}"]`)?.closest('li');
		if (!file_li) return;
		
		const existing_icon = file_li.querySelector('.bi-exclamation-triangle-fill');
		if (!existing_icon) {
			const file_span = file_li.querySelector('.file-entry');
			if (file_span) {
				file_span.insertAdjacentHTML ('afterend', ' <i class="bi bi-exclamation-triangle-fill text-warning align-middle ml-1" title="File has been modified since last analysis"></i>');
				has_changes = true;
			}
		}
	});
	
	// Remove 'modified' icon from files that are now back to their analyzed state
	updates.unmodified.forEach(file_path => {
		const file_li = file_tree.querySelector(`input[type="checkbox"][data-path="${file_path}"]`)?.closest('li');
		if (!file_li) return;
		
		const existing_icon = file_li.querySelector('.bi-exclamation-triangle-fill');
		if (existing_icon) {
			existing_icon.remove();
			has_changes = true;
		}
	});
	
	// Remove list items for files that have been deleted from the filesystem
	updates.deleted.forEach(file_path => {
		const file_li = file_tree.querySelector(`input[type="checkbox"][data-path="${file_path}"]`)?.closest('li');
		if (file_li) {
			// If the deleted file was selected, we need to update the content area
			const checkbox = file_li.querySelector('input[type="checkbox"]');
			const was_checked = checkbox && checkbox.checked;
			
			file_li.remove();
			has_changes = true;
			
			if (was_checked) {
				// This will re-fetch content for remaining checked files
				update_selected_content();
			}
		}
	});
	
	if (has_changes) {
		console.log('File tree icons updated due to filesystem changes.');
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
 * Starts the periodic polling for file tree updates.
 * MODIFIED: This now polls for the modification status of all analyzed files in the project,
 * rather than syncing the contents of open folders.
 */
export function start_file_tree_polling () {
	stop_file_tree_polling(); // Ensure no multiple intervals are running
	
	const poll_interval = 10000; // Poll every 10 seconds.
	
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
			
			handle_modification_status_updates(updates);
		} catch (error) {
			console.error('Error polling for file tree updates:', error);
		}
	}, poll_interval);
	console.log('File tree polling started for modification status.');
}

/**
 * Sets up delegated event listeners for the file tree container and its controls.
 * This function was created by moving logic out of main.js.
 */
export function setup_file_tree_listeners () {
	const file_tree = document.getElementById('file-tree');
	
	// Delegated event listener for clicks within the file tree
	file_tree.addEventListener('click', async (e) => {
		const folder = e.target.closest('.folder');
		const search_icon = e.target.closest('.folder-search-icon');
		const clear_icon = e.target.closest('.folder-clear-icon');
		const analysis_icon = e.target.closest('.analysis-icon');
		
		if (analysis_icon) {
			e.stopPropagation();
			handle_analysis_icon_click(analysis_icon);
			return;
		}
		
		if (search_icon) {
			e.stopPropagation();
			handle_search_icon_click(search_icon);
			return;
		}
		
		if (clear_icon) {
			e.stopPropagation();
			const folder_path = clear_icon.closest('.folder').dataset.path;
			if (!folder_path) return;
			const selector = `input[type="checkbox"][data-path^="${folder_path}/"]`;
			let uncheck_count = 0;
			document.querySelectorAll(selector).forEach(cb => {
				if (cb.checked) {
					cb.checked = false;
					uncheck_count++;
				}
			});
			if (uncheck_count > 0) {
				update_selected_content();
				save_current_project_state();
			}
			return;
		}
		
		if (folder) {
			e.stopPropagation();
			// MODIFIED: Find the <ul> that is the next sibling of the folder's parent <li>.
			const li = folder.closest('li');
			const ul = li.next_element_sibling;
			
			if (folder.classList.contains('open')) {
				folder.classList.remove('open');
				// MODIFIED: Check if the sibling is a UL before trying to hide it.
				if (ul && ul.tag_name === 'UL') ul.style.display = 'none';
				save_current_project_state();
			} else {
				// MODIFIED: Check if the sibling is a UL before trying to show it.
				if (ul && ul.tag_name === 'UL') {
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
	
	// Delegated listener for checkbox changes
	file_tree.addEventListener('change', (e) => {
		if (e.target.matches('input[type="checkbox"]')) {
			e.stopPropagation();
			update_selected_content();
			save_current_project_state();
		}
	});
	
	// Event listener for the "Unselect All" button
	document.getElementById('unselect-all').addEventListener('click', function () {
		document.querySelectorAll('#file-tree input[type="checkbox"]').forEach(cb => (cb.checked = false));
		update_selected_content();
		save_current_project_state();
	});
	
	// NEW: Event listener for the "Select Unanalyzed" button
	document.getElementById('select-unanalyzed').addEventListener('click', function () {
		let checked_count = 0;
		document.querySelectorAll('#file-tree input[type="checkbox"]').forEach(cb => {
			console.log(`Checkbox for ${cb.dataset.path} has analysis: ${cb.dataset.has_analysis}`);
			// Check if the checkbox is not already checked and its data-has_analysis attribute is 'false'
			if (!cb.checked && cb.dataset.has_analysis === 'false') {
				cb.checked = true;
				checked_count++;
			} else
			{
				//uncheck the box if it is checked and has_analysis is true
				if (cb.checked && cb.dataset.has_analysis === 'true') {
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
