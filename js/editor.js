// js/editor.js

/**
 * @file This file serves as the public API for the editor module.
 * It aggregates and exports functions from its constituent sub-modules,
 * providing a single, stable interface for other parts of the application.
 * This approach encapsulates the internal structure of the editor logic.
 */

// MODIFIED: This file now acts as a public facade for the refactored editor module.
import {
	initialize_editor,
	set_editor_theme,
	get_editor_content,
	set_editor_content,
	highlight_search_matches,
	clear_search_highlights
} from './editor/main.js';
import {
	switchToTab,
	closeTab,
	closeAllTabs,
	createNewTab,
	openFileInTab,
	updateTabGitStatus,
	appendToTabContent,
	setTabContent
} from './editor/actions.js';
import {
	getTabs,
	getMruTabs,
	getActiveTabId,
	getPromptTabId
} from './editor/state.js';
import {
	saveTabContent,
	saveAllModifiedTabs
} from './editor/io.js';
import { updateSaveButtonState } from './editor/ui.js';

// Re-export all the necessary functions to be used by other modules.
export {
	// Initialization and Core Control
	initialize_editor,
	set_editor_theme,
	get_editor_content,
	set_editor_content,
	
	// Tab Actions
	switchToTab,
	closeTab,
	closeAllTabs,
	createNewTab,
	openFileInTab,
	updateTabGitStatus,
	appendToTabContent,
	setTabContent,
	
	// State Getters
	getTabs,
	getMruTabs,
	getActiveTabId,
	getPromptTabId,
	
	// I/O Actions
	saveTabContent,
	saveAllModifiedTabs,
	
	// UI Helpers
	updateSaveButtonState,
	
	// Search Highlighting
	highlight_search_matches,
	clear_search_highlights
};
