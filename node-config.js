// SmartCodePrompts/node-config.js
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const yaml = require('yaml');

const isElectron = !!process.env.ELECTRON_RUN;
const appDataPath = isElectron ? process.env.APP_DATA_PATH : __dirname;

const db = new Database(path.join(appDataPath, 'smart_code.sqlite'));

// Global config object, will be populated from the database.
// This object is exported and should be mutated, not reassigned.
let config = {};

/**
 * Creates all necessary tables if they don't exist and runs migration logic
 * for backward compatibility. This function defines the database schema.
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
            open_tabs TEXT,
            active_tab_identifier TEXT, /* MODIFIED: Renamed from active_tab_id for clarity */
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

        CREATE TABLE IF NOT EXISTS llm_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL,
            reason TEXT,
            model_id TEXT,
            prompt_tokens INTEGER,
            completion_tokens INTEGER
        );
    `);

	// --- MODIFIED: Backward Compatibility & Migration Logic ---
	db.transaction(() => {
		const projectStatesColumns = db.pragma("table_info('project_states')");

		// Migration from the very old 'project_open_tabs' table
		const oldTableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='project_open_tabs'").get();
		if (oldTableExists) {
			console.log('[DB Migration] Old `project_open_tabs` table found. Migrating data...');
			if (!projectStatesColumns.some(c => c.name === 'open_tabs')) {
				db.exec('ALTER TABLE project_states ADD COLUMN open_tabs TEXT');
			}
			const projectsToMigrate = db.prepare('SELECT DISTINCT project_path FROM project_open_tabs').all();
			for (const project of projectsToMigrate) {
				const tabRows = db.prepare('SELECT file_path FROM project_open_tabs WHERE project_path = ?').all(project.project_path);
				const newTabsData = tabRows.map(row => ({ filePath: row.file_path, viewState: null }));
				db.prepare('UPDATE project_states SET open_tabs = ? WHERE project_path = ?').run(JSON.stringify(newTabsData), project.project_path);
			}
			db.exec('DROP TABLE project_open_tabs');
			console.log('[DB Migration] Old `project_open_tabs` table dropped.');
		}

		// Migration for adding/renaming the active tab column
		if (projectStatesColumns.some(c => c.name === 'active_tab_id')) {
			console.log("[DB Migration] Renaming 'active_tab_id' to 'active_tab_identifier'.");
			db.exec('ALTER TABLE project_states RENAME COLUMN active_tab_id TO active_tab_identifier');
		} else if (!projectStatesColumns.some(c => c.name === 'active_tab_identifier')) {
			console.log("[DB Migration] Adding column 'active_tab_identifier' to table 'project_states'.");
			db.exec('ALTER TABLE project_states ADD COLUMN active_tab_identifier TEXT');
		}
	})();
	// --- END: Migration Logic ---
}


// This is used to create new project-specific settings files.
function get_default_settings_yaml() {
	try {
		const yamlPath = path.join(__dirname, 'default-settings.yaml');
		if (!fs.existsSync(yamlPath)) {
			throw new Error("default-settings.yaml does not exist.");
		}
		const yamlContent = fs.readFileSync(yamlPath, 'utf8');
		return yamlContent;
	} catch (error) {
		console.error("FATAL: Could not read default-settings.yaml. Make sure the file exists in the application directory.", error);
		process.exit(1);
	}
}

/**
 * Sets default application settings (like dark mode state).
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
		initSettings_stmt.run('total_prompt_tokens', '0');
		initSettings_stmt.run('total_completion_tokens', '0');
		initSettings_stmt.run('right_sidebar_collapsed', 'false');
		initSettings_stmt.run('file_tree_width', '300');
		initSettings_stmt.run('openrouter_api_key', '');
	});
	transaction();
}

/**
 * Loads the configuration from `app_settings` table into the global 'config' object.
 * It resolves relative paths and ensures correct data types.
 */
function load_config_from_db () {
	// Clear existing properties from the config object without creating a new reference.
	Object.keys(config).forEach(key => delete config[key]);
	
	const settings_rows = db.prepare('SELECT key, value FROM app_settings').all();
	const new_config_data = {};
	
	// Process settings data (all are strings)
	settings_rows.forEach(row => {
		new_config_data[row.key] = row.value;
	});
	
	// Mutate the original config object by copying the new properties into it.
	Object.assign(config, new_config_data);
	console.log('App-level configuration loaded from database.');
}

/**
 * Initializes the entire database and configuration setup.
 * This should be called once on server startup.
 */
function initialize_database_and_config () {
	create_tables();
	set_default_app_settings();
	load_config_from_db();
}

/**
 * Resets the LLM log and token counters in the database.
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
 * Sets the right sidebar collapsed preference in the database.
 * @param {boolean} is_collapsed - The new collapsed state.
 */
function setright_sidebar_collapsed (is_collapsed) {
	db.prepare('UPDATE app_settings SET value = ? WHERE key = ?').run(is_collapsed ? 'true' : 'false', 'right_sidebar_collapsed');
}

/**
 * Saves the global OpenRouter API key to the database.
 * @param {string} api_key - The API key to save.
 */
function save_api_key(api_key) {
	db.prepare('UPDATE app_settings SET value = ? WHERE key = ?').run(api_key, 'openrouter_api_key');
}

/**
 * @param {string} prompt - The prompt text to save.
 */
function save_last_smart_prompt (prompt) {
	db.prepare('UPDATE app_settings SET value = ? WHERE key = ?').run(prompt, 'last_smart_prompt');
}


/**
 * @param {string|number} width - The width in pixels to save.
 */
function save_file_tree_width (width) {
	db.prepare('UPDATE app_settings SET value = ? WHERE key = ?').run(String(width), 'file_tree_width');
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
	
	const prompt_tokens = app_settings.total_prompt_tokens || '0';
	const completion_tokens = app_settings.total_completion_tokens || '0';
	
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
		file_tree_width: app_settings.file_tree_width || '300',
		llms,
		last_selected_llm_analysis: app_settings.last_selected_llm_analysis || '',
		last_selected_llm_smart_prompt: app_settings.last_selected_llm_smart_prompt || '',
		last_selected_llm_qa: app_settings.last_selected_llm_qa || '',
		last_selected_llm_direct_prompt: app_settings.last_selected_llm_direct_prompt || '',
		last_smart_prompt: app_settings.last_smart_prompt || '',
		api_key_set: !!app_settings.openrouter_api_key,
		session_tokens: {
			prompt: parseInt(prompt_tokens, 10),
			completion: parseInt(completion_tokens, 10),
			cost: total_cost
		},
	};
}

module.exports = {
	db,
	config,
	initialize_database_and_config,
	load_config_from_db,
	get_default_settings_yaml,
	set_dark_mode,
	setright_sidebar_collapsed,
	save_api_key,
	save_last_smart_prompt,
	save_file_tree_width,
	get_main_page_data,
	reset_llm_log
};
