// js/editor/io.js

/**
 * @file Manages file input/output and state persistence for the editor.
 * This includes saving tab content and the list of open tabs.
 */

import { post_data } from '../utils.js';
import { get_current_project } from '../state.js';
import { show_alert } from '../modal-alert.js';
import { update_project_settings } from '../settings.js';
import * as state from './state.js';
import { renderTabs } from './renderer.js';
import { updateSaveButtonState } from './ui.js';

/**
 * Saves the content of a specific tab to the filesystem.
 * @param {string} tabId - The ID of the tab to save.
 */
export async function saveTabContent (tabId) {
	const tab = state.findTab(tabId);
	if (!tab || !tab.filePath || !tab.isModified) return;
	
	const project = get_current_project();
	if (!project) {
		console.error('Cannot save file: No project selected.');
		return;
	}
	
	const content = tab.model.getValue();
	
	if (tab.filePath === '.scp/settings.yaml') {
		try {
			const result = await post_data({
				action: 'validate_and_save_settings',
				project_path: project.path,
				content: content
			});
			
			if (result.success) {
				tab.isModified = false;
				if (result.mtimeMs) {
					tab.lastMtime = result.mtimeMs;
				}
				await update_project_settings(content);
				renderTabs();
				updateSaveButtonState();
				show_alert('Project settings saved and reloaded successfully.', 'Settings Saved');
			} else {
				show_alert(result.error, 'Settings Validation Error');
			}
		} catch (error) {
			show_alert(`An error occurred while saving settings: ${error.message}`, 'Error');
		}
		return;
	}
	
	try {
		const result = await post_data({
			action: 'save_file_content',
			project_path: project.path,
			file_path: tab.filePath,
			content: content
		});
		
		if (result.success) {
			tab.isModified = false;
			if (result.mtimeMs) {
				tab.lastMtime = result.mtimeMs;
			}
			renderTabs();
			updateSaveButtonState();
		} else {
			throw new Error(result.message || 'Unknown save error');
		}
	} catch (error) {
		show_alert(`Failed to save ${tab.filePath}: ${error.message}`, 'Save Error');
	}
};

/**
 * Saves all currently modified and savable tabs.
 */
export function saveAllModifiedTabs () {
	const modifiedTabs = state.tabs.filter(tab => tab.isModified && tab.filePath && tab.filePath !== '.scp/settings.yaml');
	
	if (modifiedTabs.length > 0) {
		const savePromises = modifiedTabs.map(tab => saveTabContent(tab.id));
		Promise.all(savePromises).catch(err => {
			console.error('An error occurred while saving all modified files:', err);
		});
	}
};

/**
 * Persists the list of currently open file tabs to the backend.
 */
export function save_open_tabs_state () {
	const project = get_current_project();
	if (!project) return;
	
	const open_file_tabs = state.getTabs()
		.map(tab => tab.filePath)
		.filter(filePath => filePath !== null);
	
	post_data({
		action: 'save_open_tabs',
		project_path: project.path,
		open_tabs: JSON.stringify(open_file_tabs)
	}).catch(error => {
		console.error('Failed to save open tabs state:', error);
	});
};
