// electron-preload.js
const { contextBridge, ipcRenderer } = require('electron');

// Expose a safe, limited API to the renderer process (e.g., js/main.js)
// This avoids exposing the full 'ipcRenderer' object.
contextBridge.exposeInMainWorld('electronAPI', {
	/**
	 * Invokes the main process to show a native "Open Directory" dialog.
	 * @returns {Promise<string|null>} A promise that resolves with the selected directory path, or null if canceled.
	 */
	openDirectoryDialog: () => ipcRenderer.invoke('dialog:openDirectory')
});
