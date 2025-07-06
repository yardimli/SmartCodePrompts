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
 * If no path is provided, it provides an OS-specific root (drives for Windows, home dir for others).
 * @param {string|null} dir_path - The path to browse.
 * @returns {object} An object with current path, parent path, and a list of subdirectories.
 */
function browse_directory(dir_path) {
	// MODIFIED: If no path is provided, determine the best root based on the OS.
	if (!dir_path || dir_path.trim() === '' || dir_path === 'null') {
		// On Windows, list the logical drives for a better user experience.
		if (os.platform() === 'win32') {
			const { execSync } = require('child_process');
			try {
				// Use 'wmic' to get drive letters. It's reliable and doesn't require parsing complex output.
				const stdout = execSync('wmic logicaldisk get name', { encoding: 'utf8' });
				const drives = stdout.split('\r\n') // Split by lines
					.slice(1) // Remove the 'Name' header
					.map(line => line.trim()) // Trim whitespace
					.filter(line => line.length > 0) // Filter out empty lines
					.map(drive => `${drive}\\`); // Add trailing slash for a valid path
				return {
					current: null, // No "current" path when showing the list of drives
					parent: null,
					directories: drives
				};
			} catch (e) {
				console.error("Failed to get Windows drives, falling back to home dir:", e);
				// If 'wmic' fails for any reason, fall back to the user's home directory.
				return browse_directory(os.homedir());
			}
		} else {
			// On macOS/Linux, the home directory is the most sensible starting point.
			return browse_directory(os.homedir());
		}
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
		// Don't let user go "above" the root (e.g., from C:\ to C:).
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
