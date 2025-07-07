// SmartCodePrompts/js/status_bar.js
import {post_data} from './utils.js';

/**
 * NEW: Updates the estimated token count for the current prompt in the status bar.
 * @param {number} token_count - The estimated number of tokens.
 */
export function update_estimated_prompt_tokens (token_count) {
	const el = document.getElementById('estimated-prompt-tokens');
	if (el) {
		el.textContent = token_count.toLocaleString();
	}
}

/**
 * Updates the status bar with the latest session and progress data.
 * @param {object} stats - The stats object from the server.
 * @param {object} stats.tokens - Token usage { prompt, completion }.
 * @param {number} stats.cost - Total session cost.
 * @param {object} stats.reanalysis - Reanalysis progress { running, current, total, message }.
 */
export function update_status_bar (stats) {
	const prompt_tokens_el = document.getElementById('prompt-tokens');
	const completion_tokens_el = document.getElementById('completion-tokens');
	const total_cost_el = document.getElementById('total-cost');
	const progress_container = document.getElementById('status-bar-progress-container');
	const progress_text = document.getElementById('status-bar-progress-text');
	const progress_bar = document.getElementById('status-bar-progress-bar');
	const statusMessage_el = document.getElementById('status-bar-message');
	
	// Update token counts
	if (stats.tokens && prompt_tokens_el && completion_tokens_el) {
		prompt_tokens_el.textContent = (stats.tokens.prompt || 0).toLocaleString();
		completion_tokens_el.textContent = (stats.tokens.completion || 0).toLocaleString();
	}
	
	// Update total cost
	if (stats.cost !== undefined && total_cost_el) {
		total_cost_el.textContent = `$${stats.cost.toFixed(2)}`;
	}
	

	progress_container.style.display = 'none';
	statusMessage_el.textContent = '';
	statusMessage_el.title = '';
}

/**
 * Periodically fetches session stats from the server and updates the UI.
 */
function poll_session_stats () {
	setInterval(async () => {
		try {
			const stats = await post_data({action: 'get_session_stats'});
			update_status_bar(stats);
		} catch (error) {
			console.error("Could not poll session stats:", error);
			const statusMessage_el = document.getElementById('status-bar-message');
			if (statusMessage_el) {
				statusMessage_el.textContent = 'Error updating status.';
			}
		}
	}, 5000);
}

/**
 * Initializes the status bar with initial data and starts polling for updates.
 * @param {object} initial_session_data - The initial session data object {prompt, completion, cost} from the server page load.
 */
export function initialize_status_bar (initial_session_data) {
	if (initial_session_data) {
		// MODIFIED: Construct the full stats object for the initial update.
		update_status_bar({
			tokens: {
				prompt: initial_session_data.prompt,
				completion: initial_session_data.completion
			},
			cost: initial_session_data.cost,
			reanalysis: {running: false}
		});
	}
	poll_session_stats();
}
