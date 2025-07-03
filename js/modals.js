// llm-php-helper/js/modals.js
import {showLoading, hideLoading, postData} from './utils.js';
import {getCurrentProject, saveCurrentProjectState} from './state.js';
import {ensureFileIsVisible, updateSelectedContent} from './fileTree.js';

let searchModal = null;
let analysisModal = null;
let currentSearchFolderPath = null;

/**
 * Initializes the Bootstrap modal instances.
 */
export function initializeModals() {
	searchModal = new bootstrap.Modal(document.getElementById('searchModal'));
	analysisModal = new bootstrap.Modal(document.getElementById('analysisModal'));
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
}
