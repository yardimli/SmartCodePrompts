const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');
const {db} = require('./node-config');
const { get_project_settings, is_path_excluded } = require('./node-projects');

function resolve_path(relative_path, project_full_path) {
	const full_path = path.resolve(project_full_path, relative_path);
	if (!full_path.startsWith(project_full_path)) {
		throw new Error("Invalid path traversal attempt.");
	}
	return full_path;
}

function calculate_checksum(data) {
	return crypto.createHash('sha256').update(data).digest('hex');
}

function get_folders({ input_path, project_path }) {
	const settings = get_project_settings(project_path);
	const { allowed_extensions } = settings;
	
	const full_path = resolve_path(input_path, project_path);
	const folders = [];
	const files = [];
	const metadata_stmt = db.prepare('SELECT file_path, last_checksum FROM file_metadata WHERE project_path = ?');
	const analyzed_files_map = new Map(metadata_stmt.all(project_path).map(r => [r.file_path, r.last_checksum]));
	
	const modifiedGitFiles = getGitModifiedFiles(project_path);
	
	try {
		const items = fs.readdirSync(full_path);
		for (const item of items) {
			if (item === '.' || item === '..') continue;
			const item_full_path = path.join(full_path, item);
			let stats;
			try {
				stats = fs.statSync(item_full_path);
			} catch (e) {
				console.warn(`Skipping ${item_full_path}: ${e.message}`);
				continue;
			}
			if (stats.isDirectory()) {
				folders.push(item);
			} else if (stats.isFile()) {
				const ext = path.extname(item_full_path).slice(1);
				let base = path.basename(item_full_path);
				if (base.startsWith('.')) {
					base = base.slice(1);
				}
				if (allowed_extensions.includes(ext) || (ext === '' && allowed_extensions.includes(base))) {
					const relative_file_path = path.join(input_path, item).replace(/\\/g, '/');
					const has_analysis = analyzed_files_map.has(relative_file_path);
					let needs_reanalysis = false;
					const has_git_diff = modifiedGitFiles.has(relative_file_path);
					let file_content_buffer;
					try {
						file_content_buffer = fs.readFileSync(item_full_path);
					} catch (read_error) {
						console.warn(`Could not read file, skipping: ${item_full_path}`, read_error);
						continue;
					}
					if (has_analysis) {
						const stored_checksum = analyzed_files_map.get(relative_file_path);
						if (stored_checksum) {
							const current_checksum = calculate_checksum(file_content_buffer);
							if (current_checksum !== stored_checksum) {
								needs_reanalysis = true;
							}
						}
					}
					files.push({
						name: item,
						path: relative_file_path,
						has_analysis: has_analysis,
						needs_reanalysis: needs_reanalysis,
						has_git_diff: has_git_diff,
						size: stats.size
					});
				}
			}
		}
	} catch (error) {
		console.error(`Error reading directory ${full_path}:`, error);
		return {folders: [], files: []};
	}
	
	// MODIFIED: Removed sorting, as it's now handled on the client-side for better consistency.
	return {folders, files};
}

function get_file_content(input_path, project_path) {
	const full_path = resolve_path(input_path, project_path);
	try {
		let file_contents = fs.readFileSync(full_path, 'utf8');
		return {content: file_contents};
	} catch (error) {
		console.error(`Error reading file ${full_path}:`, error);
		throw new Error(`Could not read file: ${input_path}`);
	}
}

function save_file_content({ project_path, file_path, content }) {
	const full_path = resolve_path(file_path, project_path);
	try {
		fs.writeFileSync(full_path, content, 'utf8');
		return { success: true };
	} catch (error) {
		console.error(`Error writing file ${full_path}:`, error);
		throw new Error(`Could not save file: ${file_path}`);
	}
}

function get_raw_file_content(input_path, project_path) {
	const full_path = resolve_path(input_path, project_path);
	return fs.readFileSync(full_path, 'utf8');
}

function isGitRepository(project_path) {
	return fs.existsSync(path.join(project_path, '.git'));
}

function getGitHeadContent(relative_path, project_full_path) {
	const sanitized_path = relative_path.replace(/\\/g, '/');
	if (sanitized_path.includes('"') || sanitized_path.includes(';')) {
		console.error(`Invalid characters in file path for git command: ${sanitized_path}`);
		return null;
	}
	try {
		const gitCommand = `git show HEAD:"${sanitized_path}"`;
		const stdout = execSync(gitCommand, { cwd: project_full_path, encoding: 'utf8', timeout: 2000 });
		return stdout;
	} catch (error) {
		return null;
	}
}

function getGitModifiedFiles(project_full_path) {
	if (!isGitRepository(project_full_path)) {
		return new Set();
	}
	try {
		const gitCommand = 'git diff --name-only HEAD -z';
		const stdout = execSync(gitCommand, { cwd: project_full_path, encoding: 'utf8', timeout: 5000 });
		const modifiedFiles = stdout.split('\0').filter(p => p.length > 0);
		return new Set(modifiedFiles);
	} catch (error) {
		console.warn(`Could not get git diff for ${project_full_path}: ${error.message}`);
		return new Set();
	}
}

function get_file_for_editor({ project_path, file_path }) {
	let currentContent;
	let mtimeMs;
	try {
		const full_path = resolve_path(file_path, project_path);
		const stats = fs.statSync(full_path);
		mtimeMs = stats.mtimeMs;
		currentContent = fs.readFileSync(full_path, 'utf8');
	} catch (e) {
		if (e.code === 'ENOENT') {
			console.warn(`File not found while opening for editor: ${file_path}`);
			return { currentContent: null, originalContent: null, mtimeMs: null };
		}
		console.error(`Error reading file for editor ${file_path}:`, e);
		return { currentContent: `/* ERROR: Could not read file: ${file_path}. Reason: ${e.message} */`, originalContent: null, mtimeMs: null };
	}
	
	let originalContent = null;
	if (isGitRepository(project_path)) {
		originalContent = getGitHeadContent(file_path, project_path);
	}
	
	if (originalContent && currentContent.replace(/\r/g, '') === originalContent.replace(/\r/g, '')) {
		originalContent = null;
	}
	
	return { currentContent, originalContent, mtimeMs };
}

function get_file_mtime({ project_path, file_path }) {
	try {
		const full_path = resolve_path(file_path, project_path);
		if (!fs.existsSync(full_path)) {
			return { mtimeMs: null, exists: false };
		}
		const stats = fs.statSync(full_path);
		return { mtimeMs: stats.mtimeMs, exists: true };
	} catch (error) {
		console.warn(`Could not get mtime for ${file_path}:`, error.message);
		return { mtimeMs: null, exists: false };
	}
}

function search_files({ start_path, search_term, project_path }) {
	const settings = get_project_settings(project_path);
	const { allowed_extensions } = settings;
	
	const absolute_start_path = resolve_path(start_path, project_path);
	const matching_files = [];
	const search_regex = new RegExp(search_term.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'gi');
	
	function search_in_directory(current_dir) {
		let items;
		try {
			items = fs.readdirSync(current_dir);
		} catch (err) {
			console.warn(`Cannot read directory ${current_dir}: ${err.message}`);
			return;
		}
		for (const item of items) {
			if (item === '.' || item === '..') continue;
			const item_full_path = path.join(current_dir, item);
			let stats;
			try {
				stats = fs.statSync(item_full_path);
			} catch (e) {
				console.warn(`Skipping ${item_full_path}: ${e.message}`);
				continue;
			}
			if (stats.isDirectory()) {
				if (!is_path_excluded(path.relative(project_path, item_full_path), settings)) {
					search_in_directory(item_full_path);
				}
			} else if (stats.isFile()) {
				const ext = path.extname(item_full_path).slice(1);
				if (allowed_extensions.includes(ext)) {
					try {
						const content = fs.readFileSync(item_full_path, 'utf8');
						const matches = content.match(search_regex);
						if (matches && matches.length > 0) {
							const relative_path = path.relative(project_path, item_full_path).replace(/\\/g, '/');
							matching_files.push({path: relative_path, match_count: matches.length});
						}
					} catch (err) {
						console.warn(`Cannot read file ${item_full_path}: ${err.message}`);
					}
				}
			}
		}
	}
	
	search_in_directory(absolute_start_path);
	return {matching_files};
}

function get_file_analysis({project_path, file_path}) {
	const data = db.prepare('SELECT file_overview, functions_overview FROM file_metadata WHERE project_path = ? AND file_path = ?')
		.get(project_path, file_path);
	return data || {file_overview: null, functions_overview: null};
}

/**
 * Recursively walks the project directory to get a set of all valid, non-excluded file paths.
 * @param {string} project_path - The absolute path to the project root.
 * @param {object} settings - The project's settings object.
 * @returns {Set<string>} A set of relative file paths.
 */
function get_all_project_files(project_path, settings) {
	const { allowed_extensions } = settings;
	const all_files = new Set();
	
	function walk(directory) {
		let items;
		try {
			items = fs.readdirSync(directory);
		} catch (e) {
			console.warn(`Could not read directory, skipping: ${directory}`);
			return;
		}
		
		for (const item of items) {
			const full_path = path.join(directory, item);
			const relative_path = path.relative(project_path, full_path).replace(/\\/g, '/');
			
			if (is_path_excluded(relative_path, settings)) {
				continue;
			}
			
			let stats;
			try {
				stats = fs.statSync(full_path);
			} catch (e) {
				continue;
			}
			
			if (stats.isDirectory()) {
				walk(full_path);
			} else if (stats.isFile()) {
				const ext = path.extname(item).slice(1);
				let base = path.basename(item);
				if (base.startsWith('.')) base = base.slice(1);
				
				if (allowed_extensions.includes(ext) || (ext === '' && allowed_extensions.includes(base))) {
					all_files.add(relative_path);
				}
			}
		}
	}
	
	walk(project_path);
	return all_files;
}

/**
 * Checks for file system changes by comparing tracked files with the actual file system.
 * Detects new files, deleted files, and modifications to existing files.
 * @param {object} params - The parameters.
 * @param {string} params.project_path - The full path of the project.
 * @returns {object} An object containing arrays of added, deleted, and updated files.
 */
function check_folder_updates({ project_path }) {
	// 1. Get all files currently tracked in the DB
	const db_files_stmt = db.prepare('SELECT file_path, last_checksum FROM file_metadata WHERE project_path = ?');
	const db_files_list = db_files_stmt.all(project_path);
	const db_files_map = new Map(db_files_list.map(r => [r.file_path, r.last_checksum]));
	
	// 2. Get all valid files from the filesystem
	const settings = get_project_settings(project_path);
	const fs_files_set = get_all_project_files(project_path, settings);
	
	// 3. Compare sets to find added and deleted files
	const added_files_paths = [...fs_files_set].filter(p => !db_files_map.has(p));
	const deleted_files_paths = [...db_files_map.keys()].filter(p => !fs_files_set.has(p));
	
	// 4. Process existing files for updates (checksum, git status)
	const updates = [];
	const modifiedGitFiles = getGitModifiedFiles(project_path);
	
	db_files_list.forEach(file => {
		// Only process files that still exist on the filesystem
		if (fs_files_set.has(file.file_path)) {
			try {
				const full_path = resolve_path(file.file_path, project_path);
				const file_content = fs.readFileSync(full_path);
				const current_checksum = calculate_checksum(file_content);
				
				const needs_reanalysis = current_checksum !== file.last_checksum;
				const has_git_diff = modifiedGitFiles.has(file.file_path);
				
				updates.push({
					file_path: file.file_path,
					needs_reanalysis: needs_reanalysis,
					has_git_diff: has_git_diff
				});
			} catch (error) {
				console.error(`Error checking file for modification during poll: ${file.file_path}`, error);
				updates.push({
					file_path: file.file_path,
					needs_reanalysis: true,
					has_git_diff: false
				});
			}
		}
	});
	
	// 5. Format added files with details needed by the frontend
	const added_files_details = added_files_paths.map(p => ({
		path: p,
		name: path.basename(p),
		parent_path: path.dirname(p).replace(/\\/g, '/') || '.'
	}));
	
	return {
		updates: updates,
		deleted: deleted_files_paths,
		added: added_files_details
	};
}

function check_for_modified_files({project_path}) {
	const project_settings = get_project_settings(project_path);
	const stmt = db.prepare('SELECT file_path, last_checksum FROM file_metadata WHERE project_path = ?');
	const all_analyzed_files = stmt.all(project_path);
	
	const analyzed_files = all_analyzed_files.filter(
		file => !is_path_excluded(file.file_path, project_settings)
	);
	
	if (analyzed_files.length === 0) {
		return {needs_reanalysis: false, count: 0};
	}
	
	let modified_count = 0;
	
	for (const file of analyzed_files) {
		try {
			const full_path = resolve_path(file.file_path, project_path);
			
			if (!fs.existsSync(full_path)) {
				console.warn(`Analyzed file not found (likely deleted): ${full_path}`);
				continue;
			}
			
			const file_content = fs.readFileSync(full_path);
			const current_checksum = calculate_checksum(file_content);
			
			if (current_checksum !== file.last_checksum) {
				modified_count++;
			}
		} catch (error) {
			console.error(`Error checking file for modification: ${file.file_path}`, error);
			modified_count++;
		}
	}
	
	return {
		needs_reanalysis: modified_count > 0,
		count: modified_count
	};
}

function create_file({ project_path, file_path }) {
	const full_path = resolve_path(file_path, project_path);
	try {
		if (fs.existsSync(full_path)) {
			throw new Error(`File already exists: ${file_path}`);
		}
		fs.mkdirSync(path.dirname(full_path), { recursive: true });
		fs.writeFileSync(full_path, '', 'utf8');
		return { success: true };
	} catch (error) {
		console.error(`Error creating file ${full_path}:`, error);
		throw error;
	}
}

function create_folder({ project_path, folder_path }) {
	const full_path = resolve_path(folder_path, project_path);
	try {
		if (fs.existsSync(full_path)) {
			throw new Error(`Folder already exists: ${folder_path}`);
		}
		fs.mkdirSync(full_path, { recursive: true });
		return { success: true };
	} catch (error) {
		console.error(`Error creating folder ${full_path}:`, error);
		throw error;
	}
}

function rename_path({ project_path, old_path, new_path }) {
	const full_old_path = resolve_path(old_path, project_path);
	const full_new_path = resolve_path(new_path, project_path);
	try {
		if (fs.existsSync(full_new_path)) {
			throw new Error(`Destination path already exists: ${new_path}`);
		}
		fs.renameSync(full_old_path, full_new_path);
		db.prepare('UPDATE file_metadata SET file_path = ? WHERE project_path = ? AND file_path = ?')
			.run(new_path, project_path, old_path);
		db.prepare('UPDATE project_open_tabs SET file_path = ? WHERE project_path = ? AND file_path = ?')
			.run(new_path, project_path, old_path);
		return { success: true };
	} catch (error) {
		console.error(`Error renaming ${old_path} to ${new_path}:`, error);
		throw error;
	}
}

function delete_path({ project_path, path_to_delete }) {
	const full_path = resolve_path(path_to_delete, project_path);
	try {
		fs.rmSync(full_path, { recursive: true, force: true });
		db.prepare('DELETE FROM file_metadata WHERE project_path = ? AND file_path LIKE ?')
			.run(project_path, `${path_to_delete}%`);
		db.prepare('DELETE FROM project_open_tabs WHERE project_path = ? AND file_path LIKE ?')
			.run(project_path, `${path_to_delete}%`);
		return { success: true };
	} catch (error) {
		console.error(`Error deleting ${path_to_delete}:`, error);
		throw error;
	}
}

function git_reset_file({ project_path, file_path }) {
	if (!isGitRepository(project_path)) {
		throw new Error('Project is not a Git repository.');
	}
	const sanitized_path = file_path.replace(/\\/g, '/');
	if (sanitized_path.includes('"') || sanitized_path.includes(';')) {
		throw new Error(`Invalid characters in file path for git command: ${sanitized_path}`);
	}
	try {
		const gitCommand = `git checkout HEAD -- "${sanitized_path}"`;
		execSync(gitCommand, { cwd: project_path, encoding: 'utf8', timeout: 2000 });
		return { success: true };
	} catch (error) {
		console.error(`Error resetting file ${file_path}:`, error);
		throw error;
	}
}


module.exports = {
	get_folders,
	get_file_content,
	save_file_content,
	get_raw_file_content,
	search_files,
	get_file_analysis,
	calculate_checksum,
	check_folder_updates,
	check_for_modified_files,
	get_file_for_editor,
	get_file_mtime,
	create_file,
	create_folder,
	rename_path,
	delete_path,
	git_reset_file,
};
