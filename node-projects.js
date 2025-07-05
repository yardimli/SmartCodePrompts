// SmartCodePrompts/node-projects.js
const fs = require('fs');
const path = require('path');
const os = require('os');
const {db} = require('./node-config');

/**
 * Adds a new project to the database.
 * @param {object} params - The parameters.
 * @param {string} params.path - The full, absolute path of the project to add.
 * @returns {object} A success object.
 */
function addProject({path}) {
	db.prepare('INSERT OR IGNORE INTO projects (path) VALUES (?)').run(path);
	return {success: true};
}

/**
 * Retrieves the saved state (open folders, selected files) for a specific project.
 * @param {object} params - The parameters for fetching state.
 * @param {string} params.projectPath - The full path of the project.
 * @returns {object} The saved state of the project.
 */
function getProjectState({projectPath}) {
	const state = db.prepare('SELECT open_folders, selected_files FROM project_states WHERE project_path = ?')
		.get(projectPath);
	return {
		openFolders: state ? JSON.parse(state.open_folders || '[]') : [],
		selectedFiles: state ? JSON.parse(state.selected_files || '[]') : []
	};
}

/**
 * Saves the current state (open folders, selected files) for a project and
 * updates the 'last selected project' setting.
 * @param {object} params - The parameters for saving state.
 * @param {string} params.projectPath - The full path of the project.
 * @param {string} params.openFolders - A JSON string of open folder paths.
 * @param {string} params.selectedFiles - A JSON string of selected file paths.
 */
function saveProjectState({projectPath, openFolders, selectedFiles}) {
	db.prepare('INSERT OR REPLACE INTO project_states (project_path, open_folders, selected_files) VALUES (?, ?, ?)')
		.run(projectPath, openFolders, selectedFiles);
	
	// Also update the last selected project for convenience
	db.prepare('UPDATE app_settings SET value = ? WHERE key = ?').run(projectPath, 'lastSelectedProject');
	
	return {success: true};
}

/**
 * Provides a list of directories for the project browser modal.
 * If no path is provided, it defaults to the application's root directory.
 * @returns {object} An object with current path, parent path, and a list of subdirectories.
 */
function browseDirectory(dirPath) {
	// MODIFIED: If no path is provided, default to the application's own directory.
	// This is more reliable and intuitive than starting from system drives or home.
	if (!dirPath || dirPath.trim() === '' || dirPath === 'null') {
		// Recursively call with __dirname, which is the absolute path of the current module's directory.
		return browseDirectory(__dirname);
	}
	
	// Security check: ensure path is absolute.
	if (!path.isAbsolute(dirPath)) {
		throw new Error("Browsing is only allowed with absolute paths.");
	}
	
	try {
		const items = fs.readdirSync(dirPath, {withFileTypes: true});
		const directories = items
			.filter(item => item.isDirectory())
			.map(item => item.name);
		
		const parent = path.dirname(dirPath);
		// Don't let user go "above" the root on Windows drives (e.g., C:\ -> C:)
		const isRoot = parent === dirPath;
		
		return {
			current: dirPath,
			parent: isRoot ? null : parent,
			directories: directories.sort((a, b) => a.localeCompare(b, undefined, {sensitivity: 'base'}))
		};
	} catch (error) {
		console.error(`Error browsing directory ${dirPath}:`, error);
		throw new Error(`Could not access directory: ${dirPath}`);
	}
}

module.exports = {
	addProject,
	getProjectState,
	saveProjectState,
	browseDirectory
};
