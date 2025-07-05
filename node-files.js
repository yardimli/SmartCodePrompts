const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {db, config} = require('./node-config');

/**
 * Resolves a relative path from the client against a project's absolute path,
 * ensuring it does not traverse outside the project folder.
 * @param {string} relative_path - The relative path from the client (e.g., 'src/components/Button.js').
 * @param {string} project_full_path - The absolute path of the project on the server.
 * @returns {string} The absolute, validated file system path.
 * @throws {Error} If the path is invalid or attempts traversal.
 */
function resolve_path(relative_path, project_full_path) {
	const full_path = path.resolve(project_full_path, relative_path);
	// Security check: ensure the resolved path is still within the intended project directory.
	if (!full_path.startsWith(project_full_path)) {
		throw new Error("Invalid path traversal attempt.");
	}
	return full_path;
}

/**
 * Calculates an MD5 checksum for the given data.
 * @param {string|Buffer} data - The data to hash.
 * @returns {string} The MD5 checksum in hex format.
 */
function calculate_checksum(data) {
	return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Reads the contents of a directory and returns separate lists of folders and files,
 * filtering by allowed extensions and excluded folder names.
 * @param {string} input_path - The path of the directory to read, relative to the project root.
 * @param {string} project_path - The absolute path of the project.
 * @returns {object} An object containing `folders` and `files` arrays.
 */
function get_folders(input_path, project_path) {
	const full_path = resolve_path(input_path, project_path);
	const folders = [];
	const files = [];
	// Get analysis metadata for all files in this project to avoid N+1 queries in the loop.
	const metadata_stmt = db.prepare('SELECT file_path, last_checksum FROM file_metadata WHERE project_path = ?');
	const analyzed_files_map = new Map(metadata_stmt.all(project_path).map(r => [r.file_path, r.last_checksum]));
	
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
				if (!config.excluded_folders.includes(item)) {
					folders.push(item);
				}
			} else if (stats.isFile()) {
				const ext = path.extname(item_full_path).slice(1);
				let base = path.basename(item_full_path);
				if (base.startsWith('.')) {
					base = base.slice(1);
				}
				if (config.allowed_extensions.includes(ext) || (ext === '' && config.allowed_extensions.includes(base))) {
					const relative_file_path = path.join(input_path, item).replace(/\\/g, '/');
					const has_analysis = analyzed_files_map.has(relative_file_path);
					let is_modified = false;
					
					if (has_analysis) {
						const stored_checksum = analyzed_files_map.get(relative_file_path);
						if (stored_checksum) {
							try {
								const file_content = fs.readFileSync(item_full_path);
								const current_checksum = calculate_checksum(file_content);
								if (current_checksum !== stored_checksum) {
									is_modified = true;
								}
							} catch (read_error) {
								console.warn(`Could not read file for checksum: ${item_full_path}`, read_error);
							}
						}
					}
					
					files.push({
						name: item,
						path: relative_file_path,
						has_analysis: has_analysis,
						is_modified: is_modified
					});
				}
			}
		}
	} catch (error) {
		console.error(`Error reading directory ${full_path}:`, error);
		return {folders: [], files: []};
	}
	return {folders, files};
}

/**
 * Reads the content of a single file.
 * @param {string} input_path - The path of the file to read, relative to the project root.
 * @param {string} project_path - The absolute path of the project.
 * @returns {object} An object containing the `content` of the file.
 */
function get_file_content(input_path, project_path) {
	const full_path = resolve_path(input_path, project_path);
	try {
		const file_contents = fs.readFileSync(full_path, 'utf8');
		return {content: file_contents};
	} catch (error) {
		console.error(`Error reading file ${full_path}:`, error);
		throw new Error(`Could not read file: ${input_path}`);
	}
}

/**
 * Reads the raw, unmodified content of a single file.
 * @param {string} input_path - The path of the file to read, relative to the project root.
 * @param {string} project_path - The absolute path of the project.
 * @returns {string} The raw content of the file.
 * @throws {Error} If the file cannot be read.
 */
function get_raw_file_content(input_path, project_path) {
	const full_path = resolve_path(input_path, project_path);
	try {
		return fs.readFileSync(full_path, 'utf8');
	} catch (error) {
		console.error(`Error reading raw file ${full_path}:`, error);
		throw new Error(`Could not read raw file content for: ${input_path}`);
	}
}

/**
 * Recursively searches for a term within files in a given directory.
 * @param {string} start_path - The directory path to start the search from, relative to the project root.
 * @param {string} search_term - The case-insensitive term to search for.
 * @param {string} project_path - The absolute path of the project.
 * @returns {object} An object containing an array of `matching_files`.
 */
function search_files(start_path, search_term, project_path) {
	const absolute_start_path = resolve_path(start_path, project_path);
	const matching_files = [];
	const search_lower = search_term.toLowerCase();
	
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
				if (!config.excluded_folders.includes(item)) {
					search_in_directory(item_full_path);
				}
			} else if (stats.isFile()) {
				const ext = path.extname(item_full_path).slice(1);
				if (config.allowed_extensions.includes(ext)) {
					try {
						const content = fs.readFileSync(item_full_path, 'utf8');
						if (content.toLowerCase().includes(search_lower)) {
							const relative_path = path.relative(project_path, item_full_path).replace(/\\/g, '/');
							matching_files.push(relative_path);
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

/**
 * Retrieves the stored analysis metadata for a specific file from the database.
 * @param {object} params - The parameters for the lookup.
 * @param {string} params.project_path - The absolute path of the project.
 * @param {string} params.file_path - The path of the file, relative to the project root.
 * @returns {object} The stored analysis data or nulls if not found.
 */
function get_file_analysis({project_path, file_path}) {
	const data = db.prepare('SELECT file_overview, functions_overview FROM file_metadata WHERE project_path = ? AND file_path = ?')
		.get(project_path, file_path);
	return data || {file_overview: null, functions_overview: null};
}

/**
 * Checks the modification status of all *analyzed* files within a project
 * by comparing their current checksums against those stored in the database.
 * @param {string} project_path - The absolute path of the project.
 * @returns {object} An object containing arrays of file paths for `modified`, `unmodified`, and `deleted` files.
 */
function check_folder_updates(project_path) {
	const stmt = db.prepare('SELECT file_path, last_checksum FROM file_metadata WHERE project_path = ?');
	const analyzed_files = stmt.all(project_path);
	
	const results = {
		modified: [],
		unmodified: [],
		deleted: []
	};
	
	if (analyzed_files.length === 0) {
		return results;
	}
	
	for (const file of analyzed_files) {
		try {
			const full_path = resolve_path(file.file_path, project_path);
			
			if (!fs.existsSync(full_path)) {
				results.deleted.push(file.file_path);
				continue;
			}
			
			const file_content = fs.readFileSync(full_path);
			const current_checksum = calculate_checksum(file_content);
			
			if (current_checksum !== file.last_checksum) {
				results.modified.push(file.file_path);
			} else {
				results.unmodified.push(file.file_path);
			}
		} catch (error) {
			console.error(`Error checking file for modification during poll: ${file.file_path}`, error);
			results.modified.push(file.file_path);
		}
	}
	
	return results;
}

/**
 * Checks all analyzed files in a project to see if any have been modified since their last analysis.
 * @param {object} params - The parameters for the check.
 * @param {string} params.project_path - The absolute path of the project.
 * @returns {{needs_reanalysis: boolean, count: number}} An object indicating if re-analysis is needed and the count of modified files.
 */
function check_for_modified_files({project_path}) {
	const stmt = db.prepare('SELECT file_path, last_checksum FROM file_metadata WHERE project_path = ?');
	const analyzed_files = stmt.all(project_path);
	
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

module.exports = {get_folders, get_file_content, get_raw_file_content, search_files, get_file_analysis, calculate_checksum, check_folder_updates, check_for_modified_files};
