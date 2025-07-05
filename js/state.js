// SmartCodePrompts/js/state.js
import {post_data} from './utils.js';

// Application state variables
let current_project = null; // { path: string }
let content_footer_prompt = '';
let last_smart_prompt = '';

export function get_current_project() {
	return current_project;
}

export function set_current_project(project) {
	current_project = project;
}

export function get_content_footer_prompt() {
	return content_footer_prompt;
}

export function set_content_footer_prompt(prompt) {
	content_footer_prompt = prompt;
}

/**
 * Gets the last submitted smart prompt.
 * @returns {string} The last prompt.
 */
export function get_last_smart_prompt() {
	return last_smart_prompt;
}

/**
 * Sets the last submitted smart prompt and persists it for future sessions.
 * @param {string} prompt The prompt to save.
 */
export function set_last_smart_prompt(prompt) {
	last_smart_prompt = prompt;
	console.log('Saving last smart prompt:', prompt);
	post_data({
		action: 'save_last_smart_prompt',
		prompt: prompt
	}).catch(error => {
		console.error('Could not save smart prompt state:', error);
	});
}

/**
 * Saves the current project state (open folders, selected files) to the server.
 */
export function save_current_project_state() {
	if (!current_project) return;
	
	const open_folders = Array.from(document.querySelectorAll('#file-tree .folder.open'))
		.map(el => el.dataset.path);
	const selected_files = Array.from(document.querySelectorAll('#file-tree input[type="checkbox"]:checked'))
		.map(el => el.dataset.path);
	
	post_data({
		action: 'save_project_state',
		project_path: current_project.path,
		open_folders: JSON.stringify(open_folders),
		selected_files: JSON.stringify(selected_files)
	})
		.catch(error => {
			console.error('Failed to save project state:', error);
		});
}
