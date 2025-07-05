// SmartCodePrompts/js/modals.js
import {showLoading, hideLoading, postData} from './utils.js';
import {getCurrentProject, saveCurrentProjectState, getLastSmartPrompt, setLastSmartPrompt} from './state.js';
import {ensureFileIsVisible, updateSelectedContent} from './fileTree.js';
import {updateStatusBar} from './statusBar.js';

let searchModal = null;
let logModal = null;
let reanalysisPromptModal = null;
let projectModal = null; // NEW: Reference for the project browser modal
let currentSearchFolderPath = null;
let currentBrowserPath = null; // NEW: To track the current path in the project browser

/**
 * Initializes the modal element references.
 */
export function initializeModals() {
	searchModal = document.getElementById('searchModal');
	logModal = document.getElementById('logModal');
	reanalysisPromptModal = document.getElementById('reanalysisPromptModal');
	projectModal = document.getElementById('projectModal'); // NEW: Initialize the project modal
}

/**
 * NEW: Fetches and displays a list of directories for the project browser modal.
 * @param {string|null} dirPath - The absolute path of the directory to browse. If null, starts at the top level.
 */
async function browseDirectory(dirPath = null) {
	const listEl = document.getElementById('project-browser-list');
	const pathEl = document.getElementById('project-browser-current-path');
	listEl.innerHTML = '<div class="text-center p-4"><span class="loading loading-lg"></span></div>';
	
	try {
		const data = await postData({action: 'browse_directory', path: dirPath});
		currentBrowserPath = data.current;
		pathEl.textContent = currentBrowserPath || 'Select a drive or directory';
		pathEl.title = currentBrowserPath;
		
		let html = '';
		// Add "up" directory if a parent exists
		if (data.parent) {
			html += `<a href="#" class="block p-2 rounded-md hover:bg-base-300" data-path="${data.parent}"><i class="bi bi-arrow-90deg-up mr-2"></i>..</a>`;
		}
		
		// Add subdirectories
		data.directories.forEach(dir => {
			const separator = currentBrowserPath && (currentBrowserPath.includes('\\')) ? '\\' : '/';
			const isRoot = !currentBrowserPath || currentBrowserPath.endsWith(separator);
			const fullPath = currentBrowserPath ? `${currentBrowserPath}${isRoot ? '' : separator}${dir}` : dir;
			html += `<a href="#" class="block p-2 rounded-md hover:bg-base-300 truncate" data-path="${fullPath}" title="${fullPath}"><i class="bi bi-folder mr-2"></i>${dir}</a>`;
		});
		
		listEl.innerHTML = html || '<p class="text-base-content/70 p-3">No subdirectories found.</p>';
		
	} catch (error) {
		console.error('Failed to browse directory:', error);
		listEl.innerHTML = `<p class="text-error p-3">Could not browse directory: ${error.message}</p>`;
		pathEl.textContent = 'Error';
	}
}

/**
 * NEW: Opens the project browser modal and loads the initial directory list.
 */
export function openProjectModal() {
	projectModal.showModal();
	browseDirectory(); // Start at the root (drives on Windows, home on others)
}

/**
 * Handles the click on the LLM Log button in the status bar.
 * Fetches log data and displays the modal.
 */
export async function handleLogButtonClick() {
	const modalBody = document.getElementById('logModalBody');
	modalBody.innerHTML = '<div class="text-center p-4"><span class="loading loading-lg"></span></div>';
	logModal.showModal();
	
	try {
		const logData = await postData({action: 'get_llm_log'});
		if (!logData || logData.length === 0) {
			modalBody.innerHTML = '<p class="text-base-content/70 p-3">No LLM calls have been made yet.</p>';
			return;
		}
		
		let tableHtml = `
            <div class="overflow-x-auto">
                <table class="table table-sm">
                    <thead>
                        <tr>
                            <th>Timestamp</th>
                            <th>Reason</th>
                            <th>Model</th>
                            <th class="text-right">Prompt Tokens</th>
                            <th class="text-right">Completion Tokens</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
		
		for (const entry of logData) {
			const timestamp = new Date(entry.timestamp).toLocaleString();
			tableHtml += `
                <tr class="hover">
                    <td class="log-timestamp">${timestamp}</td>
                    <td class="log-reason">${entry.reason}</td>
                    <td class="log-model">${entry.modelId || 'N/A'}</td>
                    <td class="log-tokens text-right">${(entry.promptTokens || 0).toLocaleString()}</td>
                    <td class="log-tokens text-right">${(entry.completionTokens || 0).toLocaleString()}</td>
                </tr>
            `;
		}
		
		tableHtml += '</tbody></table></div>';
		modalBody.innerHTML = tableHtml;
	} catch (error) {
		console.error("Failed to fetch LLM log:", error);
		modalBody.innerHTML = `<p class="text-error p-3">Could not load LLM log: ${error.message}</p>`;
	}
}

/**
 * Handles the click event on a folder's search icon.
 */
export function handleSearchIconClick(target) {
	currentSearchFolderPath = target.closest('.folder').dataset.path;
	document.getElementById('searchModalFolderPath').textContent = currentSearchFolderPath || 'Root';
	searchModal.showModal();
}

/**
 * Handles the click event on a file's analysis icon.
 * This now injects the analysis content directly into the #analysis-view div.
 */
export async function handleAnalysisIconClick(target) {
	const filePath = target.dataset.path;
	const analysisView = document.getElementById('analysis-view');
	const promptTextarea = document.getElementById('selected-content');
	
	promptTextarea.classList.add('hidden');
	analysisView.innerHTML = '<div class="text-center p-4"><span class="loading loading-lg"></span></div>';
	analysisView.classList.remove('hidden');
	
	try {
		const currentProject = getCurrentProject();
		const data = await postData({
			action: 'get_file_analysis',
			projectPath: currentProject.path,
			filePath: filePath
		});
		
		let bodyContent = '<p>No analysis data found for this file.</p>';
		if (data.file_overview || data.functions_overview) {
			bodyContent = '';
			const renderJson = (title, jsonString) => {
				let content;
				try {
					const parsed = JSON.parse(jsonString);
					content = JSON.stringify(parsed, null, 2);
				} catch (err) {
					content = jsonString;
				}
				return `<h6 class="font-bold mt-2">${title}</h6><pre class="bg-base-300 p-2 rounded-md text-xs overflow-auto">${content}</pre>`;
			};
			if (data.file_overview) {
				bodyContent += renderJson('File Overview', data.file_overview);
			}
			if (data.functions_overview) {
				bodyContent += renderJson('Functions & Logic', data.functions_overview);
			}
		}
		
		analysisView.innerHTML = `
            <div class="p-4 h-full flex flex-col">
                <div id="analysis-view-header" class="flex justify-between items-center mb-2 flex-shrink-0">
                    <h2 id="analysis-view-title" class="text-lg font-bold truncate" title="Analysis for ${filePath}">Analysis for ${filePath}</h2>
                    <button id="close-analysis-view" class="btn btn-sm btn-ghost">
                        <i class="bi bi-x-lg"></i> Close
                    </button>
                </div>
                <div id="analysis-view-body" class="flex-grow overflow-y-auto">
                    ${bodyContent}
                </div>
            </div>
        `;
		
	} catch (error) {
		analysisView.innerHTML = `<p class="text-error p-4">Error fetching analysis: ${error.message}</p>`;
	}
}

/**
 * Performs the "smart prompt" action to select relevant files using an LLM.
 * @param {string} userPrompt - The user's high-level request.
 */
export async function performSmartPrompt(userPrompt) {
	const trimmedPrompt = userPrompt.trim();
	if (!trimmedPrompt) {
		alert('Please enter a prompt.');
		return;
	}
	const llmId = document.getElementById('llm-dropdown').value;
	if (!llmId) {
		alert('Please select an LLM from the dropdown.');
		return;
	}
	
	setLastSmartPrompt(userPrompt);
	
	showLoading('Asking LLM to select relevant files...');
	try {
		const currentProject = getCurrentProject();
		const response = await postData({
			action: 'get_relevant_files_from_prompt',
			projectPath: currentProject.path,
			userPrompt: trimmedPrompt,
			llmId: llmId,
			temperature: document.getElementById('temperature-slider').value
		});
		
		if (response.relevant_files && response.relevant_files.length > 0) {
			document.querySelectorAll('#file-tree input[type="checkbox"]').forEach(cb => (cb.checked = false));
			
			let checkedCount = 0;
			for (const filePath of response.relevant_files) {
				const isVisible = await ensureFileIsVisible(filePath);
				if (isVisible) {
					const checkbox = document.querySelector(`#file-tree input[type="checkbox"][data-path="${filePath}"]`);
					if (checkbox) {
						checkbox.checked = true;
						checkedCount++;
					}
				}
			}
			
			await updateSelectedContent();
			saveCurrentProjectState();
			alert(`LLM selected ${checkedCount} relevant file(s). Prompt has been built.`);
		} else {
			alert("The LLM did not identify any relevant files from the project's analyzed files. No changes were made.");
		}
	} catch (error) {
		console.error('Failed to get relevant files from prompt:', error);
		alert(`An error occurred: ${error.message}`);
	} finally {
		hideLoading();
	}
}

/**
 * Sets up event listeners for modal-related controls.
 */
export function setupModalEventListeners() {
	// Search Modal Listeners
	document.getElementById('searchTermInput').addEventListener('keypress', e => {
		if (e.key === 'Enter') {
			document.getElementById('performSearchButton').click();
		}
	});
	
	document.getElementById('performSearchButton').addEventListener('click', async function () {
		const searchTerm = document.getElementById('searchTermInput').value.trim();
		searchModal.close();
		if (!searchTerm || !currentSearchFolderPath) return;
		
		showLoading('Searching files...');
		try {
			const currentProject = getCurrentProject();
			const response = await postData({
				action: 'search_files',
				folderPath: currentSearchFolderPath,
				searchTerm: searchTerm,
				projectPath: currentProject.path
			});
			
			if (response.matchingFiles && response.matchingFiles.length > 0) {
				let successfulChecks = 0;
				for (const filePath of response.matchingFiles) {
					const isVisible = await ensureFileIsVisible(filePath);
					if (isVisible) {
						const checkbox = document.querySelector(`#file-tree input[type="checkbox"][data-path="${filePath}"]`);
						if (checkbox && !checkbox.checked) {
							checkbox.checked = true;
							successfulChecks++;
						}
					}
				}
				if (successfulChecks > 0) {
					updateSelectedContent();
					saveCurrentProjectState();
					alert(`Selected ${successfulChecks} new file(s) containing "${searchTerm}".`);
				} else {
					alert(`Found files containing "${searchTerm}", but no *new* files were selected.`);
				}
			} else {
				alert(`No files found containing "${searchTerm}" in "${currentSearchFolderPath}".`);
			}
		} catch (error) {
			alert(`Search failed: ${error.message || 'Unknown error'}`);
		} finally {
			hideLoading();
		}
	});
	
	// LLM Log Modal Listeners
	document.getElementById('log-modal-button').addEventListener('click', handleLogButtonClick);
	
	document.getElementById('reset-log-button').addEventListener('click', async () => {
		if (confirm('Are you sure you want to permanently delete the LLM call log and reset all token counters? This cannot be undone.')) {
			showLoading('Resetting log...');
			try {
				await postData({action: 'reset_llm_log'});
				await handleLogButtonClick();
				updateStatusBar({prompt: 0, completion: 0});
			} catch (error) {
				console.error('Failed to reset log:', error);
				alert(`Failed to reset log: ${error.message}`);
			} finally {
				hideLoading();
			}
		}
	});
	
	// Analysis View Close Button Listener (delegated)
	document.getElementById('workspace').addEventListener('click', (e) => {
		if (e.target.closest('#close-analysis-view')) {
			document.getElementById('analysis-view').classList.add('hidden');
			document.getElementById('selected-content').classList.remove('hidden');
		}
	});
	
	// NEW: Project Modal Listeners
	document.getElementById('add-project-button').addEventListener('click', openProjectModal);
	
	document.getElementById('project-browser-list').addEventListener('click', (e) => {
		e.preventDefault();
		const target = e.target.closest('a');
		if (target && target.dataset.path) {
			browseDirectory(target.dataset.path);
		}
	});
	
	document.getElementById('select-project-folder-button').addEventListener('click', async () => {
		if (!currentBrowserPath) {
			alert('No folder is selected.');
			return;
		}
		showLoading('Adding project...');
		try {
			await postData({action: 'add_project', path: currentBrowserPath});
			projectModal.close();
			// Reload the page to refresh the project list and load the new project.
			window.location.reload();
		} catch (error) {
			console.error('Failed to add project:', error);
			alert(`Failed to add project: ${error.message}`);
		} finally {
			hideLoading();
		}
	});
}
