// SmartCodePrompts/js/main.js
// --- CORE & STATE IMPORTS ---
import {post_data} from './utils.js';
import {set_content_footer_prompt, set_last_smart_prompt} from './state.js';

// --- MODULE IMPORTS ---
import {setup_file_tree_listeners} from './file_tree.js';
// MODIFIED: Removed import for initialize_project_modal as it's handled by initialize_modals
import {initialize_modals, setup_modal_event_listeners} from './modals.js';
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
		if (data.dark_mode) {
			document.documentElement.setAttribute('data-theme', 'dark');
			document.querySelector('#toggle-mode i').classList = 'bi-moon';
		} else {
			document.documentElement.setAttribute('data-theme', 'light');
			document.querySelector('#toggle-mode i').classList = 'bi-sun';
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
		initialize_llm_selector(data.llms, data.last_selected_llm);
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
		// Add the "Add New Project" option at the end
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
		alert('Could not load application data from the server. Please ensure the server is running and check the console.');
	}
}

// --- Document Ready ---
document.addEventListener('DOMContentLoaded', function () {
	// Initialize UI elements first
	initialize_modals(); // This function now initializes the project modal as well.
	initialize_qa_modal();
	initialize_direct_prompt_modal();
	// REMOVED: The redundant call to initialize_project_modal()
	initialize_resizers();
	initialize_auto_expand_textarea();
	initialize_temperature_slider();
	
	// Load main application data and state
	initialize_app();
	
	// Setup all event listeners from the various modules
	setup_modal_event_listeners();
	setup_qa_listeners();
	setup_direct_prompt_listeners();
	setup_analysis_actions_listener();
	setup_llm_listeners();
	setup_project_listeners();
	setup_file_tree_listeners();
	setup_ui_event_listeners();
	setup_prompt_bar_listeners();
});
