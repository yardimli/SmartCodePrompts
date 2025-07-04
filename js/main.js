// llm-php-helper/js/main.js
import {showLoading, hideLoading, getProjectIdentifier, parseProjectIdentifier, postData} from './utils.js';
import {
	setCurrentProject,
	setContentFooterPrompt,
	saveCurrentProjectState,
	getCurrentProject,
	setLastSmartPrompt
} from './state.js';
import {loadFolders, updateSelectedContent, restoreState} from './fileTree.js';
import {
	initializeModals,
	handleSearchIconClick,
	handleAnalysisIconClick,
	setupModalEventListeners,
	handleLogButtonClick,
	performSmartPrompt
} from './modals.js';
import {setupAnalysisActionsListener} from './analysis.js';
import {initializeLlmSelector, setupLlmListeners} from './llm.js';

/**
 * Updates the status bar with the latest session and progress data.
 * @param {object} stats - The stats object from the server.
 * @param {object} stats.tokens - Token usage { prompt, completion }.
 * @param {object} stats.reanalysis - Reanalysis progress { running, current, total, message }.
 */
function updateStatusBar(stats) {
	const promptTokensEl = document.getElementById('prompt-tokens');
	const completionTokensEl = document.getElementById('completion-tokens');
	const progressContainer = document.getElementById('status-bar-progress-container');
	const progressText = document.getElementById('status-bar-progress-text');
	const progressBar = document.getElementById('status-bar-progress-bar');
	const statusMessageEl = document.getElementById('status-bar-message');
	
	// Update token counts
	if (stats.tokens && promptTokensEl && completionTokensEl) {
		promptTokensEl.textContent = (stats.tokens.prompt || 0).toLocaleString();
		completionTokensEl.textContent = (stats.tokens.completion || 0).toLocaleString();
	}
	
	// Update re-analysis progress
	if (stats.reanalysis && stats.reanalysis.running && stats.reanalysis.total > 0) {
		const percent = Math.round((stats.reanalysis.current / stats.reanalysis.total) * 100);
		progressText.textContent = `Re-analyzing... (${stats.reanalysis.current}/${stats.reanalysis.total})`;
		progressBar.value = percent; // MODIFIED: Set value for <progress> element
		progressContainer.style.display = 'flex';
		statusMessageEl.textContent = stats.reanalysis.message;
		statusMessageEl.title = stats.reanalysis.message;
	} else {
		progressContainer.style.display = 'none';
		statusMessageEl.textContent = '';
		statusMessageEl.title = '';
	}
}

/**
 * Periodically fetches session stats from the server and updates the UI.
 * This assumes a 'get_session_stats' action exists on the backend.
 */
function pollSessionStats() {
	setInterval(async () => {
		try {
			// This action needs to be implemented in the main server file to return the stats.
			const stats = await postData({action: 'get_session_stats'});
			updateStatusBar(stats);
		} catch (error) {
			console.error("Could not poll session stats:", error);
			const statusMessageEl = document.getElementById('status-bar-message');
			if (statusMessageEl) {
				statusMessageEl.textContent = 'Error updating status.';
			}
		}
	}, 2000);
}

/**
 * Loads a project, including its file tree and saved state.
 * @param {string} identifier - The unique project identifier.
 */
async function loadProject(identifier) {
	const project = parseProjectIdentifier(identifier);
	const fileTree = document.getElementById('file-tree');
	if (!project) {
		fileTree.innerHTML = '<p class="p-3 text-base-content/70">Please select a project.</p>';
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
 * NEW: Populates the compress extensions dropdown with checkboxes.
 * @param {string} allowedExtensionsJson - JSON string array of all possible extensions.
 * @param {string} compressedExtensionsJson - JSON string array of extensions to be checked.
 */
function initializeCompressExtensionsDropdown(allowedExtensionsJson, compressedExtensionsJson) {
	const container = document.getElementById('compress-extensions-list');
	if (!container) return;
	
	try {
		const allowed = JSON.parse(allowedExtensionsJson);
		const compressed = new Set(JSON.parse(compressedExtensionsJson));
		
		if (!Array.isArray(allowed) || allowed.length === 0) {
			container.innerHTML = '<li><a class="p-2 text-base-content/70 text-sm">No extensions configured.</a></li>';
			return;
		}
		
		allowed.sort(); // Sort alphabetically for consistency
		let content = '';
		for (const ext of allowed) {
			const isChecked = compressed.has(ext);
			const id = `compress-ext-${ext.replace('.', '')}`;
			// MODIFIED: Use DaisyUI structure for checkbox items in a dropdown menu.
			content += `
                <li>
                    <label for="${id}" class="label cursor-pointer p-2">
                        <span class="label-text">.${ext}</span>
                        <input type="checkbox" value="${ext}" id="${id}" class="checkbox checkbox-primary" ${isChecked ? 'checked' : ''}>
                    </label>
                </li>
            `;
		}
		container.innerHTML = content;
	} catch (e) {
		console.error("Failed to parse extension settings:", e);
		container.innerHTML = '<li><a class="p-2 text-error text-sm">Error loading settings.</a></li>';
	}
}

/**
 * NEW: Adjusts the height of the bottom prompt textarea to fit its content.
 */
function adjustPromptTextareaHeight() {
	const textarea = document.getElementById('prompt-input');
	if (!textarea) return;
	// Temporarily reset height to 'auto' to get the correct scrollHeight
	textarea.style.height = 'auto';
	// Set the height to the scrollHeight to fit the content
	textarea.style.height = `${textarea.scrollHeight}px`;
}

/**
 * Initializes the entire application on page load.
 */
async function initializeApp() {
	try {
		const data = await postData({action: 'get_main_page_data'});
		
		// 1. Apply Dark Mode
		// MODIFIED: Use DaisyUI theme system instead of a body class.
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
		// NEW: Populate the bottom prompt input with the last saved prompt.
		document.getElementById('prompt-input').value = data.last_smart_prompt || '';
		// NEW: Adjust textarea height based on the loaded content.
		adjustPromptTextareaHeight();
		
		// 3. Initialize LLM selector
		initializeLlmSelector(data.llms, data.lastSelectedLlm);
		
		// Initialize compress extensions dropdown.
		initializeCompressExtensionsDropdown(data.allowed_extensions, data.compress_extensions);
		
		// Initialize status bar with initial data from page load.
		if (data.sessionTokens) {
			updateStatusBar({tokens: data.sessionTokens, reanalysis: {running: false}}); // Assume not running on initial load
		}
		
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

/**
 * NEW: Initializes the vertical and horizontal resizers for the layout.
 */
function initializeResizers() {
	const verticalResizer = document.getElementById('vertical-resizer');
	const horizontalResizer = document.getElementById('horizontal-resizer');
	const mainSplitPane = document.getElementById('main-split-pane');
	const fileTreePane = document.getElementById('file-tree-pane');
	const bottomPanel = document.getElementById('bottom-panel');
	
	// Vertical Resizer (File Tree width)
	if (verticalResizer && mainSplitPane && fileTreePane) {
		verticalResizer.addEventListener('mousedown', (e) => {
			e.preventDefault();
			document.body.style.cursor = 'col-resize';
			document.body.style.userSelect = 'none';
			
			const startX = e.clientX;
			const startWidth = fileTreePane.offsetWidth;
			
			const doDrag = (e) => {
				const newWidth = startWidth + e.clientX - startX;
				// Add constraints for min/max width
				if (newWidth >= 200 && newWidth <= 600) {
					mainSplitPane.style.gridTemplateColumns = `${newWidth}px auto 1fr`;
				}
			};
			
			const stopDrag = () => {
				document.body.style.cursor = 'default';
				document.body.style.userSelect = 'auto';
				document.removeEventListener('mousemove', doDrag);
				document.removeEventListener('mouseup', stopDrag);
			};
			
			document.addEventListener('mousemove', doDrag);
			document.addEventListener('mouseup', stopDrag);
		});
	}
	
	// Horizontal Resizer (Bottom Panel height)
	if (horizontalResizer && bottomPanel) {
		horizontalResizer.addEventListener('mousedown', (e) => {
			e.preventDefault();
			document.body.style.cursor = 'row-resize';
			document.body.style.userSelect = 'none';
			
			const startY = e.clientY;
			const startHeight = bottomPanel.offsetHeight;
			
			const doDrag = (e) => {
				// Dragging up increases height, so we subtract the delta
				const newHeight = startHeight - (e.clientY - startY);
				// Add constraints for min/max height. Max 300px allows for a large prompt area.
				if (newHeight >= 80 && newHeight <= 300) {
					bottomPanel.style.height = `${newHeight}px`;
				}
			};
			
			const stopDrag = () => {
				document.body.style.cursor = 'default';
				document.body.style.userSelect = 'auto';
				document.removeEventListener('mousemove', doDrag);
				document.removeEventListener('mouseup', stopDrag);
			};
			
			document.addEventListener('mousemove', doDrag);
			document.addEventListener('mouseup', stopDrag);
		});
	}
}

/**
 * NEW: Sets up the event listener for the auto-expanding textarea.
 */
function initializeAutoExpandTextarea() {
	const promptInput = document.getElementById('prompt-input');
	if (promptInput) {
		promptInput.addEventListener('input', adjustPromptTextareaHeight);
	}
}

// --- Document Ready ---
document.addEventListener('DOMContentLoaded', function () {
	// Initialize components
	initializeModals();
	initializeApp();
	initializeResizers();
	initializeAutoExpandTextarea(); // NEW: Setup auto-expanding textarea.
	
	// Setup event listeners
	setupModalEventListeners();
	setupAnalysisActionsListener();
	setupLlmListeners();
	
	// MODIFIED: Event listener for DaisyUI dropdown needs to be on the parent `ul`.
	document.getElementById('compress-extensions-list').addEventListener('change', (e) => {
		if (e.target.matches('input[type="checkbox"]')) {
			const checkboxes = document.querySelectorAll('#compress-extensions-list input[type="checkbox"]:checked');
			const selectedExtensions = Array.from(checkboxes).map(cb => cb.value);
			postData({
				action: 'save_compress_extensions',
				extensions: JSON.stringify(selectedExtensions)
			}).then(() => {
				// On success, reload the content of selected files to apply new settings.
				updateSelectedContent();
			}).catch(err => {
				console.error("Failed to save compress extensions setting:", err);
				alert("Could not save compression setting. See console for details.");
			});
		}
	});
	
	// Start polling for status updates for tokens and progress.
	pollSessionStats();
	
	// MODIFIED: The bottom run button now directly invokes the smart prompt action.
	document.getElementById('bottom-run-button').addEventListener('click', () => {
		const promptInput = document.getElementById('prompt-input');
		const promptText = promptInput.value.trim();
		if (!promptText) {
			alert('Please enter a prompt first.');
			return;
		}
		// MODIFIED: Directly call the smart prompt action instead of opening a modal.
		// The input is not cleared, and the prompt is saved by performSmartPrompt.
		performSmartPrompt(promptText);
	});
	
	// NEW: Event listener for the "Re-Analyze and Run" button.
	document.getElementById('reanalyze-and-run-button').addEventListener('click', async () => {
		const promptInput = document.getElementById('prompt-input');
		const promptText = promptInput.value.trim();
		if (!promptText) {
			alert('Please enter a prompt first.');
			return;
		}
		
		const llmId = document.getElementById('llm-dropdown').value;
		const currentProject = getCurrentProject();
		const temperature = document.getElementById('temperature-slider').value;
		
		if (!llmId || !currentProject) {
			alert('Please select a project and an LLM.');
			return;
		}
		
		showLoading('Re-analyzing modified files...');
		try {
			await postData({
				action: 'reanalyze_modified_files',
				rootIndex: currentProject.rootIndex,
				projectPath: currentProject.path,
				llmId: llmId,
				force: false, // Only re-analyze modified files
				temperature: parseFloat(temperature)
			});
			// The status bar polling will handle progress display and clearing.
			await performSmartPrompt(promptText);
		} catch (error) {
			console.error('Failed to re-analyze and run:', error);
			alert(`An error occurred during the process: ${error.message}`);
		} finally {
			hideLoading();
		}
	});
	
	document.getElementById('log-modal-button').addEventListener('click', handleLogButtonClick);
	
	document.getElementById('projects-dropdown').addEventListener('change', function () {
		loadProject(this.value);
	});
	
	document.getElementById('unselect-all').addEventListener('click', function () {
		document.querySelectorAll('#file-tree input[type="checkbox"]').forEach(cb => (cb.checked = false));
		updateSelectedContent();
		saveCurrentProjectState();
	});
	
	// MODIFIED: Dark mode toggle now sets the `data-theme` attribute on the <html> element.
	document.getElementById('toggle-mode').addEventListener('click', function () {
		const html = document.documentElement;
		const isDarkMode = html.getAttribute('data-theme') === 'dark';
		const newTheme = isDarkMode ? 'light' : 'dark';
		html.setAttribute('data-theme', newTheme);
		
		this.querySelector('i').classList.toggle('fa-sun', !isDarkMode);
		this.querySelector('i').classList.toggle('fa-moon', isDarkMode);
		
		postData({action: 'set_dark_mode', isDarkMode: !isDarkMode});
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
	
	// NEW: Delegated listener for the workspace, specifically for closing the analysis view.
	document.getElementById('workspace').addEventListener('click', (e) => {
		if (e.target.id === 'close-analysis-view') {
			document.getElementById('analysis-view').classList.add('hidden');
			document.getElementById('selected-content').classList.remove('hidden');
			// MODIFIED: Null-check for the title element which has been removed.
			const mainTitle = document.getElementById('main-content-title');
			if (mainTitle) {
				mainTitle.textContent = 'Prompt Builder';
			}
		}
	});
});
