/**
 * @file node-llm-api.js
 * @description Handles all low-level communication with the OpenRouter LLM API.
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const {db, config} = require('./node-config');

// Determine the application data path from environment variables for consistency.
const isElectron = !!process.env.ELECTRON_RUN;
const appDataPath = isElectron ? process.env.APP_DATA_PATH : __dirname;

/**
 * Logs an interaction with the LLM to a file for debugging purposes.
 * @param {string} prompt - The prompt sent to the LLM.
 * @param {string} response - The response received from the LLM (or an error message).
 * @param {boolean} [is_error=false] - Flag to indicate if the log entry is an error.
 */
function log_llm_interaction (prompt, response, is_error = false) {
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

/**
 * Fetches the list of available models from the OpenRouter API.
 * @param {string|null} [api_key_override=null] - An optional API key to use for this call, for testing purposes.
 * @returns {Promise<object>} A promise that resolves to the parsed JSON response from OpenRouter.
 */
async function fetch_open_router_models (api_key_override = null) {
	const api_key = api_key_override || config.openrouter_api_key;
	if (!api_key) {
		throw new Error('OpenRouter API key is not configured.');
	}
	
	return new Promise((resolve, reject) => {
		const options = {
			hostname: 'openrouter.ai',
			path: '/api/v1/models',
			method: 'GET',
			headers: {
				'Accept': 'application/json',
				'HTTP-Referer': 'https://smartcodeprompts.com',
				'X-Title': 'Smart Code Prompts',
				'Authorization': `Bearer ${api_key}`
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
					reject(new Error(`OpenRouter request failed with status code: ${res.statusCode}. Response: ${data}`));
				}
			});
		});
		req.on('error', (e) => reject(e));
		req.end();
	});
}

/**
 * Calls a specified LLM synchronously, waiting for the full response.
 * @param {string} prompt - The prompt to send to the LLM.
 * @param {string} model_id - The ID of the OpenRouter model to use.
 * @param {string} [call_reason='Unknown'] - A short description of why the LLM is being called.
 * @param {number} [temperature] - The temperature for the LLM call.
 * @param {string|null} [response_format='json_object'] - The expected response format ('json_object' or 'text'). Pass null for default.
 * @returns {Promise<string>} A promise that resolves to the content of the LLM's response.
 */
async function call_llm_sync (prompt, model_id, call_reason = 'Unknown', temperature, response_format = 'json_object') {
	const api_key = config.openrouter_api_key;
	if (!api_key) {
		throw new Error('OpenRouter API key is not configured. Please add it via the API Key settings.');
	}
	return new Promise((resolve, reject) => {
		const request_body = {
			model: model_id,
			messages: [{role: 'user', content: prompt}]
		};
		if (response_format) {
			request_body.response_format = {type: response_format};
		}
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
				'Authorization': `Bearer ${api_key}`,
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
						
						const log_stmt = db.prepare('INSERT INTO llm_log (timestamp, reason, model_id, prompt_tokens, completion_tokens) VALUES (?, ?, ?, ?, ?)');
						const updatePromptTokens_stmt = db.prepare("UPDATE app_settings SET value = CAST(value AS INTEGER) + ? WHERE key = 'total_prompt_tokens'");
						const updateCompletionTokens_stmt = db.prepare("UPDATE app_settings SET value = CAST(value AS INTEGER) + ? WHERE key = 'total_completion_tokens'");
						
						db.transaction(() => {
							log_stmt.run(new Date().toISOString(), call_reason, model_id || 'N/A', prompt_tokens, completion_tokens);
							if (prompt_tokens > 0) updatePromptTokens_stmt.run(prompt_tokens);
							if (completion_tokens > 0) updateCompletionTokens_stmt.run(completion_tokens);
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
 * Calls a specified LLM and streams the response back via callbacks.
 * @param {string} prompt - The prompt to send to the LLM.
 * @param {string} model_id - The ID of the OpenRouter model to use.
 * @param {string} call_reason - A short description of why the LLM is being called.
 * @param {number} temperature - The temperature for the LLM call.
 * @param {string|null} response_format - The expected response format ('json_object' or 'text').
 * @param {object} callbacks - The callback functions { onChunk, onEnd, onError }.
 */
async function call_llm_stream (prompt, model_id, call_reason, temperature, response_format, {onChunk, onEnd, onError}) {
	const api_key = config.openrouter_api_key;
	if (!api_key) {
		onError(new Error('OpenRouter API key is not configured. Please add it via the API Key settings.'));
		return;
	}
	
	const request_body = {
		model: model_id,
		messages: [{role: 'user', content: prompt}],
		stream: true
	};
	
	if (response_format) {
		request_body.response_format = {type: response_format};
	}
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
			'Authorization': `Bearer ${api_key}`,
			'Content-Length': Buffer.byteLength(post_data)
		}
	};
	
	const req = https.request(options, (res) => {
		if (res.statusCode < 200 || res.statusCode >= 300) {
			let errorBody = '';
			res.on('data', chunk => errorBody += chunk);
			res.on('end', () => {
				const error_msg = `LLM API request failed with status code: ${res.statusCode}. Response: ${errorBody}`;
				log_llm_interaction(prompt, error_msg, true);
				onError(new Error(error_msg));
			});
			return;
		}
		
		let buffer = '';
		let prompt_tokens = 0;
		let completion_tokens = 0;
		
		res.on('data', (chunk) => {
			buffer += chunk.toString();
			let boundary;
			while ((boundary = buffer.indexOf('\n\n')) !== -1) {
				const message = buffer.substring(0, boundary);
				buffer = buffer.substring(boundary + 2);
				if (message.startsWith('data: ')) {
					const data = message.substring(6);
					if (data.trim() === '[DONE]') continue;
					try {
						const parsed = JSON.parse(data);
						if (parsed.choices && parsed.choices[0].delta && parsed.choices[0].delta.content) {
							onChunk(parsed.choices[0].delta.content);
						}
						if (parsed.usage) {
							prompt_tokens = parsed.usage.prompt_tokens || 0;
							completion_tokens = parsed.usage.completion_tokens || 0;
						}
					} catch (e) {
						console.error('Failed to parse stream chunk:', data, e);
					}
				}
			}
		});
		
		res.on('end', () => {
			const usageHeader = res.headers['x-openrouter-usage'];
			if (usageHeader) {
				try {
					const usage = JSON.parse(usageHeader);
					prompt_tokens = usage.prompt_tokens || prompt_tokens;
					completion_tokens = usage.completion_tokens || completion_tokens;
				} catch (e) {
					console.warn('Could not parse x-openrouter-usage header', e);
				}
			}
			
			const log_stmt = db.prepare('INSERT INTO llm_log (timestamp, reason, model_id, prompt_tokens, completion_tokens) VALUES (?, ?, ?, ?, ?)');
			const updatePromptTokens_stmt = db.prepare("UPDATE app_settings SET value = CAST(value AS INTEGER) + ? WHERE key = 'total_prompt_tokens'");
			const updateCompletionTokens_stmt = db.prepare("UPDATE app_settings SET value = CAST(value AS INTEGER) + ? WHERE key = 'total_completion_tokens'");
			
			db.transaction(() => {
				log_stmt.run(new Date().toISOString(), call_reason, model_id || 'N/A', prompt_tokens, completion_tokens);
				if (prompt_tokens > 0) updatePromptTokens_stmt.run(prompt_tokens);
				if (completion_tokens > 0) updateCompletionTokens_stmt.run(completion_tokens);
			})();
			
			onEnd({prompt_tokens, completion_tokens});
		});
	});
	
	req.on('error', (e) => {
		const error_msg = `Request Error: ${e.message}`;
		log_llm_interaction(prompt, error_msg, true);
		onError(e);
	});
	
	req.write(post_data);
	req.end();
}

module.exports = {
	fetch_open_router_models,
	call_llm_sync,
	call_llm_stream
};
