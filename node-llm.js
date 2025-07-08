// SmartCodePrompts/node-llm.js
const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const {db, config} = require('./node-config');
const {get_file_content, get_raw_file_content, get_file_analysis, calculate_checksum} = require('./node-files');

// Determine the application data path from environment variables for consistency with node-config.js.
const isElectron = !!process.env.ELECTRON_RUN;
const appDataPath = isElectron ? process.env.APP_DATA_PATH : __dirname;

let reanalysis_progress = {total: 0, current: 0, running: false, message: '', cancelled: false, summary: null};
let auto_select_progress = {total: 0, current: 0, running: false, message: '', cancelled: false, summary: null};

/**
 * Logs an interaction with the LLM to a file.
 * @param {string} prompt - The prompt sent to the LLM.
 * @param {string} response - The response received from the LLM (or an error message).
 * @param {boolean} [is_error=false] - Flag to indicate if the log entry is an error.
 */
function log_llm_interaction(prompt, response, is_error = false) {
	const log_file_path = path.join(appDataPath, 'llm-log.txt');
	const timestamp = new Date().toISOString();
	const log_header = is_error ? '--- LLM ERROR ---' : '--- LLM INTERACTION ---';
	const log_entry = ` ${log_header}\n Timestamp: ${timestamp} \n---\n PROMPT SENT \n---\n ${prompt} \n---\n RESPONSE RECEIVED \n---\n ${response} \n--- END ---\n \n`;
	try {
		fs.appendFileSync(log_file_path, log_entry);
	} catch (err) {
		console.error('Failed to write to LLM log file:', err);
	}
}

function cancel_analysis () {
	if (reanalysis_progress && reanalysis_progress.running) {
		console.log('Cancellation signal received for re-analysis.');
		reanalysis_progress.cancelled = true;
	}
	return {success: true};
}

function cancel_auto_select () {
	if (auto_select_progress && auto_select_progress.running) {
		console.log('Cancellation signal received for auto-select.');
		auto_select_progress.cancelled = true;
	}
	return {success: true};
}

/**
 * Fetches the list of available models from the OpenRouter API.
 * @returns {Promise<object>} A promise that resolves to the parsed JSON response from OpenRouter.
 */
async function fetch_open_router_models() {
	return new Promise((resolve, reject) => {
		const options = {
			hostname: 'openrouter.ai',
			path: '/api/v1/models',
			method: 'GET',
			headers: {
				'Accept': 'application/json',
				'HTTP-Referer': 'https://smartcodeprompts.com',
				'X-Title': 'Smart Code Prompts',
			}
		};
		const req = https.request(options, (res) => {
			let data = '';
			res.on('data', (chunk) => {
				data += chunk;
			});
			res.on('end', () => {
				if (res.statusCode >= 200 && res.statusCode < 300) {
					try {
						resolve(JSON.parse(data));
					} catch (e) {
						reject(new Error('Failed to parse OpenRouter response.'));
					}
				} else {
					reject(new Error(`OpenRouter request failed with status code: ${res.statusCode}`));
				}
			});
		});
		req.on('error', (e) => reject(e));
		req.end();
	});
}

/**
 * Calls a specified LLM, tracks token usage, and logs the call for the session.
 * @param {string} prompt - The prompt to send to the LLM.
 * @param {string} model_id - The ID of the OpenRouter model to use.
 * @param {string} [call_reason='Unknown'] - A short description of why the LLM is being called.
 * @param {number} [temperature] - The temperature for the LLM call.
 * @param {string|null} [response_format='json_object'] - The expected response format ('json_object' or 'text'). Pass null for default.
 * @returns {Promise<string>} A promise that resolves to the content of the LLM's response.
 */
async function call_llm(prompt, model_id, call_reason = 'Unknown', temperature, response_format = 'json_object') {
	if (!config.openrouter_api_key || config.openrouter_api_key === 'YOUR_API_KEY_HERE') {
		throw new Error('OpenRouter API key is not configured. Please add it on the Setup page.');
	}
	return new Promise((resolve, reject) => {
		const request_body = {
			model: model_id,
			messages: [{role: "user", content: prompt}],
		};
		// Conditionally add response_format
		if (response_format) {
			request_body.response_format = {type: response_format};
		}
		
		// Only add temperature to the request if it's a valid number
		if (typeof temperature === 'number' && !isNaN(temperature)) {
			request_body.temperature = temperature;
		}
		const post_data = JSON.stringify(request_body);
		const options = {
			hostname: 'openrouter.ai',
			path: '/api/v1/chat/completions',
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'HTTP-Referer': 'https://smartcodeprompts.com',
				'X-Title': 'Smart Code Prompts',
				'Authorization': `Bearer ${config.openrouter_api_key}`,
				'Content-Length': Buffer.byteLength(post_data)
			}
		};
		const req = https.request(options, (res) => {
			let data = '';
			res.on('data', (chunk) => {
				data += chunk;
			});
			res.on('end', () => {
				if (res.statusCode >= 200 && res.statusCode < 300) {
					try {
						const response_json = JSON.parse(data);
						const prompt_tokens = response_json.usage ? response_json.usage.prompt_tokens || 0 : 0;
						const completion_tokens = response_json.usage ? response_json.usage.completion_tokens || 0 : 0;
						
						// Persist log and token counts to the database
						const log_stmt = db.prepare('INSERT INTO llm_log (timestamp, reason, model_id, prompt_tokens, completion_tokens) VALUES (?, ?, ?, ?, ?)');
						const updatePromptTokens_stmt = db.prepare("UPDATE app_settings SET value = CAST(value AS INTEGER) + ? WHERE key = 'total_prompt_tokens'");
						const updateCompletionTokens_stmt = db.prepare("UPDATE app_settings SET value = CAST(value AS INTEGER) + ? WHERE key = 'total_completion_tokens'");
						
						db.transaction(() => {
							log_stmt.run(new Date().toISOString(), call_reason, model_id || 'N/A', prompt_tokens, completion_tokens);
							if (prompt_tokens > 0) {
								updatePromptTokens_stmt.run(prompt_tokens);
							}
							if (completion_tokens > 0) {
								updateCompletionTokens_stmt.run(completion_tokens);
							}
						})();
						
						if (response_json.choices && response_json.choices.length > 0) {
							const llm_content = response_json.choices[0].message.content;
							log_llm_interaction(prompt, llm_content, false);
							resolve(llm_content);
						} else {
							const error_msg = 'Invalid response structure from LLM.';
							log_llm_interaction(prompt, `Error: ${error_msg}\nRaw Response: ${data}`, true);
							reject(new Error(error_msg));
						}
					} catch (e) {
						const error_msg = `Failed to parse LLM response. Error: ${e.message}`;
						log_llm_interaction(prompt, `Error: ${error_msg}\nRaw Response: ${data}`, true);
						reject(new Error('Failed to parse LLM response.'));
					}
				} else {
					const error_msg = `LLM API request failed with status code: ${res.statusCode}. Response: ${data}`;
					log_llm_interaction(prompt, error_msg, true);
					reject(new Error(error_msg));
				}
			});
		});
		req.on('error', (e) => {
			const error_msg = `Request Error: ${e.message}`;
			log_llm_interaction(prompt, error_msg, true);
			reject(e);
		});
		req.write(post_data);
		req.end();
	});
}

/**
 * Refreshes the local list of LLMs from OpenRouter and stores them in the database.
 * @returns {Promise<object>} A promise that resolves to an object containing the new list of LLMs.
 */
async function refresh_llms() {
	const model_data = await fetch_open_router_models();
	const models = model_data.data || [];
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
	const new_llms = db.prepare('SELECT id, name FROM llms ORDER BY name ASC').all();
	return {success: true, llms: new_llms};
}

/**
 * Analyzes a single file using two separate LLM calls for overview and function details,
 * then saves the results to the database. Skips analysis if file content has not changed, unless forced.
 * @param {object} params - The parameters for the analysis.
 * @param {string} params.project_path - The path of the project.
 * @param {string} params.file_path - The path of the file to analyze.
 * @param {string} params.llm_id - The ID of the LLM to use for analysis.
 * @param {boolean} [params.force=false] - If true, analysis is performed even if checksums match.
 * @param {number} [params.temperature] - The temperature for the LLM call.
 * @returns {Promise<object>} A promise that resolves to a success object with a status ('analyzed' or 'skipped').
 */
async function analyze_file({project_path, file_path, llm_id, force = false, temperature}) {
	if (!llm_id) {
		throw new Error('No LLM selected for analysis.');
	}
	const raw_file_content = get_raw_file_content(file_path, project_path);
	const current_checksum = crypto.createHash('sha256').update(raw_file_content).digest('hex');
	const existing_metadata = db.prepare('SELECT last_checksum FROM file_metadata WHERE project_path = ? AND file_path = ?')
		.get(project_path, file_path);
	
	if (!force && existing_metadata && existing_metadata.last_checksum === current_checksum) {
		console.log(`Skipping analysis for ${file_path}, checksum matches.`);
		return {success: true, status: 'skipped'};
	}
	
	console.log(`Analyzing ${file_path}, checksum mismatch or new file.`);
	const file_content = get_file_content(file_path, project_path).content;
	const short_file_name = path.basename(file_path); // Get just the filename for the log.
	
	const overview_prompt_template = config.prompt_file_overview;
	const overview_prompt = overview_prompt_template
		.replace(/\$\{file_path\}/g, file_path)
		.replace(/\$\{file_content\}/g, file_content);
	const overview_result = await call_llm(overview_prompt, llm_id, `File Overview: ${short_file_name}`, temperature);
	
	const functions_prompt_template = config.prompt_functions_logic;
	const functions_prompt = functions_prompt_template
		.replace(/\$\{file_path\}/g, file_path)
		.replace(/\$\{file_content\}/g, file_content);
	const functions_result = await call_llm(functions_prompt, llm_id, `Functions/Logic: ${short_file_name}`, temperature);
	
	db.prepare(`
        INSERT OR REPLACE INTO file_metadata (project_path, file_path, file_overview, functions_overview, last_analyze_update_time, last_checksum)
        VALUES (?, ?, ?, ?, ?, ?)
    `).run(project_path, file_path, overview_result, functions_result, new Date().toISOString(), current_checksum);
	
	return {success: true, status: 'analyzed'};
}

/**
 * MODIFIED: This function now runs as a background task. It scans all analyzed files in a project,
 * re-analyzes any that have been modified (or all if forced), and reports progress via the
 * module-level `reanalysis_progress` state object for the frontend to poll.
 * @param {object} params - The parameters for the operation.
 * @param {string} params.project_path - The path of the project.
 * @param {string} params.llm_id - The ID of the LLM to use for analysis.
 * @param {boolean} [params.force=false] - If true, re-analyzes all files, ignoring checksums.
 * @param {number} [params.temperature] - The temperature for the LLM call.
 */
async function reanalyze_modified_files({project_path, llm_id, force = false, temperature}) {
	// This function is now fire-and-forget from the frontend's perspective.
	// It should not be awaited for its final result.
	if (!llm_id) {
		console.error('No LLM selected for re-analysis.');
		return;
	}
	
	const analyzed_files = db.prepare('SELECT file_path, last_checksum FROM file_metadata WHERE project_path = ?')
		.all(project_path);
	
	// Initialize progress tracking state.
	reanalysis_progress = {
		total: analyzed_files.length,
		current: 0,
		running: true,
		message: 'Initializing re-analysis...',
		cancelled: false,
		summary: null
	};
	
	let analyzed_count = 0;
	let skipped_count = 0;
	let deleted_count = 0;
	const errors = [];
	
	const delete_stmt = db.prepare('DELETE FROM file_metadata WHERE project_path = ? AND file_path = ?');
	
	try {
		for (const file of analyzed_files) {
			// Check for cancellation signal on each iteration.
			if (reanalysis_progress.cancelled) {
				reanalysis_progress.message = 'Re-analysis cancelled by user.';
				console.log('Re-analysis loop cancelled.');
				errors.push('Operation cancelled by user.');
				break;
			}
			
			// Update progress before processing each file.
			reanalysis_progress.current++;
			reanalysis_progress.message = `Processing ${reanalysis_progress.current}/${reanalysis_progress.total}: ${file.file_path}`;
			
			try {
				const full_path = path.join(project_path, file.file_path);
				
				if (!fs.existsSync(full_path)) {
					console.log(`File not found, removing metadata: ${file.file_path}`);
					delete_stmt.run(project_path, file.file_path);
					deleted_count++;
					continue;
				}
				
				const raw_file_content = get_raw_file_content(file.file_path, project_path);
				const current_checksum = calculate_checksum(raw_file_content);
				
				if (force || current_checksum !== file.last_checksum) {
					reanalysis_progress.message = `Analyzing ${reanalysis_progress.current}/${reanalysis_progress.total}: ${file.file_path}`;
					console.log(`Re-analyzing ${force ? '(forced)' : '(modified)'} file: ${file.file_path}`);
					await analyze_file({project_path, file_path: file.file_path, llm_id, force: true, temperature});
					analyzed_count++;
				} else {
					skipped_count++;
				}
			} catch (error) {
				console.error(`Error during re-analysis of ${file.file_path}:`, error);
				errors.push(`${file.file_path}: ${error.message}`);
			}
		}
	} finally {
		const summary = {success: true, analyzed: analyzed_count, skipped: skipped_count, deleted: deleted_count, errors: errors};
		reanalysis_progress.summary = summary;
		reanalysis_progress.running = false;
		console.log('Re-analysis process finished.', summary);
	}
}

/**
 * Uses an LLM to determine which files from a given list are relevant to a user's prompt.
 * @param {object} params - The parameters for the operation.
 * @returns {Promise<object>} A promise resolving to an object with a `relevant_files` array.
 */
async function get_relevant_files_from_prompt({project_path, user_prompt, llm_id, temperature}) {
	if (!llm_id) {
		throw new Error('No LLM selected for analysis.');
	}
	const analyzed_files = db.prepare(`
        SELECT file_path, file_overview, functions_overview
        FROM file_metadata
        WHERE project_path = ?
          AND ((file_overview IS NOT NULL AND file_overview != '') OR (functions_overview IS NOT NULL AND functions_overview != ''))
    `).all(project_path);
	
	if (!analyzed_files || analyzed_files.length === 0) {
		throw new Error('No files have been analyzed in this project. Please analyze files before using this feature.');
	}
	
	let analysis_data_string = '';
	const all_file_paths = [];
	for (const analysis of analyzed_files) {
		all_file_paths.push(analysis.file_path);
		analysis_data_string += `File: ${analysis.file_path}\n`;
		if (analysis.file_overview) {
			analysis_data_string += `Overview: ${analysis.file_overview}\n`;
		}
		if (analysis.functions_overview) {
			analysis_data_string += `Functions/Logic: ${analysis.functions_overview}\n`;
		}
		analysis_data_string += '---\n\n';
	}
	
	const master_prompt_template = config.prompt_smart_prompt;
	const master_prompt = master_prompt_template
		.replace(/\$\{user_prompt\}/g, user_prompt)
		.replace(/\$\{analysis_data_string\}/g, analysis_data_string);
	
	const llm_response = await call_llm(master_prompt, llm_id, 'Smart Prompt File Selection', temperature);
	
	try {
		const parsed_response = JSON.parse(llm_response);
		if (parsed_response && Array.isArray(parsed_response.relevant_files)) {
			const valid_file_paths = new Set(all_file_paths);
			const filtered_files = parsed_response.relevant_files.filter(f => valid_file_paths.has(f));
			return {relevant_files: filtered_files};
		} else {
			throw new Error('LLM response is not in the expected format (missing "relevant_files" array).');
		}
	} catch (e) {
		console.error("Failed to parse LLM response for relevant files:", llm_response);
		throw new Error(`Could not understand the LLM's response. Raw response: ${llm_response}`);
	}
}

/**
 * Asks a question about the code, using provided files as context.
 * @param {object} params - The parameters for the operation.
 * @returns {Promise<object>} A promise resolving to an object with the `answer`.
 */
async function ask_question_about_code({project_path, question, relevant_files, llm_id, temperature}) {
	if (!llm_id) {
		throw new Error('No LLM selected for the question.');
	}
	if (!relevant_files || relevant_files.length === 0) {
		throw new Error('No relevant files were provided to answer the question.');
	}
	
	let file_context = '';
	for (const file_path of relevant_files) {
		try {
			const content = get_raw_file_content(file_path, project_path);
			file_context += `--- FILE: ${file_path} ---\n\n${content}\n\n`;
		} catch (error) {
			console.warn(`Could not read file ${file_path} for QA context:`, error.message);
			file_context += `--- FILE: ${file_path} ---\n\n[Could not read file content]\n\n`;
		}
	}
	
	const qa_prompt_template = config.prompt_qa;
	const final_prompt = qa_prompt_template
		.replace(/\$\{file_context\}/g, file_context)
		.replace(/\$\{user_question\}/g, question);
	
	// Call the LLM expecting a free-text response, not JSON
	const answer = await call_llm(final_prompt, llm_id, `QA: ${question.substring(0, 30)}...`, temperature, 'text');
	
	return {answer: answer};
}

/**
 * Handles a direct prompt from the user, sending it to the LLM.
 * @param {object} params - The parameters for the operation.
 * @param {string} params.prompt - The user-provided prompt.
 * @param {string} params.llm_id - The ID of the LLM to use.
 * @param {number} params.temperature - The temperature for the LLM call.
 * @returns {Promise<object>} A promise resolving to an object with the `answer`.
 */
async function handle_direct_prompt({prompt, llm_id, temperature}) {
	if (!llm_id) {
		throw new Error('No LLM selected for the prompt.');
	}
	if (!prompt) {
		throw new Error('Prompt content is empty.');
	}
	
	// Call the LLM expecting a free-text response, not JSON
	const answer = await call_llm(prompt, llm_id, `Direct Prompt`, temperature, 'text');
	
	return {answer: answer};
}

/**
 * Returns the current session statistics.
 * @returns {object} An object containing session token usage and re-analysis progress.
 */
function get_session_stats() {
	// Fetch persistent token counts from the database.
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
		const prompt_cost = ((row.prompt_tokens || 0) ) * prompt_price;
		const completion_cost = ((row.completion_tokens || 0) ) * completion_price;
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
 * Returns the log of LLM calls, including calculated cost for each.
 * @returns {Array<object>} The array of log entries with cost.
 */
function get_llm_log() {
	// Fetch the log from the database and join with the llms table to get pricing.
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
		const prompt_cost = ((entry.prompt_tokens || 0) ) * prompt_price;
		const completion_cost = ((entry.completion_tokens || 0) ) * completion_price;
		entry.cost = prompt_cost + completion_cost;
		return entry;
	});
}

/**
 * Identifies project-specific files from a list using an LLM, processing in batches.
 * This is a background task that reports progress via the `auto_select_progress` state object.
 * @param {object} params - The parameters for the operation.
 */
async function identify_project_files ({project_path, all_files, llm_id, temperature}) {
	if (!llm_id) {
		console.error('No LLM selected for auto-select.');
		return;
	}
	
	const files_to_process = JSON.parse(all_files);
	const BATCH_SIZE = 20;
	
	// Initialize progress tracking state.
	auto_select_progress = {
		total: files_to_process.length,
		current: 0,
		running: true,
		message: 'Initializing file identification...',
		cancelled: false,
		summary: null
	};
	
	let identified_files = [];
	const errors = [];
	
	try {
		for (let i = 0; i < files_to_process.length; i += BATCH_SIZE) {
			if (auto_select_progress.cancelled) {
				errors.push('Operation cancelled by user.');
				break;
			}
			
			const batch_paths = files_to_process.slice(i, i + BATCH_SIZE);
			let file_list_string = '';
			
			for (const file_path of batch_paths) {
				try {
					const content = get_raw_file_content(file_path, project_path);
					const snippet = content.substring(0, 256).replace(/\s+/g, ' ');
					file_list_string += `File: ${file_path}\nSnippet: "${snippet}..."\n\n`;
				} catch (e) {
					console.warn(`Could not read file for auto-select snippet: ${file_path}`, e);
					file_list_string += `File: ${file_path}\nSnippet: "[Error reading file content]"\n\n`;
				}
			}
			
			const current_batch_num = Math.floor(i / BATCH_SIZE) + 1;
			const total_batches = Math.ceil(files_to_process.length / BATCH_SIZE);
			auto_select_progress.message = `Processing batch ${current_batch_num}/${total_batches}...`;
			
			const prompt_template = config.prompt_auto_select;
			const prompt = prompt_template.replace(/\$\{file_list_string\}/g, file_list_string);
			
			try {
				const llm_response = await call_llm(prompt, llm_id, `Auto-Select Batch ${current_batch_num}`, temperature);
				const parsed = JSON.parse(llm_response);
				if (parsed && Array.isArray(parsed.project_files)) {
					identified_files = identified_files.concat(parsed.project_files);
				} else {
					errors.push(`Batch ${current_batch_num}: Invalid LLM response format.`);
				}
			} catch (llm_error) {
				console.error(`Error processing auto-select batch ${current_batch_num}:`, llm_error);
				errors.push(`Batch ${current_batch_num}: ${llm_error.message}`);
			}
			
			auto_select_progress.current = Math.min(i + BATCH_SIZE, files_to_process.length);
		}
	} finally {
		const summary = {
			success: errors.length === 0,
			identified_files: identified_files,
			errors: errors
		};
		auto_select_progress.summary = summary;
		auto_select_progress.running = false;
		console.log('Auto-select process finished.', summary);
	}
}

module.exports = {
	refresh_llms,
	analyze_file,
	get_relevant_files_from_prompt,
	reanalyze_modified_files,
	get_session_stats,
	get_llm_log,
	ask_question_about_code,
	handle_direct_prompt,
	cancel_analysis,
	identify_project_files,
	cancel_auto_select
};
