const path = require('path');
const Database = require('better-sqlite3');

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
            FOREIGN KEY (project_root_index, project_path) REFERENCES projects (root_index, path) ON DELETE CASCADE
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
		initSettingsStmt.run('lastSmartPrompt', '');
		
		const defaultOverviewPrompt = `Analyze the following file content and provide a response in a single, JSON object format.
		Do not include any text outside of the JSON object.
		The JSON object should have the following structure, if a structure is empty, it should not be included in the output.:

{
"overview": "A brief, one-sentence summary of the file's primary purpose.",
"internal_dependencies": ["list/of/project/files/it/imports/or/requires"],
"external_dependencies": ["list/of/external/libraries/or/apis/used"],
"codex": {
"security_crypto": ["List of security and cryptographic functions found - including encryption/decryption (AES, RSA, DES), hashing (SHA, bcrypt, PBKDF2), random generation, key management, signatures, certificates"],
"auth": ["List of authentication and authorization functions - including OAuth, JWT, sessions, biometric auth, MFA"],
"platform_apis": ["List of platform-specific security APIs - Android KeyStore, iOS Keychain, Web Crypto API"],
"system_io": ["List of system and I/O operations - file system, network, process management, database operations"],
"data_processing": ["List of data processing functions - JSON parsing, encoding/decoding, compression, regex, XML/HTML parsing"],
"data_protection": ["List of data protection and privacy functions - PII handling, secure storage, data erasure, clipboard ops"],
"memory_resources": ["List of memory and resource management - allocation, garbage collection, threading, pools"],
"communication": ["List of communication and protocol functions - WebSockets, gRPC, GraphQL, push notifications, WebRTC, message queues"],
"state_cache": ["List of state and cache management - localStorage, mobile databases, cache operations, state libraries"],
"third_party": ["List of third-party service integrations - payment processing, cloud services, analytics, social media, maps"],
"web_apis": ["List of modern web APIs - service workers, web workers, permissions, device APIs, media APIs"],
"runtime_ops": ["List of build-time and runtime operations - reflection, dynamic loading, code generation, hot reload"]
}
}

File Path: \${filePath}
File Content:
\${fileContent}`;
		
		const defaultFunctionsPrompt = `Analyze the following file content and provide a response in a single, JSON object format. Do not include any text outside of the JSON object.

PROMPT: Create a comprehensive function analysis by analyzing source code

INSTRUCTIONS:
Perform a detailed analysis of all functions, methods, and callable code blocks in the source file:

Function Identification
- Identify all function declarations (named functions, anonymous functions, arrow functions, lambda expressions)
- Detect class methods (public, private, protected, static methods)
- Find constructors, destructors, and initializers
- Locate getters, setters, and property accessors
- Identify event handlers and callback functions
- Detect lifecycle methods and hooks
- Find generator functions and async functions

Function Signature Analysis
- Extract exact function names and aliases
- Document all parameters with types (if available)
- Identify optional parameters and default values
- Note rest parameters and spread operators
- Detect function overloads and polymorphic signatures
- Document return types (explicit or inferred)

Function Purpose and Behavior
- Determine the primary purpose of each function
- Identify side effects and state mutations
- Note pure vs impure functions
- Detect recursive functions
- Identify higher-order functions
- Document error handling within functions
- Note any security-sensitive operations

Function Dependencies
- List all external functions called within each function
- Identify global variables accessed or modified
- Note imported modules and libraries used
- Document API calls and external service interactions
- Track database operations and file system access
- Identify shared resources and synchronization points

Function Relationships
- Map caller-callee relationships
- Identify function chains and pipelines
- Note inheritance and override patterns
- Document interface implementations
- Track event emitters and listeners
- Identify decorator and wrapper patterns

The JSON object should have the following structure, if a structure is empty, it should not be included in the output. The documentation should be short.:
{
"language": "The primary programming language detected",
"frameworks": ["List of frameworks and major libraries detected"],
"functions": [
{
"name": "functionName",
"type": "function|method|constructor|getter|setter|async|generator|arrow|anonymous",
"visibility": "public|private|protected|static",
"purpose": "Short description of what the function does",
"parameters": [
{
"name": "paramName",
"type": "parameter type if available",
"optional": true|false,
"default": "default value if any",
"description": "what this parameter is for"
}
],
"returns": {
"type": "return type if available",
"description": "what is returned and when"
},
"throws": ["List of exceptions or errors that may be thrown"],
"calls": ["List of other functions this function calls"],
"called_by": ["List of functions that call this function"],
"accesses": ["Global variables or external resources accessed"],
"modifies": ["State or data that this function modifies"],
"async_behavior": "Description of any asynchronous behavior",
"security_notes": "Any security-relevant observations"
}
],
"classes": [
{
"name": "ClassName",
"extends": "ParentClass if any",
"implements": ["List of interfaces implemented"],
"purpose": "What this class represents or does",
"methods": ["List of method names in this class"],
"properties": ["List of class properties"]
}
],
"global_scope": {
"variables": ["List of global variables"],
"constants": ["List of global constants"],
"imports": ["List of imported modules or libraries"],
"exports": ["List of exported items"]
},
"entry_point": "Short description of the main entry point or initialization logic",
}

File Path: \${filePath}
File Content:
\${fileContent}`;
		const defaultContentFooter = `
		\${userPrompt}

Format the output.
For PHP use psr-12 standards.
For javascript use StandardJS but include semicolumns.
For html use W3C standards.
Skip files that dont need to be changed and are provided for reference.
Don't refactor code that is not needed to be changed.
Comment as needed.
Add comments to new lines and modified sections.
`;
		const defaultSmartPrompt = `Based on the user's request below, identify which of the provided files are directly or indirectly necessary to fulfill the request. The user has provided a list of files with their automated analysis (overview and function summaries). Your task is to act as a filter. Only return the file paths that are relevant. Return your answer as a single, minified JSON object with a single key "relevant_files" which is an array of strings. Each string must be one of the file paths provided in the "AVAILABLE FILES" section. Do not include any other text or explanation. Example response: {"relevant_files":["src/user.js","src/api/auth.js"]}\n\nUSER REQUEST: \${userPrompt}\n\nAVAILABLE FILES AND THEIR ANALYSIS:\n---\n\${analysisDataString}\n---`;
		
		initSettingsStmt.run('prompt_file_overview', defaultOverviewPrompt);
		initSettingsStmt.run('prompt_functions_logic', defaultFunctionsPrompt);
		initSettingsStmt.run('prompt_content_footer', defaultContentFooter);
		initSettingsStmt.run('prompt_smart_prompt', defaultSmartPrompt);
		
		const allowedExtensions = db.prepare('SELECT value FROM app_setup WHERE key = ?').get('allowed_extensions')?.value;
		if (allowedExtensions) {
			initSettingsStmt.run('compress_extensions', allowedExtensions);
		} else {
			initSettingsStmt.run('compress_extensions', '[]');
		}
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
		// Also parse compress_extensions if it exists.
		if (row.key === 'compress_extensions') {
			try {
				newConfigData[row.key] = JSON.parse(row.value);
			} catch (e) {
				newConfigData[row.key] = [];
			}
		} else {
			newConfigData[row.key] = row.value;
		}
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
	return {config: currentConfig, darkMode: currentConfig.darkMode === 'true'};
}

/**
 * Saves the setup configuration from the /setup page to the appropriate tables.
 * @param {URLSearchParams} postData - The form data from the request.
 */
function saveSetupData(postData) {
	const setupKeys = new Set(['root_directories', 'allowed_extensions', 'excluded_folders', 'server_port', 'openrouter_api_key']);
	const settingsKeys = new Set(['prompt_file_overview', 'prompt_functions_logic', 'prompt_content_footer', 'prompt_smart_prompt', 'compress_extensions']);
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
	const promptKeys = ['prompt_file_overview', 'prompt_functions_logic', 'prompt_content_footer', 'prompt_smart_prompt'];
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
	return {success: true};
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
 * NEW: Saves the last used smart prompt text.
 * @param {string} prompt - The prompt text to save.
 */
function saveLastSmartPrompt(prompt) {
	db.prepare('UPDATE app_settings SET value = ? WHERE key = ?').run(prompt, 'lastSmartPrompt');
}

/**
 * NEW: Saves the list of extensions to compress.
 * @param {string} extensionsJson - A JSON string array of extensions.
 */
function saveCompressExtensions(extensionsJson) {
	db.prepare('UPDATE app_settings SET value = ? WHERE key = ?').run(extensionsJson, 'compress_extensions');
	// Reload config into memory to make the change effective immediately for get_file_content.
	loadConfigFromDb();
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
	// Get allowed_extensions from app_setup.
	const allowedExtensionsRow = db.prepare('SELECT value FROM app_setup WHERE key = ?').get('allowed_extensions');
	
	return {
		projects,
		lastSelectedProject: appSettings.lastSelectedProject || '',
		darkMode: appSettings.darkMode === 'true',
		llms,
		lastSelectedLlm: appSettings.lastSelectedLlm || '',
		prompt_content_footer: appSettings.prompt_content_footer || '',
		last_smart_prompt: appSettings.lastSmartPrompt || '',
		// Add settings for the compress dropdown.
		allowed_extensions: allowedExtensionsRow ? allowedExtensionsRow.value : '[]',
		compress_extensions: appSettings.compress_extensions || '[]'
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
	saveLastSmartPrompt,
	// Export the new function.
	saveCompressExtensions,
	getMainPageData,
	resetPromptsToDefault
};
