// SmartCodePrompts/js/project.js
import {show_loading, hide_loading, post_data} from './utils.js';
import {set_current_project} from './state.js';
import {load_folders, restore_state, start_file_tree_polling, stop_file_tree_polling} from './file_tree.js';
// DELETED: No longer need to import from modals.js

/**
 * NEW: Opens a native dialog to select a project folder and adds it to the application.
 * This function was moved from the old modals.js.
 */
export async function open_project_modal () {
	try {
		// Call the method exposed from the main process via the preload script.
		const selected_path = await window.electronAPI.openDirectoryDialog();
		
		if (selected_path) {
			show_loading('Adding project...');
			try {
				await post_data({action: 'add_project', path: selected_path});
				// Reload the page to refresh the project list and load the new project.
				window.location.reload();
			} catch (error) {
				console.error('Failed to add project:', error);
				alert(`Failed to add project: ${error.message}`);
			} finally {
				hide_loading();
			}
		}
	} catch (error) {
		console.error('Error opening directory dialog:', error);
		alert(`Could not open directory selector: ${error.message}`);
	}
}

/**
 * Loads a project, including its file tree and saved state.
 * @param {string} project_path - The full, absolute path of the project.
 */
export async function load_project(project_path) {
	stop_file_tree_polling();
	
	const file_tree = document.getElementById('file-tree');
	if (!project_path) {
		file_tree.innerHTML = '<p class="p-3 text-base-content/70">Please select a project.</p>';
		return;
	}
	show_loading(`Loading project "${project_path}"...`);
	set_current_project({path: project_path});
	document.getElementById('projects-dropdown').value = project_path;
	try {
		const saved_state = await post_data({
			action: 'get_project_state',
			project_path: project_path
		});
		// Load the root of the project. The path '.' is relative to the project root.
		await load_folders('.', null);
		await restore_state(saved_state || {open_folders: [], selected_files: []});
		
		start_file_tree_polling();
	} catch (error) {
		console.error(`Error loading project ${project_path}:`, error);
		alert(`Error loading project. Check console for details.`);
	} finally {
		hide_loading();
	}
}

/**
 * Sets up the event listener for the projects dropdown and the add project button.
 */
export function setup_project_listeners() {
	document.getElementById('projects-dropdown').addEventListener('change', function () {
		if (this.value === 'add_new_project') {
			open_project_modal();
		} else {
			load_project(this.value);
		}
	});
	
	// NEW: Listener for the dedicated "Add Project" button, its logic moved from the old modals.js.
	document.getElementById('add-project-button').addEventListener('click', open_project_modal);
}
