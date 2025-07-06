// SmartCodePrompts/js/status_bar.js
import {post_data} from './utils.js';

/**
 * Updates the status bar with the latest session and progress data.
 * @param {object} stats - The stats object from the server.
 * @param {object} stats.tokens - Token usage { prompt, completion }.
 * @param {object} stats.reanalysis - Reanalysis progress { running, current, total, message }.
 */
export function update_status_bar(stats) {
	const prompt_tokens_el = document.getElementById('prompt-tokens');
	const completion_tokens_el = document.getElementById('completion-tokens');
	const progress_container = document.getElementById('status-bar-progress-container');
	const progress_text = document.getElementById('status-bar-progress-text');
	const progress_bar = document.getElementById('status-bar-progress-bar');
	const statusMessage_el = document.getElementById('status-bar-message');
	
	// Update token counts
	if (stats.tokens && prompt_tokens_el && completion_tokens_el) {
		prompt_tokens_el.textContent = (stats.tokens.prompt || 0).toLocaleString();
		completion_tokens_el.textContent = (stats.tokens.completion || 0).toLocaleString();
	}
	
	// Update re-analysis progress
	if (stats.reanalysis && stats.reanalysis.running && stats.reanalysis.total > 0) {
		const percent = Math.round((stats.reanalysis.current / stats.reanalysis.total) * 100);
		progress_text.textContent = `Re-analyzing... (${stats.reanalysis.current}/${stats.reanalysis.total})`;
		progress_bar.value = percent;
		progress_container.style.display = 'flex';
		statusMessage_el.textContent = stats.reanalysis.message;
		statusMessage_el.title = stats.reanalysis.message;
	} else {
		progress_container.style.display = 'none';
		statusMessage_el.textContent = '';
		statusMessage_el.title = '';
	}
}

/**
 * Periodically fetches session stats from the server and updates the UI.
 */
function poll_session_stats() {
	setInterval(async () => {
		try {
			const stats = await post_data({action: 'get_session_stats'});
			update_status_bar(stats);
		} catch (error) {
			console.error("Could not poll session stats:", error);
			const statusMessage_el = document.getElementById('status-bar-message');
			if (status_message_el) {
				statusMessage_el.textContent = 'Error updating status.';
			}
		}
	}, 5000);
}

/**
 * Initializes the status bar with initial data and starts polling for updates.
 * @param {object} initial_tokens - The initial session token object from the server page load.
 */
export function initialize_status_bar(initial_tokens) {
	if (initial_tokens) {
		update_status_bar({tokens: initial_tokens, reanalysis: {running: false}});
	}
	poll_session_stats();
}
