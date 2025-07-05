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
function add_project({path}) {
	db.prepare('INSERT OR IGNORE INTO projects (path) VALUES (?)').run(path);
	return {success: true};
}

/**
 * Retrieves the saved state (open folders, selected files) for a specific project.
 * @param {object} params - The parameters for fetching state.
 * @param {string} params.project_path - The full path of the project.
 * @returns {object} The saved state of the project.
 */
function get_project_state({project_path}) {
	const state = db.prepare('SELECT open_folders, selected_files FROM project_states WHERE project_path = ?')
		.get(project_path);
	return {
		open_folders: state ? JSON.parse(state.open_folders || '[]') : [],
		selected_files: state ? JSON.parse(state.selected_files || '[]') : []
	};
}

/**
 * Saves the current state (open folders, selected files) for a project and
 * updates the 'last selected project' setting.
 * @param {object} params - The parameters for saving state.
 * @param {string} params.project_path - The full path of the project.
 * @param {string} params.open_folders - A JSON string of open folder paths.
 * @param {string} params.selected_files - A JSON string of selected file paths.
 */
function save_project_state({project_path, open_folders, selected_files}) {
	db.prepare('INSERT OR REPLACE INTO project_states (project_path, open_folders, selected_files) VALUES (?, ?, ?)')
		.run(project_path, open_folders, selected_files);
	
	// Also update the last selected project for convenience
	db.prepare('UPDATE app_settings SET value = ? WHERE key = ?').run(project_path, 'last_selected_project');
	
	return {success: true};
}

/**
 * Provides a list of directories for the project browser modal.
 * If no path is provided, it defaults to the application's root directory.
 * @returns {object} An object with current path, parent path, and a list of subdirectories.
 */
function browse_directory(dir_path) {
	// MODIFIED: If no path is provided, default to the application's own directory.
	// This is more reliable and intuitive than starting from system drives or home.
	if (!dir_path || dir_path.trim() === '' || dir_path === 'null') {
		// Recursively call with __dirname, which is the absolute path of the current module's directory.
		return browse_directory(__dirname);
	}
	
	// Security check: ensure path is absolute.
	if (!path.isAbsolute(dir_path)) {
		throw new Error("Browsing is only allowed with absolute paths.");
	}
	
	try {
		const items = fs.readdirSync(dir_path, {withFileTypes: true});
		const directories = items
			.filter(item => item.isDirectory())
			.map(item => item.name);
		
		const parent = path.dirname(dir_path);
		// Don't let user go "above" the root on Windows drives (e.g., C:\ -> C:)
		const is_root = parent === dir_path;
		
		return {
			current: dir_path,
			parent: is_root ? null : parent,
			directories: directories.sort((a, b) => a.localeCompare(b, undefined, {sensitivity: 'base'}))
		};
	} catch (error) {
		console.error(`Error browsing directory ${dir_path}:`, error);
		throw new Error(`Could not access directory: ${dir_path}`);
	}
}

module.exports = {
	add_project,
	get_project_state,
	save_project_state,
	browse_directory
};
