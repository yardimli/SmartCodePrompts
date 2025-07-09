/**
 * @file node-llm.js
 * @description This file acts as a facade, aggregating and exporting all LLM-related functionalities
 * from specialized modules. This maintains a consistent public API for the rest of the application,
 * preventing the need for refactoring in consumer files like electron-main.js.
 */

// NEW: Import from the new specialized modules.
const data_functions = require('./node-llm-data');
const task_functions = require('./node-llm-tasks');

// The API functions are used internally by the task and data modules,
// so they don't need to be re-exported from this top-level facade.

// NEW: Destructure all public functions from their respective modules.
const {
	cancel_analysis,
	cancel_auto_select,
	analyze_file,
	reanalyze_modified_files,
	get_relevant_files_from_prompt,
	ask_question_about_code_stream,
	handle_direct_prompt_stream,
	identify_project_files
} = task_functions;

const {
	refresh_llms,
	get_session_stats,
	get_llm_log
} = data_functions;

// NEW: Combine all functions into a single export object to match the original module's interface.
module.exports = {
	// Functions from node-llm-data.js
	refresh_llms,
	get_session_stats,
	get_llm_log,
	
	// Functions from node-llm-tasks.js
	cancel_analysis,
	cancel_auto_select,
	analyze_file,
	reanalyze_modified_files,
	get_relevant_files_from_prompt,
	ask_question_about_code_stream,
	handle_direct_prompt_stream,
	identify_project_files
};
