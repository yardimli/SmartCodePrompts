// js/editor/ui.js

/**
 * @file Contains miscellaneous UI helper functions for the editor.
 */

import * as state from './state.js';

/**
 * Enables or disables the global 'Save' button based on the active tab's modified state.
 */
export function updateSaveButtonState () {
	const saveBtn = document.getElementById('save-active-file-btn');
	if (!saveBtn) return;
	
	const activeTab = state.findTab(state.activeTabId);
	const shouldBeEnabled = activeTab && activeTab.isModified;
	
	saveBtn.disabled = !shouldBeEnabled;
};
