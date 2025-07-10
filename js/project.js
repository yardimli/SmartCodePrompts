// SmartCodePrompts/js/project.js
import { show_loading, hide_loading, post_data } from './utils.js';
// MODIFIED: Imported get_current_project to check when switching projects.
import { get_current_project, set_current_project } from './state.js';
import { load_folders, restore_state, start_file_tree_polling, stop_file_tree_polling } from './file_tree.js';
import { show_alert } from './modal-alert.js';
// MODIFIED: Imported closeAllTabs to clear the editor when switching projects.
import { openFileInTab, closeAllTabs } from './editor.js';
import { update_project_settings } from './settings.js';

/**
 * Opens a native dialog to select a project folder and adds it to the application.
 * This function was moved from the old modals.js.
 */
// MODIFIED: Updated to dynamically add and select the new project without a page reload.
export async function open_project_modal() {
	try {
		const selected_path = await window.electronAPI.openDirectoryDialog();
		
		if (selected_path) {
			show_loading('Adding project...');
			try {
				// The backend returns the project object on success.
				const result = await post_data({ action: 'add_project', path: selected_path });
				
				if (result.success && result.project) {
					const dropdown = document.getElementById('projects-dropdown');
					const newOption = document.createElement('option');
					
					// The backend returns the full path for the project.
					newOption.value = result.project.path;
					newOption.textContent = result.project.path.split(/[\\/]/).pop(); // Get name from path.
					
					// Insert the new project before the "Add new..." option.
					const addNewProjectOption = dropdown.querySelector('option[value="add_new_project"]');
					if (addNewProjectOption) {
						dropdown.insertBefore(newOption, addNewProjectOption);
					} else {
						dropdown.appendChild(newOption);
					}
					
					// Select the new project in the dropdown.
					dropdown.value = result.project.path;
					
					// Load the newly added project.
					await load_project(result.project.path);
				} else {
					// Show an error if the backend failed to add the project.
					show_alert(result.message || 'Failed to add project.', 'Error');
				}
			} catch (error) {
				console.error('Failed to add project:', error);
				show_alert(`Failed to add project: ${error.message}`, 'Error');
			} finally {
				hide_loading();
			}
		}
	} catch (error) {
		console.error('Error opening directory dialog:', error);
		show_alert(`Could not open directory selector: ${error.message}`, 'Error');
	}
}

/**
 * Loads a project, including its file tree and saved state.
 * @param {string} project_path - The full, absolute path of the project.
 */
// MODIFIED: Added logic to close all tabs when switching between projects.
export async function load_project(project_path) {
	const previous_project = get_current_project();
	
	// If switching from an existing, different project, close all open tabs first.
	if (previous_project && previous_project.path !== project_path) {
		await closeAllTabs();
	}
	
	stop_file_tree_polling();
	
	const file_tree = document.getElementById('file-tree');
	if (!project_path) {
		file_tree.innerHTML = '<p class="p-3 text-base-content/70">Please select a project.</p>';
		return;
	}
	show_loading(`Loading project "${project_path}"...`);
	set_current_project({ path: project_path });
	document.getElementById('projects-dropdown').value = project_path;
	try {
		const saved_state = await post_data({
			action: 'get_project_state',
			project_path: project_path
		});
		console.log('Loaded saved state:', saved_state);
		
		// --- CRITICAL CHANGE HERE ---
		// 1. Synchronously update settings from the fetched YAML.
		let project_settings = null;
		if (saved_state.settings_yaml) {
			// This is now a synchronous call. When it finishes, the settings module is updated.
			project_settings = update_project_settings(saved_state.settings_yaml);
		}
		
		
		// 3. NOW it is safe to load the file tree, which depends on the settings.
		await load_folders('.', null);
		await restore_state(saved_state || { open_folders: [], selected_files: [] });
		
		// 4. Restore open tabs. This part is independent of settings, so its order is less critical.
		if (saved_state && saved_state.open_tabs && saved_state.open_tabs.length > 0) {
			console.log('Restoring open tabs:', saved_state.open_tabs);
			show_loading(`Restoring ${saved_state.open_tabs.length} open file(s)...`);
			
			const open_tab_promises = saved_state.open_tabs.map(async (filePath) => {
				try {
					const data = await post_data({
						action: 'get_file_for_editor',
						project_path: project_path,
						path: filePath
					});
					if (data.currentContent !== null) {
						openFileInTab(filePath, data.currentContent, data.originalContent);
					} else {
						console.warn(`Could not restore tab for non-existent file: ${filePath}`);
					}
				} catch (error) {
					console.error(`Error restoring tab for ${filePath}:`, error);
				}
			});
			await Promise.all(open_tab_promises);
		}
		
		// 5. Start polling, which also depends on settings.
		start_file_tree_polling();
		
	} catch (error) {
		console.error(`Error loading project ${project_path}:`, error);
		show_alert(`Error loading project. Check console for details.`, 'Error');
	} finally {
		hide_loading();
	}
}

/**
 * Sets up the event listener for the projects dropdown and the add project button.
 */
export function setup_project_listeners() {
	document.getElementById('projects-dropdown').addEventListener('change', function() {
		if (this.value === 'add_new_project') {
			open_project_modal();
		} else {
			load_project(this.value);
		}
	});
	
	document.getElementById('add-project-button').addEventListener('click', open_project_modal);
}
