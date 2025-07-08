// SmartCodePrompts/js/editor.js

import { post_data } from './utils.js';
import { get_current_project } from './state.js';

let editor = null;
let diffEditor = null; // NEW: For side-by-side diff view
// MODIFIED: Added isModified property. Removed debounceTimer.
let tabs = []; // Array of { id, title, model, originalModel, isDiff, isCloseable, language, viewState, readOnly, filePath, isModified }
let activeTabId = null;
let tabCounter = 0;

/**
 * NEW: A utility function to update the state of the global "Save" button.
 * It enables the button only if the active tab is a modified, editable file.
 */
export function updateSaveButtonState() {
	const saveBtn = document.getElementById('save-active-file-btn');
	if (!saveBtn) return;
	
	const activeTab = findTab(activeTabId);
	const shouldBeEnabled = activeTab && activeTab.isModified && !activeTab.readOnly && !activeTab.isDiff;
	
	saveBtn.disabled = !shouldBeEnabled;
}

/**
 * NEW: Saves all tabs that are currently marked as modified.
 * Intended for use when the application loses focus.
 */
export function saveAllModifiedTabs() {
	console.log('Attempting to save all modified files on blur...');
	const modifiedTabs = tabs.filter(tab => tab.isModified && !tab.readOnly && tab.filePath);
	
	if (modifiedTabs.length > 0) {
		const savePromises = modifiedTabs.map(tab => saveTabContent(tab.id));
		Promise.all(savePromises).then(() => {
			console.log(`${modifiedTabs.length} modified file(s) were saved.`);
		}).catch(err => {
			console.error('An error occurred while saving all modified files:', err);
		});
	}
}


/**
 * NEW: Saves the current list of open file tabs to the server for the current project.
 * Moved from state.js to avoid circular dependency.
 */
function save_open_tabs_state() {
	const project = get_current_project();
	if (!project) return;
	
	// Get all tabs that have a filePath (i.e., are actual files)
	const open_file_tabs = getTabs()
		.map(tab => tab.filePath)
		.filter(filePath => filePath !== null);
	
	post_data({
		action: 'save_open_tabs',
		project_path: project.path,
		open_tabs: JSON.stringify(open_file_tabs)
	}).catch(error => {
		console.error('Failed to save open tabs state:', error);
	});
}

/**
 * MODIFIED: Saves a tab's content to the filesystem. Now async and updates modification state.
 * @param {string} tabId The ID of the tab to save.
 */
export async function saveTabContent(tabId) {
	const tab = findTab(tabId);
	// Don't save if it's not a file, is read-only, is a diff view, or isn't modified
	if (!tab || !tab.filePath || tab.readOnly || tab.isDiff || !tab.isModified) {
		return;
	}
	
	const project = get_current_project();
	if (!project) {
		console.error("Cannot save file: No project selected.");
		return;
	}
	
	const content = tab.model.getValue();
	console.log(`Saving ${tab.filePath}...`);
	
	try {
		await post_data({
			action: 'save_file_content',
			project_path: project.path,
			file_path: tab.filePath,
			content: content
		});
		// On successful save, update the tab's state and the UI
		tab.isModified = false;
		renderTabs();
		updateSaveButtonState();
		console.log(`${tab.filePath} saved successfully.`);
	} catch (error) {
		console.error(`Failed to save ${tab.filePath}:`, error);
		// TODO: Show an error to the user in the UI
	}
}


// NEW: Helper to get the currently active Monaco editor instance (either the standard one or the modified pane of the diff editor).
function getActiveMonacoEditorInstance() {
	if (!activeTabId) return null;
	const tab = findTab(activeTabId);
	if (!tab) return null;
	
	if (tab.isDiff) {
		return diffEditor ? diffEditor.getModifiedEditor() : null;
	} else {
		return editor;
	}
}

// Helper to get language from filename for Monaco
function getLanguageForFile(filename) {
	if (!window.monaco) return 'plaintext';
	const extension = '.' + filename.split('.').pop();
	const languages = monaco.languages.getLanguages();
	const lang = languages.find(l => l.extensions && l.extensions.includes(extension));
	return lang ? lang.id : 'plaintext';
}

// Helper function to render the tab UI
function renderTabs() {
	const tabsContainer = document.getElementById('editor-tabs');
	if (!tabsContainer) return;
	
	tabsContainer.innerHTML = '';
	
	tabs.forEach(tab => {
		const tabEl = document.createElement('div');
		tabEl.className = 'editor-tab';
		tabEl.dataset.tabId = tab.id;
		if (tab.id === activeTabId) {
			tabEl.classList.add('active');
		}
		
		const titleEl = document.createElement('span');
		titleEl.textContent = tab.title;
		// NEW: Add a visual indicator for diff tabs.
		if (tab.isDiff) {
			titleEl.textContent += ' (modified)';
			titleEl.style.fontStyle = 'italic';
		}
		// NEW: Add a visual indicator for unsaved changes.
		if (tab.isModified) {
			titleEl.innerHTML += ' <span class="modified-dot" title="Unsaved changes">•</span>';
		}
		tabEl.appendChild(titleEl);
		
		if (tab.isCloseable) {
			const closeBtn = document.createElement('i');
			closeBtn.className = 'bi bi-x close-tab-btn';
			closeBtn.title = 'Close Tab';
			closeBtn.onclick = (e) => {
				e.stopPropagation();
				// TODO: In the future, check for unsaved changes before closing.
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
	if (tabId === activeTabId) return;
	if (!editor || !diffEditor) return; // MODIFIED: Check both editors are initialized
	
	const editorContainer = document.getElementById('monaco-editor-container');
	const diffEditorContainer = document.getElementById('monaco-diff-editor-container');
	
	// Save view state of the old tab
	const oldTab = findTab(activeTabId);
	if (oldTab) {
		// MODIFIED: Save view state based on which editor was active
		if (oldTab.isDiff) {
			oldTab.viewState = diffEditor.saveViewState();
		} else {
			oldTab.viewState = editor.saveViewState();
		}
	}
	
	// Switch to the new tab
	const newTab = findTab(tabId);
	if (newTab) {
		activeTabId = tabId;
		
		// MODIFIED: Show the correct editor and set models
		if (newTab.isDiff) {
			// This is a diff tab
			editorContainer.style.display = 'none';
			diffEditorContainer.style.display = 'block';
			
			diffEditor.setModel({
				original: newTab.originalModel,
				modified: newTab.model
			});
			// The original is always read-only. Set readOnly for the modified editor.
			diffEditor.getModifiedEditor().updateOptions({ readOnly: newTab.readOnly });
			if (newTab.viewState) {
				diffEditor.restoreViewState(newTab.viewState);
			}
			diffEditor.getModifiedEditor().focus();
			
		} else {
			// This is a regular tab
			diffEditorContainer.style.display = 'none';
			editorContainer.style.display = 'block';
			
			editor.setModel(newTab.model);
			editor.updateOptions({ readOnly: newTab.readOnly });
			if (newTab.viewState) {
				editor.restoreViewState(newTab.viewState);
			}
			editor.focus();
		}
		
		renderTabs();
		updateSaveButtonState(); // NEW: Update save button state on tab switch.
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
	
	// MODIFIED: Dispose of both models to free up memory if it's a diff tab
	tabToClose.model.dispose();
	if (tabToClose.originalModel) {
		tabToClose.originalModel.dispose();
	}
	tabs.splice(tabIndex, 1);
	
	// If the closed tab was the active one, switch to another tab
	if (activeTabId === tabId) {
		const newActiveTab = tabs[tabIndex - 1] || tabs[0];
		if (newActiveTab) {
			switchToTab(newActiveTab.id);
		} else {
			// MODIFIED: No tabs left, hide both editors
			activeTabId = null;
			editor.setModel(null);
			diffEditor.setModel({ original: null, modified: null });
			document.getElementById('monaco-editor-container').style.display = 'block'; // Show default
			document.getElementById('monaco-diff-editor-container').style.display = 'none';
			updateSaveButtonState(); // NEW: Ensure button is disabled
		}
	}
	
	renderTabs();
	save_open_tabs_state(); // NEW: Persist the new tab state.
}

/**
 * Creates a new non-diff tab in the editor. Used for programmatic tabs like "Prompt".
 * @param {string} title - The title for the new tab.
 * @param {string} content - The initial content for the tab.
 * @param {string} language - The language for syntax highlighting.
 * @param {boolean} isCloseable - Whether the tab can be closed by the user.
 * @param {boolean} readOnly - Whether the editor should be read-only for this tab.
 * @param {string|null} filePath - The file path associated with the tab.
 * @returns {string} The ID of the newly created tab.
 */
export function createNewTab(title, content, language = 'plaintext', isCloseable = true, readOnly = false, filePath = null) {
	if (!monaco || !editor) return null;
	
	tabCounter++;
	const newTabId = `tab-${Date.now()}-${tabCounter}`;
	const newModel = monaco.editor.createModel(content, language);
	
	// MODIFIED: Updated tab object structure
	const newTab = {
		id: newTabId,
		title: title,
		model: newModel,
		originalModel: null, // Explicitly null for non-diff tabs
		isDiff: false,       // Explicitly false for non-diff tabs
		isCloseable: isCloseable,
		language: language,
		viewState: null,
		readOnly: readOnly,
		filePath: filePath,
		isModified: false, // NEW: Not modified initially
	};
	
	tabs.push(newTab);
	switchToTab(newTabId);
	return newTabId;
}

/**
 * Opens a file in a new tab (or switches to it), showing a diff view if changes are detected.
 * @param {string} filePath - The unique path of the file.
 * @param {string} currentContent - The current content of the file from disk.
 * @param {string|null} originalContent - The content from git HEAD, or null if no diff.
 */
export function openFileInTab(filePath, currentContent, originalContent) {
	if (!monaco || !editor) return;
	
	// Check if a tab for this file already exists
	const existingTab = tabs.find(t => t.filePath === filePath);
	if (existingTab) {
		// For now, just switch to the existing tab. A future enhancement could be to refresh its content.
		switchToTab(existingTab.id);
		return;
	}
	
	const title = filePath.split('/').pop();
	const language = getLanguageForFile(filePath);
	const isDiff = originalContent !== null;
	
	tabCounter++;
	const newTabId = `tab-${Date.now()}-${tabCounter}`;
	const modifiedModel = monaco.editor.createModel(currentContent, language);
	let originalModel = null;
	
	if (isDiff) {
		originalModel = monaco.editor.createModel(originalContent, language);
		// The original (left side) of a diff should always be read-only.
		originalModel.updateOptions({ readOnly: true });
	}
	
	const newTab = {
		id: newTabId,
		title: title,
		model: modifiedModel,
		originalModel: originalModel,
		isDiff: isDiff,
		isCloseable: true,
		language: language,
		viewState: null,
		// MODIFIED: Diff views are read-only; normal file views are editable.
		readOnly: isDiff,
		filePath: filePath,
		isModified: false, // NEW: Not modified initially
	};
	
	// NEW: Add listener to track modifications for editable, non-diff tabs.
	// This replaces the old auto-save logic.
	if (!newTab.readOnly && !newTab.isDiff) {
		newTab.model.onDidChangeContent(() => {
			// Use a direct reference to the tab in the array to ensure we modify the correct one.
			const tabInArray = findTab(newTab.id);
			if (tabInArray && !tabInArray.isModified) {
				tabInArray.isModified = true;
				renderTabs(); // Re-render to show the modification indicator (dot).
				updateSaveButtonState(); // Update the global save button state.
			}
		});
	}
	
	tabs.push(newTab);
	switchToTab(newTabId);
	save_open_tabs_state(); // NEW: Persist the new tab state.
}

/**
 * Appends content to a specific tab.
 * @param {string} tabId - The ID of the tab to append to.
 * @param {string} text - The text to append.
 */
export function appendToTabContent(tabId, text) {
	const tab = findTab(tabId);
	if (!tab) return;
	
	// Appending content only makes sense for the modifiable model.
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
		// Setting content only makes sense for the modifiable model.
		tab.model.setValue(content);
	}
}

/**
 * Initializes the Monaco Editors and the tab system.
 * @param {boolean} is_dark_mode - Whether to initialize in dark mode.
 * @returns {Promise<void>} A promise that resolves when the editors are initialized.
 */
export function initialize_editor(is_dark_mode) {
	return new Promise((resolve) => {
		require(['vs/editor/editor.main'], () => {
			window.MonacoEnvironment = {
				getWorkerUrl: function (moduleId, label) {
					return `data:text/javascript;charset=utf-8,${encodeURIComponent(`
						self.MonacoEnvironment = {
							baseUrl: 'http://localhost:31987/node_modules/monaco-editor/min/'
						};
						importScripts('http://localhost:31987/node_modules/monaco-editor/min/vs/base/worker/workerMain.js');
					`)}`;
				},
				getWorker: function (moduleId, label) {
					const getWorkerUrl = this.getWorkerUrl(moduleId, label);
					return new Worker(getWorkerUrl);
				}
			};
			
			// MODIFIED: Get both editor containers
			const editorContainer = document.getElementById('monaco-editor-container');
			const diffEditorContainer = document.getElementById('monaco-diff-editor-container');
			if (!editorContainer || !diffEditorContainer) {
				console.error('Monaco editor container(s) not found!');
				resolve();
				return;
			}
			
			const commonEditorOptions = {
				theme: is_dark_mode ? 'vs-dark' : 'vs',
				wordWrap: 'off',
				fontFamily: 'monospace',
				fontSize: 13,
				minimap: { enabled: true },
				automaticLayout: true, // Crucial for editors in hidden containers
				scrollBeyondLastLine: false,
				contextmenu: true,
			};
			
			// Create the standard editor
			editor = monaco.editor.create(editorContainer, {
				...commonEditorOptions,
				language: 'plaintext',
				readOnly: false,
			});
			
			// NEW: Create the diff editor
			diffEditor = monaco.editor.createDiffEditor(diffEditorContainer, {
				...commonEditorOptions,
				originalEditable: false, // The left side is never editable.
				readOnly: false, // This applies to the component; we control the modified editor individually.
			});
			
			// NEW: Add Ctrl+S (Cmd+S) keybinding to save the active tab.
			const saveCommand = () => {
				if (activeTabId) {
					saveTabContent(activeTabId);
				}
			};
			editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, saveCommand);
			diffEditor.getModifiedEditor().addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, saveCommand);
			
			
			createNewTab(
				'Prompt',
				'// Select files from the left to build a prompt.',
				'plaintext',
				false, // isCloseable
				false // readOnly
			);
			
			console.log('Monaco editors with tabs initialized.');
			resolve();
		});
	});
}

/**
 * Sets the content of the currently active Monaco Editor tab.
 * @param {string} content - The new content to display.
 */
export function set_editor_content(content) {
	if (activeTabId) {
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
		// Always get content from the main (potentially modified) model.
		return activeTab.model.getValue();
	}
	return '';
}

/**
 * Gets the current list of open tabs.
 * @returns {Array<object>} A copy of the tabs array.
 */
export function getTabs() {
	return [...tabs];
}

/**
 * Gets the ID of the currently active tab.
 * @returns {string|null} The active tab's ID.
 */
export function getActiveTabId() {
	return activeTabId;
}

/**
 * Gets the ID of the "Prompt" tab.
 * @returns {string|null} The prompt tab's ID, or null if not found.
 */
export function getPromptTabId() {
	const promptTab = tabs.find(t => t.title === 'Prompt' && t.isCloseable === false);
	return promptTab ? promptTab.id : null;
}

/**
 * Toggles the theme of the Monaco Editor.
 * @param {boolean} is_dark_mode - True for dark mode, false for light mode.
 */
export function set_editor_theme(is_dark_mode) {
	// MODIFIED: This global call updates all editor instances.
	if (monaco) {
		monaco.editor.setTheme(is_dark_mode ? 'vs-dark' : 'vs');
	}
}

/**
 * Highlights search matches in the active editor tab.
 * @param {Array<object>} matches - An array of match objects, e.g., [{start, end}, ...].
 * @param {number} current_index - The index of the currently selected match.
 */
export function highlight_search_matches(matches, current_index) {
	// MODIFIED: Use helper to get the correct editor instance.
	const activeEditor = getActiveMonacoEditorInstance();
	if (!activeEditor) return;
	
	const model = activeEditor.getModel();
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
	
	activeEditor.deltaDecorations([], decorations);
	
	if (current_index >= 0 && current_index < matches.length) {
		const current_match_decoration = decorations[current_index];
		if (current_match_decoration) {
			activeEditor.revealRangeInCenter(current_match_decoration.range, monaco.editor.ScrollType.Smooth);
		}
	}
}

/**
 * Clears all search-related highlights from the active editor tab.
 */
export function clear_search_highlights() {
	// MODIFIED: Use helper to get the correct editor instance.
	const activeEditor = getActiveMonacoEditorInstance();
	if (activeEditor) {
		activeEditor.deltaDecorations([], []);
	}
}
