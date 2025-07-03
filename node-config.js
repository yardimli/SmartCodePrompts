const path = require('path');
const Database = require('better-sqlite3');
// Initialize the database connection. The DB file is in the same directory as the script.
const db = new Database(path.join(__dirname, 'llm-helper.sqlite'));
// Global config object, will be populated from the database.
// This object is exported and should be mutated, not reassigned.
let config = {};

/**
 * Creates all necessary tables if they don't exist. This function defines the database schema.
 */
function createTables() {
	db.exec(`
        CREATE TABLE IF NOT EXISTS projects (
            root_index INTEGER NOT NULL,
            path TEXT NOT NULL,
            PRIMARY KEY (root_index, path)
        );
        CREATE TABLE IF NOT EXISTS project_states (
            project_root_index INTEGER NOT NULL,
            project_path TEXT NOT NULL,
            open_folders TEXT,
            selected_files TEXT,
            PRIMARY KEY (project_root_index, project_path),
            FOREIGN KEY (project_root_index, project_path) REFERENCES projects(root_index, path) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS file_metadata (
            project_root_index INTEGER NOT NULL,
            project_path TEXT NOT NULL,
            file_path TEXT NOT NULL,
            file_overview TEXT,
            functions_overview TEXT,
            last_analyze_update_time TEXT,
            last_checksum TEXT,
            PRIMARY KEY (project_root_index, project_path, file_path)
        );
        CREATE TABLE IF NOT EXISTS llms (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            context_length INTEGER,
            prompt_price REAL,
            completion_price REAL
        );
        CREATE TABLE IF NOT EXISTS app_settings (
            key TEXT PRIMARY KEY,
            value TEXT
        );
        CREATE TABLE IF NOT EXISTS app_setup (
            key TEXT PRIMARY KEY,
            value TEXT
        );
    `);
}

/**
 * Sets default configuration values in the database.
 * Uses INSERT OR IGNORE to prevent overwriting user-modified settings.
 */
function setDefaultConfig() {
	const defaultConfig = {
		root_directories: JSON.stringify(["path/to/your/first/directory", "c:/myprojects"]),
		allowed_extensions: JSON.stringify(["js", "jsx", "json", "ts", "tsx", "php", "py", "html", "css", "swift", "xcodeproj", "xcworkspace", "storyboard", "xib", "plist", "xcassets", "playground", "cs", "csproj", "htaccess"]),
		excluded_folders: JSON.stringify([".git", ".idea", "vendor", "storage", "node_modules"]),
		server_port: "3000",
		openrouter_api_key: "YOUR_API_KEY_HERE"
	};
	const insertStmt = db.prepare('INSERT OR IGNORE INTO app_setup (key, value) VALUES (?, ?)');
	const transaction = db.transaction(() => {
		for (const key in defaultConfig) {
			insertStmt.run(key, defaultConfig[key]);
		}
	});
	transaction();
}

/**
 * Sets default application settings (like dark mode state and LLM prompts).
 * Uses INSERT OR IGNORE to prevent overwriting existing values.
 */
function setDefaultAppSettings() {
	const initSettingsStmt = db.prepare("INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)");
	const transaction = db.transaction(() => {
		initSettingsStmt.run('darkMode', 'false');
		initSettingsStmt.run('lastSelectedProject', '');
		initSettingsStmt.run('lastSelectedLlm', '');
		
		const defaultOverviewPrompt = `Analyze the following file content and provide a response in a single, minified JSON object format. Do not include any text outside of the JSON object. The JSON object should have the following structure: {"overview": "A brief, one-sentence summary of the file's primary purpose.","internal_dependencies": ["list/of/project/files/it/imports/or/requires"],"external_dependencies": ["list/of/external/libraries/or/apis/used"]}\n\nFile Path: \${filePath}\nFile Content:\n---\n\${fileContent}\n---`;
		const defaultFunctionsPrompt = `Analyze the following file content and provide a response in a single, minified JSON object format. Do not include any text outside of the JSON object. The JSON object should have the following structure: {"language": "The primary programming language detected (e.g., 'JavaScript', 'PHP', 'HTML/JS').","functions": [{"name": "functionName","purpose": "A concise description of what the function does.","inputs": "Description of parameters or 'none'.","output": "Description of the return value or 'none'."}],"main_logic": "A summary of the code that runs outside of any function definitions, like initializations or script entry points."}\n\nFile Path: \${filePath}\nFile Content:\n---\n\${fileContent}\n---`;
		const defaultContentFooter = 'All input is minified. \n' +
			'For output format the output. \n' +
			'For PHP use psr-12 standards.\n' +
			'For javascript use StandardJS but include semicolumns.\n' +
			'For html use W3C standards.\n' +
			'Skip files that dont need to be changed and are provided for reference.\n' +
			'Comment as needed.\n' +
			'Add comments to new lines and modifed sections.\n';
		
		initSettingsStmt.run('prompt_file_overview', defaultOverviewPrompt);
		initSettingsStmt.run('prompt_functions_logic', defaultFunctionsPrompt);
		initSettingsStmt.run('prompt_content_footer', defaultContentFooter);
	});
	transaction();
}

/**
 * Loads the configuration from `app_setup` and `app_settings` tables into the global 'config' object.
 * It resolves relative paths and ensures correct data types.
 */
function loadConfigFromDb() {
	// Clear existing properties from the config object without creating a new reference.
	Object.keys(config).forEach(key => delete config[key]);
	
	const setupRows = db.prepare('SELECT key, value FROM app_setup').all();
	const settingsRows = db.prepare('SELECT key, value FROM app_settings').all();
	const newConfigData = {};
	
	// Process setup data (JSON parsing for arrays)
	setupRows.forEach(row => {
		try {
			newConfigData[row.key] = JSON.parse(row.value);
		} catch (e) {
			newConfigData[row.key] = row.value;
		}
	});
	
	// Process settings data (all are strings)
	settingsRows.forEach(row => {
		newConfigData[row.key] = row.value;
	});
	
	// Ensure server_port is a number for the listener.
	newConfigData.server_port = parseInt(newConfigData.server_port, 10);
	// Resolve root directories to absolute paths.
	if (Array.isArray(newConfigData.root_directories)) {
		newConfigData.root_directories = newConfigData.root_directories.map(dir =>
			path.isAbsolute(dir) ? dir : path.resolve(__dirname, dir)
		);
	} else {
		newConfigData.root_directories = [];
	}
	
	// Mutate the original config object by copying the new properties into it.
	Object.assign(config, newConfigData);
	console.log('Configuration loaded from database.');
}

/**
 * Initializes the entire database and configuration setup.
 * This should be called once on server startup.
 */
function initializeDatabaseAndConfig() {
	createTables();
	setDefaultConfig();
	setDefaultAppSettings();
	loadConfigFromDb();
}

/**
 * Retrieves all setup data for the /setup page.
 * @returns {object} An object containing the current config and dark mode status.
 */
function getSetupData() {
	const setupRows = db.prepare('SELECT key, value FROM app_setup').all();
	const settingsRows = db.prepare("SELECT key, value FROM app_settings").all();
	const currentConfig = {};
	
	setupRows.forEach(row => {
		try {
			currentConfig[row.key] = JSON.parse(row.value);
		} catch (e) {
			currentConfig[row.key] = row.value;
		}
	});
	
	settingsRows.forEach(row => {
		currentConfig[row.key] = row.value;
	});
	
	return {
		config: currentConfig,
		darkMode: currentConfig.darkMode === 'true'
	};
}

/**
 * Saves the setup configuration from the /setup page to the appropriate tables.
 * @param {URLSearchParams} postData - The form data from the request.
 */
function saveSetupData(postData) {
	const setupKeys = new Set(['root_directories', 'allowed_extensions', 'excluded_folders', 'server_port', 'openrouter_api_key']);
	const settingsKeys = new Set(['prompt_file_overview', 'prompt_functions_logic', 'prompt_content_footer']);
	
	const upsertSetupStmt = db.prepare('INSERT OR REPLACE INTO app_setup (key, value) VALUES (?, ?)');
	const upsertSettingsStmt = db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)');
	
	const transaction = db.transaction(() => {
		for (const [key, value] of postData.entries()) {
			if (key === 'action') continue;
			
			if (setupKeys.has(key)) {
				upsertSetupStmt.run(key, value);
			} else if (settingsKeys.has(key)) {
				upsertSettingsStmt.run(key, value);
			}
		}
	});
	transaction();
	// Reload config into memory after saving.
	loadConfigFromDb();
}

/**
 * Resets LLM prompts to their default values.
 * @returns {object} A success object.
 */
function resetPromptsToDefault() {
	const promptKeys = ['prompt_file_overview', 'prompt_functions_logic', 'prompt_content_footer'];
	const deleteStmt = db.prepare('DELETE FROM app_settings WHERE key = ?');
	
	const transaction = db.transaction(() => {
		for (const key of promptKeys) {
			deleteStmt.run(key);
		}
	});
	transaction();
	
	// Re-add the defaults
	setDefaultAppSettings();
	// Reload config into memory
	loadConfigFromDb();
	
	return {
		success: true
	};
}

/**
 * Sets the dark mode preference in the database.
 * @param {boolean} isDarkMode - The new dark mode state.
 */
function setDarkMode(isDarkMode) {
	db.prepare('UPDATE app_settings SET value = ? WHERE key = ?').run(isDarkMode ? 'true' : 'false', 'darkMode');
}

/**
 * Saves the ID of the last selected LLM.
 * @param {string} llmId - The ID of the selected LLM.
 */
function saveSelectedLlm(llmId) {
	db.prepare('UPDATE app_settings SET value = ? WHERE key = ?').run(llmId, 'lastSelectedLlm');
}

/**
 * Retrieves all data needed for the main page (index.html).
 * @returns {object} An object containing projects, settings, and LLMs.
 */
function getMainPageData() {
	const projects = db.prepare('SELECT root_index as rootIndex, path FROM projects ORDER BY path ASC').all();
	const settings = db.prepare('SELECT key, value FROM app_settings').all();
	const appSettings = settings.reduce((acc, row) => {
		acc[row.key] = row.value;
		return acc;
	}, {});
	const llms = db.prepare('SELECT id, name FROM llms ORDER BY name ASC').all();
	return {
		projects,
		lastSelectedProject: appSettings.lastSelectedProject || '',
		darkMode: appSettings.darkMode === 'true',
		llms,
		lastSelectedLlm: appSettings.lastSelectedLlm || '',
		prompt_content_footer: appSettings.prompt_content_footer || ''
	};
}

module.exports = {
	db,
	config,
	initializeDatabaseAndConfig,
	getSetupData,
	saveSetupData,
	setDarkMode,
	saveSelectedLlm,
	getMainPageData,
	resetPromptsToDefault
};
