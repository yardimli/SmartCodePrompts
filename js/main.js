// llm-php-helper/js/main.js
import {showLoading, hideLoading, getProjectIdentifier, parseProjectIdentifier, postData} from './utils.js';
import {setCurrentProject, setContentFooterPrompt, saveCurrentProjectState} from './state.js';
import {loadFolders, updateSelectedContent, restoreState} from './fileTree.js';
import {initializeModals, handleSearchIconClick, handleAnalysisIconClick, setupModalEventListeners, handlePromptButtonClick} from './modals.js';
import {setupAnalysisButtonListener} from './analysis.js';

/**
 * Loads a project, including its file tree and saved state.
 * @param {string} identifier - The unique project identifier.
 */
async function loadProject(identifier) {
	const project = parseProjectIdentifier(identifier);
	const fileTree = document.getElementById('file-tree');
	if (!project) {
		fileTree.innerHTML = '<p class="p-3 text-muted">Please select a project.</p>';
		return;
	}
	showLoading(`Loading project "${project.path}"...`);
	setCurrentProject(project);
	document.getElementById('projects-dropdown').value = identifier;
	try {
		const savedState = await postData({
			action: 'get_project_state',
			rootIndex: project.rootIndex,
			projectPath: project.path
		});
		await loadFolders(project.path, null);
		await restoreState(savedState || {openFolders: [], selectedFiles: []});
	} catch (error) {
		console.error(`Error loading project ${project.path}:`, error);
		alert(`Error loading project. Check console for details.`);
	} finally {
		hideLoading();
	}
}

/**
 * Initializes the entire application on page load.
 */
async function initializeApp() {
	try {
		const data = await postData({action: 'get_main_page_data'});
		// 1. Apply Dark Mode
		if (data.darkMode) {
			document.body.classList.add('dark-mode');
			document.querySelector('#toggle-mode i').classList.replace('fa-sun', 'fa-moon');
		}
		// 2. Set global prompt footer
		setContentFooterPrompt(data.prompt_content_footer || '');
		// 3. Initialize LLM selector
		if (window.llmHelper && typeof window.llmHelper.initializeLlmSelector === 'function') {
			window.llmHelper.initializeLlmSelector(data.llms, data.lastSelectedLlm);
		} else {
			console.error('LLM helper function not found. Ensure llm.js is loaded before this script.');
		}
		// 4. Populate Projects Dropdown
		const dropdown = document.getElementById('projects-dropdown');
		dropdown.innerHTML = '';
		if (!data.projects || data.projects.length === 0) {
			dropdown.innerHTML = '<option value="">No projects selected</option>';
			document.getElementById('file-tree').innerHTML = '<p class="p-3 text-muted">No projects configured. Please go to "Select Projects" to begin.</p>';
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
	// Initialize components
	initializeModals();
	initializeApp();
	
	// Setup event listeners
	setupModalEventListeners();
	setupAnalysisButtonListener();
	document.getElementById('prompt-button').addEventListener('click', handlePromptButtonClick);
	
	document.getElementById('projects-dropdown').addEventListener('change', function () {
		loadProject(this.value);
	});
	document.getElementById('unselect-all').addEventListener('click', function () {
		document.querySelectorAll('#file-tree input[type="checkbox"]').forEach(cb => (cb.checked = false));
		updateSelectedContent();
		saveCurrentProjectState();
	});
	document.getElementById('toggle-mode').addEventListener('click', function () {
		document.body.classList.toggle('dark-mode');
		const isDarkMode = document.body.classList.contains('dark-mode');
		this.querySelector('i').classList.toggle('fa-sun');
		this.querySelector('i').classList.toggle('fa-moon');
		postData({action: 'set_dark_mode', isDarkMode: isDarkMode});
	});
	
	// Delegated event listener for the file tree
	document.getElementById('file-tree').addEventListener('click', async (e) => {
		const folder = e.target.closest('.folder');
		const searchIcon = e.target.closest('.folder-search-icon');
		const clearIcon = e.target.closest('.folder-clear-icon');
		const analysisIcon = e.target.closest('.analysis-icon');
		
		if (analysisIcon) {
			e.stopPropagation();
			handleAnalysisIconClick(analysisIcon);
			return;
		}
		
		if (searchIcon) {
			e.stopPropagation();
			handleSearchIconClick(searchIcon);
			return;
		}
		
		if (clearIcon) {
			e.stopPropagation();
			const folderPath = clearIcon.closest('.folder').dataset.path;
			if (!folderPath) return;
			const selector = `input[type="checkbox"][data-path^="${folderPath}/"]`;
			let uncheckCount = 0;
			document.querySelectorAll(selector).forEach(cb => {
				if (cb.checked) {
					cb.checked = false;
					uncheckCount++;
				}
			});
			if (uncheckCount > 0) {
				updateSelectedContent();
				saveCurrentProjectState();
			}
			return;
		}
		
		if (folder) {
			e.stopPropagation();
			const ul = folder.nextElementSibling;
			if (folder.classList.contains('open')) {
				folder.classList.remove('open');
				if (ul) ul.style.display = 'none';
				saveCurrentProjectState();
			} else {
				if (ul) {
					folder.classList.add('open');
					ul.style.display = 'block';
					saveCurrentProjectState();
				} else {
					showLoading('Loading folder...');
					folder.classList.add('open');
					try {
						await loadFolders(folder.dataset.path, folder);
						saveCurrentProjectState();
					} catch (err) {
						folder.classList.remove('open');
					} finally {
						hideLoading();
					}
				}
			}
		}
	});
	
	// Delegated listener for checkbox changes
	document.getElementById('file-tree').addEventListener('change', (e) => {
		if (e.target.matches('input[type="checkbox"]')) {
			e.stopPropagation();
			updateSelectedContent();
			saveCurrentProjectState();
		}
	});
});
