// SmartCodePrompts/js/project.js
import {show_loading, hide_loading, post_data} from './utils.js';
import {set_current_project} from './state.js';
import {load_folders, restore_state, start_file_tree_polling, stop_file_tree_polling} from './file_tree.js';
import {open_project_modal} from './modals.js';

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
		
		//Start polling for file system changes now that the project is loaded.
		start_file_tree_polling();
	} catch (error) {
		console.error(`Error loading project ${project_path}:`, error);
		alert(`Error loading project. Check console for details.`);
	} finally {
		hide_loading();
	}
}

/**
 * Sets up the event listener for the projects dropdown.
 */
export function setup_project_listeners() {
	document.getElementById('projects-dropdown').addEventListener('change', function () {
		if (this.value === 'add_new_project') {
			open_project_modal();
		} else {
			load_project(this.value);
		}
	});
}
