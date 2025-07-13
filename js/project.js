// SmartCodePrompts/js/project.js
import { show_loading, hide_loading, post_data } from './utils.js';
import { get_current_project, set_current_project } from './state.js';
import { load_folders, restore_state, start_file_tree_polling, stop_file_tree_polling } from './file_tree.js';
import { show_alert } from './modal-alert.js';
import { openFileInTab, closeAllTabs, switchToTab, getTabs } from './editor.js';
import { update_project_settings } from './settings.js';

/**
 * Opens a native dialog to select a project folder and adds it to the application.
 */
export async function open_project_modal() {
	try {
		const selected_path = await window.electronAPI.openDirectoryDialog();
		
		if (selected_path) {
			show_loading('Adding project...');
			try {
				const result = await post_data({ action: 'add_project', path: selected_path });
				
				if (result.success && result.project) {
					const dropdown = document.getElementById('projects-dropdown');
					const newOption = document.createElement('option');
					
					newOption.value = result.project.path;
					newOption.textContent = result.project.path.split(/[\\/]/).pop();
					
					const addNewProjectOption = dropdown.querySelector('option[value="add_new_project"]');
					if (addNewProjectOption) {
						dropdown.insertBefore(newOption, addNewProjectOption);
					} else {
						dropdown.appendChild(newOption);
					}
					
					dropdown.value = result.project.path;
					
					await load_project(result.project.path);
				} else {
					console.error('Failed to add project:', result);
					show_alert(result.message || 'Failed to add project.', 'Error');
					if (result.project) {
						await load_project(result.project.path);
					}
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
export async function load_project(project_path) {
	const previous_project = get_current_project();
	
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
		
		let project_settings = null;
		if (saved_state.settings_yaml) {
			project_settings = update_project_settings(saved_state.settings_yaml);
		}
		
		await load_folders('.', null);
		await restore_state(saved_state || { open_folders: [], selected_files: [] });
		
		if (saved_state && saved_state.open_tabs && saved_state.open_tabs.length > 0) {
			console.log('Restoring open tabs:', saved_state.open_tabs);
			show_loading(`Restoring ${saved_state.open_tabs.length} open file(s)...`);
			
			const open_tab_promises = saved_state.open_tabs.map(async (tabInfo) => {
				try {
					const data = await post_data({
						action: 'get_file_for_editor',
						project_path: project_path,
						path: tabInfo.filePath
					});
					if (data.currentContent !== null) {
						openFileInTab(tabInfo.filePath, data.currentContent, data.originalContent, undefined, undefined, tabInfo.viewState);
					} else {
						console.warn(`Could not restore tab for non-existent file: ${tabInfo.filePath}`);
					}
				} catch (error) {
					console.error(`Error restoring tab for ${tabInfo.filePath}:`, error);
				}
			});
			await Promise.all(open_tab_promises);
		}
		
		// MODIFIED: After all tabs are loaded, find the one matching the stable identifier and activate it.
		if (saved_state && saved_state.active_tab_identifier) {
			const identifier = saved_state.active_tab_identifier;
			let tabToActivate = null;

			if (identifier === '__PROMPT_TAB__') {
				// Find the special prompt tab by its unique properties.
				tabToActivate = getTabs().find(t => t.title === 'Prompt' && !t.isCloseable);
			} else {
				// Find a file-based tab by its filePath.
				tabToActivate = getTabs().find(t => t.filePath === identifier);
			}

			if (tabToActivate) {
				// We found it! Now use its *new* dynamic ID to switch.
				// A brief timeout helps ensure the DOM is fully rendered before switching.
				setTimeout(() => switchToTab(tabToActivate.id), 100);
			}
		}
		
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