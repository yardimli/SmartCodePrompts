// SmartCodePrompts/node-llm.js
const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const {db, config} = require('./node-config');
const {getFileContent, getRawFileContent, getFileAnalysis, calculateChecksum} = require('./node-files');

// Module-level state to track session-wide data.
// This will persist as long as the Node.js process is running.
let sessionTokenUsage = {prompt: 0, completion: 0};
let reanalysisProgress = {total: 0, current: 0, running: false, message: ''};
let sessionLlmLog = []; // In-memory log for LLM calls this session.

/**
 * Logs an interaction with the LLM to a file.
 * @param {string} prompt - The prompt sent to the LLM.
 * @param {string} response - The response received from the LLM (or an error message).
 * @param {boolean} [isError=false] - Flag to indicate if the log entry is an error.
 */
function logLlmInteraction(prompt, response, isError = false) {
	const logFilePath = path.join(__dirname, 'llm-log.txt');
	const timestamp = new Date().toISOString();
	const logHeader = isError ? '--- LLM ERROR ---' : '--- LLM INTERACTION ---';
	const logEntry = ` ${logHeader}\n Timestamp: ${timestamp} \n---\n PROMPT SENT \n---\n ${prompt} \n---\n RESPONSE RECEIVED \n---\n ${response} \n--- END ---\n \n`;
	try {
		fs.appendFileSync(logFilePath, logEntry);
	} catch (err) {
		console.error('Failed to write to LLM log file:', err);
	}
}

/**
 * Fetches the list of available models from the OpenRouter API.
 * @returns {Promise<object>} A promise that resolves to the parsed JSON response from OpenRouter.
 */
async function fetchOpenRouterModels() {
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
 * MODIFIED: Calls a specified LLM, tracks token usage, and logs the call for the session.
 * @param {string} prompt - The prompt to send to the LLM.
 * @param {string} modelId - The ID of the OpenRouter model to use.
 * @param {string} [callReason='Unknown'] - A short description of why the LLM is being called.
 * @returns {Promise<string>} A promise that resolves to the content of the LLM's response.
 */
async function callLlm(prompt, modelId, callReason = 'Unknown') {
	if (!config.openrouter_api_key || config.openrouter_api_key === 'YOUR_API_KEY_HERE') {
		throw new Error('OpenRouter API key is not configured. Please add it on the Setup page.');
	}
	return new Promise((resolve, reject) => {
		const postData = JSON.stringify({
			model: modelId,
			messages: [{role: "user", content: prompt}],
			response_format: {type: "json_object"} // Request JSON output
		});
		const options = {
			hostname: 'openrouter.ai',
			path: '/api/v1/chat/completions',
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'HTTP-Referer': 'https://smartcodeprompts.com',
				'X-Title': 'Smart Code Prompts',
				'Authorization': `Bearer ${config.openrouter_api_key}`,
				'Content-Length': Buffer.byteLength(postData)
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
						const responseJson = JSON.parse(data);
						const promptTokens = responseJson.usage ? responseJson.usage.prompt_tokens || 0 : 0;
						const completionTokens = responseJson.usage ? responseJson.usage.completion_tokens || 0 : 0;
						
						// Track total token usage for the session
						sessionTokenUsage.prompt += promptTokens;
						sessionTokenUsage.completion += completionTokens;
						
						// Add to session log for the UI modal
						sessionLlmLog.unshift({ // unshift to add to the beginning (most recent first)
							timestamp: new Date().toISOString(),
							reason: callReason,
							promptTokens: promptTokens,
							completionTokens: completionTokens,
							modelId: modelId || 'N/A', // Use 'N/A' if modelId is not provided
						});
						// Keep the log from growing indefinitely
						if (sessionLlmLog.length > 100) {
							sessionLlmLog.pop();
						}
						
						if (responseJson.choices && responseJson.choices.length > 0) {
							const llmContent = responseJson.choices[0].message.content;
							logLlmInteraction(prompt, llmContent, false);
							resolve(llmContent);
						} else {
							const errorMsg = 'Invalid response structure from LLM.';
							logLlmInteraction(prompt, `Error: ${errorMsg}\nRaw Response: ${data}`, true);
							reject(new Error(errorMsg));
						}
					} catch (e) {
						const errorMsg = `Failed to parse LLM response. Error: ${e.message}`;
						logLlmInteraction(prompt, `Error: ${errorMsg}\nRaw Response: ${data}`, true);
						reject(new Error('Failed to parse LLM response.'));
					}
				} else {
					const errorMsg = `LLM API request failed with status code: ${res.statusCode}. Response: ${data}`;
					logLlmInteraction(prompt, errorMsg, true);
					reject(new Error(errorMsg));
				}
			});
		});
		req.on('error', (e) => {
			const errorMsg = `Request Error: ${e.message}`;
			logLlmInteraction(prompt, errorMsg, true);
			reject(e);
		});
		req.write(postData);
		req.end();
	});
}

/**
 * Refreshes the local list of LLMs from OpenRouter and stores them in the database.
 * @returns {Promise<object>} A promise that resolves to an object containing the new list of LLMs.
 */
async function refreshLlms() {
	const modelData = await fetchOpenRouterModels();
	const models = modelData.data || [];
	const insert = db.prepare('INSERT OR REPLACE INTO llms (id, name, context_length, prompt_price, completion_price) VALUES (@id, @name, @context_length, @prompt_price, @completion_price)');
	const transaction = db.transaction((modelsToInsert) => {
		db.exec('DELETE FROM llms');
		for (const model of modelsToInsert) {
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
	const newLlms = db.prepare('SELECT id, name FROM llms ORDER BY name ASC').all();
	return {success: true, llms: newLlms};
}

/**
 * Analyzes a single file using two separate LLM calls for overview and function details,
 * then saves the results to the database. Skips analysis if file content has not changed, unless forced.
 * @param {object} params - The parameters for the analysis.
 * @param {number} params.rootIndex - The index of the project's root directory.
 * @param {string} params.projectPath - The path of the project.
 * @param {string} params.filePath - The path of the file to analyze.
 * @param {string} params.llmId - The ID of the LLM to use for analysis.
 * @param {boolean} [params.force=false] - If true, analysis is performed even if checksums match.
 * @returns {Promise<object>} A promise that resolves to a success object with a status ('analyzed' or 'skipped').
 */
async function analyzeFile({rootIndex, projectPath, filePath, llmId, force = false}) {
	if (!llmId) {
		throw new Error('No LLM selected for analysis.');
	}
	const rawFileContent = getRawFileContent(filePath, rootIndex);
	const currentChecksum = crypto.createHash('sha256').update(rawFileContent).digest('hex');
	const existingMetadata = db.prepare('SELECT last_checksum FROM file_metadata WHERE project_root_index = ? AND project_path = ? AND file_path = ?')
		.get(rootIndex, projectPath, filePath);
	
	if (!force && existingMetadata && existingMetadata.last_checksum === currentChecksum) {
		console.log(`Skipping analysis for ${filePath}, checksum matches.`);
		return {success: true, status: 'skipped'};
	}
	
	console.log(`Analyzing ${filePath}, checksum mismatch or new file.`);
	const fileContent = getFileContent(filePath, rootIndex).content;
	const shortFileName = path.basename(filePath); // Get just the filename for the log.
	
	const overviewPromptTemplate = config.prompt_file_overview;
	const overviewPrompt = overviewPromptTemplate
		.replace(/\$\{filePath\}/g, filePath)
		.replace(/\$\{fileContent\}/g, fileContent);
	const overviewResult = await callLlm(overviewPrompt, llmId, `File Overview: ${shortFileName}`);
	
	const functionsPromptTemplate = config.prompt_functions_logic;
	const functionsPrompt = functionsPromptTemplate
		.replace(/\$\{filePath\}/g, filePath)
		.replace(/\$\{fileContent\}/g, fileContent);
	const functionsResult = await callLlm(functionsPrompt, llmId, `Functions/Logic: ${shortFileName}`);
	
	db.prepare(`
        INSERT OR REPLACE INTO file_metadata (project_root_index, project_path, file_path, file_overview, functions_overview, last_analyze_update_time, last_checksum)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(rootIndex, projectPath, filePath, overviewResult, functionsResult, new Date().toISOString(), currentChecksum);
	
	return {success: true, status: 'analyzed'};
}

/**
 * MODIFIED: Scans all analyzed files in a project and re-analyzes any that have been modified.
 * Can also be forced to re-analyze all files regardless of modification status.
 * Now reports progress via the module-level `reanalysisProgress` state.
 * @param {object} params - The parameters for the operation.
 * @param {number} params.rootIndex - The index of the project's root directory.
 * @param {string} params.projectPath - The path of the project.
 * @param {string} params.llmId - The ID of the LLM to use for analysis.
 * @param {boolean} [params.force=false] - If true, re-analyzes all files, ignoring checksums.
 * @returns {Promise<object>} A summary of the operation.
 */
async function reanalyzeModifiedFiles({rootIndex, projectPath, llmId, force = false}) {
	if (!llmId) {
		throw new Error('No LLM selected for analysis.');
	}
	const analyzedFiles = db.prepare('SELECT file_path, last_checksum FROM file_metadata WHERE project_root_index = ? AND project_path = ?')
		.all(rootIndex, projectPath);
	
	// Initialize progress tracking state.
	reanalysisProgress = {
		total: analyzedFiles.length,
		current: 0,
		running: true,
		message: 'Initializing re-analysis...'
	};
	let analyzedCount = 0;
	let skippedCount = 0;
	const errors = [];
	try {
		for (const file of analyzedFiles) {
			// Update progress before processing each file.
			reanalysisProgress.current++;
			reanalysisProgress.message = `Processing ${file.file_path}`;
			try {
				const rawFileContent = getRawFileContent(file.file_path, rootIndex);
				const currentChecksum = calculateChecksum(rawFileContent);
				
				if (force || currentChecksum !== file.last_checksum) {
					reanalysisProgress.message = `Analyzing ${file.file_path}`; // More specific message
					console.log(`Re-analyzing ${force ? '(forced)' : '(modified)'} file: ${file.file_path}`);
					// Pass `force: true` to analyzeFile to ensure it runs without its own redundant check.
					await analyzeFile({rootIndex, projectPath, filePath: file.file_path, llmId, force: true});
					analyzedCount++;
				} else {
					skippedCount++;
				}
			} catch (error) {
				console.error(`Error during re-analysis of ${file.file_path}:`, error);
				errors.push(`${file.file_path}: ${error.message}`);
			}
		}
		return {success: true, analyzed: analyzedCount, skipped: skippedCount, errors: errors};
	} finally {
		// Reset progress state regardless of success or failure to clean up the UI.
		reanalysisProgress = {total: 0, current: 0, running: false, message: ''};
	}
}

/**
 * Uses an LLM to determine which files from a given list are relevant to a user's prompt.
 * @param {object} params - The parameters for the operation.
 * @returns {Promise<object>} A promise resolving to an object with a `relevant_files` array.
 */
async function getRelevantFilesFromPrompt({rootIndex, projectPath, userPrompt, llmId}) {
	if (!llmId) {
		throw new Error('No LLM selected for analysis.');
	}
	const analyzedFiles = db.prepare(`
        SELECT file_path, file_overview, functions_overview
        FROM file_metadata
        WHERE project_root_index = ?
          AND project_path = ?
          AND ((file_overview IS NOT NULL AND file_overview != '') OR (functions_overview IS NOT NULL AND functions_overview != ''))
    `).all(rootIndex, projectPath);
	
	if (!analyzedFiles || analyzedFiles.length === 0) {
		throw new Error('No files have been analyzed in this project. Please analyze files before using this feature.');
	}
	
	let analysisDataString = '';
	const allFilePaths = [];
	for (const analysis of analyzedFiles) {
		allFilePaths.push(analysis.file_path);
		analysisDataString += `File: ${analysis.file_path}\n`;
		if (analysis.file_overview) {
			analysisDataString += `Overview: ${analysis.file_overview}\n`;
		}
		if (analysis.functions_overview) {
			analysisDataString += `Functions/Logic: ${analysis.functions_overview}\n`;
		}
		analysisDataString += '---\n\n';
	}
	
	const masterPromptTemplate = config.prompt_smart_prompt;
	const masterPrompt = masterPromptTemplate
		.replace(/\$\{userPrompt\}/g, userPrompt)
		.replace(/\$\{analysisDataString\}/g, analysisDataString);
	
	const llmResponse = await callLlm(masterPrompt, llmId, 'Smart Prompt File Selection');
	
	try {
		const parsedResponse = JSON.parse(llmResponse);
		if (parsedResponse && Array.isArray(parsedResponse.relevant_files)) {
			const validFilePaths = new Set(allFilePaths);
			const filteredFiles = parsedResponse.relevant_files.filter(f => validFilePaths.has(f));
			return {relevant_files: filteredFiles};
		} else {
			throw new Error('LLM response is not in the expected format (missing "relevant_files" array).');
		}
	} catch (e) {
		console.error("Failed to parse LLM response for relevant files:", llmResponse);
		throw new Error(`Could not understand the LLM's response. Raw response: ${llmResponse}`);
	}
}

/**
 * NEW: Returns the current session statistics.
 * This function should be exposed via a new 'get_session_stats' action in the main server handler.
 * The main 'get_main_page_data' action should also be modified to include `tokens` from this function
 * in its initial response payload.
 * @returns {object} An object containing session token usage and re-analysis progress.
 */
function getSessionStats() {
	return {
		tokens: sessionTokenUsage,
		reanalysis: reanalysisProgress
	};
}

/**
 * NEW: Returns the in-memory log of LLM calls for the current session.
 * @returns {Array<object>} The array of log entries.
 */
function getLlmLog() {
	return sessionLlmLog;
}

module.exports = {
	refreshLlms,
	analyzeFile,
	getRelevantFilesFromPrompt,
	reanalyzeModifiedFiles,
	getSessionStats, // Export the new stats function.
	getLlmLog // Export the new log function.
};
