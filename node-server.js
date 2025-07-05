// SmartCodePrompts/node-server.js
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const os = require('os');

const config_manager = require('./node-config');
const llm_manager = require('./node-llm');
const project_manager = require('./node-projects');
const file_manager = require('./node-files');

config_manager.initialize_database_and_config();

/**
 * Handles all incoming POST requests by routing them to the correct handler function
 * based on the 'action' parameter in the request body.
 * @param {http.IncomingMessage} req - The request object.
 * @param {http.ServerResponse} res - The response object.
 */
async function handle_post_request(req, res) {
	let body = '';
	req.on('data', chunk => {
		body += chunk.toString();
	});
	req.on('end', async () => {
		const post_data = new URLSearchParams(body);
		const action = post_data.get('action');
		console.log('POST Request Action:', action);
		let result;
		try {
			switch (action) {
				// --- Config/Setup Actions (from node-config.js) ---
				case 'get_session_stats':
					result = llm_manager.get_session_stats();
					break;
				case 'get_setup':
					result = config_manager.get_setup_data();
					break;
				case 'save_setup':
					config_manager.save_setup_data(post_data);
					result = {success: true};
					break;
				case 'reset_prompts':
					result = config_manager.reset_prompts_to_default();
					break;
				case 'reset_llm_log':
					result = config_manager.reset_llm_log();
					break;
				case 'set_dark_mode':
					config_manager.set_dark_mode(post_data.get('is_dark_mode') === 'true');
					result = {success: true};
					break;
				case 'set_right_sidebar_collapsed':
					config_manager.setright_sidebar_collapsed(post_data.get('is_collapsed') === 'true');
					result = {success: true};
					break;
				case 'save_selected_llm':
					config_manager.save_selected_llm(post_data.get('llm_id'));
					result = {success: true};
					break;
				case 'save_last_smart_prompt':
					config_manager.save_last_smart_prompt(post_data.get('prompt'));
					result = {success: true};
					break;
				case 'save_compress_extensions':
					config_manager.save_compress_extensions(post_data.get('extensions'));
					result = {success: true};
					break;
				case 'get_main_page_data':
					result = config_manager.get_main_page_data();
					break;
				
				// --- LLM Actions (from node-llm.js) ---
				case 'refresh_llms':
					result = await llm_manager.refresh_llms();
					break;
				case 'get_llm_log':
					result = llm_manager.get_llm_log();
					break;
				case 'analyze_file':
					result = await llm_manager.analyze_file({
						project_path: post_data.get('project_path'),
						file_path: post_data.get('file_path'),
						llm_id: post_data.get('llm_id'),
						temperature: parseFloat(post_data.get('temperature'))
					});
					break;
				case 'reanalyze_modified_files':
					result = await llm_manager.reanalyze_modified_files({
						project_path: post_data.get('project_path'),
						llm_id: post_data.get('llm_id'),
						force: post_data.get('force') === 'true',
						temperature: parseFloat(post_data.get('temperature'))
					});
					break;
				case 'get_relevant_files_from_prompt':
					result = await llm_manager.get_relevant_files_from_prompt({
						project_path: post_data.get('project_path'),
						user_prompt: post_data.get('user_prompt'),
						llm_id: post_data.get('llm_id'),
						temperature: parseFloat(post_data.get('temperature'))
					});
					break;
				case 'ask_question_about_code':
					result = await llm_manager.ask_question_about_code({
						project_path: post_data.get('project_path'),
						question: post_data.get('question'),
						relevant_files: JSON.parse(post_data.get('relevant_files')),
						llm_id: post_data.get('llm_id'),
						temperature: parseFloat(post_data.get('temperature'))
					});
					break;
				case 'direct_prompt':
					result = await llm_manager.handle_direct_prompt({
						prompt: post_data.get('prompt'),
						llm_id: post_data.get('llm_id'),
						temperature: parseFloat(post_data.get('temperature'))
					});
					break;
				
				// --- Project Actions (from node-projects.js) ---
				// NEW: Action to add a project by its full path
				case 'add_project':
					result = project_manager.add_project({
						path: post_data.get('path')
					});
					break;
				// NEW: Action to browse the filesystem
				case 'browse_directory':
					result = project_manager.browse_directory(post_data.get('path') || null);
					break;
				case 'get_project_state':
					result = project_manager.get_project_state({
						project_path: post_data.get('project_path')
					});
					break;
				case 'save_project_state':
					result = project_manager.save_project_state({
						project_path: post_data.get('project_path'),
						open_folders: post_data.get('open_folders'),
						selected_files: post_data.get('selected_files')
					});
					break;
				
				// --- File Actions (from node-files.js) ---
				case 'get_folders':
					result = file_manager.get_folders(
						post_data.get('path'),
						post_data.get('project_path')
					);
					break;
				case 'get_file_content':
					const file_path = post_data.get('path');
					result = file_manager.get_file_content(
						file_path,
						post_data.get('project_path')
					);
					const file_ext = path.extname(file_path).slice(1);
					const compress_extensions = Array.isArray(config_manager.config.compress_extensions) ? config_manager.config.compress_extensions : [];
					if (result && result.content && compress_extensions.includes(file_ext)) {
						result.content = result.content.replace(/\s+/g, ' ');
						result.content = result.content.split(/\r?\n/).filter(line => line.trim() !== '').join('\n');
					}
					break;
				case 'search_files':
					result = file_manager.search_files(
						post_data.get('folder_path'),
						post_data.get('search_term'),
						post_data.get('project_path')
					);
					break;
				case 'get_file_analysis':
					result = file_manager.get_file_analysis({
						project_path: post_data.get('project_path'),
						file_path: post_data.get('file_path')
					});
					break;
				case 'check_for_modified_files':
					result = file_manager.check_for_modified_files({
						project_path: post_data.get('project_path')
					});
					break;
				case 'check_folder_updates':
					result = file_manager.check_folder_updates(
						post_data.get('project_path')
					);
					break;
				default:
					throw new Error(`Unknown action: ${action}`);
			}
			res.writeHead(200, {'Content-Type': 'application/json'});
			res.end(JSON.stringify(result));
		} catch (error) {
			console.error("Error processing POST request:", error);
			res.writeHead(400, {'Content-Type': 'application/json'});
			res.end(JSON.stringify({error: error.message}));
		}
	});
}

/**
 * Serves a static file from the file system.
 * @param {string} file_path - The path to the file to serve.
 * @param {http.ServerResponse} res - The response object.
 */
function serve_static_file(file_path, res) {
	const full_path = path.join(__dirname, file_path);
	const ext = path.extname(file_path).slice(1);
	const mime_types = {
		html: 'text/html',
		js: 'application/javascript',
		css: 'text/css',
		json: 'application/json',
		txt: 'text/plain',
	};
	const content_type = mime_types[ext] || 'application/octet-stream';
	
	fs.readFile(full_path, (err, content) => {
		if (err) {
			if (err.code === 'ENOENT') {
				res.writeHead(404);
				res.end('Not Found');
			} else {
				res.writeHead(500);
				res.end('Server Error');
			}
			return;
		}
		res.writeHead(200, {'Content-Type': content_type});
		res.end(content);
	});
}

// Create the main HTTP server
const server = http.createServer((req, res) => {
	const parsed_url = url.parse(req.url, true);
	if (req.method === 'POST') {
		handle_post_request(req, res);
	} else if (req.method === 'GET') {
		switch (parsed_url.pathname) {
			case '/':
				serve_static_file('index.html', res);
				break;
			// MODIFIED: Removed /projects route
			case '/setup':
				serve_static_file('setup.html', res);
				break;
			default:
				// Serve other static files like JS, CSS
				serve_static_file(parsed_url.pathname, res);
				break;
		}
	} else {
		res.writeHead(405); // Method Not Allowed
		res.end();
	}
});

// Start the server using the port from the loaded configuration
const port = config_manager.config.server_port || 3000;
server.listen(port, () => {
	console.log(`Server running at http://localhost:${port}/`);
});
