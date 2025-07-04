const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {db, config} = require('./node-config');

/**
 * Resolves a relative path from the client against a configured root directory,
 * ensuring it does not traverse outside the root.
 * @param {string} inputPath - The relative path from the client.
 * @param {number} rootIndex - The index of the root directory to use.
 * @returns {string} The absolute, validated file system path.
 * @throws {Error} If the path is invalid or attempts traversal.
 */
function resolvePath(inputPath, rootIndex) {
	if (rootIndex >= config.root_directories.length) {
		throw new Error("Invalid root directory index.");
	}
	const realRoot = path.resolve(config.root_directories[rootIndex]);
	// If inputPath is '.', use the realRoot. Otherwise, resolve it against the realRoot.
	const fullPath = inputPath === '.' ? realRoot : path.resolve(realRoot, inputPath);
	// Security check: ensure the resolved path is still within the intended root directory.
	if (!fullPath.startsWith(realRoot)) {
		throw new Error("Invalid path traversal attempt.");
	}
	return fullPath;
}

/**
 * Calculates an MD5 checksum for the given data.
 * @param {string|Buffer} data - The data to hash.
 * @returns {string} The MD5 checksum in hex format.
 */
function calculateChecksum(data) {
	return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Reads the contents of a directory and returns separate lists of folders and files,
 * filtering by allowed extensions and excluded folder names.
 * @param {string} inputPath - The path of the directory to read.
 * @param {number} rootIndex - The index of the project's root directory.
 * @param {string} projectPath - The path of the project (used for analysis metadata lookup).
 * @returns {object} An object containing `folders` and `files` arrays.
 */
function getFolders(inputPath, rootIndex, projectPath) {
	const fullPath = resolvePath(inputPath, rootIndex);
	const folders = [];
	const files = [];
	// Get analysis metadata for all files in this project to avoid N+1 queries in the loop.
	const metadataStmt = db.prepare('SELECT file_path, last_checksum FROM file_metadata WHERE project_root_index = ? AND project_path = ?'); // Modified to get checksum
	const analyzedFilesMap = new Map(metadataStmt.all(rootIndex, projectPath).map(r => [r.file_path, r.last_checksum])); // Use a Map for checksums
	
	try {
		const items = fs.readdirSync(fullPath);
		for (const item of items) {
			if (item === '.' || item === '..') continue;
			const itemFullPath = path.join(fullPath, item);
			let stats;
			try {
				stats = fs.statSync(itemFullPath);
			} catch (e) {
				console.warn(`Skipping ${itemFullPath}: ${e.message}`);
				continue;
			}
			if (stats.isDirectory()) {
				if (!config.excluded_folders.includes(item)) {
					folders.push(item);
				}
			} else if (stats.isFile()) {
				const ext = path.extname(itemFullPath).slice(1);
				let base = path.basename(itemFullPath);
				// Handle dotfiles or files with no extension that are explicitly allowed
				if (base.startsWith('.')) {
					base = base.slice(1);
				}
				if (config.allowed_extensions.includes(ext) || (ext === '' && config.allowed_extensions.includes(base))) {
					const relativeFilePath = path.join(inputPath, item).replace(/\\/g, '/');
					const hasAnalysis = analyzedFilesMap.has(relativeFilePath);
					let isModified = false;
					
					// If the file has been analyzed, check if it has been modified.
					if (hasAnalysis) {
						const storedChecksum = analyzedFilesMap.get(relativeFilePath);
						if (storedChecksum) {
							try {
								const fileContent = fs.readFileSync(itemFullPath);
								const currentChecksum = calculateChecksum(fileContent);
								if (currentChecksum !== storedChecksum) {
									isModified = true;
								}
							} catch (readError) {
								console.warn(`Could not read file for checksum: ${itemFullPath}`, readError);
							}
						}
					}
					
					files.push({
						name: item,
						path: relativeFilePath,
						has_analysis: hasAnalysis,
						is_modified: isModified // Include modification status in response
					});
				}
			}
		}
	} catch (error) {
		console.error(`Error reading directory ${fullPath}:`, error);
		return {folders: [], files: []};
	}
	return {folders, files};
}

/**
 * Reads the content of a single file and collapses whitespace.
 * @param {string} inputPath - The path of the file to read.
 * @param {number} rootIndex - The index of the project's root directory.
 * @returns {object} An object containing the minified `content` of the file.
 */
function getFileContent(inputPath, rootIndex) {
	const fullPath = resolvePath(inputPath, rootIndex);
	try {
		const fileContents = fs.readFileSync(fullPath, 'utf8');
		// Collapse multiple whitespace characters into a single space for minification.
		// don't collapse for now -- we'll only collapse in node-server.js get_file_content function
		// const collapsedContent = fileContents.replace(/\s+/g, ' ');
		return {content: fileContents};
	} catch (error) {
		console.error(`Error reading file ${fullPath}:`, error);
		throw new Error(`Could not read file: ${inputPath}`);
	}
}

/**
 * Reads the raw, unmodified content of a single file.
 * @param {string} inputPath - The path of the file to read.
 * @param {number} rootIndex - The index of the project's root directory.
 * @returns {string} The raw content of the file.
 * @throws {Error} If the file cannot be read.
 */
function getRawFileContent(inputPath, rootIndex) {
	const fullPath = resolvePath(inputPath, rootIndex);
	try {
		return fs.readFileSync(fullPath, 'utf8');
	} catch (error) {
		console.error(`Error reading raw file ${fullPath}:`, error);
		throw new Error(`Could not read raw file content for: ${inputPath}`);
	}
}

/**
 * Recursively searches for a term within files in a given directory.
 * @param {string} startPath - The directory path to start the search from.
 * @param {string} searchTerm - The case-insensitive term to search for.
 * @param {number} rootIndex - The index of the project's root directory.
 * @returns {object} An object containing an array of `matchingFiles`.
 */
function searchFiles(startPath, searchTerm, rootIndex) {
	const realRoot = path.resolve(config.root_directories[rootIndex]);
	const absoluteStartPath = resolvePath(startPath, rootIndex);
	const matchingFiles = [];
	const searchLower = searchTerm.toLowerCase();
	
	function searchInDirectory(currentDir) {
		let items;
		try {
			items = fs.readdirSync(currentDir);
		} catch (err) {
			console.warn(`Cannot read directory ${currentDir}: ${err.message}`);
			return;
		}
		for (const item of items) {
			if (item === '.' || item === '..') continue;
			const itemFullPath = path.join(currentDir, item);
			let stats;
			try {
				stats = fs.statSync(itemFullPath);
			} catch (e) {
				console.warn(`Skipping ${itemFullPath}: ${e.message}`);
				continue;
			}
			if (stats.isDirectory()) {
				if (!config.excluded_folders.includes(item)) {
					searchInDirectory(itemFullPath);
				}
			} else if (stats.isFile()) {
				const ext = path.extname(itemFullPath).slice(1);
				if (config.allowed_extensions.includes(ext)) {
					try {
						const content = fs.readFileSync(itemFullPath, 'utf8');
						if (content.toLowerCase().includes(searchLower)) {
							const relativePath = path.relative(realRoot, itemFullPath).replace(/\\/g, '/');
							matchingFiles.push(relativePath);
						}
					} catch (err) {
						console.warn(`Cannot read file ${itemFullPath}: ${err.message}`);
					}
				}
			}
		}
	}
	
	searchInDirectory(absoluteStartPath);
	return {matchingFiles};
}

/**
 * Retrieves the stored analysis metadata for a specific file from the database.
 * @param {object} params - The parameters for the lookup.
 * @param {number} params.rootIndex - The index of the project's root directory.
 * @param {string} params.projectPath - The path of the project.
 * @param {string} params.filePath - The path of the file.
 * @returns {object} The stored analysis data or nulls if not found.
 */
function getFileAnalysis({rootIndex, projectPath, filePath}) {
	const data = db.prepare('SELECT file_overview, functions_overview FROM file_metadata WHERE project_root_index = ? AND project_path = ? AND file_path = ?')
		.get(rootIndex, projectPath, filePath);
	return data || {file_overview: null, functions_overview: null};
}

/**
 * MODIFIED: This function has been repurposed based on the new polling strategy.
 * It no longer checks for general filesystem changes in specific open folders.
 * Instead, it checks the modification status of all *analyzed* files within a project
 * by comparing their current checksums against those stored in the database.
 * This is used for live-updating the "modified" icon in the file tree.
 * Note: This change means new/deleted files in open folders will no longer appear/disappear
 * automatically via polling; a folder must be collapsed and re-opened to refresh its contents.
 * @param {number} rootIndex - The index of the project's root directory.
 * @param {string} projectPath - The path of the project.
 * @returns {object} An object containing arrays of file paths for `modified`, `unmodified`, and `deleted` files.
 */
function checkFolderUpdates(rootIndex, projectPath) {
	const stmt = db.prepare('SELECT file_path, last_checksum FROM file_metadata WHERE project_root_index = ? AND project_path = ?');
	const analyzedFiles = stmt.all(rootIndex, projectPath);
	
	const results = {
		modified: [],
		unmodified: [],
		deleted: []
	};
	
	if (analyzedFiles.length === 0) {
		return results;
	}
	
	for (const file of analyzedFiles) {
		try {
			const fullPath = resolvePath(file.file_path, rootIndex);
			
			if (!fs.existsSync(fullPath)) {
				results.deleted.push(file.file_path);
				continue;
			}
			
			const fileContent = fs.readFileSync(fullPath);
			const currentChecksum = calculateChecksum(fileContent);
			
			if (currentChecksum !== file.last_checksum) {
				results.modified.push(file.file_path);
			} else {
				results.unmodified.push(file.file_path);
			}
		} catch (error) {
			// If we can't read the file, we can't get a checksum. Treat as modified.
			console.error(`Error checking file for modification during poll: ${file.file_path}`, error);
			results.modified.push(file.file_path);
		}
	}
	
	return results;
}

/**
 * NEW: Checks all analyzed files in a project to see if any have been modified since their last analysis.
 * @param {object} params - The parameters for the check.
 * @param {number} params.rootIndex - The index of the project's root directory.
 * @param {string} params.projectPath - The path of the project.
 * @returns {{needsReanalysis: boolean, count: number}} An object indicating if re-analysis is needed and the count of modified files.
 */
function checkForModifiedFiles({rootIndex, projectPath}) {
	// Get all files that have existing analysis metadata for this project.
	const stmt = db.prepare('SELECT file_path, last_checksum FROM file_metadata WHERE project_root_index = ? AND project_path = ?');
	const analyzedFiles = stmt.all(rootIndex, projectPath);
	
	if (analyzedFiles.length === 0) {
		return {needsReanalysis: false, count: 0};
	}
	
	let modifiedCount = 0;
	
	for (const file of analyzedFiles) {
		try {
			const fullPath = resolvePath(file.file_path, rootIndex);
			
			// If a file that was previously analyzed no longer exists, we don't count it as "modified"
			// for the purpose of re-analysis, as there's nothing to re-analyze.
			if (!fs.existsSync(fullPath)) {
				console.warn(`Analyzed file not found (likely deleted): ${fullPath}`);
				continue;
			}
			
			const fileContent = fs.readFileSync(fullPath);
			const currentChecksum = calculateChecksum(fileContent);
			
			if (currentChecksum !== file.last_checksum) {
				modifiedCount++;
			}
		} catch (error) {
			// This could happen if file permissions change, preventing a read.
			// We'll log the error but treat it as a modification, as the state is uncertain.
			console.error(`Error checking file for modification: ${file.file_path}`, error);
			modifiedCount++;
		}
	}
	
	return {
		needsReanalysis: modifiedCount > 0,
		count: modifiedCount
	};
}

// MODIFIED: Export the new function
module.exports = {getFolders, getFileContent, getRawFileContent, searchFiles, getFileAnalysis, calculateChecksum, checkFolderUpdates, checkForModifiedFiles};
