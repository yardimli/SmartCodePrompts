/**
 * @file node-llm-data.js
 * @description Provides functions for retrieving LLM-related data from the database and external APIs.
 */

const {db} = require('./node-config');
const {fetch_open_router_models} = require('./node-llm-api');
const {reanalysis_progress, auto_select_progress} = require('./node-llm-tasks');

/**
 * Refreshes the local list of LLMs from OpenRouter. Can also be used to test a key.
 * @param {object} [options={}] - Options for the refresh.
 * @param {string|null} [options.api_key_override=null] - An API key to test. If provided, models are not saved to the DB.
 * @returns {Promise<object>} A promise that resolves to an object containing the new list of LLMs.
 */
async function refresh_llms ({api_key_override = null} = {}) {
	const model_data = await fetch_open_router_models(api_key_override);
	const models = model_data.data || [];
	
	// Only save the models to the database if we are not just testing a key.
	if (!api_key_override) {
		const insert = db.prepare('INSERT OR REPLACE INTO llms (id, name, context_length, prompt_price, completion_price) VALUES (@id, @name, @context_length, @prompt_price, @completion_price)');
		const transaction = db.transaction((models_to_insert) => {
			db.exec('DELETE FROM llms');
			for (const model of models_to_insert) {
				insert.run({
					id: model.id,
					name: model.name,
					context_length: model.context_length,
					prompt_price: parseFloat(model.pricing.prompt),
					completion_price: parseFloat(model.pricing.completion)
				});
			}
		});
		transaction(models);
	}
	
	const new_llms = db.prepare('SELECT id, name FROM llms ORDER BY name ASC').all();
	return {success: true, llms: new_llms};
}

/**
 * Returns the current session statistics, including token usage, cost, and progress of background tasks.
 * @returns {object} An object containing session token usage and re-analysis progress.
 */
function get_session_stats () {
	const prompt_tokens_row = db.prepare("SELECT value FROM app_settings WHERE key = 'total_prompt_tokens'").get();
	const completionTokens_row = db.prepare("SELECT value FROM app_settings WHERE key = 'total_completion_tokens'").get();
	
	const cost_rows = db.prepare(`
        SELECT l.prompt_tokens,
               l.completion_tokens,
               m.prompt_price,
               m.completion_price
        FROM llm_log l
                 LEFT JOIN llms m ON l.model_id = m.id
    `).all();
	
	let total_cost = 0;
	for (const row of cost_rows) {
		const prompt_price = row.prompt_price || 0;
		const completion_price = row.completion_price || 0;
		const prompt_cost = ((row.prompt_tokens || 0)) * prompt_price;
		const completion_cost = ((row.completion_tokens || 0)) * completion_price;
		total_cost += prompt_cost + completion_cost;
	}
	
	return {
		tokens: {
			prompt: prompt_tokens_row ? parseInt(prompt_tokens_row.value, 10) : 0,
			completion: completionTokens_row ? parseInt(completionTokens_row.value, 10) : 0
		},
		cost: total_cost,
		reanalysis: reanalysis_progress,
		auto_select: auto_select_progress
	};
}

/**
 * Returns the log of LLM calls from the database, including calculated cost for each.
 * @returns {Array<object>} The array of log entries with cost.
 */
function get_llm_log () {
	const log_entries = db.prepare(`
        SELECT l.timestamp,
               l.reason,
               l.model_id,
               l.prompt_tokens,
               l.completion_tokens,
               m.prompt_price,
               m.completion_price
        FROM llm_log l
                 LEFT JOIN llms m ON l.model_id = m.id
        ORDER BY l.timestamp DESC
    `).all();
	
	return log_entries.map(entry => {
		const prompt_price = entry.prompt_price || 0;
		const completion_price = entry.completion_price || 0;
		const prompt_cost = ((entry.prompt_tokens || 0)) * prompt_price;
		const completion_cost = ((entry.completion_tokens || 0)) * completion_price;
		entry.cost = prompt_cost + completion_cost;
		return entry;
	});
}

module.exports = {
	refresh_llms,
	get_session_stats,
	get_llm_log
};
