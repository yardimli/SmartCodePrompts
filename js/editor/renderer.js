// js/editor/renderer.js

/**
 * @file Handles all DOM rendering for the editor's tab interface,
 * including the tab bar and its context menu.
 */

import { show_confirm } from '../modal-confirm.js';
import * as actions from './actions.js';
import * as state from './state.js';

/**
 * Renders the tab bar UI based on the current state from `state.js`.
 */
export function renderTabs () {
	const tabsContainer = document.getElementById('editor-tabs');
	if (!tabsContainer) return;
	
	tabsContainer.innerHTML = '';
	
	state.tabs.forEach(tab => {
		const tabEl = document.createElement('div');
		tabEl.className = 'editor-tab';
		tabEl.dataset.tabId = tab.id;
		if (tab.filePath) {
			tabEl.title = tab.filePath;
		}
		if (tab.id === state.activeTabId) {
			tabEl.classList.add('active');
		}
		
		const titleEl = document.createElement('span');
		titleEl.textContent = tab.title;
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
				const tabToClose = state.findTab(tab.id);
				if (tabToClose && tabToClose.isModified) {
					const confirmed = await show_confirm(`The file "${tabToClose.title}" has unsaved changes. Do you want to close it anyway?`, 'Unsaved Changes');
					if (!confirmed) {
						return;
					}
				}
				actions.closeTab(tab.id);
			};
			tabEl.appendChild(closeBtn);
		}
		
		tabEl.onclick = () => {
			actions.switchToTab(tab.id);
		};
		
		tabEl.addEventListener('contextmenu', (e) => {
			e.preventDefault();
			const menu = document.getElementById('tab-context-menu');
			if (!menu) return;
			
			state.setContextMenuTargetTabId(tab.id);
			
			menu.style.top = `${e.pageY}px`;
			menu.style.left = `${e.pageX}px`;
			menu.classList.remove('hidden');
			
			const closeLi = document.getElementById('context-menu-close').parentElement;
			const closeOthersLi = document.getElementById('context-menu-close-others').parentElement;
			const closeUnmodifiedLi = document.getElementById('context-menu-close-unmodified').parentElement;
			
			tab.isCloseable ? closeLi.classList.remove('disabled') : closeLi.classList.add('disabled');
			
			const otherCloseableTabsExist = state.tabs.some(t => t.id !== tab.id && t.isCloseable);
			otherCloseableTabsExist ? closeOthersLi.classList.remove('disabled') : closeOthersLi.classList.add('disabled');
			
			const unmodifiedTabsExist = state.tabs.some(t => !t.isModified && !t.isGitModified && t.isCloseable);
			unmodifiedTabsExist ? closeUnmodifiedLi.classList.remove('disabled') : closeUnmodifiedLi.classList.add('disabled');
		});
		
		tabsContainer.appendChild(tabEl);
	});
};

/**
 * Initializes the context menu for editor tabs.
 */
export function initializeTabContextMenu () {
	const menu = document.getElementById('tab-context-menu');
	if (!menu) return;
	
	const closeBtn = document.getElementById('context-menu-close');
	const closeOthersBtn = document.getElementById('context-menu-close-others');
	const closeUnmodifiedBtn = document.getElementById('context-menu-close-unmodified');
	const closeAllBtn = document.getElementById('context-menu-close-all');
	
	document.addEventListener('click', () => {
		menu.classList.add('hidden');
		state.setContextMenuTargetTabId(null);
	});
	
	document.addEventListener('keydown', (e) => {
		if (e.key === 'Escape') {
			if (menu && !menu.classList.contains('hidden')) {
				menu.classList.add('hidden');
				state.setContextMenuTargetTabId(null);
			}
		}
	});
	
	menu.addEventListener('click', (e) => e.stopPropagation());
	
	closeBtn.addEventListener('click', async (e) => {
		e.preventDefault();
		if (state.contextMenuTargetTabId) {
			const tabToClose = state.findTab(state.contextMenuTargetTabId);
			if (tabToClose && tabToClose.isModified) {
				const confirmed = await show_confirm(`The file "${tabToClose.title}" has unsaved changes. Do you want to close it anyway?`, 'Unsaved Changes');
				if (!confirmed) {
					menu.classList.add('hidden');
					return;
				}
			}
			actions.closeTab(state.contextMenuTargetTabId);
		}
		menu.classList.add('hidden');
	});
	
	closeOthersBtn.addEventListener('click', (e) => {
		e.preventDefault();
		if (state.contextMenuTargetTabId) {
			actions.closeOtherTabs(state.contextMenuTargetTabId);
		}
		menu.classList.add('hidden');
	});
	
	closeUnmodifiedBtn.addEventListener('click', (e) => {
		e.preventDefault();
		actions.closeUnmodifiedTabs();
		menu.classList.add('hidden');
	});
	
	closeAllBtn.addEventListener('click', (e) => {
		e.preventDefault();
		actions.closeAllTabs();
		menu.classList.add('hidden');
	});
};
