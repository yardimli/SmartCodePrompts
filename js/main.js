// SmartCodePrompts/js/main.js

// --- CORE & STATE IMPORTS ---
import {post_data} from './utils.js';
import {set_content_footer_prompt, set_last_smart_prompt} from './state.js';

// --- MODULE IMPORTS ---
import {initialize_about_modal, open_about_modal, setup_about_modal_listeners} from './modal-about.js';
import {initialize_analysis_modal} from './modal-analysis.js';
import {initialize_log_modal, setup_log_modal_listeners} from './modal-log.js';
import {initialize_search_modal, setup_search_modal_listeners} from './modal-search.js';
import {initialize_setup_modal, setup_setup_modal_listeners} from './modal-setup.js';
import {setup_analysis_actions_listener} from './analysis.js';
import {initialize_llm_selector, setup_llm_listeners} from './llm.js';
import {initialize_status_bar} from './status_bar.js';
import {load_project, setup_project_listeners} from './project.js';
import {initialize_auto_expand_textarea, setup_prompt_bar_listeners} from './prompt.js';
import {
	initialize_compress_extensions_dropdown,
	initialize_resizers,
	initialize_temperature_slider,
	setup_ui_event_listeners
} from './ui_components.js';
import {initialize_qa_modal, setup_qa_listeners} from './qa.js';
import {setup_direct_prompt_listeners} from './direct_prompt.js';
import {setup_file_tree_listeners} from './file_tree.js';
import {initialize_progress_modal} from './modal-progress.js';
import {initialize_alert_modal, show_alert} from './modal-alert.js';
import {initialize_confirm_modal} from './modal-confirm.js';
import {setup_auto_select_listeners} from './auto_select.js';

import { initialize_editor, saveTabContent, getActiveTabId, saveAllModifiedTabs } from './editor.js';
import { initialize_tab_switcher } from './tab-switcher.js'; // This is now handled by initialize_tab_scroller

// Function to load all individual modal HTML files.
async function load_all_modals_html () {
	const modal_files = [
		'modal-about.html', 'modal-analysis.html',
		'modal-log.html', 'modal-qa.html',
		'modal-reanalysis.html', 'modal-search.html', 'modal-setup.html',
		'modal-progress.html', 'modal-alert.html', 'modal-confirm.html',
		'modal-tab-switcher.html'
	];
	const modal_container = document.getElementById('modal-container');
	
	try {
		const fetch_promises = modal_files.map(file => fetch(file).then(res => {
			if (!res.ok) throw new Error(`Failed to load ${file}: ${res.statusText}`);
			return res.text();
		}));
		
		const html_contents = await Promise.all(fetch_promises);
		modal_container.innerHTML = html_contents.join('');
	} catch (error) {
		console.error(error);
		document.body.innerHTML = `<div class="p-4"><div class="alert alert-error">Could not load essential UI components (modals). Please refresh the page or check the console.</div></div>`;
	}
}

// NEW: Handles horizontal scrolling for editor tabs with buttons and drag-to-scroll.
function initialize_tab_scroller() {
	const tabsContainer = document.getElementById('editor-tabs');
	const leftScroller = document.getElementById('scroll-tabs-left');
	const rightScroller = document.getElementById('scroll-tabs-right');
	
	if (!tabsContainer || !leftScroller || !rightScroller) {
		console.warn('Tab scroller elements not found, feature disabled.');
		return;
	}
	
	const checkScroll = () => {
		const hasOverflow = tabsContainer.scrollWidth > tabsContainer.clientWidth;
		leftScroller.classList.toggle('hidden', !hasOverflow);
		rightScroller.classList.toggle('hidden', !hasOverflow);
		
		if (hasOverflow) {
			// Use a small tolerance to handle sub-pixel rendering issues
			leftScroller.disabled = tabsContainer.scrollLeft < 1;
			rightScroller.disabled = tabsContainer.scrollLeft >= tabsContainer.scrollWidth - tabsContainer.clientWidth - 1;
		}
	};
	
	// Scroll with buttons
	leftScroller.addEventListener('click', () => {
		tabsContainer.scrollLeft -= 200;
	});
	rightScroller.addEventListener('click', () => {
		tabsContainer.scrollLeft += 200;
	});
	
	// Drag to scroll
	let isDown = false;
	let startX;
	let scrollLeft;
	
	tabsContainer.addEventListener('mousedown', (e) => {
		// Only activate drag with the primary mouse button
		if (e.button !== 0) return;
		// Prevent drag from starting on a button inside the tab (like the close button)
		if (e.target.closest('button, i')) return;
		
		isDown = true;
		tabsContainer.classList.add('dragging');
		startX = e.pageX - tabsContainer.offsetLeft;
		scrollLeft = tabsContainer.scrollLeft;
	});
	
	const stopDragging = () => {
		if (!isDown) return;
		isDown = false;
		tabsContainer.classList.remove('dragging');
	};
	
	tabsContainer.addEventListener('mouseleave', stopDragging);
	tabsContainer.addEventListener('mouseup', stopDragging);
	
	tabsContainer.addEventListener('mousemove', (e) => {
		if (!isDown) return;
		e.preventDefault();
		const x = e.pageX - tabsContainer.offsetLeft;
		const walk = (x - startX); // The distance the mouse has moved
		tabsContainer.scrollLeft = scrollLeft - walk;
	});
	
	// Update button states on scroll
	tabsContainer.addEventListener('scroll', checkScroll);
	
	// Use a MutationObserver to detect when tabs are added or removed
	const observer = new MutationObserver(checkScroll);
	observer.observe(tabsContainer, { childList: true });
	
	// Initial check
	checkScroll();
}

/**
 * Initializes the entire application on page load.
 */
async function initialize_app() {
	function adjust_prompt_textarea_height() {
		const textarea = document.getElementById('prompt-input');
		if (!textarea) return;
		textarea.style.height = 'auto';
		textarea.style.height = `${textarea.scrollHeight}px`;
	}
	
	try {
		const data = await post_data({action: 'get_main_page_data'});
		
		// 1. Apply UI States (Dark Mode, Sidebar, Panel Widths)
		// Also set the correct highlight.js theme on initial load.
		const highlight_theme_link = document.getElementById('highlight-js-theme');
		if (data.dark_mode) {
			document.documentElement.setAttribute('data-theme', 'dark');
			document.querySelector('#toggle-mode i').classList = 'bi-moon';
			if (highlight_theme_link) {
				highlight_theme_link.href = './vendor/highlight.js/styles/atom-one-dark.min.css';
			}
		} else {
			document.documentElement.setAttribute('data-theme', 'light');
			document.querySelector('#toggle-mode i').classList = 'bi-sun';
			if (highlight_theme_link) {
				highlight_theme_link.href = './vendor/highlight.js/styles/atom-one-light.min.css';
			}
		}
		
		// Initialize the editor with the correct theme
		await initialize_editor(data.dark_mode);
		
		if (data.right_sidebar_collapsed) {
			document.getElementById('app-container').classList.add('right-sidebar-collapsed');
		} else {
			document.getElementById('app-container').classList.remove('right-sidebar-collapsed');
		}
		
		// Apply saved file tree width
		if (data.file_tree_width) {
			const main_split_pane = document.getElementById('main-split-pane');
			if (main_split_pane) {
				main_split_pane.style.gridTemplateColumns = `${data.file_tree_width}px auto 1fr`;
			}
		}
		
		// 2. Set global prompts from state
		console.log('Last Smart Prompt:', data.last_smart_prompt);
		set_content_footer_prompt(data.prompt_content_footer || '');
		set_last_smart_prompt(data.last_smart_prompt || '');
		document.getElementById('prompt-input').value = data.last_smart_prompt || '';
		adjust_prompt_textarea_height();
		
		// 3. Initialize UI Components from their respective modules
		const last_selected_llms = {
			analysis: data.last_selected_llm_analysis,
			smart_prompt: data.last_selected_llm_smart_prompt,
			qa: data.last_selected_llm_qa,
			direct_prompt: data.last_selected_llm_direct_prompt
		};
		initialize_llm_selector(data.llms, last_selected_llms);
		initialize_compress_extensions_dropdown(data.allowed_extensions, data.compress_extensions);
		initialize_status_bar(data.session_tokens);
		
		// 4. Populate Projects Dropdown
		const dropdown = document.getElementById('projects-dropdown');
		dropdown.innerHTML = '';
		if (!data.projects || data.projects.length === 0) {
			dropdown.innerHTML = '<option value="">No projects found</option>';
			document.getElementById('file-tree').innerHTML = '<p class="p-3 text-base-content/70">No projects configured. Please add a project to begin.</p>';
		} else {
			data.projects.forEach(project => {
				const option = document.createElement('option');
				option.value = project.path; // The full path is the value
				option.textContent = project.path;
				dropdown.appendChild(option);
			});
		}
		
		dropdown.insertAdjacentHTML ('beforeend', '<option value="add_new_project" class="text-accent font-bold">Add New Project...</option>');
		
		// 5. Load last or first project
		const last_project_path = data.last_selected_project;
		if (last_project_path) {
			const options = Array.from(dropdown.options);
			const matching_option = options.find(option => option.value === last_project_path);
			
			if (matching_option) {
				await load_project(last_project_path);
			} else if (data.projects.length > 0) {
				await load_project(data.projects[0].path);
			}
		} else if (data.projects.length > 0) {
			await load_project(data.projects[0].path);
		}
	} catch (error) {
		console.error('Failed to initialize app:', error);
		show_alert('Could not load application data from the server. Please ensure the server is running and check the console.', 'Initialization Error');
	}
}

/**
 * NEW: Sets up listeners related to the new save functionality.
 */
function setup_save_listeners() {
	// Listener for the manual "Save" button click.
	const saveBtn = document.getElementById('save-active-file-btn');
	if (saveBtn) {
		saveBtn.addEventListener('click', () => {
			const activeId = getActiveTabId();
			if (activeId) {
				saveTabContent(activeId);
			}
		});
	}
	
	// Listener to save all modified files when the application window loses focus.
	window.addEventListener('blur', () => {
		saveAllModifiedTabs();
	});
}

// --- Document Ready ---
document.addEventListener('DOMContentLoaded', async function () {
	await load_all_modals_html();
	
	// MODIFIED: Editor initialization is now handled inside initialize_app
	// to ensure it gets the correct initial theme.
	
	initialize_about_modal();
	initialize_analysis_modal();
	initialize_log_modal();
	initialize_search_modal();
	initialize_setup_modal();
	initialize_qa_modal();
	initialize_progress_modal();
	initialize_alert_modal();
	initialize_confirm_modal();
	initialize_resizers();
	initialize_auto_expand_textarea();
	initialize_temperature_slider();
	initialize_tab_scroller();
	initialize_tab_switcher();
	
	// Show the about modal on first visit per session.
	if (!sessionStorage.getItem('aboutModalShown')) {
		open_about_modal();
		sessionStorage.setItem('aboutModalShown', 'true');
	}
	
	// Load main application data and state
	await initialize_app();
	
	setup_about_modal_listeners();
	setup_log_modal_listeners();
	setup_search_modal_listeners();
	setup_setup_modal_listeners();
	setup_qa_listeners();
	setup_direct_prompt_listeners();
	setup_analysis_actions_listener();
	setup_llm_listeners();
	setup_project_listeners();
	setup_file_tree_listeners();
	setup_ui_event_listeners();
	setup_prompt_bar_listeners();
	setup_auto_select_listeners();
	setup_save_listeners(); // NEW: Set up save-related event listeners.
});
