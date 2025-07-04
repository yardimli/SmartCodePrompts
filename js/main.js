// SmartCodePrompts/js/main.js
// --- CORE & STATE IMPORTS ---
import {getProjectIdentifier, postData} from './utils.js';
import {setContentFooterPrompt, setLastSmartPrompt} from './state.js';

// --- MODULE IMPORTS ---
import {setupFileTreeListeners} from './fileTree.js';
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

/**
 * Initializes the entire application on page load.
 */
async function initializeApp() {
	try {
		const data = await postData({action: 'get_main_page_data'});
		
		// 1. Apply Dark Mode
		if (data.darkMode) {
			document.documentElement.setAttribute('data-theme', 'dark');
			document.querySelector('#toggle-mode i').classList.replace('fa-sun', 'fa-moon');
		} else {
			document.documentElement.setAttribute('data-theme', 'light');
			document.querySelector('#toggle-mode i').classList.replace('fa-moon', 'fa-sun');
		}
		
		// 2. Set global prompts from state
		setContentFooterPrompt(data.prompt_content_footer || '');
		setLastSmartPrompt(data.last_smart_prompt || '');
		document.getElementById('prompt-input').value = data.last_smart_prompt || '';
		
		// 3. Initialize UI Components from their respective modules
		initializeLlmSelector(data.llms, data.lastSelectedLlm);
		initializeCompressExtensionsDropdown(data.allowed_extensions, data.compress_extensions);
		initializeStatusBar(data.sessionTokens);
		
		// 4. Populate Projects Dropdown
		const dropdown = document.getElementById('projects-dropdown');
		dropdown.innerHTML = '';
		if (!data.projects || data.projects.length === 0) {
			dropdown.innerHTML = '<option value="">No projects selected</option>';
			document.getElementById('file-tree').innerHTML = '<p class="p-3 text-base-content/70">No projects configured. Please go to "Select Projects" to begin.</p>';
			return;
		}
		data.projects.forEach(project => {
			const identifier = getProjectIdentifier(project);
			const option = document.createElement('option');
			option.value = identifier;
			option.textContent = project.path;
			dropdown.appendChild(option);
		});
		
		// 5. Load last or first project
		const lastProjectIdentifier = data.lastSelectedProject;
		if (lastProjectIdentifier && dropdown.querySelector(`option[value="${lastProjectIdentifier}"]`)) {
			await loadProject(lastProjectIdentifier);
		} else if (data.projects.length > 0) {
			const firstProjectIdentifier = getProjectIdentifier(data.projects[0]);
			await loadProject(firstProjectIdentifier);
		}
	} catch (error) {
		console.error('Failed to initialize app:', error);
		alert('Could not load application data from the server. Please ensure the server is running and check the console.');
	}
}

// --- Document Ready ---
document.addEventListener('DOMContentLoaded', function () {
	// Initialize UI elements first
	initializeModals();
	initializeResizers();
	initializeAutoExpandTextarea();
	initializeTemperatureSlider();
	
	// Load main application data and state
	initializeApp();
	
	// Setup all event listeners from the various modules
	setupModalEventListeners();
	setupAnalysisActionsListener();
	setupLlmListeners();
	setupProjectListeners();
	setupFileTreeListeners();
	setupUIEventListeners();
	setupPromptBarListeners();
});
