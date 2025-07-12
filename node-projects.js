// SmartCodePrompts/node-projects.js
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const {db} = require('./node-config');
const { get_default_settings_yaml } = require('./node-config');

/**
 * Adds a new project to the database. If the project already exists, it returns a failure message.
 * @param {object} params - The parameters.
 * @param {string} params.path - The full, absolute path of the project to add.
 * @returns {object} On success, returns `{ success: true, project: { path: string } }`. On failure (e.g., project exists), returns `{ success: false, message: string }`.
 */
function add_project ({path}) {
	// First, check if the project already exists.
	const existing_project = db.prepare('SELECT path FROM projects WHERE path = ?').get(path);
	if (existing_project) {
		return { success: false, message: 'Project already exists.', project: { path: existing_project.path } };
	}
	
	// If it doesn't exist, insert it.
	db.prepare('INSERT INTO projects (path) VALUES (?)').run(path);
	// Ensure settings file exists when adding a project
	ensure_settings_file_exists(path);
	
	// Return success along with the project object.
	return {success: true, project: { path: path }};
}

/**
 * Ensures the .scp/settings.yaml file exists for a project, creating it with defaults if not.
 * @param {string} project_path - The full path of the project.
 * @returns {string} The content of the settings file.
 */
function ensure_settings_file_exists(project_path) {
	const scp_dir = path.join(project_path, '.scp');
	const settings_file_path = path.join(scp_dir, 'settings.yaml');
	
	if (!fs.existsSync(settings_file_path)) {
		if (!fs.existsSync(scp_dir)) {
			fs.mkdirSync(scp_dir);
		}
		const default_yaml = get_default_settings_yaml();
		fs.writeFileSync(settings_file_path, default_yaml, 'utf8');
		return default_yaml;
	}
	return fs.readFileSync(settings_file_path, 'utf8');
}

/**
 * Reads, parses, and returns the settings for a specific project.
 * Merges project-specific settings over default settings to ensure a complete object.
 * @param {string} project_path - The full path of the project.
 * @returns {object} The complete settings object.
 */
function get_project_settings(project_path) {
	const default_settings = get_default_settings_yaml();
	const settings_file_path = path.join(project_path, '.scp', 'settings.yaml');
	
	if (!fs.existsSync(settings_file_path)) {
		// This is a safe fallback, though the file should always exist for a loaded project.
		return default_settings;
	}
	
	try {
		const yaml_content = fs.readFileSync(settings_file_path, 'utf8');
		const project_specific_settings = yaml.load(yaml_content);
		
		if (typeof project_specific_settings !== 'object' || project_specific_settings === null) {
			console.warn(`[${project_path}] settings.yaml is not a valid object. Using default settings.`);
			return default_settings;
		}
		
		// Merge project settings over defaults. A simple deep merge for the 'prompts' object.
		const merged_settings = { ...default_settings, ...project_specific_settings };
		if (default_settings.prompts && project_specific_settings.prompts) {
			merged_settings.prompts = { ...default_settings.prompts, ...project_specific_settings.prompts };
		}
		
		return merged_settings;
		
	} catch (error) {
		console.error(`[${project_path}] Error reading or parsing settings.yaml. Using default settings. Error: ${error.message}`);
		return default_settings;
	}
}

/**
 * Retrieves the saved state (open folders, selected files, open tabs, and settings) for a specific project.
 * @param {object} params - The parameters for fetching state.
 * @param {string} params.project_path - The full path of the project.
 * @returns {object} The saved state of the project.
 */
function get_project_state ({project_path}) {
	const state = db.prepare('SELECT open_folders, selected_files FROM project_states WHERE project_path = ?')
		.get(project_path);
	
	const open_tabs_rows = db.prepare('SELECT file_path FROM project_open_tabs WHERE project_path = ?').all(project_path);
	const open_tabs = open_tabs_rows.map(row => row.file_path);
	
	// Load settings from the project's .scp/settings.yaml file
	const settings_yaml = ensure_settings_file_exists(project_path);
	
	return {
		open_folders: state ? JSON.parse(state.open_folders || '[]') : [],
		selected_files: state ? JSON.parse(state.selected_files || '[]') : [],
		open_tabs: open_tabs,
		settings_yaml: settings_yaml
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

/**
 * Saves the list of open file tabs for a project.
 * @param {object} params - The parameters for saving tabs.
 * @param {string} params.project_path - The full path of the project.
 * @param {string} params.open_tabs_json - A JSON string array of file paths.
 */
function save_open_tabs({ project_path, open_tabs_json }) {
	const open_tabs = JSON.parse(open_tabs_json); // Expecting an array of file paths
	const delete_stmt = db.prepare('DELETE FROM project_open_tabs WHERE project_path = ?');
	const insert_stmt = db.prepare('INSERT OR IGNORE INTO project_open_tabs (project_path, file_path) VALUES (?, ?)');
	
	const transaction = db.transaction(() => {
		delete_stmt.run(project_path);
		for (const file_path of open_tabs) {
			if (file_path) { // Ensure we don't save null/undefined paths
				insert_stmt.run(project_path, file_path);
			}
		}
	});
	transaction();
	return { success: true };
}

/**
 * Validates and saves the project settings YAML file.
 * @param {object} params - The parameters.
 * @param {string} params.project_path - The full path of the project.
 * @param {string} params.content - The YAML content to validate and save.
 * @returns {object} A success or error object.
 */
function validate_and_save_settings({ project_path, content }) {
	try {
		const parsed_content = yaml.load(content);
		if (typeof parsed_content !== 'object' || parsed_content === null) {
			throw new Error('Root of YAML must be an object.');
		}
		
		// Basic validation: check for the presence of a few key properties
		const required_keys = ['allowed_extensions', 'excluded_folders', 'prompts'];
		for (const key of required_keys) {
			if (!(key in parsed_content)) {
				throw new Error(`Missing required top-level key: '${key}'`);
			}
		}
		if (typeof parsed_content.prompts !== 'object' || parsed_content.prompts === null) {
			throw new Error("'prompts' key must be an object.");
		}
		
		// If validation passes, save the file
		const settings_file_path = path.join(project_path, '.scp', 'settings.yaml');
		fs.writeFileSync(settings_file_path, content, 'utf8');
		
		return { success: true };
		
	} catch (error) {
		console.error('Settings validation failed:', error.message);
		return { success: false, error: `Settings validation failed: ${error.message}` };
	}
}


module.exports = {
	add_project,
	get_project_state,
	save_project_state,
	save_open_tabs,
	validate_and_save_settings,
	get_project_settings,
};
