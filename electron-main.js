// electron-main.js:

const {app, BrowserWindow, Menu, MenuItem, ipcMain, dialog} = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const http = require('http');
const yaml = require('js-yaml');

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
const node_files = require('./node-files');
const {get_project_settings} = require("./node-projects");

let mainWindow;
const PORT = 31987;

config_manager.initialize_database_and_config();

function createWindow () {
	mainWindow = new BrowserWindow({
		width: 1600,
		height: 1000,
		icon: path.join(__dirname, 'assets/icon.png'),
		title: "Smart Code Prompts",
		autoHideMenuBar: true,
		webPreferences: {
			preload: path.join(__dirname, 'electron-preload.js'),
			contextIsolation: true,
			nodeIntegration: false,
		}
	});
	
	mainWindow.loadURL(`http://localhost:${PORT}`);
	
	mainWindow.webContents.on('context-menu', (event, params) => {
		const menu = new Menu();
		
		for (const suggestion of params.dictionarySuggestions) {
			menu.append(new MenuItem({
				label: suggestion,
				click: () => mainWindow.webContents.replaceMisspelling(suggestion)
			}));
		}
		
		if (params.misspelledWord) {
			menu.append(
				new MenuItem({
					label: 'Add to dictionary',
					click: () => mainWindow.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord)
				})
			);
		}
		
		if (params.isEditable) {
			if (menu.items.length > 0) {
				menu.append(new MenuItem({type: 'separator'}));
			}
			
			menu.append(new MenuItem({label: 'Cut', role: 'cut', enabled: params.selectionText}));
			menu.append(new MenuItem({label: 'Copy', role: 'copy', enabled: params.selectionText}));
			menu.append(new MenuItem({label: 'Paste', role: 'paste'}));
			menu.append(new MenuItem({type: 'separator'}));
			menu.append(new MenuItem({label: 'Select All', role: 'selectAll'}));
		}
		
		menu.popup();
	});
	
	mainWindow.on('closed', () => {
		mainWindow = null;
	});
}

// --- IPC Handlers ---

ipcMain.on('update-window-title', (event, title) => {
	if (mainWindow) {
		mainWindow.setTitle(title);
	}
});

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

ipcMain.handle('post-data', async (event, data) => {
	const action = data.action;
	console.log('IPC Request Action:', action);
	let result;
	try {
		const handle_stream_action = (action_handler) => {
			const streamId = crypto.randomUUID();
			action_handler({
				...data,
				onChunk: (content) => mainWindow.webContents.send('llm-stream', {type: 'chunk', streamId, content}),
				onEnd: (usage) => mainWindow.webContents.send('llm-stream', {type: 'end', streamId, usage}),
				onError: (error) => mainWindow.webContents.send('llm-stream', {
					type: 'error',
					streamId,
					message: error.message
				}),
			});
			return {success: true, streamId};
		};
		
		switch (action) {
			// --- Config/Setup Actions (from node-config.js) ---
			case 'get_session_stats':
				result = llm_manager.get_session_stats();
				break;
			case 'get_default_settings_yaml':
				result = { yaml: config_manager.get_default_settings_yaml() };
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
			case 'save_api_key':
				config_manager.save_api_key(data.api_key);
				config_manager.load_config_from_db();
				result = { success: true };
				break;
			case 'save_last_smart_prompt':
				config_manager.save_last_smart_prompt(data.prompt);
				result = {success: true};
				break;
			case 'save_file_tree_width':
				config_manager.save_file_tree_width(data.width);
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
			case 'identify_project_files':
				llm_manager.identify_project_files({
					project_path: data.project_path,
					all_files: data.all_files,
					llm_id: data.llm_id,
					temperature: parseFloat(data.temperature)
				});
				result = {success: true, message: 'Auto-select process started.'};
				break;
			case 'cancel_auto_select':
				result = llm_manager.cancel_auto_select();
				break;
			case 'get_relevant_files_from_prompt':
				result = await llm_manager.get_relevant_files_from_prompt({
					project_path: data.project_path,
					user_prompt: data.user_prompt,
					llm_id: data.llm_id,
					temperature: parseFloat(data.temperature)
				});
				break;
			case 'ask_question_about_code_stream':
				result = handle_stream_action((callbacks) => llm_manager.ask_question_about_code_stream({ ...data, ...callbacks }));
				break;
			case 'direct_prompt_stream':
				result = handle_stream_action((callbacks) => llm_manager.handle_direct_prompt_stream({ ...data, ...callbacks }));
				break;
			
			// --- Project Actions (from node-projects.js) ---
			case 'add_project':
				result = project_manager.add_project({path: data.path});
				break;
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
			case 'save_open_tabs':
				result = project_manager.save_open_tabs({
					project_path: data.project_path,
					open_tabs_json: data.open_tabs
				});
				break;
			case 'validate_and_save_settings':
				result = project_manager.validate_and_save_settings({
					project_path: data.project_path,
					content: data.content
				});
				break;
			
			// --- File Actions (from node-files.js) ---
			case 'get_folders':
				result = node_files.get_folders({
					input_path: data.path,
					project_path: data.project_path
				});
				break;
			case 'get_file_content':
				const file_path = data.path;
				const project_settings = get_project_settings(data.project_path);
				result = node_files.get_file_content(file_path, data.project_path);
				const compress_extensions = project_settings?.compress_extensions || [];
				if (result && result.content && compress_extensions.includes(path.extname(file_path).slice(1))) {
					result.content = result.content.replace(/\s+/g, ' ');
					result.content = result.content.split(/\r?\n/).filter(line => line.trim() !== '').join('\n');
				}
				break;
			case 'save_file_content':
				result = node_files.save_file_content({
					project_path: data.project_path,
					file_path: data.file_path,
					content: data.content
				});
				break;
			case 'get_file_for_editor':
				result = node_files.get_file_for_editor({
					project_path: data.project_path,
					file_path: data.path
				});
				break;
			case 'search_files':
				result = node_files.search_files({
					start_path: data.folder_path,
					search_term: data.search_term,
					project_path: data.project_path
				});
				break;
			case 'get_file_analysis':
				result = node_files.get_file_analysis({
					project_path: data.project_path,
					file_path: data.file_path
				});
				break;
			case 'check_for_modified_files':
				result = node_files.check_for_modified_files({project_path: data.project_path});
				break;
			case 'check_folder_updates':
				result = node_files.check_folder_updates({
					project_path: data.project_path
				});
				break;
			case 'create_file':
				result = node_files.create_file(data);
				break;
			case 'create_folder':
				result = node_files.create_folder(data);
				break;
			case 'rename_path':
				result = node_files.rename_path(data);
				break;
			case 'delete_path':
				result = node_files.delete_path(data);
				break;
			case 'git_reset_file':
				result = node_files.git_reset_file(data);
				break;
			default:
				throw new Error(`Unknown action: ${action}`);
		}
		return result;
	} catch (error) {
		console.error("Error processing IPC request:", error);
		throw error;
	}
});


// --- App Lifecycle ---
app.on('ready', () => {
	const server = http.createServer((req, res) => {
		try {
			let reqPath = req.url.toString().split('?')[0];
			if (reqPath === '/') {
				reqPath = '/index.html';
			}
			const filePath = path.join(__dirname, reqPath);
			
			if (!filePath.startsWith(__dirname)) {
				res.writeHead(403);
				res.end('Forbidden');
				return;
			}
			
			const extname = String(path.extname(filePath)).toLowerCase();
			const mimeTypes = {
				'.html': 'text/html',
				'.js': 'text/javascript',
				'.mjs': 'text/javascript',
				'.css': 'text/css',
				'.json': 'application/json',
				'.png': 'image/png',
				'.jpg': 'image/jpeg',
				'.gif': 'image/gif',
				'.svg': 'image/svg+xml',
				'.woff': 'font/woff',
				'.woff2': 'font/woff2',
				'.ttf': 'font/ttf',
				'.eot': 'application/vnd.ms-fontobject',
				'.otf': 'font/otf',
			};
			
			const contentType = mimeTypes[extname] || 'application/octet-stream';
			
			fs.readFile(filePath, (error, content) => {
				if (error) {
					if (error.code === 'ENOENT') {
						res.writeHead(404, {'Content-Type': 'text/html'});
						res.end('404: File Not Found', 'utf-8');
					} else {
						res.writeHead(500);
						res.end('Server Error: ' + error.code);
					}
				} else {
					res.writeHead(200, {'Content-Type': contentType});
					res.end(content, 'utf-8');
				}
			});
		} catch (error) {
			console.error('Error in HTTP server:', error);
			res.writeHead(500);
			res.end('Internal Server Error');
		}
	});
	
	server.listen(PORT, 'localhost', () => {
		console.log(`[Smart Code Prompts] Server running at http://localhost:${PORT}/`);
		createWindow();
	});
});

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
