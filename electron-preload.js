// electron-preload.js
const {contextBridge, ipcRenderer} = require('electron');

// Expose a safe, limited API to the renderer process (e.g., js/main.js)
// This avoids exposing the full 'ipcRenderer' object.
contextBridge.exposeInMainWorld('electronAPI', {
	/**
	 * Invokes the main process to show a native "Open Directory" dialog.
	 * @returns {Promise<string|null>} A promise that resolves with the selected directory path, or null if canceled.
	 */
	openDirectoryDialog: () => ipcRenderer.invoke('dialog:openDirectory'),
	
	/**
	 * A generic function to send data to the main process and get a response.
	 * This replaces all HTTP POST requests.
	 * @param {object} data - The data payload, must include an 'action' property.
	 * @returns {Promise<any>} A promise that resolves with the result from the main process.
	 */
	postData: (data) => ipcRenderer.invoke('post-data', data)
});
