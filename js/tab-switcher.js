// SmartCodePrompts/js/tab-switcher.js

// --- MODULE IMPORTS ---
import { getMruTabs, switchToTab } from './editor.js';

// --- STATE VARIABLES ---
let isSwitcherVisible = false;
let switcherTabs = [];
let switcherCurrentIndex = 0;
let tabSwitcherOverlay = null;
let tabSwitcherList = null;
let tabSwitcherContainer = null;

/**
 * Renders and displays the tab switcher UI.
 */
function showTabSwitcher() {
	if (!tabSwitcherOverlay || !tabSwitcherList) return;
	
	switcherTabs = getMruTabs();
	if (switcherTabs.length < 2) return; // No need to switch if less than 2 tabs
	
	// On first press, highlight the next tab in the MRU list (the previously active one).
	switcherCurrentIndex = 1;
	
	renderTabSwitcher();
	tabSwitcherOverlay.classList.remove('hidden');
	tabSwitcherOverlay.classList.add('flex'); // Use flex for centering
	isSwitcherVisible = true;
	
	// Ensure the selected item is visible when the switcher first opens.
	const selectedElement = tabSwitcherList.children[switcherCurrentIndex];
	if (selectedElement) {
		selectedElement.scrollIntoView({ block: 'nearest' });
	}
}

/**
 * Hides the tab switcher UI.
 */
function hideTabSwitcher() {
	if (!tabSwitcherOverlay) return;
	tabSwitcherOverlay.classList.add('hidden');
	tabSwitcherOverlay.classList.remove('flex');
	isSwitcherVisible = false;
}

/**
 * Populates the tab switcher list with the current open tabs.
 */
function renderTabSwitcher() {
	if (!tabSwitcherList) return;
	tabSwitcherList.innerHTML = '';
	switcherTabs.forEach((tab, index) => {
		const li = document.createElement('li');
		li.className = 'p-2 rounded-md text-base-content w-full flex items-center gap-2 cursor-pointer';
		li.dataset.tabId = tab.id;
		
		if (index === switcherCurrentIndex) {
			li.classList.add('bg-primary', 'text-primary-content');
		} else {
			li.classList.add('hover:bg-base-300');
		}
		
		const icon = document.createElement('span');
		const filetype = tab.filePath ? tab.filePath.split('.').pop() : '';
		icon.className = `file filetype-${filetype} text-lg`;
		li.appendChild(icon);
		
		const textWrapper = document.createElement('div');
		textWrapper.className = 'flex-grow overflow-hidden';
		
		const titleSpan = document.createElement('span');
		titleSpan.className = 'font-semibold block truncate text-sm';
		titleSpan.textContent = tab.title;
		textWrapper.appendChild(titleSpan);
		
		if (tab.filePath) {
			const pathSpan = document.createElement('span');
			pathSpan.className = 'text-xs opacity-70 block truncate';
			pathSpan.textContent = tab.filePath;
			textWrapper.appendChild(pathSpan);
		}
		
		li.appendChild(textWrapper);
		
		li.addEventListener('click', () => {
			switchToTab(tab.id);
			hideTabSwitcher();
		});
		
		tabSwitcherList.appendChild(li);
	});
}

/**
 * Navigates the selection within the tab switcher.
 * @param {number} direction - 1 for forward, -1 for backward.
 */
function navigateSwitcher(direction) {
	if (!isSwitcherVisible) return;
	const numTabs = switcherTabs.length;
	switcherCurrentIndex = (switcherCurrentIndex + direction + numTabs) % numTabs;
	renderTabSwitcher();
	
	// MODIFIED: Scroll the newly selected item into view. This is triggered on each Ctrl+Tab press
	// while the switcher is visible, ensuring the highlighted item is always visible within the scrollable area.
	const selectedElement = tabSwitcherList.children[switcherCurrentIndex];
	if (selectedElement) {
		selectedElement.scrollIntoView({ block: 'nearest' });
	}
}

/**
 * Sets up global event listeners for the Ctrl+Tab functionality.
 */
function setupTabSwitcherListeners() {
	document.addEventListener('keydown', (e) => {
		// Use `e.code` for layout-independent key checks
		if (e.ctrlKey && e.code === 'Tab') {
			e.preventDefault();
			if (!isSwitcherVisible) {
				showTabSwitcher();
			} else {
				const direction = e.shiftKey ? -1 : 1;
				navigateSwitcher(direction);
			}
		}
	});
	
	document.addEventListener('keyup', (e) => {
		// When the Control key is released, commit the switch.
		if (e.key === 'Control' && isSwitcherVisible) {
			e.preventDefault();
			hideTabSwitcher();
			const selectedTab = switcherTabs[switcherCurrentIndex];
			if (selectedTab) {
				switchToTab(selectedTab.id);
			}
		}
	});
	
	// Hide switcher if the window loses focus for a better user experience.
	window.addEventListener('blur', () => {
		if (isSwitcherVisible) {
			hideTabSwitcher();
		}
	});
}

/**
 * Initializes the tab switcher module.
 * This should be called after the DOM is fully loaded, including the switcher's HTML.
 */
export function initialize_tab_switcher() {
	// Get elements once the DOM is ready
	tabSwitcherOverlay = document.getElementById('tab-switcher-overlay');
	tabSwitcherList = document.getElementById('tab-switcher-list');
	tabSwitcherContainer = document.getElementById('tab-switcher-container');
	
	if (!tabSwitcherOverlay || !tabSwitcherList || !tabSwitcherContainer) {
		console.error('Tab switcher UI elements not found in the DOM. Was modal-tab-switcher.html loaded?');
		return;
	}
	
	setupTabSwitcherListeners();
	console.log('Tab switcher initialized.');
}
