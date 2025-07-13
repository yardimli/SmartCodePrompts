// js/file_tree/events.js

import { show_loading, hide_loading, post_data, get_parent_path } from '../utils.js';
import { get_current_project, save_current_project_state } from '../state.js';
import { handle_analysis_icon_click } from '../modal-analysis.js';
import { show_diff_modal } from '../modal-diff.js';
import { openFileInTab } from '../editor.js';
import { update_project_settings } from '../settings.js';
import { show_confirm } from '../modal-confirm.js';
import { show_prompt } from '../modal-prompt.js';
import { show_alert } from '../modal-alert.js';
import { load_folders, refresh_folder_view } from './renderer.js';
import { update_selected_content } from './state.js';

// State for the file tree context menu.
let contextMenuTargetPath = null;

async function handle_diff_icon_click (filePath) {
	show_loading(`Opening diff for ${filePath}...`);
	try {
		await show_diff_modal(filePath);
	} catch (error) {
		console.error(`Error opening diff modal for file ${filePath}:`, error);
	} finally {
		hide_loading();
	}
}

async function handle_file_click (filePath) {
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

// This function sets up all the click handlers for the file tree context menu items.
function initialize_file_tree_context_menu () {
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
	
	file_tree.addEventListener('contextmenu', (e) => {
		const target = e.target.closest('.folder, .file-entry');
		
		e.preventDefault();
		e.stopPropagation();
		
		document.getElementById('file-tree-context-menu').classList.add('hidden');
		
		if (target) {
			contextMenuTargetPath = target.dataset.path;
			
			const menu = document.getElementById('file-tree-context-menu');
			const isFolder = target.classList.contains('folder');
			const isExcluded = target.dataset.excluded === 'true';
			
			const menuItems = {
				newFile: document.getElementById('context-menu-new-file-li'),
				newFolder: document.getElementById('context-menu-new-folder-li'),
				rename: document.getElementById('context-menu-rename-li'),
				delete: document.getElementById('context-menu-delete-li'),
				gitReset: document.getElementById('context-menu-git-reset-li'),
				excludeFolder: document.getElementById('context-menu-exclude-folder-li'),
				includeFolder: document.getElementById('context-menu-include-folder-li')
			};
			
			Object.values(menuItems).forEach(item => item && (item.style.display = 'none'));
			
			if (isFolder) {
				if (isExcluded) {
					menuItems.includeFolder.style.display = 'block';
				} else {
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
	
	document.addEventListener('click', () => {
		document.getElementById('file-tree-context-menu')?.classList.add('hidden');
	});
	
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
