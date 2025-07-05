// SmartCodePrompts/node-config.js
const path = require('path');
const Database = require('better-sqlite3');

const db = new Database(path.join(__dirname, 'smart_code.sqlite'));

// Global config object, will be populated from the database.
// This object is exported and should be mutated, not reassigned.
let config = {};

/**
 * Creates all necessary tables if they don't exist. This function defines the database schema.
 */
function createTables() {
	db.exec(`
        CREATE TABLE IF NOT EXISTS projects (
            path TEXT PRIMARY KEY
        );

        CREATE TABLE IF NOT EXISTS project_states (
            project_path TEXT PRIMARY KEY,
            open_folders TEXT,
            selected_files TEXT,
            FOREIGN KEY (project_path) REFERENCES projects (path) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS file_metadata (
            project_path TEXT NOT NULL,
            file_path TEXT NOT NULL,
            file_overview TEXT,
            functions_overview TEXT,
            last_analyze_update_time TEXT,
            last_checksum TEXT,
            PRIMARY KEY (project_path, file_path)
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

        /* NEW: Table for persistent LLM call logs */
        CREATE TABLE IF NOT EXISTS llm_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL,
            reason TEXT,
            model_id TEXT,
            prompt_tokens INTEGER,
            completion_tokens INTEGER
        );
    `);
}

/**
 * Sets default configuration values in the database.
 * Uses INSERT OR IGNORE to prevent overwriting user-modified settings.
 */
function setDefaultConfig() {
	const defaultConfig = {
		// MODIFIED: Removed root_directories
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
		// NEW: Persistent token counters
		initSettingsStmt.run('total_prompt_tokens', '0');
		initSettingsStmt.run('total_completion_tokens', '0');
		// NEW: Default for right sidebar collapsed state
		initSettingsStmt.run('rightSidebarCollapsed', 'false');
		
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
		
		const defaultFunctionsPrompt = `PROMPT: Create a concise function analysis summary

INSTRUCTIONS:
Analyze all functions and provide a minimal but comprehensive overview:

Function Analysis:
- List all functions with their primary purpose (one line max)
- Include only essential parameters (name and type if typed)
- Note return type only if explicitly defined
- Flag only: async, generator, constructor, or security-sensitive functions
- List direct dependencies only (called functions, not callers)
- Include only critical side effects or state mutations

Class Analysis:
- Class name, parent class, and one-line purpose
- List method names only (no details unless critical)

Global Scope:
- List imports, exports, and entry point only

Output Format (exclude empty fields):
{
  "language": "detected language",
  "functions": [
    {
      "name": "functionName",
      "type": "only if not regular function",
      "purpose": "one line description",
      "params": ["param1: type", "param2?: type"],
      "returns": "type only if explicit",
      "async": true, // only if true
      "calls": ["critical dependencies only"],
      "sideEffects": "only if significant",
      "security": "only if security-relevant"
    }
  ],
  "classes": [
    {
      "name": "ClassName",
      "extends": "ParentClass",
      "purpose": "one line",
      "methods": ["method1", "method2"]
    }
  ],
  "imports": ["module names only"],
  "exports": ["exported items"],
  "entryPoint": "main() or initialization"
}

Keep descriptions under 10 words. Omit obvious information.

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
		
		const defaultSmartPrompt = `Based on the user's request below, identify which of the provided files are directly or indirectly necessary to fulfill the request. The user has provided a list of files with their automated analysis (overview and function summaries). Your task is to act as a filter. Only return the file paths that are relevant. Return your answer as a single, minified JSON object with a single key "relevant_files" which is an array of strings. Each string must be one of the file paths provided in the "AVAILABLE FILES" section. Do not include any other text or explanation. Example response: {"relevant_files":["src/user.js","src/api/auth.js"]}

		USER REQUEST: \${userPrompt}

		AVAILABLE FILES AND THEIR ANALYSIS:
		\${analysisDataString}`;
		
		// NEW: Default prompt for the QA feature
		const defaultQAPrompt = `You are an expert software developer assistant. Based *only* on the code provided in the context below, answer the user's question. Format your answer clearly using Markdown. If the question cannot be answered from the provided context, say so and explain why.

CONTEXT:
\${fileContext}

QUESTION:
\${userQuestion}`;
		
		initSettingsStmt.run('prompt_file_overview', defaultOverviewPrompt);
		initSettingsStmt.run('prompt_functions_logic', defaultFunctionsPrompt);
		initSettingsStmt.run('prompt_content_footer', defaultContentFooter);
		initSettingsStmt.run('prompt_smart_prompt', defaultSmartPrompt);
		initSettingsStmt.run('prompt_qa', defaultQAPrompt); // NEW
		
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
	
	newConfigData.server_port = parseInt(newConfigData.server_port, 10);
	
	// MODIFIED: Removed root_directories logic
	
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
	// MODIFIED: Removed root_directories
	const setupKeys = new Set(['allowed_extensions', 'excluded_folders', 'server_port', 'openrouter_api_key']);
	const settingsKeys = new Set(['prompt_file_overview', 'prompt_functions_logic', 'prompt_content_footer', 'prompt_smart_prompt', 'prompt_qa', 'compress_extensions']);
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
	const promptKeys = ['prompt_file_overview', 'prompt_functions_logic', 'prompt_content_footer', 'prompt_smart_prompt', 'prompt_qa'];
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
 * NEW: Resets the LLM log and token counters in the database.
 * @returns {{success: boolean}}
 */
function resetLlmLog() {
	db.exec('DELETE FROM llm_log');
	const stmt = db.prepare('UPDATE app_settings SET value = ? WHERE key = ?');
	const transaction = db.transaction(() => {
		stmt.run('0', 'total_prompt_tokens');
		stmt.run('0', 'total_completion_tokens');
	});
	transaction();
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
 * NEW: Sets the right sidebar collapsed preference in the database.
 * @param {boolean} isCollapsed - The new collapsed state.
 */
function setRightSidebarCollapsed(isCollapsed) {
	db.prepare('UPDATE app_settings SET value = ? WHERE key = ?').run(isCollapsed ? 'true' : 'false', 'rightSidebarCollapsed');
}

/**
 * Saves the ID of the last selected LLM.
 * @param {string} llmId - The ID of the selected LLM.
 */
function saveSelectedLlm(llmId) {
	db.prepare('UPDATE app_settings SET value = ? WHERE key = ?').run(llmId, 'lastSelectedLlm');
}

/**
 * @param {string} prompt - The prompt text to save.
 */
function saveLastSmartPrompt(prompt) {
	db.prepare('UPDATE app_settings SET value = ? WHERE key = ?').run(prompt, 'lastSmartPrompt');
}

/**
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
	// MODIFIED: Select full path from projects table
	const projects = db.prepare('SELECT path FROM projects ORDER BY path ASC').all();
	const settings = db.prepare('SELECT key, value FROM app_settings').all();
	const appSettings = settings.reduce((acc, row) => {
		acc[row.key] = row.value;
		return acc;
	}, {});
	const llms = db.prepare('SELECT id, name FROM llms ORDER BY name ASC').all();
	const allowedExtensionsRow = db.prepare('SELECT value FROM app_setup WHERE key = ?').get('allowed_extensions');
	
	const promptTokens = appSettings.total_prompt_tokens || '0';
	const completionTokens = appSettings.total_completion_tokens || '0';
	
	return {
		projects,
		lastSelectedProject: appSettings.lastSelectedProject || '',
		darkMode: appSettings.darkMode === 'true',
		rightSidebarCollapsed: appSettings.rightSidebarCollapsed === 'true',
		llms,
		lastSelectedLlm: appSettings.lastSelectedLlm || '',
		prompt_content_footer: appSettings.prompt_content_footer || '',
		last_smart_prompt: appSettings.last_smart_prompt || '',
		sessionTokens: {
			prompt: parseInt(promptTokens, 10),
			completion: parseInt(completionTokens, 10)
		},
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
	setRightSidebarCollapsed,
	saveSelectedLlm,
	saveLastSmartPrompt,
	saveCompressExtensions,
	getMainPageData,
	resetPromptsToDefault,
	resetLlmLog
};
