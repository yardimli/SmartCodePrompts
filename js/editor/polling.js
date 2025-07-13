// js/editor/polling.js

/**
 * @file Handles polling for external file changes on disk.
 * Detects if an open file is modified or deleted outside the application.
 */

import { post_data } from '../utils.js';
import { get_current_project } from '../state.js';
import { show_confirm } from '../modal-confirm.js';
import * as state from './state.js';
import * as actions from './actions.js';
import { renderTabs } from './renderer.js';
import { updateSaveButtonState } from './ui.js';

let fileChangeWatcherInterval = null;

/**
 * Checks for files that have been modified on disk outside the editor and reloads them.
 */
async function checkForExternalFileChanges () {
	const project = get_current_project();
	if (!project) return;
	
	const openFileTabs = state.tabs.filter(t => t.filePath && t.lastMtime && !t.isShowingReloadConfirm);
	if (openFileTabs.length === 0) return;
	
	for (const tab of openFileTabs) {
		try {
			const result = await post_data({
				action: 'get_file_mtime',
				project_path: project.path,
				file_path: tab.filePath
			});
			
			if (result.exists === false) {
				tab.isShowingReloadConfirm = true;
				const confirmed = await show_confirm(`The file "${tab.title}" has been deleted from the disk. Do you want to close the tab?`, 'File Deleted');
				if (confirmed) {
					actions.closeTab(tab.id);
				} else {
					const deletedTab = state.findTab(tab.id);
					if (deletedTab) {
						deletedTab.lastMtime = null;
						deletedTab.isShowingReloadConfirm = false;
					}
				}
				continue;
			}
			
			if (result.mtimeMs && result.mtimeMs > tab.lastMtime) {
				tab.isShowingReloadConfirm = true;
				
				if (tab.isModified) {
					console.warn(`File "${tab.filePath}" was modified on disk and in the editor. Auto-reloading from disk and discarding editor changes.`);
				}
				
				const tabToUpdate = state.findTab(tab.id);
				if (!tabToUpdate) continue;
				
				try {
					const newData = await post_data({
						action: 'get_file_for_editor',
						project_path: project.path,
						path: tabToUpdate.filePath
					});
					
					const finalTab = state.findTab(tabToUpdate.id);
					if (finalTab && newData.currentContent !== null) {
						const currentViewState = (state.activeTabId === finalTab.id) ? state.editor.saveViewState() : finalTab.viewState;
						
						finalTab.model.setValue(newData.currentContent);
						finalTab.isModified = false;
						finalTab.lastMtime = newData.mtimeMs;
						
						if (state.activeTabId === finalTab.id) {
							state.editor.restoreViewState(currentViewState);
						} else {
							finalTab.viewState = currentViewState;
						}
						
						renderTabs();
						if (state.activeTabId === finalTab.id) {
							updateSaveButtonState();
						}
					}
				} catch (error) {
					const failedTab = state.findTab(tabToUpdate.id);
					if (failedTab) failedTab.lastMtime = null;
				} finally {
					const finalTab = state.findTab(tabToUpdate.id);
					if (finalTab) finalTab.isShowingReloadConfirm = false;
				}
			}
		} catch (error) {
			tab.lastMtime = null;
		}
	}
};

/**
 * Starts the file change watcher.
 */
export function startFileChangeWatcher () {
	if (fileChangeWatcherInterval) {
		clearInterval(fileChangeWatcherInterval);
	}
	fileChangeWatcherInterval = setInterval(checkForExternalFileChanges, 3000);
	console.log('File change watcher started.');
};

/**
 * Stops the file change watcher.
 */
export function stopFileChangeWatcher () {
	if (fileChangeWatcherInterval) {
		clearInterval(fileChangeWatcherInterval);
		fileChangeWatcherInterval = null;
		console.log('File change watcher stopped.');
	}
};
