// js/editor/actions.js

/**
 * @file Contains functions that perform actions on editor tabs,
 * such as opening, closing, switching, and modifying content.
 * This module orchestrates state changes, I/O, and rendering.
 */

import { show_confirm } from '../modal-confirm.js';
import { get_current_project } from '../state.js';
import * as state from './state.js';
import * as io from './io.js';
import { renderTabs } from './renderer.js';
import { updateSaveButtonState } from './ui.js';
import { getLanguageForFile } from './main.js';

/**
 * Switches the active editor view to the specified tab.
 * @param {string} tabId - The ID of the tab to switch to.
 */
export function switchToTab (tabId) {
	if (tabId === state.activeTabId || !state.editor) return;
	
	const editorContainer = document.getElementById('monaco-editor-container');
	const resetSettingsBtn = document.getElementById('reset-settings-btn');
	
	const oldTab = state.findTab(state.activeTabId);
	if (oldTab) {
		oldTab.viewState = state.editor.saveViewState();
	}
	
	const newTab = state.findTab(tabId);
	if (newTab) {
		state.setActiveTabId(tabId);
		
		const mruIndex = state.mruTabIds.indexOf(tabId);
		if (mruIndex > -1) {
			state.mruTabIds.splice(mruIndex, 1);
		}
		state.mruTabIds.unshift(tabId);
		
		if (window.electronAPI?.updateWindowTitle) {
			const project = get_current_project();
			const titleParts = ['Smart Code Prompts'];
			titleParts.push(newTab.filePath || newTab.title);
			if (project) {
				titleParts.push(project.path.split(/[\\/]/).pop());
			}
			window.electronAPI.updateWindowTitle(titleParts.join(' - '));
		}
		
		if (resetSettingsBtn) {
			resetSettingsBtn.classList.toggle('hidden', newTab.filePath !== '.scp/settings.yaml');
		}
		
		editorContainer.style.display = 'block';
		state.editor.setModel(newTab.model);
		if (newTab.viewState) {
			state.editor.restoreViewState(newTab.viewState);
		}
		state.editor.focus();
		
		renderTabs();
		
		const activeTabEl = document.querySelector(`.editor-tab[data-tab-id="${tabId}"]`);
		if (activeTabEl) {
			activeTabEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
		}
		updateSaveButtonState();
	}
};

/**
 * Closes a specific tab.
 * @param {string} tabId - The ID of the tab to close.
 */
export function closeTab (tabId) {
	const tabIndex = state.tabs.findIndex(t => t.id === tabId);
	if (tabIndex === -1) return;
	
	const tabToClose = state.tabs[tabIndex];
	if (!tabToClose.isCloseable) return;
	
	const mruIndex = state.mruTabIds.indexOf(tabId);
	if (mruIndex > -1) {
		state.mruTabIds.splice(mruIndex, 1);
	}
	
	tabToClose.model.dispose();
	if (tabToClose.originalModel) tabToClose.originalModel.dispose();
	state.tabs.splice(tabIndex, 1);
	
	if (state.activeTabId === tabId) {
		const newActiveTabId = state.mruTabIds[0] || (state.tabs.length > 0 ? state.tabs[0].id : null);
		if (newActiveTabId) {
			switchToTab(newActiveTabId);
		} else {
			state.setActiveTabId(null);
			state.editor.setModel(null);
			document.getElementById('monaco-editor-container').style.display = 'block';
			document.getElementById('reset-settings-btn').classList.add('hidden');
			updateSaveButtonState();
		}
	}
	
	renderTabs();
	io.save_open_tabs_state();
};

/**
 * Closes all tabs except for the one specified.
 * @param {string} keepOpenTabId - The ID of the tab to keep open.
 */
export async function closeOtherTabs (keepOpenTabId) {
	const tabsToClose = state.tabs.filter(tab => tab.id !== keepOpenTabId && tab.isCloseable);
	
	for (const tab of tabsToClose) {
		if (tab.isModified) {
			const confirmed = await show_confirm(`The file "${tab.title}" has unsaved changes. Do you want to close it anyway?`, 'Unsaved Changes');
			if (!confirmed) continue;
		}
		const tabIndex = state.tabs.findIndex(t => t.id === tab.id);
		if (tabIndex > -1) {
			const tabToRemove = state.tabs[tabIndex];
			tabToRemove.model.dispose();
			if (tabToRemove.originalModel) tabToRemove.originalModel.dispose();
			state.tabs.splice(tabIndex, 1);
		}
	}
	
	if (state.activeTabId !== keepOpenTabId && state.findTab(keepOpenTabId)) {
		switchToTab(keepOpenTabId);
	}
	
	renderTabs();
	io.save_open_tabs_state();
};

/**
 * Closes all savable tabs.
 */
export async function closeAllTabs () {
	const tabsToClose = state.tabs.filter(tab => tab.isCloseable);
	
	for (const tab of tabsToClose) {
		if (tab.isModified) {
			const confirmed = await show_confirm(`The file "${tab.title}" has unsaved changes. Do you want to close it anyway?`, 'Unsaved Changes');
			if (!confirmed) continue;
		}
		const tabIndex = state.tabs.findIndex(t => t.id === tab.id);
		if (tabIndex > -1) {
			const tabToRemove = state.tabs[tabIndex];
			tabToRemove.model.dispose();
			if (tabToRemove.originalModel) tabToRemove.originalModel.dispose();
			state.tabs.splice(tabIndex, 1);
			
			const mruIndex = state.mruTabIds.indexOf(tab.id);
			if (mruIndex > -1) state.mruTabIds.splice(mruIndex, 1);
		}
	}
	
	const newActiveTab = state.tabs.find(tab => !tab.isCloseable) || state.tabs[0];
	if (newActiveTab) {
		switchToTab(newActiveTab.id);
	} else {
		state.setActiveTabId(null);
		state.editor.setModel(null);
		document.getElementById('monaco-editor-container').style.display = 'block';
		updateSaveButtonState();
	}
	
	renderTabs();
	io.save_open_tabs_state();
};

/**
 * Closes all tabs that have no unsaved changes.
 */
export function closeUnmodifiedTabs () {
	const tabsToClose = state.tabs.filter(tab => !tab.isModified && !tab.isGitModified && tab.isCloseable);
	let activeTabWasClosed = false;
	
	for (const tab of tabsToClose) {
		if (tab.id === state.activeTabId) activeTabWasClosed = true;
		const tabIndex = state.tabs.findIndex(t => t.id === tab.id);
		if (tabIndex > -1) {
			const tabToRemove = state.tabs[tabIndex];
			tabToRemove.model.dispose();
			if (tabToRemove.originalModel) tabToRemove.originalModel.dispose();
			state.tabs.splice(tabIndex, 1);
		}
	}
	
	if (activeTabWasClosed) {
		const newActiveTab = state.tabs[0];
		if (newActiveTab) {
			switchToTab(newActiveTab.id);
		} else {
			state.setActiveTabId(null);
			state.editor.setModel(null);
			document.getElementById('monaco-editor-container').style.display = 'block';
			updateSaveButtonState();
		}
	}
	
	renderTabs();
	io.save_open_tabs_state();
};

/**
 * Creates a new tab in the editor.
 * @returns {string|null} The ID of the newly created tab.
 */
export function createNewTab (title, content, language = 'plaintext', isCloseable = true, filePath = null) {
	if (!window.monaco || !state.editor) return null;
	
	state.incrementTabCounter();
	const newTabId = `tab-${Date.now()}-${state.tabCounter}`;
	const newModel = monaco.editor.createModel(content, language);
	
	const newTab = {
		id: newTabId,
		title: title,
		model: newModel,
		originalModel: null,
		isCloseable: isCloseable,
		language: language,
		viewState: null,
		filePath: filePath,
		isModified: false,
		isGitModified: false
	};
	
	state.tabs.push(newTab);
	switchToTab(newTabId);
	return newTabId;
};

/**
 * Opens a file from the file tree in a new editor tab.
 */
export function openFileInTab (filePath, currentContent, originalContent, isGitModified = false, mtimeMs = null) {
	if (!window.monaco || !state.editor) return;
	
	const existingTab = state.tabs.find(t => t.filePath === filePath);
	if (existingTab) {
		if (isGitModified !== undefined) existingTab.isGitModified = isGitModified;
		if (mtimeMs !== null) existingTab.lastMtime = mtimeMs;
		switchToTab(existingTab.id);
		return;
	}
	
	const title = filePath === '.scp/settings.yaml' ? 'Project Settings' : filePath.split('/').pop();
	const language = getLanguageForFile(filePath);
	
	state.incrementTabCounter();
	const newTabId = `tab-${Date.now()}-${state.tabCounter}`;
	const modifiedModel = monaco.editor.createModel(currentContent, language);
	
	const newTab = {
		id: newTabId,
		title: title,
		model: modifiedModel,
		originalModel: null,
		isCloseable: true,
		language: language,
		viewState: null,
		filePath: filePath,
		isModified: false,
		isGitModified: isGitModified,
		lastMtime: mtimeMs,
		isShowingReloadConfirm: false
	};
	
	newTab.model.onDidChangeContent(() => {
		const tabInArray = state.findTab(newTab.id);
		if (tabInArray && !tabInArray.isModified) {
			tabInArray.isModified = true;
			renderTabs();
			updateSaveButtonState();
		}
	});
	
	state.tabs.push(newTab);
	switchToTab(newTabId);
	io.save_open_tabs_state();
};

/**
 * Updates the Git modification status of an open tab.
 */
export function updateTabGitStatus (filePath, isGitModified) {
	const tab = state.tabs.find(t => t.filePath === filePath);
	if (tab) {
		tab.isGitModified = isGitModified;
	}
};

/**
 * Appends text to the end of a tab's content.
 */
export function appendToTabContent (tabId, text) {
	const tab = state.findTab(tabId);
	if (!tab) return;
	
	const model = tab.model;
	const lastLine = model.getLineCount();
	const lastColumn = model.getLineMaxColumn(lastLine);
	const range = new monaco.Range(lastLine, lastColumn, lastLine, lastColumn);
	model.applyEdits([{ range: range, text: text, forceMoveMarkers: true }]);
};

/**
 * Overwrites the entire content of a tab.
 */
export function setTabContent (tabId, content) {
	const tab = state.findTab(tabId);
	if (tab) {
		tab.model.setValue(content);
	}
};
