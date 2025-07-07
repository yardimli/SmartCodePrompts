// SmartCodePrompts/js/main.js

// --- CORE & STATE IMPORTS ---
import {post_data} from './utils.js';
import {set_content_footer_prompt, set_last_smart_prompt} from './state.js';

// --- MODULE IMPORTS ---
// MODIFIED: Import individual modal setup functions instead of a generic one.
import {initialize_about_modal, open_about_modal, setup_about_modal_listeners} from './modal-about.js';
import {initialize_analysis_modal} from './modal-analysis.js';
import {initialize_file_view_modal} from './modal-file-view.js';
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
import {initialize_direct_prompt_modal, setup_direct_prompt_listeners} from './direct_prompt.js';
import {setup_file_tree_listeners} from './file_tree.js';
import {initialize_progress_modal} from './modal-progress.js';
import {initialize_alert_modal, show_alert} from './modal-alert.js'; // NEW: Import alert modal

// Function to load all individual modal HTML files.
async function load_all_modals_html () {
	const modal_files = [
		'modal-about.html', 'modal-analysis.html', 'modal-direct-prompt.html',
		'modal-file-view.html', 'modal-log.html', 'modal-qa.html',
		'modal-reanalysis.html', 'modal-search.html', 'modal-setup.html',
		'modal-progress.html', 'modal-alert.html' // NEW: Add alert modal to the list
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
		
		// 1. Apply UI States (Dark Mode, Sidebar)
		// MODIFIED: Also set the correct highlight.js theme on initial load.
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
		
		if (data.right_sidebar_collapsed) {
			document.getElementById('app-container').classList.add('right-sidebar-collapsed');
		} else {
			document.getElementById('app-container').classList.remove('right-sidebar-collapsed');
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
		show_alert('Could not load application data from the server. Please ensure the server is running and check the console.', 'Initialization Error'); // MODIFIED: Use custom alert
	}
}

// --- Document Ready ---
document.addEventListener('DOMContentLoaded', async function () {
	// MODIFIED: Load all individual modal HTML files instead of one.
	await load_all_modals_html();
	
	// MODIFIED: Initialize UI elements first, calling individual modal initializers.
	initialize_about_modal();
	initialize_analysis_modal();
	initialize_file_view_modal();
	initialize_log_modal();
	initialize_search_modal();
	initialize_setup_modal();
	initialize_qa_modal();
	initialize_direct_prompt_modal();
	initialize_progress_modal();
	initialize_alert_modal(); // NEW: Initialize the alert modal
	initialize_resizers();
	initialize_auto_expand_textarea();
	initialize_temperature_slider();
	
	// Show the about modal on first visit per session.
	if (!sessionStorage.getItem('aboutModalShown')) {
		// MODIFIED: Use the imported function to open the modal.
		open_about_modal();
		sessionStorage.setItem('aboutModalShown', 'true');
	}
	
	// Load main application data and state
	await initialize_app();
	
	// MODIFIED: Setup all event listeners from the various modules, including new modal listener setups.
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
});
