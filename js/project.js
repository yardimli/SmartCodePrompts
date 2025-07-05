// SmartCodePrompts/js/project.js
import {showLoading, hideLoading, postData} from './utils.js';
import {setCurrentProject} from './state.js';
import {loadFolders, restoreState, startFileTreePolling, stopFileTreePolling} from './fileTree.js';
import {openProjectModal} from './modals.js';

/**
 * Loads a project, including its file tree and saved state.
 * @param {string} projectPath - The full, absolute path of the project.
 */
export async function loadProject(projectPath) {
	stopFileTreePolling();
	
	const fileTree = document.getElementById('file-tree');
	if (!projectPath) {
		fileTree.innerHTML = '<p class="p-3 text-base-content/70">Please select a project.</p>';
		return;
	}
	showLoading(`Loading project "${projectPath}"...`);
	setCurrentProject({path: projectPath});
	document.getElementById('projects-dropdown').value = projectPath;
	try {
		const savedState = await postData({
			action: 'get_project_state',
			projectPath: projectPath
		});
		// Load the root of the project. The path '.' is relative to the project root.
		await loadFolders('.', null);
		await restoreState(savedState || {openFolders: [], selectedFiles: []});
		
		//Start polling for file system changes now that the project is loaded.
		startFileTreePolling();
	} catch (error) {
		console.error(`Error loading project ${projectPath}:`, error);
		alert(`Error loading project. Check console for details.`);
	} finally {
		hideLoading();
	}
}

/**
 * Sets up the event listener for the projects dropdown.
 */
export function setupProjectListeners() {
	document.getElementById('projects-dropdown').addEventListener('change', function () {
		if (this.value === 'add_new_project') {
			openProjectModal();
		} else {
			loadProject(this.value);
		}
	});
}
