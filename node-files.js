const fs = require('fs');
const path = require('path');
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
	const metadataStmt = db.prepare('SELECT file_path FROM file_metadata WHERE project_root_index = ? AND project_path = ?');
	const analyzedFiles = new Set(metadataStmt.all(rootIndex, projectPath).map(r => r.file_path));
	
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
					const hasAnalysis = analyzedFiles.has(relativeFilePath);
					files.push({name: item, path: relativeFilePath, has_analysis: hasAnalysis});
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
		const collapsedContent = fileContents.replace(/\s+/g, ' ');
		return {content: collapsedContent};
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

module.exports = {
	getFolders,
	getFileContent,
	getRawFileContent,
	searchFiles,
	getFileAnalysis
};
