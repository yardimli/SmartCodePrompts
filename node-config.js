// SmartCodePrompts/node-config.js
const path = require('path');
const Database = require('better-sqlite3');

const isElectron = !!process.env.ELECTRON_RUN;
const appDataPath = isElectron ? process.env.APP_DATA_PATH : __dirname;

const db = new Database(path.join(appDataPath, 'smart_code.sqlite'));

// Global config object, will be populated from the database.
// This object is exported and should be mutated, not reassigned.
let config = {};

/**
 * Creates all necessary tables if they don't exist. This function defines the database schema.
 */
function create_tables () {
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
function set_default_config () {
	const default_config = {
		allowed_extensions: JSON.stringify(["js", "jsx", "json", "ts", "tsx", "php", "py", "html", "css", "swift", "xcodeproj", "xcworkspace", "storyboard", "xib", "plist", "xcassets", "playground", "cs", "csproj", "htaccess"]),
		excluded_folders: JSON.stringify([".git", ".idea", "vendor", "storage", "node_modules"]),
		openrouter_api_key: "YOUR_API_KEY_HERE"
	};
	const insert_stmt = db.prepare('INSERT OR IGNORE INTO app_setup (key, value) VALUES (?, ?)');
	const transaction = db.transaction(() => {
		for (const key in default_config) {
			insert_stmt.run(key, default_config[key]);
		}
	});
	transaction();
}

/**
 * Sets default application settings (like dark mode state and LLM prompts).
 * Uses INSERT OR IGNORE to prevent overwriting existing values.
 */
function set_default_app_settings () {
	const initSettings_stmt = db.prepare("INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)");
	const transaction = db.transaction(() => {
		initSettings_stmt.run('dark_mode', 'false');
		initSettings_stmt.run('last_selected_project', '');
		initSettings_stmt.run('last_selected_llm_analysis', '');
		initSettings_stmt.run('last_selected_llm_smart_prompt', '');
		initSettings_stmt.run('last_selected_llm_qa', '');
		initSettings_stmt.run('last_selected_llm_direct_prompt', '');
		initSettings_stmt.run('last_smart_prompt', '');
		// NEW: Persistent token counters
		initSettings_stmt.run('total_prompt_tokens', '0');
		initSettings_stmt.run('total_completion_tokens', '0');
		// NEW: Default for right sidebar collapsed state
		initSettings_stmt.run('right_sidebar_collapsed', 'false');
		
		const default_overview_prompt = `Analyze the following file content and provide a response in a single, JSON object format.
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

File Path: \${file_path}
File Content:
\${file_content}`;
		
		const default_functions_prompt = `PROMPT: Create a concise function analysis summary

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

File Path: \${file_path}
File Content:
\${file_content}`;
		
		const default_content_footer = `
		\${user_prompt}

Format the output.
For PHP use psr-12 standards.
For javascript use StandardJS but include semicolumns.
For html use W3C standards.
Skip files that dont need to be changed and are provided for reference.
Don't refactor code that is not needed to be changed.
Comment as needed.
Add comments to new lines and modified sections.
`;
		
		const default_smart_prompt = `Based on the user's request below, identify which of the provided files are directly or indirectly necessary to fulfill the request. The user has provided a list of files with their automated analysis (overview and function summaries). Your task is to act as a filter. Only return the file paths that are relevant. Return your answer as a single, minified JSON object with a single key "relevant_files" which is an array of strings. Each string must be one of the file paths provided in the "AVAILABLE FILES" section. Do not include any other text or explanation. Example response: {"relevant_files":["src/user.js","src/api/auth.js"]}

		USER REQUEST: \${user_prompt}

		AVAILABLE FILES AND THEIR ANALYSIS:
		\${analysis_data_string}`;
		
		// NEW: Default prompt for the QA feature
		const default_qa_prompt = `You are an expert software developer assistant. Based *only* on the code provided in the context below, answer the user's question. Format your answer clearly using Markdown. If the question cannot be answered from the provided context, say so and explain why.

CONTEXT:
\${file_context}

QUESTION:
\${user_question}`;
		
		initSettings_stmt.run('prompt_file_overview', default_overview_prompt);
		initSettings_stmt.run('prompt_functions_logic', default_functions_prompt);
		initSettings_stmt.run('prompt_content_footer', default_content_footer);
		initSettings_stmt.run('prompt_smart_prompt', default_smart_prompt);
		initSettings_stmt.run('prompt_qa', default_qa_prompt); // NEW
		
		const allowed_extensions = db.prepare('SELECT value FROM app_setup WHERE key = ?').get('allowed_extensions')?.value;
		if (allowed_extensions) {
			initSettings_stmt.run('compress_extensions', allowed_extensions);
		} else {
			initSettings_stmt.run('compress_extensions', '[]');
		}
	});
	transaction();
}

/**
 * Loads the configuration from `app_setup` and `app_settings` tables into the global 'config' object.
 * It resolves relative paths and ensures correct data types.
 */
function load_config_from_db () {
	// Clear existing properties from the config object without creating a new reference.
	Object.keys(config).forEach(key => delete config[key]);
	
	const setup_rows = db.prepare('SELECT key, value FROM app_setup').all();
	const settings_rows = db.prepare('SELECT key, value FROM app_settings').all();
	const new_config_data = {};
	
	// Process setup data (JSON parsing for arrays)
	setup_rows.forEach(row => {
		try {
			new_config_data[row.key] = JSON.parse(row.value);
		} catch (e) {
			new_config_data[row.key] = row.value;
		}
	});
	
	// Process settings data (all are strings)
	settings_rows.forEach(row => {
		// Also parse compress_extensions if it exists.
		if (row.key === 'compress_extensions') {
			try {
				new_config_data[row.key] = JSON.parse(row.value);
			} catch (e) {
				new_config_data[row.key] = [];
			}
		} else {
			new_config_data[row.key] = row.value;
		}
	});
	
	// Mutate the original config object by copying the new properties into it.
	Object.assign(config, new_config_data);
	console.log('Configuration loaded from database.');
}

/**
 * Initializes the entire database and configuration setup.
 * This should be called once on server startup.
 */
function initialize_database_and_config () {
	create_tables();
	set_default_config();
	set_default_app_settings();
	load_config_from_db();
}

/**
 * Retrieves all setup data for the /setup page.
 * @returns {object} An object containing the current config and dark mode status.
 */
function get_setup_data () {
	const setup_rows = db.prepare('SELECT key, value FROM app_setup').all();
	const settings_rows = db.prepare("SELECT key, value FROM app_settings").all();
	const current_config = {};
	setup_rows.forEach(row => {
		try {
			current_config[row.key] = JSON.parse(row.value);
		} catch (e) {
			current_config[row.key] = row.value;
		}
	});
	settings_rows.forEach(row => {
		current_config[row.key] = row.value;
	});
	return {config: current_config, dark_mode: current_config.dark_mode === 'true'};
}

/**
 * Saves the setup configuration from the /setup page to the appropriate tables.
 * @param {object} data - The form data from the request.
 */
function save_setup_data (data) {
	const setup_keys = new Set(['allowed_extensions', 'excluded_folders', 'openrouter_api_key']);
	const settings_keys = new Set(['prompt_file_overview', 'prompt_functions_logic', 'prompt_content_footer', 'prompt_smart_prompt', 'prompt_qa', 'compress_extensions']);
	const upsertSetup_stmt = db.prepare('INSERT OR REPLACE INTO app_setup (key, value) VALUES (?, ?)');
	const upsertSettings_stmt = db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)');
	
	const transaction = db.transaction(() => {
		// Iterate over the object's keys.
		for (const key in data) {
			if (key === 'action') continue;
			const value = data[key];
			if (setup_keys.has(key)) {
				upsertSetup_stmt.run(key, value);
			} else if (settings_keys.has(key)) {
				upsertSettings_stmt.run(key, value);
			}
		}
	});
	transaction();
	
	// Reload config into memory after saving.
	load_config_from_db();
}

/**
 * Resets LLM prompts to their default values.
 * @returns {object} A success object.
 */
function reset_prompts_to_default () {
	const prompt_keys = ['prompt_file_overview', 'prompt_functions_logic', 'prompt_content_footer', 'prompt_smart_prompt', 'prompt_qa'];
	const delete_stmt = db.prepare('DELETE FROM app_settings WHERE key = ?');
	const transaction = db.transaction(() => {
		for (const key of prompt_keys) {
			delete_stmt.run(key);
		}
	});
	transaction();
	
	// Re-add the defaults
	set_default_app_settings();
	// Reload config into memory
	load_config_from_db();
	return {success: true};
}

/**
 * NEW: Resets the LLM log and token counters in the database.
 * @returns {{success: boolean}}
 */
function reset_llm_log () {
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
 * @param {boolean} is_dark_mode - The new dark mode state.
 */
function set_dark_mode (is_dark_mode) {
	db.prepare('UPDATE app_settings SET value = ? WHERE key = ?').run(is_dark_mode ? 'true' : 'false', 'dark_mode');
}

/**
 * NEW: Sets the right sidebar collapsed preference in the database.
 * @param {boolean} is_collapsed - The new collapsed state.
 */
function setright_sidebar_collapsed (is_collapsed) {
	db.prepare('UPDATE app_settings SET value = ? WHERE key = ?').run(is_collapsed ? 'true' : 'false', 'right_sidebar_collapsed');
}

/**
 * @param {string} prompt - The prompt text to save.
 */
function save_last_smart_prompt (prompt) {
	db.prepare('UPDATE app_settings SET value = ? WHERE key = ?').run(prompt, 'last_smart_prompt');
}

/**
 * @param {string} extensions_json - A JSON string array of extensions.
 */
function save_compress_extensions (extensions_json) {
	db.prepare('UPDATE app_settings SET value = ? WHERE key = ?').run(extensions_json, 'compress_extensions');
	// Reload config into memory to make the change effective immediately for get_file_content.
	load_config_from_db();
}

/**
 * Retrieves all data needed for the main page (index.html).
 * @returns {object} An object containing projects, settings, and LLMs.
 */
function get_main_page_data () {
	const projects = db.prepare('SELECT path FROM projects ORDER BY path ASC').all();
	const settings = db.prepare('SELECT key, value FROM app_settings').all();
	const app_settings = settings.reduce((acc, row) => {
		acc[row.key] = row.value;
		return acc;
	}, {});
	const llms = db.prepare('SELECT id, name FROM llms ORDER BY name ASC').all();
	const allowed_extensions_row = db.prepare('SELECT value FROM app_setup WHERE key = ?').get('allowed_extensions');
	
	const prompt_tokens = app_settings.total_prompt_tokens || '0';
	const completion_tokens = app_settings.total_completion_tokens || '0';
	
	// MODIFIED: Calculate initial total cost
	const cost_rows = db.prepare(`
        SELECT l.prompt_tokens,
               l.completion_tokens,
               m.prompt_price,
               m.completion_price
        FROM llm_log l
                 LEFT JOIN llms m ON l.model_id = m.id
    `).all();
	
	let total_cost = 0;
	for (const row of cost_rows) {
		const prompt_price = row.prompt_price || 0;
		const completion_price = row.completion_price || 0;
		const prompt_cost = ((row.prompt_tokens || 0) ) * prompt_price;
		const completion_cost = ((row.completion_tokens || 0) ) * completion_price;
		total_cost += prompt_cost + completion_cost;
	}
	
	return {
		projects,
		last_selected_project: app_settings.last_selected_project || '',
		dark_mode: app_settings.dark_mode === 'true',
		right_sidebar_collapsed: app_settings.right_sidebar_collapsed === 'true',
		llms,
		last_selected_llm_analysis: app_settings.last_selected_llm_analysis || '',
		last_selected_llm_smart_prompt: app_settings.last_selected_llm_smart_prompt || '',
		last_selected_llm_qa: app_settings.last_selected_llm_qa || '',
		last_selected_llm_direct_prompt: app_settings.last_selected_llm_direct_prompt || '',
		prompt_content_footer: app_settings.prompt_content_footer || '',
		last_smart_prompt: app_settings.last_smart_prompt || '',
		session_tokens: {
			prompt: parseInt(prompt_tokens, 10),
			completion: parseInt(completion_tokens, 10),
			cost: total_cost
		},
		allowed_extensions: allowed_extensions_row ? allowed_extensions_row.value : '[]',
		compress_extensions: app_settings.compress_extensions || '[]'
	};
}

module.exports = {
	db,
	config,
	initialize_database_and_config,
	get_setup_data,
	save_setup_data,
	set_dark_mode,
	setright_sidebar_collapsed,
	save_last_smart_prompt,
	save_compress_extensions,
	get_main_page_data,
	reset_prompts_to_default,
	reset_llm_log
};
