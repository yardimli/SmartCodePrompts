// SmartCodePrompts/js/statusBar.js
import {postData} from './utils.js';

/**
 * Updates the status bar with the latest session and progress data.
 * @param {object} stats - The stats object from the server.
 * @param {object} stats.tokens - Token usage { prompt, completion }.
 * @param {object} stats.reanalysis - Reanalysis progress { running, current, total, message }.
 */
export function updateStatusBar(stats) { // MODIFIED: Added export
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
		progressBar.value = percent;
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
 */
function pollSessionStats() {
	setInterval(async () => {
		try {
			const stats = await postData({action: 'get_session_stats'});
			updateStatusBar(stats);
		} catch (error) {
			console.error("Could not poll session stats:", error);
			const statusMessageEl = document.getElementById('status-bar-message');
			if (statusMessageEl) {
				statusMessageEl.textContent = 'Error updating status.';
			}
		}
	}, 5000);
}

/**
 * Initializes the status bar with initial data and starts polling for updates.
 * @param {object} initialTokens - The initial session token object from the server page load.
 */
export function initializeStatusBar(initialTokens) {
	if (initialTokens) {
		updateStatusBar({tokens: initialTokens, reanalysis: {running: false}});
	}
	pollSessionStats();
}
