const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {db, config} = require('./node-config');

/**
 * Resolves a relative path from the client against a project's absolute path,
 * ensuring it does not traverse outside the project folder.
 * @param {string} relativePath - The relative path from the client (e.g., 'src/components/Button.js').
 * @param {string} projectFullPath - The absolute path of the project on the server.
 * @returns {string} The absolute, validated file system path.
 * @throws {Error} If the path is invalid or attempts traversal.
 */
function resolvePath(relativePath, projectFullPath) {
	console.log(`Resolving path: ${relativePath} against project: ${projectFullPath}`);
	const fullPath = path.resolve(projectFullPath, relativePath);
	// Security check: ensure the resolved path is still within the intended project directory.
	if (!fullPath.startsWith(projectFullPath)) {
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
 * @param {string} inputPath - The path of the directory to read, relative to the project root.
 * @param {string} projectPath - The absolute path of the project.
 * @returns {object} An object containing `folders` and `files` arrays.
 */
function getFolders(inputPath, projectPath) {
	const fullPath = resolvePath(inputPath, projectPath);
	const folders = [];
	const files = [];
	// Get analysis metadata for all files in this project to avoid N+1 queries in the loop.
	const metadataStmt = db.prepare('SELECT file_path, last_checksum FROM file_metadata WHERE project_path = ?');
	const analyzedFilesMap = new Map(metadataStmt.all(projectPath).map(r => [r.file_path, r.last_checksum]));
	
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
				if (base.startsWith('.')) {
					base = base.slice(1);
				}
				if (config.allowed_extensions.includes(ext) || (ext === '' && config.allowed_extensions.includes(base))) {
					const relativeFilePath = path.join(inputPath, item).replace(/\\/g, '/');
					const hasAnalysis = analyzedFilesMap.has(relativeFilePath);
					let isModified = false;
					
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
						is_modified: isModified
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
 * Reads the content of a single file.
 * @param {string} inputPath - The path of the file to read, relative to the project root.
 * @param {string} projectPath - The absolute path of the project.
 * @returns {object} An object containing the `content` of the file.
 */
function getFileContent(inputPath, projectPath) {
	const fullPath = resolvePath(inputPath, projectPath);
	try {
		const fileContents = fs.readFileSync(fullPath, 'utf8');
		return {content: fileContents};
	} catch (error) {
		console.error(`Error reading file ${fullPath}:`, error);
		throw new Error(`Could not read file: ${inputPath}`);
	}
}

/**
 * Reads the raw, unmodified content of a single file.
 * @param {string} inputPath - The path of the file to read, relative to the project root.
 * @param {string} projectPath - The absolute path of the project.
 * @returns {string} The raw content of the file.
 * @throws {Error} If the file cannot be read.
 */
function getRawFileContent(inputPath, projectPath) {
	const fullPath = resolvePath(inputPath, projectPath);
	try {
		return fs.readFileSync(fullPath, 'utf8');
	} catch (error) {
		console.error(`Error reading raw file ${fullPath}:`, error);
		throw new Error(`Could not read raw file content for: ${inputPath}`);
	}
}

/**
 * Recursively searches for a term within files in a given directory.
 * @param {string} startPath - The directory path to start the search from, relative to the project root.
 * @param {string} searchTerm - The case-insensitive term to search for.
 * @param {string} projectPath - The absolute path of the project.
 * @returns {object} An object containing an array of `matchingFiles`.
 */
function searchFiles(startPath, searchTerm, projectPath) {
	const absoluteStartPath = resolvePath(startPath, projectPath);
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
							const relativePath = path.relative(projectPath, itemFullPath).replace(/\\/g, '/');
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
 * @param {string} params.projectPath - The absolute path of the project.
 * @param {string} params.filePath - The path of the file, relative to the project root.
 * @returns {object} The stored analysis data or nulls if not found.
 */
function getFileAnalysis({projectPath, filePath}) {
	const data = db.prepare('SELECT file_overview, functions_overview FROM file_metadata WHERE project_path = ? AND file_path = ?')
		.get(projectPath, filePath);
	return data || {file_overview: null, functions_overview: null};
}

/**
 * Checks the modification status of all *analyzed* files within a project
 * by comparing their current checksums against those stored in the database.
 * @param {string} projectPath - The absolute path of the project.
 * @returns {object} An object containing arrays of file paths for `modified`, `unmodified`, and `deleted` files.
 */
function checkFolderUpdates(projectPath) {
	const stmt = db.prepare('SELECT file_path, last_checksum FROM file_metadata WHERE project_path = ?');
	const analyzedFiles = stmt.all(projectPath);
	
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
			const fullPath = resolvePath(file.file_path, projectPath);
			
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
			console.error(`Error checking file for modification during poll: ${file.file_path}`, error);
			results.modified.push(file.file_path);
		}
	}
	
	return results;
}

/**
 * Checks all analyzed files in a project to see if any have been modified since their last analysis.
 * @param {object} params - The parameters for the check.
 * @param {string} params.projectPath - The absolute path of the project.
 * @returns {{needsReanalysis: boolean, count: number}} An object indicating if re-analysis is needed and the count of modified files.
 */
function checkForModifiedFiles({projectPath}) {
	const stmt = db.prepare('SELECT file_path, last_checksum FROM file_metadata WHERE project_path = ?');
	const analyzedFiles = stmt.all(projectPath);
	
	if (analyzedFiles.length === 0) {
		return {needsReanalysis: false, count: 0};
	}
	
	let modifiedCount = 0;
	
	for (const file of analyzedFiles) {
		try {
			const fullPath = resolvePath(file.file_path, projectPath);
			
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
			console.error(`Error checking file for modification: ${file.file_path}`, error);
			modifiedCount++;
		}
	}
	
	return {
		needsReanalysis: modifiedCount > 0,
		count: modifiedCount
	};
}

module.exports = {getFolders, getFileContent, getRawFileContent, searchFiles, getFileAnalysis, calculateChecksum, checkFolderUpdates, checkForModifiedFiles};
