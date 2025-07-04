// SmartCodePrompts/js/modals.js
import {showLoading, hideLoading, postData} from './utils.js';
import {getCurrentProject, saveCurrentProjectState, getLastSmartPrompt, setLastSmartPrompt} from './state.js';
import {ensureFileIsVisible, updateSelectedContent} from './fileTree.js';
import {updateStatusBar} from './statusBar.js'; // NEW: Import status bar updater

let searchModal = null;
let logModal = null;
let reanalysisPromptModal = null; // ADDED: Reference for the new modal
let currentSearchFolderPath = null;

/**
 * Initializes the modal element references.
 */
export function initializeModals() {
	searchModal = document.getElementById('searchModal');
	logModal = document.getElementById('logModal');
	reanalysisPromptModal = document.getElementById('reanalysisPromptModal'); // ADDED: Initialize the new modal
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
			const timestamp = new Date(entry.timestamp).toLocaleString(); // MODIFIED: Use toLocaleString for date and time
			tableHtml += `
                <tr class="hover">
                    <td class="log-timestamp">${timestamp}</td>
                    <td class="log-reason">${entry.reason}</td>
                    <td class="log-model">${entry.modelId || 'N/A'}</td>
                    <td class="log-tokens">${(entry.promptTokens || 0).toLocaleString()}</td>
                    <td class="log-tokens">${(entry.completionTokens || 0).toLocaleString()}</td>
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
 * this now injects the analysis
 * content directly into the #analysis-view div in the main workspace.
 */
export async function handleAnalysisIconClick(target) {
	const filePath = target.dataset.path;
	const analysisView = document.getElementById('analysis-view');
	const promptTextarea = document.getElementById('selected-content');
	const mainTitle = document.getElementById('main-content-title');
	
	// Show loading state and switch views
	if (mainTitle) mainTitle.textContent = `Analyzing ${filePath}...`;
	promptTextarea.classList.add('hidden');
	analysisView.innerHTML = '<div class="text-center p-4"><span class="loading loading-lg"></span></div>';
	analysisView.classList.remove('hidden');
	
	try {
		const currentProject = getCurrentProject();
		const data = await postData({
			action: 'get_file_analysis',
			rootIndex: currentProject.rootIndex,
			projectPath: currentProject.path,
			filePath: filePath
		});
		
		let bodyContent = '<p>No analysis data found for this file.</p>';
		if (data.file_overview || data.functions_overview) {
			bodyContent = '';
			if (data.file_overview) {
				try {
					const overview = JSON.parse(data.file_overview);
					bodyContent += `<h6>File Overview</h6><pre>${JSON.stringify(overview, null, 2)}</pre>`;
				} catch (err) {
					bodyContent += `<h6>File Overview (Raw)</h6><pre>${data.file_overview}</pre>`;
				}
			}
			if (data.functions_overview) {
				try {
					const functions = JSON.parse(data.functions_overview);
					bodyContent += `<h6>Functions & Logic</h6><pre>${JSON.stringify(functions, null, 2)}</pre>`;
				} catch (err) {
					bodyContent += `<h6>Functions & Logic (Raw)</h6><pre>${data.functions_overview}</pre>`;
				}
			}
		}
		
		// Construct the full analysis view HTML
		analysisView.innerHTML = `
            <div id="analysis-view-header">
                <h2 id="analysis-view-title">Analysis for ${filePath}</h2>
                <button id="close-analysis-view" class="btn btn-sm btn-ghost">
                    <i class="fa-solid fa-times"></i> Close
                </button>
            </div>
            <div id="analysis-view-body">
                ${bodyContent}
            </div>
        `;
		if (mainTitle) mainTitle.textContent = 'File Analysis';
		
	} catch (error) {
		analysisView.innerHTML = `<p class="text-error p-4">Error fetching analysis: ${error.message}</p>`;
		if (mainTitle) mainTitle.textContent = 'Error';
	}
}

/**
 * Performs the "smart prompt" action to select relevant files using an LLM.
 * This logic was extracted from the 'sendPromptButton' event listener and is now called
 * from both the modal and the main bottom prompt bar.
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
			rootIndex: currentProject.rootIndex,
			projectPath: currentProject.path,
			userPrompt: trimmedPrompt,
			llmId: llmId,
		});
		
		if (response.relevant_files && response.relevant_files.length > 0) {
			// Uncheck all files
			document.querySelectorAll('#file-tree input[type="checkbox"]').forEach(cb => {
				cb.checked = false;
			});
			
			// Check only the relevant files, ensuring they are visible
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
			
			// Now update the main content area with the new selection
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
				rootIndex: currentProject.rootIndex
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
	
	// LLM Log Modal Button Listener
	document.getElementById('log-modal-button').addEventListener('click', handleLogButtonClick);
	
	// NEW: LLM Log Reset Button Listener
	document.getElementById('reset-log-button').addEventListener('click', async () => {
		if (confirm('Are you sure you want to permanently delete the LLM call log and reset all token counters? This cannot be undone.')) {
			showLoading('Resetting log...');
			try {
				await postData({action: 'reset_llm_log'});
				// Refresh the modal view by re-triggering the log fetch
				await handleLogButtonClick();
				// Refresh the status bar with the new zeroed counts
				const stats = await postData({action: 'get_session_stats'});
				updateStatusBar(stats);
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
		if (e.target.id === 'close-analysis-view') {
			document.getElementById('analysis-view').classList.add('hidden');
			document.getElementById('selected-content').classList.remove('hidden');
			const mainTitle = document.getElementById('main-content-title');
			if (mainTitle) {
				mainTitle.textContent = 'Prompt Builder';
			}
		}
	});
}
