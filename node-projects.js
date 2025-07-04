// SmartCodePrompts/node-projects.js
const fs = require('fs');
const path = require('path');
const {db, config} = require('./node-config');

/**
 * Scans the configured root directories for top-level folders to be treated as potential projects.
 * @returns {object} An object containing a list of all found project folders.
 */
function getAllTopLevelFolders() {
	const allProjects = [];
	config.root_directories.forEach((rootDir, index) => {
		try {
			const items = fs.readdirSync(rootDir);
			for (const item of items) {
				if (item === '.' || item === '..') continue;
				const itemFullPath = path.join(rootDir, item);
				let stats;
				try {
					stats = fs.statSync(itemFullPath);
				} catch (e) {
					// Ignore items that can't be stat'd (e.g., permission errors)
					continue;
				}
				if (stats.isDirectory() && !config.excluded_folders.includes(item)) {
					allProjects.push({rootIndex: index, rootPath: rootDir, path: item});
				}
			}
		} catch (error) {
			console.error(`Error reading root directory ${rootDir}:`, error.message);
		}
	});
	return {projects: allProjects};
}

/**
 * Gets the data needed for the 'Select Projects' page, including all potential
 * projects and their current selection status.
 * @returns {object} An object containing the list of projects with their `isChecked` status.
 */
function getProjectsPageData() {
	const allFolders = getAllTopLevelFolders().projects;
	const savedProjects = db.prepare('SELECT root_index, path FROM projects').all();
	// The DB query returns snake_case `root_index`, so `p.root_index` is correct here.
	const savedIdentifiers = new Set(savedProjects.map(p => `${p.root_index}_${p.path}`));
	
	// Correctly compare the filesystem-scanned projects (which use camelCase `rootIndex`)
	// against the set of saved project identifiers.
	const projectsWithStatus = allFolders.map(p => ({
		...p,
		isChecked: savedIdentifiers.has(`${p.rootIndex}_${p.path}`)
	}));
	
	return {projects: projectsWithStatus};
}

/**
 * Toggles the selected state of a project in the database.
 * @param {object} params - The parameters for toggling.
 * @param {number} params.rootIndex - The index of the project's root directory.
 * @param {string} params.path - The path of the project.
 * @param {boolean} params.isSelected - The new selection state.
 */
function toggleProject({rootIndex, path, isSelected}) {
	if (isSelected) {
		db.prepare('INSERT OR IGNORE INTO projects (root_index, path) VALUES (?, ?)').run(rootIndex, path);
	} else {
		// This will also cascade delete from project_states due to the FOREIGN KEY constraint
		db.prepare('DELETE FROM projects WHERE root_index = ? AND path = ?').run(rootIndex, path);
	}
	return {success: true};
}

/**
 * Retrieves the saved state (open folders, selected files) for a specific project.
 * @param {object} params - The parameters for fetching state.
 * @param {number} params.rootIndex - The index of the project's root directory.
 * @param {string} params.projectPath - The path of the project.
 * @returns {object} The saved state of the project.
 */
function getProjectState({rootIndex, projectPath}) {
	const state = db.prepare('SELECT open_folders, selected_files FROM project_states WHERE project_root_index = ? AND project_path = ?')
		.get(rootIndex, projectPath);
	return {
		openFolders: state ? JSON.parse(state.open_folders || '[]') : [],
		selectedFiles: state ? JSON.parse(state.selected_files || '[]') : []
	};
}

/**
 * Saves the current state (open folders, selected files) for a project and
 * updates the 'last selected project' setting.
 * @param {object} params - The parameters for saving state.
 * @param {number} params.rootIndex - The index of the project's root directory.
 * @param {string} params.projectPath - The path of the project.
 * @param {string} params.openFolders - A JSON string of open folder paths.
 * @param {string} params.selectedFiles - A JSON string of selected file paths.
 */
function saveProjectState({rootIndex, projectPath, openFolders, selectedFiles}) {
	db.prepare('INSERT OR REPLACE INTO project_states (project_root_index, project_path, open_folders, selected_files) VALUES (?, ?, ?, ?)')
		.run(rootIndex, projectPath, openFolders, selectedFiles);
	
	// Also update the last selected project for convenience
	const lastProjectIdentifier = `${rootIndex}_${projectPath}`;
	db.prepare('UPDATE app_settings SET value = ? WHERE key = ?').run(lastProjectIdentifier, 'lastSelectedProject');
	
	return {success: true};
}

module.exports = {
	getProjectsPageData,
	toggleProject,
	getProjectState,
	saveProjectState
};
