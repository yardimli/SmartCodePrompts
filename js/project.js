// llm-php-helper/js/project.js
import {showLoading, hideLoading, parseProjectIdentifier, postData} from './utils.js';
import {setCurrentProject} from './state.js';
import {loadFolders, restoreState} from './fileTree.js';

/**
 * Loads a project, including its file tree and saved state.
 * @param {string} identifier - The unique project identifier.
 */
export async function loadProject(identifier) {
	const project = parseProjectIdentifier(identifier);
	const fileTree = document.getElementById('file-tree');
	if (!project) {
		fileTree.innerHTML = '<p class="p-3 text-base-content/70">Please select a project.</p>';
		return;
	}
	showLoading(`Loading project "${project.path}"...`);
	setCurrentProject(project);
	document.getElementById('projects-dropdown').value = identifier;
	try {
		const savedState = await postData({
			action: 'get_project_state',
			rootIndex: project.rootIndex,
			projectPath: project.path
		});
		await loadFolders(project.path, null);
		await restoreState(savedState || {openFolders: [], selectedFiles: []});
	} catch (error) {
		console.error(`Error loading project ${project.path}:`, error);
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
		loadProject(this.value);
	});
}
