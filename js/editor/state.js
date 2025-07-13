// js/editor/state.js

/**
 * @file Manages the state of the editor, including all open tabs,
 * the active tab, and the editor instance. This module acts as the
 * single source of truth for editor-related state.
 */

export let editor = null;
export let tabs = []; // { id, title, model, ..., lastMtime, isShowingReloadConfirm }
export let mruTabIds = []; // Tracks Most Recently Used tab IDs.
export let activeTabId = null;
export let tabCounter = 0;
export let contextMenuTargetTabId = null;

// --- State Modifiers ---

export function setEditor (newEditor) {
	editor = newEditor;
};

export function setActiveTabId (newActiveTabId) {
	activeTabId = newActiveTabId;
};

export function incrementTabCounter () {
	tabCounter++;
};

export function setContextMenuTargetTabId (newTabId) {
	contextMenuTargetTabId = newTabId;
};

// --- State Queriers ---

export function findTab (tabId) {
	return tabs.find(t => t.id === tabId);
};

export function getTabs () {
	return [...tabs];
};

export function getMruTabs () {
	return mruTabIds.map(id => findTab(id)).filter(tab => !!tab);
};

export function getActiveTabId () {
	return activeTabId;
};

export function getPromptTabId () {
	const promptTab = tabs.find(t => t.title === 'Prompt' && t.isCloseable === false);
	return promptTab ? promptTab.id : null;
};

/**
 * Prepares the list of open tabs for serialization.
 * It captures the current view state of the active tab before creating the list.
 * @returns {Array<object>} A serializable array of tab data.
 */
export function getSerializableTabs () {
	// If there's an active editor and tab, save its current view state.
	if (editor && activeTabId) {
		const activeTab = findTab(activeTabId);
		if (activeTab) {
			activeTab.viewState = editor.saveViewState();
		}
	}
	
	// Return only tabs that have a file path, with their filePath and viewState.
	return tabs
		.filter(tab => tab.filePath)
		.map(tab => ({
			filePath: tab.filePath,
			viewState: tab.viewState
		}));
};