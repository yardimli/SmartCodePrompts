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
        CREATE TABLE IF NOT EXISTS projects
        (
            root_index INTEGER NOT NULL,
            path       TEXT    NOT NULL,
            PRIMARY KEY (root_index, path)
        );

        CREATE TABLE IF NOT EXISTS project_states
        (
            project_root_index INTEGER NOT NULL,
            project_path       TEXT    NOT NULL,
            open_folders       TEXT,
            selected_files     TEXT,
            PRIMARY KEY (project_root_index, project_path),
            FOREIGN KEY (project_root_index, project_path) REFERENCES projects (root_index, path) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS file_metadata
        (
            project_root_index        INTEGER NOT NULL,
            project_path              TEXT    NOT NULL,
            file_path                 TEXT    NOT NULL,
            file_overview             TEXT,
            functions_overview        TEXT,
            last_analyze_update_time  TEXT,
            last_checksum             TEXT,
            PRIMARY KEY (project_root_index, project_path, file_path)
        );

        CREATE TABLE IF NOT EXISTS llms
        (
            id               TEXT PRIMARY KEY,
            name             TEXT NOT NULL,
            context_length   INTEGER,
            prompt_price     REAL,
            completion_price REAL
        );

        CREATE TABLE IF NOT EXISTS app_settings
        (
            key   TEXT PRIMARY KEY,
            value TEXT
        );

        CREATE TABLE IF NOT EXISTS app_setup
        (
            key   TEXT PRIMARY KEY,
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
		const defaultFunctionsPrompt = `Analyze the following file content and provide a response in a single, JSON object format. Do not include any text outside of the JSON object.
PROMPT: Create a comprehensive function analysis and code dependency codex by analyzing source code
INSTRUCTIONS:
PART 1: FUNCTION ANALYSIS
Perform a detailed analysis of all functions, methods, and callable code blocks in the source file:

Function Identification

Identify all function declarations (named functions, anonymous functions, arrow functions, lambda expressions)
Detect class methods (public, private, protected, static methods)
Find constructors, destructors, and initializers
Locate getters, setters, and property accessors
Identify event handlers and callback functions
Detect lifecycle methods and hooks
Find generator functions and async functions


Function Signature Analysis

Extract exact function names and aliases
Document all parameters with types (if available)
Identify optional parameters and default values
Note rest parameters and spread operators
Detect function overloads and polymorphic signatures
Document return types (explicit or inferred)


Function Purpose and Behavior

Determine the primary purpose of each function
Identify side effects and state mutations
Note pure vs impure functions
Detect recursive functions
Identify higher-order functions
Document error handling within functions
Note any security-sensitive operations


Function Dependencies

List all external functions called within each function
Identify global variables accessed or modified
Note imported modules and libraries used
Document API calls and external service interactions
Track database operations and file system access
Identify shared resources and synchronization points


Function Relationships

Map caller-callee relationships
Identify function chains and pipelines
Note inheritance and override patterns
Document interface implementations
Track event emitters and listeners
Identify decorator and wrapper patterns



PART 2: DEPENDENCY CODEX
Scan and identify ALL dependencies and internal functions in the source code, categorizing them as follows:
SECURITY & CRYPTOGRAPHIC FUNCTIONS
Encryption/Decryption: AES, RSA, DES, 3DES, Blowfish, ChaCha20, etc.
Hashing: MD5, SHA-1, SHA-256, SHA-512, bcrypt, scrypt, PBKDF2, Argon2, etc.
Random Number Generation: SecureRandom, crypto.getRandomValues(), urandom, etc.
Key Generation/Management: generateKey(), createCipheriv(), KeyGenerator, etc.
Digital Signatures: sign(), verify(), ECDSA, DSA, etc.
Certificate Operations: X509, SSL/TLS functions, cert validation, pinning
AUTHENTICATION & AUTHORIZATION
Identity Management: OAuth, OAuth2, SAML, OpenID Connect
Token Handling: JWT creation/validation, refresh tokens, bearer tokens
Session Management: createSession(), destroySession(), sessionStorage
Biometric Auth: TouchID, FaceID, BiometricPrompt, fingerprint APIs
Multi-Factor Auth: TOTP, HOTP, SMS verification, authenticator apps
PLATFORM-SPECIFIC SECURITY APIS
Android: KeyStore, SafetyNet, Play Integrity API, App Attestation
iOS: Keychain Services, CryptoKit, Security framework, App Transport Security
Web: SubtleCrypto, Web Crypto API, Credential Management API
SYSTEM & I/O OPERATIONS
File System: read(), write(), open(), mkdir(), chmod(), unlink(), etc.
Network: socket(), connect(), listen(), fetch(), XMLHttpRequest, axios, etc.
Process Management: exec(), spawn(), fork(), system(), subprocess, etc.
Database: query(), connect(), execute(), prepare(), transaction(), etc.
DATA PROCESSING FUNCTIONS
Serialization: JSON.parse(), pickle, marshal, serialize(), etc.
Encoding/Decoding: base64, URL encoding, HTML encoding, unicode, etc.
Compression: gzip, zlib, bzip2, lz4, brotli, etc.
Regular Expressions: regex, match(), search(), compile(), etc.
XML/HTML Parsing: DOMParser, SAX, BeautifulSoup, etc.
DATA PROTECTION & PRIVACY
PII Handling: mask(), redact(), anonymize(), pseudonymize()
Secure Storage: EncryptedSharedPreferences, iOS Keychain, SecureStorage
Data Erasure: secureDelete(), wipe(), shred()
Clipboard Operations: clipboard access, copy protection
MEMORY & RESOURCE MANAGEMENT
Memory Allocation: malloc(), new, allocate(), mmap(), etc.
Garbage Collection: gc(), dispose(), WeakReference, etc.
Threading/Async: Thread(), async/await, Promise, coroutines, etc.
Resource Pools: connection pools, thread pools, object pools
COMMUNICATION & PROTOCOLS
WebSockets: ws.connect(), send(), onmessage
gRPC: stub generation, channel creation, streaming
GraphQL: query(), mutation(), subscription()
Push Notifications: FCM, APNS, Web Push API
WebRTC: RTCPeerConnection, getUserMedia()
Message Queues: RabbitMQ, Kafka, Redis pub/sub
STATE & CACHE MANAGEMENT
Local Storage: localStorage, sessionStorage, IndexedDB
Mobile Databases: Room, CoreData, Realm, SQLite
Cache Operations: cache.put(), invalidate(), TTL management
State Libraries: Redux, MobX, Vuex dispatchers
THIRD-PARTY SERVICE INTEGRATION
Payment Processing: Stripe, PayPal, Square SDKs
Cloud Services: AWS SDK, Google Cloud, Azure libraries
Analytics: Google Analytics, Mixpanel, Amplitude
Social Media: Facebook SDK, Twitter API, OAuth flows
Maps/Location: GPS access, Geolocation API, Maps SDKs
MODERN WEB APIS
Service Workers: register(), fetch events, cache strategies
Web Workers: postMessage(), importScripts()
Permissions API: query(), request(), revoke()
Battery/Device APIs: getBattery(), DeviceOrientation
Media APIs: getUserMedia(), MediaRecorder, Screen Capture
BUILD-TIME & RUNTIME OPERATIONS
Reflection: getClass(), getDeclaredMethods(), instanceof
Dynamic Loading: dlopen(), System.loadLibrary(), require()
Code Generation: eval(), Function(), dynamic imports
Hot Reload/Update: module.hot, code push services
The JSON object should have the following structure:
{
"language": "The primary programming language detected",
"frameworks": ["List of frameworks and major libraries detected"],
"codex": {
"security_crypto": ["List of security and cryptographic functions found"],
"auth": ["List of authentication and authorization functions found"],
"platform_apis": ["List of platform-specific security APIs found"],
"system_io": ["List of system and I/O operations found"],
"data_processing": ["List of data processing functions found"],
"data_protection": ["List of data protection and privacy functions found"],
"memory_resources": ["List of memory and resource management functions found"],
"communication": ["List of communication and protocol functions found"],
"state_cache": ["List of state and cache management functions found"],
"third_party": ["List of third-party service integrations found"],
"web_apis": ["List of modern web APIs found"],
"runtime_ops": ["List of build-time and runtime operations found"]
},
"functions": [
{
"name": "functionName",
"type": "function|method|constructor|getter|setter|async|generator|arrow|anonymous",
"visibility": "public|private|protected|static",
"purpose": "Detailed description of what the function does",
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
"entry_point": "Description of the main entry point or initialization logic",
"execution_flow": "High-level description of how the code executes"
}

File Path: ${filePath}
File Content:
${fileContent}`;
		const defaultContentFooter = 'For output format the output. \n' +
			'For PHP use psr-12 standards.\n' +
			'For javascript use StandardJS but include semicolumns.\n' +
			'For html use W3C standards.\n' +
			'Skip files that dont need to be changed and are provided for reference.\n' +
			'Comment as needed.\n' +
			'Add comments to new lines and modifed sections.\n';
		const defaultSmartPrompt = `Based on the user's request below, identify which of the provided files are directly or indirectly necessary to fulfill the request. The user has provided a list of files with their automated analysis (overview and function summaries). Your task is to act as a filter. Only return the file paths that are relevant. Return your answer as a single, minified JSON object with a single key "relevant_files" which is an array of strings. Each string must be one of the file paths provided in the "AVAILABLE FILES" section. Do not include any other text or explanation. Example response: {"relevant_files":["src/user.js","src/api/auth.js"]}\n\nUSER REQUEST: \${userPrompt}\n\nAVAILABLE FILES AND THEIR ANALYSIS:\n---\n\${analysisDataString}\n---`;
		
		initSettingsStmt.run('prompt_file_overview', defaultOverviewPrompt);
		initSettingsStmt.run('prompt_functions_logic', defaultFunctionsPrompt);
		initSettingsStmt.run('prompt_content_footer', defaultContentFooter);
		initSettingsStmt.run('prompt_smart_prompt', defaultSmartPrompt);
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
	const settingsKeys = new Set(['prompt_file_overview', 'prompt_functions_logic', 'prompt_content_footer', 'prompt_smart_prompt']);
	
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
