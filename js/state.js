// llm-php-helper/js/state.js
import {postData} from './utils.js';

// Application state variables
let currentProject = null; // { rootIndex: number, path: string }
let contentFooterPrompt = '';
let lastSmartPrompt = ''; // NEW: State variable to remember the last smart prompt.

// Exported functions to manage state
export function getCurrentProject() {
	return currentProject;
}

export function setCurrentProject(project) {
	currentProject = project;
}

export function getContentFooterPrompt() {
	return contentFooterPrompt;
}

export function setContentFooterPrompt(prompt) {
	contentFooterPrompt = prompt;
}

/**
 * NEW: Gets the last submitted smart prompt.
 * @returns {string} The last prompt.
 */
export function getLastSmartPrompt() {
	return lastSmartPrompt;
}

/**
 * NEW: Sets the last submitted smart prompt.
 * @param {string} prompt The prompt to save.
 */
export function setLastSmartPrompt(prompt) {
	lastSmartPrompt = prompt;
}

/**
 * Saves the current project state (open folders, selected files) to the server.
 */
export function saveCurrentProjectState() {
	if (!currentProject) return;
	
	const openFolders = Array.from(document.querySelectorAll('#file-tree .folder.open'))
		.map(el => el.dataset.path);
	const selectedFiles = Array.from(document.querySelectorAll('#file-tree input[type="checkbox"]:checked'))
		.map(el => el.dataset.path);
	
	postData({
		action: 'save_project_state',
		rootIndex: currentProject.rootIndex,
		projectPath: currentProject.path,
		openFolders: JSON.stringify(openFolders),
		selectedFiles: JSON.stringify(selectedFiles)
	})
		.catch(error => {
			console.error('Failed to save project state:', error);
		});
}
