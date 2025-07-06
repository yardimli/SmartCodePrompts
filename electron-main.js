// electron-main.js
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { fork } = require('child_process');
const fs = require('fs');
const Database = require('better-sqlite3');

let mainWindow;
let serverProcess;

// --- Get App Config ---
// We need to read the server port from the database *before* starting the server.
// This is necessary to know which URL to load in the BrowserWindow.
const appDataPath = app.getPath('userData');
const dbPath = path.join(appDataPath, 'smart_code.sqlite');

function getServerPort() {
	// If the DB doesn't exist yet, we must use the default port.
	if (!fs.existsSync(dbPath)) {
		return 3000; // Default port
	}
	try {
		// Open the database in read-only mode to fetch the port.
		const db = new Database(dbPath, { readonly: true });
		const row = db.prepare('SELECT value FROM app_setup WHERE key = ?').get('server_port');
		db.close();
		return row ? parseInt(row.value, 10) : 3000;
	} catch (e) {
		console.error("Could not read port from database, using default 3000.", e);
		return 3000;
	}
}

function createWindow() {
	const port = getServerPort();
	
	// Fork the Node.js server process. This keeps the web server logic separate.
	serverProcess = fork(path.join(__dirname, 'node-server.js'), [], {
		// Pass environment variables to the child process to signal it's running under Electron
		// and to provide the correct path for user data storage.
		env: {
			...process.env, // Inherit parent environment
			ELECTRON_RUN: 'true',
			APP_DATA_PATH: appDataPath
		}
	});
	
	serverProcess.on('error', (err) => {
		console.error('Server process failed to start or crashed:', err);
		dialog.showErrorBox('Server Error', 'The backend server process failed. The application cannot continue.');
		app.quit();
	});
	
	// Create the browser window.
	mainWindow = new BrowserWindow({
		width: 1600,
		height: 1000,
		title: "Smart Code Prompts - Studio",
		webPreferences: {
			// Attach the preload script to the renderer process
			preload: path.join(__dirname, 'electron-preload.js'),
			// Security best practices:
			contextIsolation: true,
			nodeIntegration: false,
		}
	});
	
	// Load the app from the local server. We'll retry a few times in case the server is slow to start.
	const loadUrl = () => {
		mainWindow.loadURL(`http://localhost:${port}`).catch(err => {
			console.log("Failed to load URL, retrying in 200ms...", err.message);
			setTimeout(loadUrl, 200);
		});
	};
	loadUrl();
	
	mainWindow.on('closed', () => {
		mainWindow = null;
	});
}

// --- IPC Handlers ---
// Handle request from the renderer process to open a native directory selection dialog.
ipcMain.handle('dialog:openDirectory', async () => {
	const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
		properties: ['openDirectory'],
		title: 'Select a Project Folder'
	});
	if (!canceled && filePaths.length > 0) {
		return filePaths[0];
	}
	return null;
});


// --- App Lifecycle ---
app.on('ready', createWindow);

app.on('window-all-closed', () => {
	// On macOS, it's common for applications to stay active until the user quits explicitly.
	if (process.platform !== 'darwin') {
		app.quit();
	}
});

app.on('activate', () => {
	// On macOS, re-create a window when the dock icon is clicked and there are no other windows open.
	if (mainWindow === null) {
		createWindow();
	}
});

// Make sure to kill the server process when the Electron app quits.
app.on('will-quit', () => {
	if (serverProcess) {
		console.log('Killing server process...');
		serverProcess.kill();
		serverProcess = null;
	}
});
