// node-llm-tasks.js:

/**
 * @file node-llm-tasks.js
 * @description Implements high-level LLM-driven tasks like file analysis, Q&A, and code generation.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const {db} = require('./node-config');
const {get_file_content, get_raw_file_content, calculate_checksum} = require('./node-files');
const {get_project_settings, is_path_excluded} = require('./node-projects');
const {call_llm_sync, call_llm_stream} = require('./node-llm-api');

// State management for long-running background tasks, allowing the UI to poll for progress.
let reanalysis_progress = {total: 0, current: 0, running: false, message: '', cancelled: false, summary: null};
let auto_select_progress = {total: 0, current: 0, running: false, message: '', cancelled: false, summary: null};

/**
 * Signals a running re-analysis task to stop.
 * @returns {{success: boolean}}
 */
function cancel_analysis () {
	if (reanalysis_progress && reanalysis_progress.running) {
		console.log('Cancellation signal received for re-analysis.');
		reanalysis_progress.cancelled = true;
	}
	return {success: true};
}

/**
 * Signals a running auto-select task to stop.
 * @returns {{success: boolean}}
 */
function cancel_auto_select () {
	if (auto_select_progress && auto_select_progress.running) {
		console.log('Cancellation signal received for auto-select.');
		auto_select_progress.cancelled = true;
	}
	return {success: true};
}

/**
 * Analyzes a single file using two separate LLM calls for overview and function details,
 * then saves the results to the database. Skips analysis if file content has not changed, unless forced.
 * @param {object} params - The parameters for the analysis.
 * @returns {Promise<object>} A promise that resolves to a success object with a status ('analyzed' or 'skipped').
 */
async function analyze_file ({project_path, file_path, llm_id, force = false, temperature}) {
	if (!llm_id) {
		throw new Error('No LLM selected for analysis.');
	}
	
	const project_settings = get_project_settings(project_path);
	
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
	const short_file_name = path.basename(file_path);
	
	const prompts = project_settings.prompts;
	
	const overview_prompt_template = prompts.file_overview;
	const overview_prompt = overview_prompt_template
		.replace(/\$\{file_path\}/g, file_path)
		.replace(/\$\{file_content\}/g, file_content);
	const overview_result = await call_llm_sync(overview_prompt, llm_id, `File Overview: ${short_file_name}`, temperature);
	
	const functions_prompt_template = prompts.functions_logic;
	const functions_prompt = functions_prompt_template
		.replace(/\$\{file_path\}/g, file_path)
		.replace(/\$\{file_content\}/g, file_content);
	const functions_result = await call_llm_sync(functions_prompt, llm_id, `Functions/Logic: ${short_file_name}`, temperature);
	
	db.prepare(`
        INSERT OR REPLACE INTO file_metadata (project_path, file_path, file_overview, functions_overview, last_analyze_update_time, last_checksum)
        VALUES (?, ?, ?, ?, ?, ?)
    `).run(project_path, file_path, overview_result, functions_result, new Date().toISOString(), current_checksum);
	
	return {success: true, status: 'analyzed'};
}

/**
 * This function now runs as a background task. It scans all analyzed files in a project,
 * re-analyzes any that have been modified (or all if forced), and reports progress via the
 * module-level `reanalysis_progress` state object for the frontend to poll.
 * @param {object} params - The parameters for the operation.
 */
async function reanalyze_modified_files ({project_path, llm_id, force = false, temperature}) {
	// Prevent multiple re-analysis tasks from running at the same time.
	if (reanalysis_progress.running) {
		console.warn('Re-analysis is already running. Ignoring new request.');
		return;
	}
	if (!llm_id) {
		console.error('No LLM selected for re-analysis.');
		return;
	}
	
	const project_settings = get_project_settings(project_path);
	const all_analyzed_files = db.prepare('SELECT file_path, last_checksum FROM file_metadata WHERE project_path = ?')
		.all(project_path);
	
	// Filter out files from excluded folders before processing.
	const analyzed_files = all_analyzed_files.filter(
		file => !is_path_excluded(file.file_path, project_settings)
	);
	
	// Mutate the existing progress object instead of reassigning it.
	// This ensures that other modules holding a reference to this object see the updates.
	reanalysis_progress.total = analyzed_files.length;
	reanalysis_progress.current = 0;
	reanalysis_progress.running = true;
	reanalysis_progress.message = 'Initializing re-analysis...';
	reanalysis_progress.cancelled = false;
	reanalysis_progress.summary = null;
	
	let analyzed_count = 0;
	let skipped_count = 0;
	let deleted_count = 0;
	const errors = [];
	
	const delete_stmt = db.prepare('DELETE FROM file_metadata WHERE project_path = ? AND file_path = ?');
	
	try {
		for (const file of analyzed_files) {
			if (reanalysis_progress.cancelled) {
				reanalysis_progress.message = 'Re-analysis cancelled by user.';
				console.log('Re-analysis loop cancelled.');
				errors.push('Operation cancelled by user.');
				break;
			}
			
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
async function get_relevant_files_from_prompt ({project_path, user_prompt, llm_id, temperature}) {
	if (!llm_id) {
		throw new Error('No LLM selected for analysis.');
	}
	
	const project_settings = get_project_settings(project_path);
	
	const all_analyzed_files = db.prepare(`
        SELECT file_path, file_overview, functions_overview
        FROM file_metadata
        WHERE project_path = ?
          AND ((file_overview IS NOT NULL AND file_overview != '') OR (functions_overview IS NOT NULL AND functions_overview != ''))
    `).all(project_path);
	
	// Filter out files from excluded folders before sending to the LLM.
	const analyzed_files = all_analyzed_files.filter(
		file => !is_path_excluded(file.file_path, project_settings)
	);
	
	if (!analyzed_files || analyzed_files.length === 0) {
		throw new Error("No non-excluded files have been analyzed in this project. Please analyze files before using 'Smart Prompt'.");
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
	
	const prompts = project_settings.prompts;
	const master_prompt_template = prompts.smart_prompt;
	
	const master_prompt = master_prompt_template
		.replace(/\$\{user_prompt\}/g, user_prompt)
		.replace(/\$\{analysis_data_string\}/g, analysis_data_string);
	
	const llm_response = await call_llm_sync(master_prompt, llm_id, 'Smart Prompt File Selection', temperature);
	
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
		console.error('Failed to parse LLM response for relevant files:', llm_response);
		throw new Error(`Could not understand the LLM's response. Raw response: ${llm_response}`);
	}
}

/**
 * Asks a question about the code, using provided files as context, and streams the answer.
 * @param {object} params - The parameters for the operation, including callbacks.
 */
async function ask_question_about_code_stream ({project_path, question, relevant_files, llm_id, temperature, onChunk, onEnd, onError}) {
	if (!llm_id) {
		onError(new Error('No LLM selected for the question.'));
		return;
	}
	
	const project_settings = get_project_settings(project_path);
	
	const parsed_relevant_files = JSON.parse(relevant_files);
	if (!parsed_relevant_files || parsed_relevant_files.length === 0) {
		onError(new Error('No relevant files were provided to answer the question.'));
		return;
	}
	
	let file_context = '';
	for (const file_path of parsed_relevant_files) {
		try {
			const content = get_raw_file_content(file_path, project_path);
			file_context += `--- FILE: ${file_path} ---\n\n${content}\n\n`;
		} catch (error) {
			console.warn(`Could not read file ${file_path} for QA context:`, error.message);
			file_context += `--- FILE: ${file_path} ---\n\n[Could not read file content]\n\n`;
		}
	}
	
	const prompts = project_settings.prompts;
	const qa_prompt_template = prompts.qa;
	
	const final_prompt = qa_prompt_template
		.replace(/\$\{file_context\}/g, file_context)
		.replace(/\$\{user_question\}/g, question);
	
	await call_llm_stream(final_prompt, llm_id, `QA: ${question.substring(0, 30)}...`, temperature, 'text', {onChunk, onEnd, onError});
}

/**
 * Handles a direct prompt from the user, streaming the response.
 * @param {object} params - The parameters for the operation, including callbacks.
 */
async function handle_direct_prompt_stream ({prompt, llm_id, temperature, onChunk, onEnd, onError, project_path}) {
	if (!llm_id) {
		onError(new Error('No LLM selected for the prompt.'));
		return;
	}
	if (!prompt) {
		onError(new Error('Prompt content is empty.'));
		return;
	}
	if (!project_path) {
		onError(new Error('No project context was provided for the direct prompt.'));
		return;
	}
	
	await call_llm_stream(prompt, llm_id, `Direct Prompt`, temperature, 'text', {onChunk, onEnd, onError});
}

/**
 * Identifies project-specific files from a list using an LLM, processing in batches.
 * This is a background task that reports progress via the `auto_select_progress` state object.
 * @param {object} params - The parameters for the operation.
 */
async function identify_project_files ({project_path, all_files, llm_id, temperature}) {
	// Prevent multiple auto-select tasks from running at the same time.
	if (auto_select_progress.running) {
		console.warn('Auto-select is already running. Ignoring new request.');
		return;
	}
	if (!llm_id) {
		console.error('No LLM selected for auto-select.');
		return;
	}
	
	const project_settings = get_project_settings(project_path);
	
	const files_to_process = JSON.parse(all_files);
	const BATCH_SIZE = 20;
	
	// Mutate the existing progress object instead of reassigning it.
	auto_select_progress.total = files_to_process.length;
	auto_select_progress.current = 0;
	auto_select_progress.running = true;
	auto_select_progress.message = 'Initializing file identification...';
	auto_select_progress.cancelled = false;
	auto_select_progress.summary = null;
	
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
			
			const prompts = project_settings.prompts;
			const prompt_template = prompts.auto_select;
			const prompt = prompt_template.replace(/\$\{file_list_string\}/g, file_list_string);
			
			try {
				const llm_response = await call_llm_sync(prompt, llm_id, `Auto-Select Batch ${current_batch_num}`, temperature);
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
	// Export state variables for use by the data module.
	reanalysis_progress,
	auto_select_progress,
	// Public Task Functions
	cancel_analysis,
	cancel_auto_select,
	analyze_file,
	reanalyze_modified_files,
	get_relevant_files_from_prompt,
	ask_question_about_code_stream,
	handle_direct_prompt_stream,
	identify_project_files
};