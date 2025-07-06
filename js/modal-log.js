// SmartCodePrompts/js/modal-log.js
import {show_loading, hide_loading, post_data} from './utils.js';
import {update_status_bar} from './status_bar.js';

let log_modal = null;

/**
 * Initializes the log modal element reference.
 */
export function initialize_log_modal () {
	log_modal = document.getElementById('log_modal');
};

/**
 * Fetches and displays the LLM call log in the modal.
 */
async function handle_log_button_click () {
	if (!log_modal) return;
	const modal_body = document.getElementById('log_modal_body');
	modal_body.innerHTML = '<div class="text-center p-4"><span class="loading loading-lg"></span></div>';
	log_modal.showModal();
	
	try {
		const log_data = await post_data({action: 'get_llm_log'});
		if (!log_data || log_data.length === 0) {
			modal_body.innerHTML = '<p class="text-base-content/70 p-3">No LLM calls have been made yet.</p>';
			return;
		}
		
		let table_html = `
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
		
		for (const entry of log_data) {
			const timestamp = new Date(entry.timestamp).toLocaleString();
			table_html += `
                <tr class="hover">
                    <td class="log-timestamp">${timestamp}</td>
                    <td class="log-reason">${entry.reason}</td>
                    <td class="log-model">${entry.model_id || 'N/A'}</td>
                    <td class="log-tokens text-right">${(entry.prompt_tokens || 0).toLocaleString()}</td>
                    <td class="log-tokens text-right">${(entry.completion_tokens || 0).toLocaleString()}</td>
                </tr>
            `;
		}
		
		table_html += '</tbody></table></div>';
		modal_body.innerHTML = table_html;
	} catch (error) {
		console.error('Failed to fetch LLM log:', error);
		modal_body.innerHTML = `<p class="text-error p-3">Could not load LLM log: ${error.message}</p>`;
	}
}

/**
 * Sets up event listeners for the log modal controls.
 */
export function setup_log_modal_listeners () {
	document.getElementById('log-modal-button').addEventListener('click', handle_log_button_click);
	
	document.getElementById('reset-log-button').addEventListener('click', async () => {
		if (confirm('Are you sure you want to permanently delete the LLM call log and reset all token counters? This cannot be undone.')) {
			show_loading('Resetting log...');
			try {
				await post_data({action: 'reset_llm_log'});
				await handle_log_button_click(); // Refresh the log view
				update_status_bar({prompt: 0, completion: 0});
			} catch (error) {
				console.error('Failed to reset log:', error);
				alert(`Failed to reset log: ${error.message}`);
			} finally {
				hide_loading();
			}
		}
	});
};
