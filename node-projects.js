// SmartCodePrompts/node-projects.js
const fs = require('fs');
const path = require('path');
const yaml = require('yaml');
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
	const default_settings_string = get_default_settings_yaml();
	const default_settings = yaml.parse(default_settings_string);
	const settings_file_path = path.join(project_path, '.scp', 'settings.yaml');
	
	if (!fs.existsSync(settings_file_path)) {
		// This is a safe fallback, though the file should always exist for a loaded project.
		return default_settings;
	}
	
	try {
		const yaml_content = fs.readFileSync(settings_file_path, 'utf8');
		const project_specific_settings = yaml.parse(yaml_content);
		
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
 * Checks if a given file or folder path is within an excluded directory as per project settings.
 * @param {string} relative_path - The relative path of the file or folder within the project.
 * @param {object} project_settings - The parsed settings object for the project.
 * @returns {boolean} True if the path should be excluded, false otherwise.
 */
function is_path_excluded(relative_path, project_settings) {
	const excluded_folders = project_settings?.excluded_folders || [];
	// Normalize path to use forward slashes for consistent matching
	const normalized_path = relative_path.replace(/\\/g, '/');
	return excluded_folders.some(excluded =>
		normalized_path === excluded || normalized_path.startsWith(excluded + '/')
	);
}

/**
 * Retrieves the saved state (open folders, selected files, open tabs, and settings) for a specific project.
 * @param {object} params - The parameters for fetching state.
 * @param {string} params.project_path - The full path of the project.
 * @returns {object} The saved state of the project.
 */
function get_project_state ({project_path}) {
	// MODIFIED: Select the renamed column.
	const state = db.prepare('SELECT open_folders, selected_files, open_tabs, active_tab_identifier FROM project_states WHERE project_path = ?')
		.get(project_path);
	
	// Load settings from the project's .scp/settings.yaml file
	const settings_yaml = ensure_settings_file_exists(project_path);
	
	return {
		open_folders: state?.open_folders ? JSON.parse(state.open_folders) : [],
		selected_files: state?.selected_files ? JSON.parse(state.selected_files) : [],
		open_tabs: state?.open_tabs ? JSON.parse(state.open_tabs) : [],
		active_tab_identifier: state?.active_tab_identifier || null, // MODIFIED: Use the new property name.
		settings_yaml: settings_yaml
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
function save_project_state ({project_path, open_folders, selected_files}) {
	db.prepare('INSERT OR IGNORE INTO project_states (project_path) VALUES (?)').run(project_path);
	db.prepare('UPDATE project_states SET open_folders = ?, selected_files = ? WHERE project_path = ?')
		.run(open_folders, selected_files, project_path);
	
	db.prepare('UPDATE app_settings SET value = ? WHERE key = ?').run(project_path, 'last_selected_project');
	
	return {success: true};
}

/**
 * Saves the state of open tabs, including view states and the active tab identifier.
 * @param {object} params - The parameters for saving tab state.
 * @param {string} params.project_path - The full path of the project.
 * @param {string} params.open_tabs_json - A JSON string of open tab objects.
 * @param {string|null} params.active_tab_identifier - The stable identifier (filePath or special token) for the active tab.
 * @returns {{success: boolean}}
 */
function save_tabs_state({ project_path, open_tabs_json, active_tab_identifier }) {
	db.prepare('INSERT OR IGNORE INTO project_states (project_path) VALUES (?)').run(project_path);
	// MODIFIED: Update the renamed column with the stable identifier.
	db.prepare('UPDATE project_states SET open_tabs = ?, active_tab_identifier = ? WHERE project_path = ?')
		.run(open_tabs_json, active_tab_identifier, project_path);
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
		const parsed_content = yaml.parse(content);
		if (typeof parsed_content !== 'object' || parsed_content === null) {
			throw new Error('Root of YAML must be an object.');
		}
		
		const required_keys = ['allowed_extensions', 'excluded_folders', 'prompts'];
		for (const key of required_keys) {
			if (!(key in parsed_content)) {
				throw new Error(`Missing required top-level key: '${key}'`);
			}
		}
		if (typeof parsed_content.prompts !== 'object' || parsed_content.prompts === null) {
			throw new Error("'prompts' key must be an object.");
		}
		
		const settings_file_path = path.join(project_path, '.scp', 'settings.yaml');
		fs.writeFileSync(settings_file_path, content, 'utf8');
		
		const stats = fs.statSync(settings_file_path);
		return { success: true, mtimeMs: stats.mtimeMs };
		
	} catch (error) {
		console.error('Settings validation failed:', error.message);
		return { success: false, error: `Settings validation failed: ${error.message}` };
	}
}

function modify_settings_yaml(project_path, modification_callback) {
	const settings_file_path = path.join(project_path, '.scp', 'settings.yaml');
	if (!fs.existsSync(settings_file_path)) {
		throw new Error('settings.yaml not found for this project.');
	}
	
	try {
		const yaml_content = fs.readFileSync(settings_file_path, 'utf8');
		const doc = yaml.parseDocument(yaml_content);
		
		if (doc.errors && doc.errors.length > 0) {
			throw new Error(`YAML parsing error: ${doc.errors[0].message}`);
		}
		
		modification_callback(doc);
		
		const new_yaml_content = doc.toString();
		fs.writeFileSync(settings_file_path, new_yaml_content, 'utf8');
		
		return { success: true, new_settings_yaml: new_yaml_content };
	} catch (error) {
		console.error(`Error modifying settings.yaml for ${project_path}:`, error);
		throw error;
	}
}

function add_to_excluded_folders({ project_path, folder_path }) {
	return modify_settings_yaml(project_path, (doc) => {
		const key = 'excluded_folders';
		let excludedFoldersNode = doc.getIn([key]);
		
		if (!excludedFoldersNode) {
			doc.set(key, [folder_path]);
			return;
		}
		
		if (!yaml.isSeq(excludedFoldersNode)) {
			throw new Error("'excluded_folders' in settings.yaml is not an array.");
		}
		
		if (!excludedFoldersNode.has(folder_path)) {
			excludedFoldersNode.add(folder_path);
			excludedFoldersNode.items.sort((a, b) => String(a.value).localeCompare(String(b.value)));
		}
	});
}

function remove_from_excluded_folders({ project_path, folder_path }) {
	return modify_settings_yaml(project_path, (doc) => {
		const key = 'excluded_folders';
		if (doc.has(key)) {
			const excludedFoldersNode = doc.getIn([key]);
			if (yaml.isSeq(excludedFoldersNode)) {
				const index = excludedFoldersNode.items.findIndex(
					(item) => item.value === folder_path
				);
				if (index !== -1) {
					excludedFoldersNode.delete(index);
				}
			}
		}
	});
}

module.exports = {
	add_project,
	get_project_state,
	save_project_state,
	save_tabs_state,
	validate_and_save_settings,
	get_project_settings,
	is_path_excluded,
	add_to_excluded_folders,
	remove_from_excluded_folders
};