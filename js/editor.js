// SmartCodePrompts/js/editor.js

let editor = null;
let tabs = []; // Array of { id, title, model, isCloseable, language, viewState }
let activeTabId = null;
let tabCounter = 0;

// Helper function to render the tab UI
function renderTabs() {
	const tabsContainer = document.getElementById('editor-tabs');
	if (!tabsContainer) return;
	
	tabsContainer.innerHTML = ''; // Clear existing tabs
	
	tabs.forEach(tab => {
		const tabEl = document.createElement('div');
		tabEl.className = 'editor-tab';
		tabEl.dataset.tabId = tab.id;
		if (tab.id === activeTabId) {
			tabEl.classList.add('active');
		}
		
		const titleEl = document.createElement('span');
		titleEl.textContent = tab.title;
		tabEl.appendChild(titleEl);
		
		if (tab.isCloseable) {
			const closeBtn = document.createElement('i');
			closeBtn.className = 'bi bi-x close-tab-btn';
			closeBtn.title = 'Close Tab';
			closeBtn.onclick = (e) => {
				e.stopPropagation(); // Prevent tab switch when clicking close
				closeTab(tab.id);
			};
			tabEl.appendChild(closeBtn);
		}
		
		tabEl.onclick = () => {
			switchToTab(tab.id);
		};
		
		tabsContainer.appendChild(tabEl);
	});
}

// Helper to find a tab by its ID
function findTab(tabId) {
	return tabs.find(t => t.id === tabId);
}

/**
 * Switches the editor to show the content of a specific tab.
 * @param {string} tabId - The ID of the tab to switch to.
 */
export function switchToTab(tabId) {
	if (!editor || tabId === activeTabId) return;
	
	// Save view state of the old tab
	const oldTab = findTab(activeTabId);
	if (oldTab) {
		oldTab.viewState = editor.saveViewState();
	}
	
	// Switch to the new tab
	const newTab = findTab(tabId);
	if (newTab) {
		activeTabId = tabId;
		editor.setModel(newTab.model);
		editor.restoreViewState(newTab.viewState);
		editor.focus();
		renderTabs();
	}
}

/**
 * Closes a tab.
 * @param {string} tabId - The ID of the tab to close.
 */
export function closeTab(tabId) {
	const tabIndex = tabs.findIndex(t => t.id === tabId);
	if (tabIndex === -1) return;
	
	const tabToClose = tabs[tabIndex];
	if (!tabToClose.isCloseable) return;
	
	// Dispose of the model to free up memory
	tabToClose.model.dispose();
	tabs.splice(tabIndex, 1);
	
	// If the closed tab was the active one, switch to another tab
	if (activeTabId === tabId) {
		// Switch to the previous tab, or the next one if it was the first
		const newActiveTab = tabs[tabIndex - 1] || tabs[0];
		if (newActiveTab) {
			switchToTab(newActiveTab.id);
		} else {
			// No tabs left, should not happen if prompt tab is not closeable
			activeTabId = null;
			editor.setModel(null);
		}
	}
	
	renderTabs();
}

/**
 * Creates a new tab in the editor.
 * @param {string} title - The title for the new tab.
 * @param {string} content - The initial content for the tab.
 * @param {string} language - The language for syntax highlighting.
 * @param {boolean} isCloseable - Whether the tab can be closed by the user.
 * @returns {string} The ID of the newly created tab.
 */
export function createNewTab(title, content, language = 'plaintext', isCloseable = true) {
	if (!monaco || !editor) return null;
	
	tabCounter++;
	const newTabId = `tab-${Date.now()}-${tabCounter}`;
	const newModel = monaco.editor.createModel(content, language);
	
	const newTab = {
		id: newTabId,
		title: title,
		model: newModel,
		isCloseable: isCloseable,
		language: language,
		viewState: null // Will be populated when switching away
	};
	
	tabs.push(newTab);
	switchToTab(newTabId); // This will also render the tabs
	return newTabId;
}

/**
 * Appends content to a specific tab.
 * @param {string} tabId - The ID of the tab to append to.
 * @param {string} text - The text to append.
 */
export function appendToTabContent(tabId, text) {
	const tab = findTab(tabId);
	if (!tab) return;
	
	const model = tab.model;
	const lastLine = model.getLineCount();
	const lastColumn = model.getLineMaxColumn(lastLine);
	const range = new monaco.Range(lastLine, lastColumn, lastLine, lastColumn);
	
	model.applyEdits([{ range: range, text: text, forceMoveMarkers: true }]);
}

/**
 * Sets the entire content of a specific tab.
 * @param {string} tabId - The ID of the tab to set content for.
 * @param {string} content - The new content.
 */
export function setTabContent(tabId, content) {
	const tab = findTab(tabId);
	if (tab) {
		tab.model.setValue(content);
	}
}

/**
 * Initializes the Monaco Editor and the tab system.
 * @param {boolean} is_dark_mode - Whether to initialize in dark mode.
 * @returns {Promise<void>} A promise that resolves when the editor is initialized.
 */
export function initialize_editor(is_dark_mode) {
	return new Promise((resolve) => {
		require(['vs/editor/editor.main'], () => {
			const editor_container = document.getElementById('monaco-editor-container');
			if (!editor_container) {
				console.error('Monaco editor container not found!');
				resolve();
				return;
			}
			
			editor = monaco.editor.create(editor_container, {
				// Initial value is irrelevant as we'll set a model immediately
				language: 'plaintext',
				theme: is_dark_mode ? 'vs-dark' : 'vs',
				readOnly: false,
				wordWrap: 'on',
				fontFamily: 'monospace',
				fontSize: 13,
				minimap: { enabled: true },
				automaticLayout: true,
				scrollBeyondLastLine: false,
				contextmenu: true,
			});
			
			// Create the initial, non-closeable "Prompt" tab
			createNewTab(
				'Prompt',
				'// Select files from the left to build a prompt.',
				'plaintext',
				false
			);
			
			console.log('Monaco editor with tabs initialized.');
			resolve();
		});
	});
}

/**
 * Sets the content of the currently active Monaco Editor tab.
 * @param {string} content - The new content to display.
 */
export function set_editor_content(content) {
	if (editor && activeTabId) {
		setTabContent(activeTabId, content);
	}
}

/**
 * Gets the current content from the currently active Monaco Editor tab.
 * @returns {string} The active tab's content.
 */
export function get_editor_content() {
	const activeTab = findTab(activeTabId);
	if (activeTab) {
		return activeTab.model.getValue();
	}
	return '';
}

/**
 * Toggles the theme of the Monaco Editor.
 * @param {boolean} is_dark_mode - True for dark mode, false for light mode.
 */
export function set_editor_theme(is_dark_mode) {
	if (editor) {
		monaco.editor.setTheme(is_dark_mode ? 'vs-dark' : 'vs');
	}
}

/**
 * Highlights search matches in the active editor tab.
 * @param {Array<object>} matches - An array of match objects, e.g., [{start, end}, ...].
 * @param {number} current_index - The index of the currently selected match.
 */
export function highlight_search_matches(matches, current_index) {
	if (!editor) return;
	
	const model = editor.getModel(); // Gets the active model
	if (!model) return;
	
	const decorations = matches.map((match, index) => {
		const start_pos = model.getPositionAt(match.start);
		const end_pos = model.getPositionAt(match.end);
		const range = new monaco.Range(start_pos.lineNumber, start_pos.column, end_pos.lineNumber, end_pos.column);
		const is_current = index === current_index;
		return {
			range: range,
			options: {
				className: is_current ? 'current-search-match' : 'search-match',
				inlineClassName: is_current ? 'current-search-match' : 'search-match',
				stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
			}
		};
	});
	
	editor.deltaDecorations([], decorations);
	
	if (current_index >= 0 && current_index < matches.length) {
		const current_match_decoration = decorations[current_index];
		if (current_match_decoration) {
			editor.revealRangeInCenter(current_match_decoration.range, monaco.editor.ScrollType.Smooth);
		}
	}
}

/**
 * Clears all search-related highlights from the active editor tab.
 */
export function clear_search_highlights() {
	if (editor) {
		// This assumes we don't have other decorations. If we did, we'd need an ownerId.
		editor.deltaDecorations([], []);
	}
}
