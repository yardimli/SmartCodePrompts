// SmartCodePrompts/node-llm.js
const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const {db, config} = require('./node-config');
const {get_file_content, get_raw_file_content, get_file_analysis, calculate_checksum} = require('./node-files');

// Session-specific state is now only for re-analysis progress.
let reanalysis_progress = {total: 0, current: 0, running: false, message: ''};

/**
 * Logs an interaction with the LLM to a file.
 * @param {string} prompt - The prompt sent to the LLM.
 * @param {string} response - The response received from the LLM (or an error message).
 * @param {boolean} [is_error=false] - Flag to indicate if the log entry is an error.
 */
function log_llm_interaction(prompt, response, is_error = false) {
	const log_file_path = path.join(__dirname, 'llm-log.txt');
	const timestamp = new Date().toISOString();
	const log_header = is_error ? '--- LLM ERROR ---' : '--- LLM INTERACTION ---';
	const log_entry = ` ${log_header}\n Timestamp: ${timestamp} \n---\n PROMPT SENT \n---\n ${prompt} \n---\n RESPONSE RECEIVED \n---\n ${response} \n--- END ---\n \n`;
	try {
		fs.appendFileSync(log_file_path, log_entry);
	} catch (err) {
		console.error('Failed to write to LLM log file:', err);
	}
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
 * Scans all analyzed files in a project and re-analyzes any that have been modified.
 * Can also be forced to re-analyze all files regardless of modification status.
 * Now reports progress via the module-level `reanalysis_progress` state.
 * If a previously analyzed file is no longer found on the filesystem, its entry
 * is removed from the `file_metadata` table.
 * @param {object} params - The parameters for the operation.
 * @param {string} params.project_path - The path of the project.
 * @param {string} params.llm_id - The ID of the LLM to use for analysis.
 * @param {boolean} [params.force=false] - If true, re-analyzes all files, ignoring checksums.
 * @param {number} [params.temperature] - The temperature for the LLM call.
 * @returns {Promise<object>} A summary of the operation.
 */
async function reanalyze_modified_files({project_path, llm_id, force = false, temperature}) {
	if (!llm_id) {
		throw new Error('No LLM selected for analysis.');
	}
	const analyzed_files = db.prepare('SELECT file_path, last_checksum FROM file_metadata WHERE project_path = ?')
		.all(project_path);
	
	// Initialize progress tracking state.
	reanalysis_progress = {
		total: analyzed_files.length,
		current: 0,
		running: true,
		message: 'Initializing re-analysis...'
	};
	let analyzed_count = 0;
	let skipped_count = 0;
	let deleted_count = 0; // Counter for deleted files
	const errors = [];
	
	const delete_stmt = db.prepare('DELETE FROM file_metadata WHERE project_path = ? AND file_path = ?');
	
	try {
		for (const file of analyzed_files) {
			// Update progress before processing each file.
			reanalysis_progress.current++;
			reanalysis_progress.message = `Processing ${file.file_path}`;
			try {
				// Resolve the full path to check for existence
				const full_path = path.join(project_path, file.file_path);
				
				if (!fs.existsSync(full_path)) {
					// If the file no longer exists, remove its metadata from the database
					console.log(`File not found, removing metadata: ${file.file_path}`);
					delete_stmt.run(project_path, file.file_path);
					deleted_count++;
					continue; // Skip to the next file
				}
				
				const raw_file_content = get_raw_file_content(file.file_path, project_path);
				const current_checksum = calculate_checksum(raw_file_content);
				
				if (force || current_checksum !== file.last_checksum) {
					reanalysis_progress.message = `Analyzing ${file.file_path}`; // More specific message
					console.log(`Re-analyzing ${force ? '(forced)' : '(modified)'} file: ${file.file_path}`);
					// Pass `force: true` to analyze_file to ensure it runs without its own redundant check, and pass temperature.
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
		return {success: true, analyzed: analyzed_count, skipped: skipped_count, deleted: deleted_count, errors: errors};
	} finally {
		// Reset progress state regardless of success or failure to clean up the UI.
		reanalysis_progress = {total: 0, current: 0, running: false, message: ''};
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
 * NEW: Handles a direct prompt from the user, sending it to the LLM.
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
	
	return {
		tokens: {
			prompt: prompt_tokens_row ? parseInt(prompt_tokens_row.value, 10) : 0,
			completion: completionTokens_row ? parseInt(completionTokens_row.value, 10) : 0
		},
		reanalysis: reanalysis_progress
	};
}

/**
 * Returns the in-memory log of LLM calls for the current session.
 * @returns {Array<object>} The array of log entries.
 */
function get_llm_log() {
	// Fetch the log from the database instead of in-memory.
	return db.prepare(`
        SELECT timestamp,
               reason,
               model_id          as model_id,
               prompt_tokens     as prompt_tokens,
               completion_tokens as completion_tokens
        FROM llm_log
        ORDER BY timestamp DESC
    `).all();
}

module.exports = {
	refresh_llms,
	analyze_file,
	get_relevant_files_from_prompt,
	reanalyze_modified_files,
	get_session_stats,
	get_llm_log,
	ask_question_about_code,
	handle_direct_prompt // NEW: Export the Direct Prompt function
};
