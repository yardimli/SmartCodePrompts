// SmartCodePrompts/node-projects.js
const {db} = require('./node-config');

/**
 * Adds a new project to the database.
 * @param {object} params - The parameters.
 * @param {string} params.path - The full, absolute path of the project to add.
 * @returns {object} A success object.
 */
function add_project ({path}) {
	db.prepare('INSERT OR IGNORE INTO projects (path) VALUES (?)').run(path);
	return {success: true};
}

/**
 * Retrieves the saved state (open folders, selected files) for a specific project.
 * @param {object} params - The parameters for fetching state.
 * @param {string} params.project_path - The full path of the project.
 * @returns {object} The saved state of the project.
 */
function get_project_state ({project_path}) {
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
 *param {string} params.project_path - The full path of the project.
 * @param {string} params.open_folders - A JSON string of open folder paths.
 * @param {string} params.selected_files - A JSON string of selected file paths.
 */
function save_project_state ({project_path, open_folders, selected_files}) {
	db.prepare('INSERT OR REPLACE INTO project_states (project_path, open_folders, selected_files) VALUES (?, ?, ?)')
		.run(project_path, open_folders, selected_files);
	
	// Also update the last selected project for convenience
	db.prepare('UPDATE app_settings SET value = ? WHERE key = ?').run(project_path, 'last_selected_project');
	
	return {success: true};
}

// DELETED: The browse_directory function is no longer needed as the native dialog is used.

module.exports = {
	add_project,
	get_project_state,
	save_project_state,
};
