// llm-php-helper/js/modals.js
import {showLoading, hideLoading, postData} from './utils.js';
// MODIFIED: Import functions to get and set the last smart prompt from state.
import {getCurrentProject, saveCurrentProjectState, getLastSmartPrompt, setLastSmartPrompt} from './state.js';
import {ensureFileIsVisible, updateSelectedContent} from './fileTree.js';

let searchModal = null;
let analysisModal = null;
let promptModal = null;
let logModal = null; // NEW: Modal instance for the LLM log.
let currentSearchFolderPath = null;

/**
 * Initializes the Bootstrap modal instances.
 */
export function initializeModals() {
	searchModal = new bootstrap.Modal(document.getElementById('searchModal'));
	analysisModal = new bootstrap.Modal(document.getElementById('analysisModal'));
	promptModal = new bootstrap.Modal(document.getElementById('promptModal'));
	logModal = new bootstrap.Modal(document.getElementById('logModal')); // NEW: Initialize the log modal.
}

/**
 * Handles the click event on the main "PROMPT" button.
 */
export function handlePromptButtonClick() {
	const textarea = document.getElementById('promptModalTextarea');
	if (textarea) {
		// MODIFIED: Populate with the last used prompt from state.
		textarea.value = getLastSmartPrompt();
		// MODIFIED: Select the text for easy editing or replacement.
		textarea.select();
	}
	promptModal.show();
}

/**
 * NEW: Handles the click on the LLM Log button in the status bar.
 * Fetches log data and displays the modal.
 */
export async function handleLogButtonClick() {
	const modalBody = document.getElementById('logModalBody');
	modalBody.innerHTML = '<div class="text-center p-4"><div class="spinner-border" role="status"><span class="visually-hidden">Loading...</span></div></div>';
	logModal.show();
	
	try {
		const logData = await postData({action: 'get_llm_log'});
		if (!logData || logData.length === 0) {
			modalBody.innerHTML = '<p class="text-muted p-3">No LLM calls have been made in this session yet.</p>';
			return;
		}
		
		let tableHtml = `
            <table class="table table-sm table-hover">
                <thead>
                    <tr>
                        <th>Timestamp</th>
                        <th>Reason</th>
                        <th class="text-end">Prompt Tokens</th>
                        <th class="text-end">Completion Tokens</th>
                    </tr>
                </thead>
                <tbody>
        `;
		
		for (const entry of logData) {
			const timestamp = new Date(entry.timestamp).toLocaleTimeString();
			tableHtml += `
                <tr>
                    <td class="log-timestamp">${timestamp}</td>
                    <td class="log-reason">${entry.reason}</td>
                    <td class="log-tokens">${(entry.promptTokens || 0).toLocaleString()}</td>
                    <td class="log-tokens">${(entry.completionTokens || 0).toLocaleString()}</td>
                </tr>
            `;
		}
		
		tableHtml += '</tbody></table>';
		modalBody.innerHTML = tableHtml;
	} catch (error) {
		console.error("Failed to fetch LLM log:", error);
		modalBody.innerHTML = `<p class="text-danger p-3">Could not load LLM log: ${error.message}</p>`;
	}
}

/**
 * Handles the click event on a folder's search icon.
 * @param {HTMLElement} target - The clicked icon element.
 */
export function handleSearchIconClick(target) {
	currentSearchFolderPath = target.closest('.folder').dataset.path;
	document.getElementById('searchModalFolderPath').textContent = currentSearchFolderPath || 'Root';
	searchModal.show();
}

/**
 * Handles the click event on a file's analysis icon.
 * @param {HTMLElement} target - The clicked icon element.
 */
export async function handleAnalysisIconClick(target) {
	const filePath = target.dataset.path;
	const modalTitle = document.getElementById('analysisModalLabel');
	const modalBody = document.getElementById('analysisModalBody');
	modalTitle.textContent = `Analysis for ${filePath}`;
	modalBody.innerHTML = '<div class="text-center p-4"><div class="spinner-border" role="status"><span class="visually-hidden">Loading...</span></div></div>';
	analysisModal.show();
	
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
		modalBody.innerHTML = bodyContent;
	} catch (error) {
		modalBody.innerHTML = `<p class="text-danger">Error fetching analysis: ${error.message}</p>`;
	}
}

/**
 * Sets up event listeners for modal-related controls.
 */
export function setupModalEventListeners() {
	document.getElementById('searchTermInput').addEventListener('keypress', e => {
		if (e.key === 'Enter') {
			document.getElementById('performSearchButton').click();
		}
	});
	
	document.getElementById('performSearchButton').addEventListener('click', async function () {
		const searchTerm = document.getElementById('searchTermInput').value.trim();
		searchModal.hide();
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
	
	// Listener for the new Smart Prompt modal button
	document.getElementById('sendPromptButton').addEventListener('click', async function () {
		const promptTextarea = document.getElementById('promptModalTextarea'); // NEW: Get textarea element once.
		const userPrompt = promptTextarea.value.trim();
		const llmId = document.getElementById('llm-dropdown').value;
		
		// NEW: Save the current prompt to state so it's remembered next time.
		setLastSmartPrompt(promptTextarea.value);
		
		if (!userPrompt) {
			alert('Please enter a prompt.');
			return;
		}
		if (!llmId) {
			alert('Please select an LLM from the dropdown.');
			return;
		}
		
		promptModal.hide();
		showLoading('Asking LLM to select relevant files...');
		try {
			const currentProject = getCurrentProject();
			const response = await postData({
				action: 'get_relevant_files_from_prompt',
				rootIndex: currentProject.rootIndex,
				projectPath: currentProject.path,
				userPrompt: userPrompt,
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
				// Append the user's prompt to the end of the textarea
				const selectedContentEl = document.getElementById('selected-content');
				selectedContentEl.value = selectedContentEl.value.replace('${userPrompt}', userPrompt);
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
	});
}
