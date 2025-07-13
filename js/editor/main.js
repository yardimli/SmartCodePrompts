// js/editor/main.js

/**
 * @file This is the main entry point for the editor module.
 * It handles the initialization of the Monaco editor instance and wires
 * up all the different sub-modules (actions, rendering, polling).
 */

import { show_confirm } from '../modal-confirm.js';
import * as state from './state.js';
import * as actions from './actions.js';
import * as renderer from './renderer.js';
import * as polling from './polling.js';
import * as io from './io.js';

/**
 * Gets the Monaco language ID for a given filename.
 * @param {string} filename - The name of the file.
 * @returns {string} The Monaco language ID.
 */
export function getLanguageForFile (filename) {
	if (!window.monaco) return 'plaintext';
	if (filename.endsWith('settings.yaml')) return 'yaml';
	const extension = '.' + filename.split('.').pop();
	const languages = monaco.languages.getLanguages();
	const lang = languages.find(l => l.extensions && l.extensions.includes(extension));
	return lang ? lang.id : 'plaintext';
};

function getActiveMonacoEditorInstance () {
	return state.findTab(state.activeTabId) ? state.editor : null;
};

/**
 * Initializes the Monaco editor and its surrounding tab functionality.
 * @param {boolean} is_dark_mode - Whether to start in dark mode.
 * @returns {Promise<void>}
 */
export function initialize_editor (is_dark_mode) {
	return new Promise((resolve) => {
		require(['vs/editor/editor.main'], () => {
			window.MonacoEnvironment = {
				getWorkerUrl: (moduleId, label) => `data:text/javascript;charset=utf-8,${encodeURIComponent(`
                    self.MonacoEnvironment = { baseUrl: 'http://localhost:31987/node_modules/monaco-editor/min/' };
                    importScripts('http://localhost:31987/node_modules/monaco-editor/min/vs/base/worker/workerMain.js');
                `)}`,
				getWorker: (moduleId, label) => new Worker(window.MonacoEnvironment.getWorkerUrl(moduleId, label))
			};
			
			const editorContainer = document.getElementById('monaco-editor-container');
			if (!editorContainer) {
				resolve();
				return;
			}
			
			const editorOptions = {
				theme: is_dark_mode ? 'vs-dark' : 'vs',
				wordWrap: 'on',
				fontFamily: 'monospace',
				fontSize: 13,
				minimap: { enabled: true },
				automaticLayout: true,
				scrollBeyondLastLine: false,
				contextmenu: true
			};
			
			const newEditor = monaco.editor.create(editorContainer, {
				...editorOptions,
				language: 'plaintext'
			});
			state.setEditor(newEditor);
			
			newEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
				if (state.activeTabId) io.saveTabContent(state.activeTabId);
			});
			
			newEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.F4, async () => {
				if (state.activeTabId) {
					const tab = state.findTab(state.activeTabId);
					if (tab?.isModified) {
						const confirmed = await show_confirm(`The file "${tab.title}" has unsaved changes. Do you want to close it anyway?`, 'Unsaved Changes');
						if (confirmed) actions.closeTab(state.activeTabId);
					} else {
						actions.closeTab(state.activeTabId);
					}
				}
			});
			
			renderer.initializeTabContextMenu();
			actions.createNewTab('Prompt', '// Select files from the left to build a prompt.', 'plaintext', false);
			
			polling.startFileChangeWatcher();
			window.addEventListener('focus', polling.startFileChangeWatcher);
			window.addEventListener('blur', () => {
				polling.stopFileChangeWatcher();
				io.saveAllModifiedTabs(); // Save on blur
			});
			
			console.log('Monaco editors with tabs initialized.');
			resolve();
		});
	});
};

/**
 * Sets the theme for the Monaco editor.
 * @param {boolean} is_dark_mode - True for dark mode, false for light.
 */
export function set_editor_theme (is_dark_mode) {
	if (monaco) {
		monaco.editor.setTheme(is_dark_mode ? 'vs-dark' : 'vs');
	}
};

/**
 * Gets the full content of the currently active editor tab.
 * @returns {string} The editor content.
 */
export function get_editor_content () {
	const activeTab = state.findTab(state.activeTabId);
	return activeTab ? activeTab.model.getValue() : '';
};

/**
 * Overwrites the content of the currently active editor tab.
 * @param {string} content - The new content for the editor.
 */
export function set_editor_content (content) {
	if (state.activeTabId) {
		actions.setTabContent(state.activeTabId, content);
	}
};

/**
 * Applies decorations to the active editor to highlight search matches.
 * @param {Array<object>} matches - An array of match objects with start/end positions.
 * @param {number} current_index - The index of the currently selected match.
 */
export function highlight_search_matches (matches, current_index) {
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
				stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
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
};

/**
 * Clears all search-related highlights from the active editor.
 */
export function clear_search_highlights () {
	const activeEditor = getActiveMonacoEditorInstance();
	if (activeEditor) {
		activeEditor.deltaDecorations([], []);
	}
};
