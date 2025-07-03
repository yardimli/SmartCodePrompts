// llm-php-helper/js/analysis.js
import {showLoading, hideLoading, postData} from './utils.js';
import {getCurrentProject} from './state.js';

/**
 * MODIFIED: This function now contains the logic for analyzing selected files.
 * It is called from the new analysis options modal.
 */
async function performSelectionAnalysis() {
	const checkedBoxes = Array.from(document.querySelectorAll('#file-tree input[type="checkbox"]:checked'));
	const llmId = document.getElementById('llm-dropdown').value;
	
	if (checkedBoxes.length === 0) {
		alert('Please select at least one file to analyze.');
		return;
	}
	// Note: LLM check is already performed before opening the modal, so it's not strictly needed here, but good for safety.
	if (!llmId) {
		alert('Please select an LLM from the dropdown to perform the analysis.');
		return;
	}
	
	const totalFiles = checkedBoxes.length;
	let filesAnalyzed = 0;
	let filesSkipped = 0;
	let errors = [];
	const currentProject = getCurrentProject();
	
	for (let i = 0; i < totalFiles; i++) {
		const checkbox = checkedBoxes[i];
		const filePath = checkbox.dataset.path;
		const fileName = filePath.split('/').pop();
		showLoading(`Analyzing ${i + 1}/${totalFiles}: ${fileName}`);
		try {
			const response = await postData({
				action: 'analyze_file',
				rootIndex: currentProject.rootIndex,
				projectPath: currentProject.path,
				filePath: filePath,
				llmId: llmId
			});
			
			if (response.status === 'analyzed') {
				filesAnalyzed++;
				const li = checkbox.closest('li');
				// Check if an icon for this file already exists to prevent duplicates
				if (li && !li.querySelector('.analysis-icon')) {
					const icon = document.createElement('i');
					icon.className = 'fas fa-info-circle analysis-icon';
					icon.dataset.path = filePath;
					icon.title = 'View Analysis';
					// Insert icon before the file name span for consistent placement
					const fileSpan = li.querySelector('.file');
					if (fileSpan) {
						fileSpan.before(icon);
					}
				}
			} else if (response.status === 'skipped') {
				filesSkipped++;
			}
		} catch (error) {
			console.error(`Failed to analyze ${filePath}:`, error);
			errors.push(`${filePath}: ${error.message}`);
		}
	}
	
	hideLoading();
	
	let summaryMessage = `Analysis complete.\n- Total files selected: ${totalFiles}\n- Successfully analyzed: ${filesAnalyzed}\n- Skipped (up-to-date): ${filesSkipped}`;
	if (errors.length > 0) {
		summaryMessage += `\n\nErrors occurred for ${errors.length} file(s):\n- ${errors.join('\n- ')}\n\nCheck the console for more details.`;
	}
	alert(summaryMessage);
}


/**
 * Performs the re-analysis call to the backend and handles the response.
 * The show/hide loading calls have been removed as the new status bar provides progress feedback.
 * @param {boolean} forceReanalysis - Whether to force re-analysis of all files.
 */
async function performReanalysis(forceReanalysis) {
	const llmId = document.getElementById('llm-dropdown').value;
	const currentProject = getCurrentProject();
	
	if (!llmId || !currentProject) {
		return;
	}
	
	// The status bar will provide detailed progress, so a generic loading indicator is no longer needed here.
	try {
		const response = await postData({
			action: 'reanalyze_modified_files',
			rootIndex: currentProject.rootIndex,
			projectPath: currentProject.path,
			llmId: llmId,
			force: forceReanalysis
		});
		
		// The status bar will clear itself on the next poll since the backend state is reset.
		let summaryMessage = `Re-analysis complete.\n` +
			`- Files re-analyzed: ${response.analyzed}\n` +
			`- Files skipped (up-to-date): ${response.skipped}`;
		
		if (response.errors && response.errors.length > 0) {
			summaryMessage += `\n\nErrors occurred for ${response.errors.length} file(s):\n- ${response.errors.join('\n- ')}\n\nCheck the console for more details.`;
		}
		alert(summaryMessage);
		
		window.location.reload();
	} catch (error) {
		// The backend resets its progress state in a `finally` block, so the UI will clear on the next poll.
		console.error('Failed to re-analyze files:', error);
		alert(`An error occurred during re-analysis: ${error.message}`);
	}
}

/**
 * MODIFIED: Sets up the event listener for the main "Analysis Actions" button.
 * This button now opens a modal with three choices:
 * 1. Analyze Selected Files
 * 2. Re-analyze Modified Files
 * 3. Force Re-analyze All Files
 * This assumes a button with id "analysis-actions-button" and a modal with id "analysisOptionsModal" exist in the HTML.
 */
export function setupAnalysisActionsListener() {
	const analysisButton = document.getElementById('analysis-actions-button');
	const analysisModalEl = document.getElementById('analysisOptionsModal');
	
	if (!analysisButton || !analysisModalEl) {
		return;
	}
	const analysisModal = new bootstrap.Modal(analysisModalEl);
	
	analysisButton.addEventListener('click', function () {
		const llmId = document.getElementById('llm-dropdown').value;
		if (!llmId) {
			alert('Please select an LLM from the dropdown to perform the analysis.');
			return;
		}
		const currentProject = getCurrentProject();
		if (!currentProject) {
			alert('No project selected.');
			return;
		}
		analysisModal.show();
	});
	
	// Listener for the "Analyze Selected" button in the modal.
	document.getElementById('analyzeSelectedButton').addEventListener('click', async () => {
		analysisModal.hide();
		await performSelectionAnalysis();
	});
	
	document.getElementById('reanalyzeModifiedOnlyButton').addEventListener('click', async () => {
		analysisModal.hide();
		await performReanalysis(false);
	});
	
	document.getElementById('reanalyzeForceAllButton').addEventListener('click', async () => {
		analysisModal.hide();
		await performReanalysis(true);
	});
}
