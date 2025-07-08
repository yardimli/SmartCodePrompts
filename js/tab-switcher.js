// SmartCodePrompts/js/tab-switcher.js

// --- MODULE IMPORTS ---
import { getTabs, getActiveTabId, switchToTab } from './editor.js';

// --- STATE VARIABLES ---
let isSwitcherVisible = false;
let switcherTabs = [];
let switcherCurrentIndex = 0;
let tabSwitcherOverlay = null;
let tabSwitcherList = null;

/**
 * Renders and displays the tab switcher UI.
 */
function showTabSwitcher() {
	if (!tabSwitcherOverlay || !tabSwitcherList) return;
	
	switcherTabs = getTabs();
	if (switcherTabs.length < 2) return; // No need to switch if less than 2 tabs
	
	const currentActiveTabId = getActiveTabId();
	const activeTabIndex = switcherTabs.findIndex(t => t.id === currentActiveTabId);
	
	// On first press, highlight the next tab in the list, wrapping around.
	switcherCurrentIndex = (activeTabIndex + 1) % switcherTabs.length;
	
	renderTabSwitcher();
	tabSwitcherOverlay.classList.remove('hidden');
	tabSwitcherOverlay.classList.add('flex'); // Use flex for centering
	isSwitcherVisible = true;
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
		li.className = 'p-2 rounded-md text-base-content w-full';
		if (index === switcherCurrentIndex) {
			li.classList.add('bg-primary', 'text-primary-content');
		} else {
			li.classList.add('bg-base-300');
		}
		
		const titleSpan = document.createElement('span');
		titleSpan.className = 'font-bold block truncate';
		titleSpan.textContent = tab.title;
		li.appendChild(titleSpan);
		
		if (tab.filePath) {
			const pathSpan = document.createElement('span');
			pathSpan.className = 'text-sm opacity-70 block truncate';
			pathSpan.textContent = tab.filePath;
			li.appendChild(pathSpan);
		}
		
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
	
	if (!tabSwitcherOverlay || !tabSwitcherList) {
		console.error('Tab switcher UI elements not found in the DOM. Was modal-tab-switcher.html loaded?');
		return;
	}
	
	setupTabSwitcherListeners();
	console.log('Tab switcher initialized.');
}
