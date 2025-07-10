import { post_data } from './utils.js';
import { get_current_project } from './state.js';
import { show_alert } from './modal-alert.js';
import { show_confirm } from './modal-confirm.js';
import { update_project_settings } from './settings.js';

let editor = null;
let tabs = []; // Array of { id, title, model, originalModel, isDiff, isCloseable, language, viewState, readOnly, filePath, isModified, isGitModified }
let mruTabIds = []; // NEW: Track Most Recently Used tab IDs.
let activeTabId = null;
let tabCounter = 0;
let contextMenuTargetTabId = null;

function initializeTabContextMenu() {
	const menu = document.getElementById('tab-context-menu');
	if (!menu) {
		return;
	}
	
	const closeBtn = document.getElementById('context-menu-close');
	const closeOthersBtn = document.getElementById('context-menu-close-others');
	const closeUnmodifiedBtn = document.getElementById('context-menu-close-unmodified');
	const closeAllBtn = document.getElementById('context-menu-close-all');
	
	document.addEventListener('click', () => {
		menu.classList.add('hidden');
		contextMenuTargetTabId = null;
	});
	
	document.addEventListener('keydown', (e) => {
		if (e.key === 'Escape') {
			if (menu && !menu.classList.contains('hidden')) {
				menu.classList.add('hidden');
				contextMenuTargetTabId = null;
			}
		}
	});
	
	menu.addEventListener('click', (e) => {
		e.stopPropagation();
	});
	
	closeBtn.addEventListener('click', async (e) => {
		e.preventDefault();
		if (contextMenuTargetTabId) {
			const tabToClose = findTab(contextMenuTargetTabId);
			if (tabToClose && tabToClose.isModified) {
				const confirmed = await show_confirm(`The file "${tabToClose.title}" has unsaved changes. Do you want to close it anyway?`, 'Unsaved Changes');
				if (!confirmed) {
					menu.classList.add('hidden');
					return;
				}
			}
			closeTab(contextMenuTargetTabId);
		}
		menu.classList.add('hidden');
	});
	
	closeOthersBtn.addEventListener('click', (e) => {
		e.preventDefault();
		if (contextMenuTargetTabId) {
			closeOtherTabs(contextMenuTargetTabId);
		}
		menu.classList.add('hidden');
	});
	
	closeUnmodifiedBtn.addEventListener('click', (e) => {
		e.preventDefault();
		closeUnmodifiedTabs();
		menu.classList.add('hidden');
	});
	
	closeAllBtn.addEventListener('click', (e) => {
		e.preventDefault();
		closeAllTabs();
		menu.classList.add('hidden');
	});
}

async function closeOtherTabs(keepOpenTabId) {
	const tabsToClose = tabs.filter(tab => tab.id !== keepOpenTabId && tab.isCloseable);
	
	for (const tab of tabsToClose) {
		if (tab.isModified) {
			const confirmed = await show_confirm(`The file "${tab.title}" has unsaved changes. Do you want to close it anyway?`, 'Unsaved Changes');
			if (!confirmed) {
				continue;
			}
		}
		const tabIndex = tabs.findIndex(t => t.id === tab.id);
		if (tabIndex > -1) {
			const tabToRemove = tabs[tabIndex];
			tabToRemove.model.dispose();
			if (tabToRemove.originalModel) {
				tabToRemove.originalModel.dispose();
			}
			tabs.splice(tabIndex, 1);
		}
	}
	
	if (activeTabId !== keepOpenTabId && findTab(keepOpenTabId)) {
		switchToTab(keepOpenTabId);
	}
	
	renderTabs();
	save_open_tabs_state();
}

async function closeAllTabs() {
	const tabsToClose = tabs.filter(tab => tab.isCloseable);
	
	for (const tab of tabsToClose) {
		if (tab.isModified) {
			const confirmed = await show_confirm(`The file "${tab.title}" has unsaved changes. Do you want to close it anyway?`, 'Unsaved Changes');
			if (!confirmed) {
				continue;
			}
		}
		const tabIndex = tabs.findIndex(t => t.id === tab.id);
		if (tabIndex > -1) {
			const tabToRemove = tabs[tabIndex];
			tabToRemove.model.dispose();
			if (tabToRemove.originalModel) {
				tabToRemove.originalModel.dispose();
			}
			tabs.splice(tabIndex, 1);
		}
	}
	
	const newActiveTab = tabs.find(tab => !tab.isCloseable) || tabs[0];
	if (newActiveTab) {
		switchToTab(newActiveTab.id);
	} else {
		activeTabId = null;
		editor.setModel(null);
		document.getElementById('monaco-editor-container').style.display = 'block';
		updateSaveButtonState();
	}
	
	renderTabs();
	save_open_tabs_state();
}

function closeUnmodifiedTabs() {
	// A tab is considered "unmodified" for closing if it has no unsaved changes AND its underlying file is not modified in Git.
	const tabsToClose = tabs.filter(tab => !tab.isModified && !tab.isGitModified && tab.isCloseable);
	let activeTabWasClosed = false;
	
	for (const tab of tabsToClose) {
		if (tab.id === activeTabId) {
			activeTabWasClosed = true;
		}
		const tabIndex = tabs.findIndex(t => t.id === tab.id);
		if (tabIndex > -1) {
			const tabToRemove = tabs[tabIndex];
			tabToRemove.model.dispose();
			if (tabToRemove.originalModel) {
				tabToRemove.originalModel.dispose();
			}
			tabs.splice(tabIndex, 1);
		}
	}
	
	if (activeTabWasClosed) {
		const newActiveTab = tabs[0];
		if (newActiveTab) {
			switchToTab(newActiveTab.id);
		} else {
			activeTabId = null;
			editor.setModel(null);
			document.getElementById('monaco-editor-container').style.display = 'block';
			updateSaveButtonState();
		}
	}
	
	renderTabs();
	save_open_tabs_state();
}


export function updateSaveButtonState() {
	const saveBtn = document.getElementById('save-active-file-btn');
	if (!saveBtn) return;
	
	const activeTab = findTab(activeTabId);
	const shouldBeEnabled = activeTab && activeTab.isModified && !activeTab.readOnly && !activeTab.isDiff;
	
	saveBtn.disabled = !shouldBeEnabled;
}

export function saveAllModifiedTabs() {
	console.log('Attempting to save all modified files on blur...');
	const modifiedTabs = tabs.filter(tab => tab.isModified && !tab.readOnly && tab.filePath && tab.filePath !== '.scp/settings.yaml');
	
	if (modifiedTabs.length > 0) {
		const savePromises = modifiedTabs.map(tab => saveTabContent(tab.id));
		Promise.all(savePromises).then(() => {
			console.log(`${modifiedTabs.length} modified file(s) were saved.`);
		}).catch(err => {
			console.error('An error occurred while saving all modified files:', err);
		});
	}
}

function save_open_tabs_state() {
	const project = get_current_project();
	if (!project) return;
	
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

export async function saveTabContent(tabId) {
	const tab = findTab(tabId);
	if (!tab || !tab.filePath || tab.readOnly || tab.isDiff || !tab.isModified) {
		return;
	}
	
	const project = get_current_project();
	if (!project) {
		console.error("Cannot save file: No project selected.");
		return;
	}
	
	const content = tab.model.getValue();
	
	if (tab.filePath === '.scp/settings.yaml') {
		console.log('Validating and saving project settings...');
		try {
			const result = await post_data({
				action: 'validate_and_save_settings',
				project_path: project.path,
				content: content
			});
			
			if (result.success) {
				tab.isModified = false;
				await update_project_settings(content);
				renderTabs();
				updateSaveButtonState();
				show_alert('Project settings saved and reloaded successfully.', 'Settings Saved');
			} else {
				show_alert(result.error, 'Settings Validation Error');
			}
		} catch (error) {
			console.error('Failed to save project settings:', error);
			show_alert(`An error occurred while saving settings: ${error.message}`, 'Error');
		}
		return;
	}
	
	console.log(`Saving ${tab.filePath}...`);
	try {
		await post_data({
			action: 'save_file_content',
			project_path: project.path,
			file_path: tab.filePath,
			content: content
		});
		tab.isModified = false;
		renderTabs();
		updateSaveButtonState();
		console.log(`${tab.filePath} saved successfully.`);
	} catch (error) {
		console.error(`Failed to save ${tab.filePath}:`, error);
		show_alert(`Failed to save ${tab.filePath}: ${error.message}`, 'Save Error');
	}
}

function getActiveMonacoEditorInstance() {
	if (!activeTabId) return null;
	const tab = findTab(activeTabId);
	if (!tab) return null;
	
	return editor;
}

function getLanguageForFile(filename) {
	if (!window.monaco) return 'plaintext';
	if (filename.endsWith('settings.yaml')) {
		return 'yaml';
	}
	const extension = '.' + filename.split('.').pop();
	const languages = monaco.languages.getLanguages();
	const lang = languages.find(l => l.extensions && l.extensions.includes(extension));
	return lang ? lang.id : 'plaintext';
}

function renderTabs() {
	const tabsContainer = document.getElementById('editor-tabs');
	if (!tabsContainer) return;
	
	tabsContainer.innerHTML = '';
	
	tabs.forEach(tab => {
		const tabEl = document.createElement('div');
		tabEl.className = 'editor-tab';
		tabEl.dataset.tabId = tab.id;
		if (tab.filePath) {
			tabEl.title = tab.filePath;
		}
		if (tab.id === activeTabId) {
			tabEl.classList.add('active');
		}
		
		const titleEl = document.createElement('span');
		titleEl.textContent = tab.title;
		if (tab.isDiff) {
			titleEl.style.fontStyle = 'italic';
		}
		if (tab.isModified) {
			titleEl.innerHTML += ' <span class="modified-dot" title="Unsaved changes">•</span>';
		}
		tabEl.appendChild(titleEl);
		
		if (tab.isCloseable) {
			const closeBtn = document.createElement('i');
			closeBtn.className = 'bi bi-x close-tab-btn';
			closeBtn.title = 'Close Tab';
			closeBtn.onclick = async (e) => {
				e.stopPropagation();
				const tabToClose = findTab(tab.id);
				if (tabToClose && tabToClose.isModified) {
					const confirmed = await show_confirm(`The file "${tabToClose.title}" has unsaved changes. Do you want to close it anyway?`, 'Unsaved Changes');
					if (!confirmed) {
						return;
					}
				}
				closeTab(tab.id);
			};
			tabEl.appendChild(closeBtn);
		}
		
		tabEl.onclick = () => {
			switchToTab(tab.id);
		};
		
		tabEl.addEventListener('contextmenu', (e) => {
			e.preventDefault();
			const menu = document.getElementById('tab-context-menu');
			if (!menu) {
				return;
			}
			
			contextMenuTargetTabId = tab.id;
			
			menu.style.top = `${e.pageY}px`;
			menu.style.left = `${e.pageX}px`;
			menu.classList.remove('hidden');
			
			const closeLi = document.getElementById('context-menu-close').parentElement;
			const closeOthersLi = document.getElementById('context-menu-close-others').parentElement;
			const closeUnmodifiedLi = document.getElementById('context-menu-close-unmodified').parentElement;
			
			tab.isCloseable ? closeLi.classList.remove('disabled') : closeLi.classList.add('disabled');
			
			const otherCloseableTabsExist = tabs.some(t => t.id !== tab.id && t.isCloseable);
			otherCloseableTabsExist ? closeOthersLi.classList.remove('disabled') : closeOthersLi.classList.add('disabled');
			
			const unmodifiedTabsExist = tabs.some(t => !t.isModified && t.isCloseable);
			unmodifiedTabsExist ? closeUnmodifiedLi.classList.remove('disabled') : closeUnmodifiedLi.classList.add('disabled');
		});
		
		tabsContainer.appendChild(tabEl);
	});
}

function findTab(tabId) {
	return tabs.find(t => t.id === tabId);
}

export function switchToTab(tabId) {
	if (tabId === activeTabId) return;
	if (!editor) return;
	
	const editorContainer = document.getElementById('monaco-editor-container');
	const resetSettingsBtn = document.getElementById('reset-settings-btn');
	
	const oldTab = findTab(activeTabId);
	if (oldTab) {
		oldTab.viewState = editor.saveViewState();
	}
	
	const newTab = findTab(tabId);
	if (newTab) {
		activeTabId = tabId;
		
		// NEW: Update MRU list. Remove from current position and add to the front.
		const mruIndex = mruTabIds.indexOf(tabId);
		if (mruIndex > -1) {
			mruTabIds.splice(mruIndex, 1);
		}
		mruTabIds.unshift(tabId);
		
		if (window.electronAPI && typeof window.electronAPI.updateWindowTitle === 'function') {
			const project = get_current_project();
			const projectName = project ? project.path.split(/[\\/]/).pop() : null;
			const titleParts = [];
			
			titleParts.push('Smart Code Prompts');
			
			if (newTab.filePath) {
				titleParts.push(newTab.filePath);
			} else {
				titleParts.push(newTab.title);
			}
			
			
			window.electronAPI.updateWindowTitle(titleParts.join(' - '));
		}
		
		if (resetSettingsBtn) {
			resetSettingsBtn.classList.toggle('hidden', newTab.filePath !== '.scp/settings.yaml');
		}
		
		editorContainer.style.display = 'block';
		
		editor.setModel(newTab.model);
		if (newTab.viewState) {
			editor.restoreViewState(newTab.viewState);
		}
		editor.focus();
		
		renderTabs();
		
		const activeTabEl = document.querySelector(`.editor-tab[data-tab-id="${tabId}"]`);
		if (activeTabEl) {
			activeTabEl.scrollIntoView({
				behavior: 'smooth',
				block: 'nearest',
				inline: 'nearest'
			});
		}
		
		updateSaveButtonState();
	}
}

export function closeTab(tabId) {
	const tabIndex = tabs.findIndex(t => t.id === tabId);
	if (tabIndex === -1) return;
	
	const tabToClose = tabs[tabIndex];
	if (!tabToClose.isCloseable) return;
	
	// NEW: Remove the closed tab from the MRU list.
	const mruIndex = mruTabIds.indexOf(tabId);
	if (mruIndex > -1) {
		mruTabIds.splice(mruIndex, 1);
	}
	
	tabToClose.model.dispose();
	if (tabToClose.originalModel) {
		tabToClose.originalModel.dispose();
	}
	tabs.splice(tabIndex, 1);
	
	if (activeTabId === tabId) {
		// MODIFIED: Switch to the most recently used tab that is still open.
		const newActiveTabId = mruTabIds[0] || (tabs.length > 0 ? tabs[0].id : null);
		if (newActiveTabId) {
			switchToTab(newActiveTabId);
		} else {
			activeTabId = null;
			editor.setModel(null);
			document.getElementById('monaco-editor-container').style.display = 'block';
			document.getElementById('reset-settings-btn').classList.add('hidden');
			updateSaveButtonState();
			
			if (window.electronAPI && typeof window.electronAPI.updateWindowTitle === 'function') {
				const project = get_current_project();
				const projectName = project ? project.path.split(/[\\/]/).pop() : null;
				const titleParts = [];
				if (projectName) {
					titleParts.push(projectName);
				}
				titleParts.push('Smart Code Prompts');
				window.electronAPI.updateWindowTitle(titleParts.join(' - '));
			}
		}
	}
	
	renderTabs();
	save_open_tabs_state();
}

export function createNewTab(title, content, language = 'plaintext', isCloseable = true, readOnly = false, filePath = null) {
	if (!monaco || !editor) return null;
	
	tabCounter++;
	const newTabId = `tab-${Date.now()}-${tabCounter}`;
	const newModel = monaco.editor.createModel(content, language);
	
	const newTab = {
		id: newTabId,
		title: title,
		model: newModel,
		originalModel: null,
		isDiff: false,
		isCloseable: isCloseable,
		language: language,
		viewState: null,
		readOnly: readOnly,
		filePath: filePath,
		isModified: false,
		isGitModified: false,
	};
	
	tabs.push(newTab);
	switchToTab(newTabId);
	return newTabId;
}

export function openFileInTab(filePath, currentContent, originalContent, isGitModified = false) {
	if (!monaco || !editor) return;
	
	const existingTab = tabs.find(t => t.filePath === filePath);
	if (existingTab) {
		// If the tab already exists, update its git status if a new status is provided.
		if (isGitModified !== undefined) {
			existingTab.isGitModified = isGitModified;
		}
		switchToTab(existingTab.id);
		return;
	}
	
	const title = filePath === '.scp/settings.yaml' ? 'Project Settings' : filePath.split('/').pop();
	const language = getLanguageForFile(filePath);
	const isDiff = originalContent !== null;
	
	// A file is considered modified in git if it's opened in diff view,
	// or if the flag is explicitly passed (for normal view of a modified file).
	const gitModifiedStatus = isDiff || isGitModified;
	
	tabCounter++;
	const newTabId = `tab-${Date.now()}-${tabCounter}`;
	const modifiedModel = monaco.editor.createModel(currentContent, language);
	let originalModel = null;
	
	if (isDiff) {
		originalModel = monaco.editor.createModel(originalContent, language);
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
		readOnly: isDiff,
		filePath: filePath,
		isModified: false,
		isGitModified: gitModifiedStatus
	};
	
	if (!newTab.readOnly && !newTab.isDiff) {
		newTab.model.onDidChangeContent(() => {
			const tabInArray = findTab(newTab.id);
			if (tabInArray && !tabInArray.isModified) {
				tabInArray.isModified = true;
				renderTabs();
				updateSaveButtonState();
			}
		});
	}
	
	tabs.push(newTab);
	switchToTab(newTabId);
	save_open_tabs_state();
}

/**
 * NEW: Updates the Git modification status of an open tab.
 * This is called by the file tree poller to keep tab state in sync.
 * @param {string} filePath - The path of the file to update.
 * @param {boolean} isGitModified - The new Git modification status.
 */
export function updateTabGitStatus(filePath, isGitModified) {
	const tab = tabs.find(t => t.filePath === filePath);
	if (tab) {
		tab.isGitModified = isGitModified;
	}
}

export function appendToTabContent(tabId, text) {
	const tab = findTab(tabId);
	if (!tab) return;
	
	const model = tab.model;
	const lastLine = model.getLineCount();
	const lastColumn = model.getLineMaxColumn(lastLine);
	const range = new monaco.Range(lastLine, lastColumn, lastLine, lastColumn);
	
	model.applyEdits([{ range: range, text: text, forceMoveMarkers: true }]);
}

export function setTabContent(tabId, content) {
	const tab = findTab(tabId);
	if (tab) {
		tab.model.setValue(content);
	}
}

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
			
			const editorContainer = document.getElementById('monaco-editor-container');
			if (!editorContainer) {
				console.error('Monaco editor container(s) not found!');
				resolve();
				return;
			}
			
			const commonEditorOptions = {
				theme: is_dark_mode ? 'vs-dark' : 'vs',
				wordWrap: 'on',
				fontFamily: 'monospace',
				fontSize: 13,
				minimap: { enabled: true },
				automaticLayout: true,
				scrollBeyondLastLine: false,
				contextmenu: true,
			};
			
			editor = monaco.editor.create(editorContainer, {
				...commonEditorOptions,
				language: 'plaintext',
				readOnly: false,
			});
			
			const saveCommand = () => {
				if (activeTabId) {
					saveTabContent(activeTabId);
				}
			};
			editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, saveCommand);
			
			const closeTabCommand = () => {
				if (activeTabId) {
					const tab = findTab(activeTabId);
					if (tab && tab.isModified) {
						show_confirm(`The file "${tab.title}" has unsaved changes. Do you want to close it anyway?`, 'Unsaved Changes')
							.then(confirmed => {
								if (confirmed) {
									closeTab(activeTabId);
								}
							});
					} else {
						closeTab(activeTabId);
					}
				}
			}
			editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.F4, closeTabCommand);
			
			initializeTabContextMenu();
			
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

export function set_editor_content(content) {
	if (activeTabId) {
		setTabContent(activeTabId, content);
	}
}

export function get_editor_content() {
	const activeTab = findTab(activeTabId);
	if (activeTab) {
		return activeTab.model.getValue();
	}
	return '';
}

export function getTabs() {
	return [...tabs];
}

/**
 * NEW: Gets all open tabs, sorted by most-recently-used.
 * @returns {Array<object>} An array of tab objects.
 */
export function getMruTabs() {
	return mruTabIds.map(id => findTab(id)).filter(tab => !!tab);
}

export function getActiveTabId() {
	return activeTabId;
}

export function getPromptTabId() {
	const promptTab = tabs.find(t => t.title === 'Prompt' && t.isCloseable === false);
	return promptTab ? promptTab.id : null;
}

export function set_editor_theme(is_dark_mode) {
	if (monaco) {
		monaco.editor.setTheme(is_dark_mode ? 'vs-dark' : 'vs');
	}
}

export function highlight_search_matches(matches, current_index) {
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

export function clear_search_highlights() {
	const activeEditor = getActiveMonacoEditorInstance();
	if (activeEditor) {
		activeEditor.deltaDecorations([], []);
	}
}
