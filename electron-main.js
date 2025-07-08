const {app, BrowserWindow, Menu, MenuItem, ipcMain, dialog} = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const http = require('http'); // NEW: Import the Node.js http module.

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
const PORT = 31987; // NEW: Define a port for the local server. A non-standard port is chosen to avoid conflicts.

config_manager.initialize_database_and_config();

function createWindow () {
	mainWindow = new BrowserWindow({
		width: 1600,
		height: 1000,
		icon: path.join(__dirname, 'assets/icon.png'),
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
	
	// MODIFIED: Load the URL from the local HTTP server instead of the custom protocol.
	mainWindow.loadURL(`http://localhost:${PORT}`);
	
	// Create context menu
	mainWindow.webContents.on('context-menu', (event, params) => {
		const menu = new Menu();
		
		// Add each spelling suggestion
		for (const suggestion of params.dictionarySuggestions) {
			menu.append(new MenuItem({
				label: suggestion,
				click: () => mainWindow.webContents.replaceMisspelling(suggestion)
			}));
		}
		
		// Allow users to add the misspelled word to the dictionary
		if (params.misspelledWord) {
			menu.append(
				new MenuItem({
					label: 'Add to dictionary',
					click: () => mainWindow.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord)
				})
			);
		}
		
		// Add standard editor actions
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
		// A helper function for streaming actions
		const handle_stream_action = (action_handler) => {
			const streamId = crypto.randomUUID();
			// Don't await this; let it run in the background.
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
			// Immediately return the streamId to the renderer.
			return {success: true, streamId};
		};
		
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
			case 'identify_project_files':
				// This is a fire-and-forget call that starts a background task.
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
			case 'ask_question_about_code_stream': // MODIFIED: Streaming action
				result = handle_stream_action(llm_manager.ask_question_about_code_stream);
				break;
			case 'direct_prompt_stream': // MODIFIED: Streaming action
				result = handle_stream_action(llm_manager.handle_direct_prompt_stream);
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
app.on('ready', () => {
	const server = http.createServer((req, res) => {
		try {
			// Sanitize and resolve the file path.
			let reqPath = req.url.toString().split('?')[0];
			if (reqPath === '/') {
				reqPath = '/index.html';
			}
			const filePath = path.join(__dirname, reqPath);
			
			// Basic security: prevent directory traversal attacks.
			if (!filePath.startsWith(__dirname)) {
				res.writeHead(403);
				res.end('Forbidden');
				return;
			}
			
			const extname = String(path.extname(filePath)).toLowerCase();
			const mimeTypes = {
				'.html': 'text/html',
				'.js': 'text/javascript',
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
	
	// Start the server and then create the main window.
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
