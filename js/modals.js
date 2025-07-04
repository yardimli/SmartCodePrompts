// llm-php-helper/js/modals.js
import {showLoading, hideLoading, postData} from './utils.js';
import {getCurrentProject, saveCurrentProjectState, getLastSmartPrompt, setLastSmartPrompt} from './state.js';
import {ensureFileIsVisible, updateSelectedContent} from './fileTree.js';

// MODIFIED: Store direct references to the modal <dialog> elements.
let searchModal = null;
let analysisModal = null;
let promptModal = null;
let logModal = null;
let currentSearchFolderPath = null;

/**
 * Initializes the modal element references.
 * MODIFIED: No longer instantiates Bootstrap modals. Just gets the DOM elements.
 */
export function initializeModals() {
	searchModal = document.getElementById('searchModal');
	analysisModal = document.getElementById('analysisModal');
	promptModal = document.getElementById('promptModal');
	logModal = document.getElementById('logModal');
}

/**
 * Handles the click event on the main "PROMPT" button.
 * MODIFIED: Uses .showModal() on the <dialog> element.
 */
export function handlePromptButtonClick() {
	const textarea = document.getElementById('promptModalTextarea');
	if (textarea) {
		textarea.value = getLastSmartPrompt();
		textarea.select();
	}
	promptModal.showModal();
}

/**
 * NEW: Handles the click on the LLM Log button in the status bar.
 * Fetches log data and displays the modal.
 * MODIFIED: Uses .showModal() on the <dialog> element.
 */
export async function handleLogButtonClick() {
	const modalBody = document.getElementById('logModalBody');
	modalBody.innerHTML = '<div class="text-center p-4"><span class="loading loading-lg"></span></div>';
	logModal.showModal();
	
	try {
		const logData = await postData({action: 'get_llm_log'});
		if (!logData || logData.length === 0) {
			modalBody.innerHTML = '<p class="text-base-content/70 p-3">No LLM calls have been made in this session yet.</p>';
			return;
		}
		
		// MODIFIED: Use DaisyUI table classes
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
			const timestamp = new Date(entry.timestamp).toLocaleTimeString();
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
 * MODIFIED: Uses .showModal() on the <dialog> element.
 */
export function handleSearchIconClick(target) {
	currentSearchFolderPath = target.closest('.folder').dataset.path;
	document.getElementById('searchModalFolderPath').textContent = currentSearchFolderPath || 'Root';
	searchModal.showModal();
}

/**
 * Handles the click event on a file's analysis icon.
 * MODIFIED: Uses .showModal() on the <dialog> element.
 */
export async function handleAnalysisIconClick(target) {
	const filePath = target.dataset.path;
	const modalTitle = document.getElementById('analysisModalLabel');
	const modalBody = document.getElementById('analysisModalBody');
	modalTitle.textContent = `Analysis for ${filePath}`;
	modalBody.innerHTML = '<div class="text-center p-4"><span class="loading loading-lg"></span></div>';
	analysisModal.showModal();
	
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
		modalBody.innerHTML = `<p class="text-error">Error fetching analysis: ${error.message}</p>`;
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
		// MODIFIED: Use .close() on the <dialog> element.
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
	
	// Listener for the new Smart Prompt modal button
	document.getElementById('sendPromptButton').addEventListener('click', async function () {
		const promptTextarea = document.getElementById('promptModalTextarea'); // Get textarea element once.
		const userPrompt = promptTextarea.value.trim();
		const llmId = document.getElementById('llm-dropdown').value;
		
		setLastSmartPrompt(promptTextarea.value);
		
		if (!userPrompt) {
			alert('Please enter a prompt.');
			return;
		}
		if (!llmId) {
			alert('Please select an LLM from the dropdown.');
			return;
		}
		
		// MODIFIED: Use .close() on the <dialog> element.
		promptModal.close();
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
				
				const searchStr = '${userPrompt}';
				const lastIndex = selectedContentEl.value.lastIndexOf(searchStr);
				
				if (lastIndex !== -1) {
					selectedContentEl.value =
						selectedContentEl.value.substring(0, lastIndex) +
						userPrompt +
						selectedContentEl.value.substring(lastIndex + searchStr.length);
				}
				
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
