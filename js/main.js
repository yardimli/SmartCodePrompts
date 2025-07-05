// SmartCodePrompts/js/main.js
// --- CORE & STATE IMPORTS ---
import {postData} from './utils.js';
import {setContentFooterPrompt, setLastSmartPrompt} from './state.js';

// --- MODULE IMPORTS ---
import {setupFileTreeListeners} from './fileTree.js';
// MODIFIED: Removed import for initializeProjectModal as it's handled by initializeModals
import {initializeModals, setupModalEventListeners} from './modals.js';
import {setupAnalysisActionsListener} from './analysis.js';
import {initializeLlmSelector, setupLlmListeners} from './llm.js';
import {initializeStatusBar} from './statusBar.js';
import {loadProject, setupProjectListeners} from './project.js';
import {initializeAutoExpandTextarea, setupPromptBarListeners} from './prompt.js';
import {
	initializeCompressExtensionsDropdown,
	initializeResizers,
	initializeTemperatureSlider,
	setupUIEventListeners
} from './uiComponents.js';
import {initializeQAModal, setupQAListeners} from './qa.js';
import {initializeDirectPromptModal, setupDirectPromptListeners} from './directPrompt.js';

/**
 * Initializes the entire application on page load.
 */
async function initializeApp() {
	function adjustPromptTextareaHeight() {
		const textarea = document.getElementById('prompt-input');
		if (!textarea) return;
		textarea.style.height = 'auto';
		textarea.style.height = `${textarea.scrollHeight}px`;
	}
	
	try {
		const data = await postData({action: 'get_main_page_data'});
		
		// 1. Apply UI States (Dark Mode, Sidebar)
		if (data.darkMode) {
			document.documentElement.setAttribute('data-theme', 'dark');
			document.querySelector('#toggle-mode i').classList = 'bi-moon';
		} else {
			document.documentElement.setAttribute('data-theme', 'light');
			document.querySelector('#toggle-mode i').classList = 'bi-sun';
		}
		
		if (data.rightSidebarCollapsed) {
			document.getElementById('app-container').classList.add('right-sidebar-collapsed');
		} else {
			document.getElementById('app-container').classList.remove('right-sidebar-collapsed');
		}
		
		// 2. Set global prompts from state
		setContentFooterPrompt(data.prompt_content_footer || '');
		setLastSmartPrompt(data.last_smart_prompt || '');
		document.getElementById('prompt-input').value = data.last_smart_prompt || '';
		adjustPromptTextareaHeight();
		
		// 3. Initialize UI Components from their respective modules
		initializeLlmSelector(data.llms, data.lastSelectedLlm);
		initializeCompressExtensionsDropdown(data.allowed_extensions, data.compress_extensions);
		initializeStatusBar(data.sessionTokens);
		
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
		dropdown.insertAdjacentHTML('beforeend', '<option value="add_new_project" class="text-accent font-bold">Add New Project...</option>');
		
		// 5. Load last or first project
		const lastProjectPath = data.lastSelectedProject;
		if (lastProjectPath && dropdown.querySelector(`option[value="${lastProjectPath}"]`)) {
			await loadProject(lastProjectPath);
		} else if (data.projects.length > 0) {
			await loadProject(data.projects[0].path);
		}
	} catch (error) {
		console.error('Failed to initialize app:', error);
		alert('Could not load application data from the server. Please ensure the server is running and check the console.');
	}
}

// --- Document Ready ---
document.addEventListener('DOMContentLoaded', function () {
	// Initialize UI elements first
	initializeModals(); // This function now initializes the project modal as well.
	initializeQAModal();
	initializeDirectPromptModal();
	// REMOVED: The redundant call to initializeProjectModal()
	initializeResizers();
	initializeAutoExpandTextarea();
	initializeTemperatureSlider();
	
	// Load main application data and state
	initializeApp();
	
	// Setup all event listeners from the various modules
	setupModalEventListeners();
	setupQAListeners();
	setupDirectPromptListeners();
	setupAnalysisActionsListener();
	setupLlmListeners();
	setupProjectListeners();
	setupFileTreeListeners();
	setupUIEventListeners();
	setupPromptBarListeners();
});
