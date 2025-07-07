// electron-main.js
const {app, BrowserWindow, ipcMain, dialog} = require('electron');
const path = require('path');
const fs = require('fs');

process.env.ELECTRON_RUN = 'true';
const userDataPath = app.getPath('userData');
process.env.APP_DATA_PATH = userDataPath;

console.log(`[Smart Code Prompts] Application data directory: ${userDataPath}`);

if (!fs.existsSync(userDataPath)) {
	fs.mkdirSync(userDataPath, {recursive: true});
	console.log(`[Smart Code Prompts] Created data directory.`);
}

const config_manager = require('./node-config');
const llm_manager = require('./node-llm');
const project_manager = require('./node-projects');
const file_manager = require('./node-files');

let mainWindow;

config_manager.initialize_database_and_config();

function createWindow () {
	mainWindow = new BrowserWindow({
		width: 1600,
		height: 1000,
		title: "Smart Code Prompts - Studio",
		autoHideMenuBar: true,
		webPreferences: {
			// Attach the preload script to the renderer process
			preload: path.join(__dirname, 'electron-preload.js'),
			// Security best practices:
			contextIsolation: true,
			nodeIntegration: false,
		}
	});
	
	mainWindow.loadFile('index.html');
	
	mainWindow.on('closed', () => {
		mainWindow = null;
	});
}

// --- IPC Handlers ---

// Handle request from the renderer process to open a native directory selection dialog.
ipcMain.handle('dialog:openDirectory', async () => {
	const {canceled, filePaths} = await dialog.showOpenDialog(mainWindow, {
		properties: ['openDirectory'],
		title: 'Select a Project Folder'
	});
	if (!canceled && filePaths.length > 0) {
		return filePaths[0];
	}
	return null;
});

// Central IPC handler for all data requests from the renderer process.
// This replaces the entire HTTP POST request handling from the old node-server.js.
ipcMain.handle('post-data', async (event, data) => {
	const action = data.action;
	console.log('IPC Request Action:', action);
	let result;
	try {
		switch (action) {
			// --- Config/Setup Actions (from node-config.js) ---
			case 'get_session_stats':
				result = llm_manager.get_session_stats();
				break;
			case 'get_setup':
				result = config_manager.get_setup_data();
				break;
			case 'save_setup':
				config_manager.save_setup_data(data);
				result = {success: true};
				break;
			case 'reset_prompts':
				result = config_manager.reset_prompts_to_default();
				break;
			case 'reset_llm_log':
				result = config_manager.reset_llm_log();
				break;
			case 'set_dark_mode':
				config_manager.set_dark_mode(data.is_dark_mode);
				result = {success: true};
				break;
			case 'set_right_sidebar_collapsed':
				config_manager.setright_sidebar_collapsed(data.is_collapsed);
				result = {success: true};
				break;
			case 'save_selected_llm':
				config_manager.db.prepare('UPDATE app_settings SET value = ? WHERE key = ?')
					.run(data.llm_id, data.key);
				result = {success: true};
				break;
			case 'save_last_smart_prompt':
				config_manager.save_last_smart_prompt(data.prompt);
				result = {success: true};
				break;
			case 'save_compress_extensions':
				config_manager.save_compress_extensions(data.extensions);
				result = {success: true};
				break;
			case 'get_main_page_data':
				result = config_manager.get_main_page_data();
				break;
			
			// --- LLM Actions (from node-llm.js) ---
			case 'refresh_llms':
				result = await llm_manager.refresh_llms();
				break;
			case 'get_llm_log':
				result = llm_manager.get_llm_log();
				break;
			case 'analyze_file':
				result = await llm_manager.analyze_file({
					project_path: data.project_path,
					file_path: data.file_path,
					llm_id: data.llm_id,
					temperature: parseFloat(data.temperature),
					force: data.force
				});
				break;
			case 'reanalyze_modified_files':
				// MODIFIED: This is now a fire-and-forget call that starts a background task.
				llm_manager.reanalyze_modified_files({
					project_path: data.project_path,
					llm_id: data.llm_id,
					force: data.force,
					temperature: parseFloat(data.temperature)
				});
				result = {success: true, message: 'Re-analysis process started.'};
				break;
			case 'cancel_analysis':
				result = llm_manager.cancel_analysis();
				break;
			case 'get_relevant_files_from_prompt':
				result = await llm_manager.get_relevant_files_from_prompt({
					project_path: data.project_path,
					user_prompt: data.user_prompt,
					llm_id: data.llm_id,
					temperature: parseFloat(data.temperature)
				});
				break;
			case 'ask_question_about_code':
				result = await llm_manager.ask_question_about_code({
					project_path: data.project_path,
					question: data.question,
					relevant_files: JSON.parse(data.relevant_files),
					llm_id: data.llm_id,
					temperature: parseFloat(data.temperature)
				});
				break;
			case 'direct_prompt':
				result = await llm_manager.handle_direct_prompt({
					prompt: data.prompt,
					llm_id: data.llm_id,
					temperature: parseFloat(data.temperature)
				});
				break;
			
			// --- Project Actions (from node-projects.js) ---
			case 'add_project':
				result = project_manager.add_project({path: data.path});
				break;
			// DELETED: 'browse_directory' action is no longer needed.
			case 'get_project_state':
				result = project_manager.get_project_state({project_path: data.project_path});
				break;
			case 'save_project_state':
				result = project_manager.save_project_state({
					project_path: data.project_path,
					open_folders: data.open_folders,
					selected_files: data.selected_files
				});
				break;
			
			// --- File Actions (from node-files.js) ---
			case 'get_folders':
				result = file_manager.get_folders(data.path, data.project_path);
				break;
			case 'get_file_content':
				const file_path = data.path;
				result = file_manager.get_file_content(file_path, data.project_path);
				const file_ext = path.extname(file_path).slice(1);
				const compress_extensions = Array.isArray(config_manager.config.compress_extensions) ? config_manager.config.compress_extensions : [];
				if (result && result.content && compress_extensions.includes(file_ext)) {
					result.content = result.content.replace(/\s+/g, ' ');
					result.content = result.content.split(/\r?\n/).filter(line => line.trim() !== '').join('\n');
				}
				break;
			case 'search_files':
				result = file_manager.search_files(data.folder_path, data.search_term, data.project_path);
				break;
			case 'get_file_analysis':
				result = file_manager.get_file_analysis({
					project_path: data.project_path,
					file_path: data.file_path
				});
				break;
			case 'check_for_modified_files':
				result = file_manager.check_for_modified_files({project_path: data.project_path});
				break;
			case 'check_folder_updates':
				result = file_manager.check_folder_updates(data.project_path);
				break;
			default:
				throw new Error(`Unknown action: ${action}`);
		}
		return result;
	} catch (error) {
		console.error("Error processing IPC request:", error);
		// When an error is thrown in an ipcMain.handle, it's automatically
		// converted into a rejected promise for the renderer.
		throw error;
	}
});


// --- App Lifecycle ---
app.on('ready', createWindow);

app.on('window-all-closed', () => {
	if (process.platform !== 'darwin') {
		app.quit();
	}
});

app.on('activate', () => {
	if (mainWindow === null) {
		createWindow();
	}
});
