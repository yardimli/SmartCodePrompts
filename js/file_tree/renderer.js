// js/file_tree/renderer.js

import { post_data } from '../utils.js';
import { get_current_project } from '../state.js';
import { get_all_settings } from '../settings.js';
import { show_alert } from '../modal-alert.js';

/**
 * Gets a specific filetype class for styling based on the filename's extension.
 * @param {string} filename - The name of the file.
 * @returns {string} The CSS class for the filetype, or an empty string if no specific icon is found.
 */
export function get_filetype_class (filename) {
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
			
			if (element) {
				element.closest('li').after(ul);
				ul.style.display = 'block';
			} else {
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
 * Refreshes the contents of a specific folder in the file tree UI.
 * This is used after file operations like create, delete, or rename to update the view immediately,
 * without waiting for the polling mechanism.
 * @param {string} folderPath - The path of the folder to refresh. Use '.' for the root.
 */
export async function refresh_folder_view (folderPath) {
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
