// SmartCodePrompts/js/qa.js
import {show_loading, hide_loading, post_data, simple_markdown_to_html} from './utils.js';
import {get_current_project} from './state.js';
import {show_alert} from './modal-alert.js';

let qa_modal = null;
let qa_chat_window = null;
let qa_input = null;
let qa_send_button = null;
let qa_modal_title = null;

/**
 * Initializes references to the QA modal and its elements.
 */
export function initialize_qa_modal() {
	qa_modal = document.getElementById('qa_modal');
	qa_chat_window = document.getElementById('qa-chat-window');
	qa_input = document.getElementById('qa-input');
	qa_send_button = document.getElementById('qa-send-button');
	qa_modal_title = document.getElementById('qa-modal-title');
}

/**
 * Adds a message to the chat window in the QA modal.
 * @param {string} role - 'user' or 'assistant'.
 * @param {string} content - The content of the message.
 * @param {boolean} is_placeholder - If true, returns the element for later updates.
 * @returns {HTMLElement|null} The new message element if it's a placeholder, otherwise null.
 */
function add_message_to_chat(role, content, is_placeholder = false) {
	const message_wrapper = document.createElement('div');
	message_wrapper.className = `chat ${role === 'user' ? 'chat-end' : 'chat-start'}`;
	
	const message_bubble = document.createElement('div');
	message_bubble.className = `chat-bubble ${role === 'user' ? 'chat-bubble-primary' : 'chat-bubble-secondary'}`;
	
	// Handle content based on role and placeholder status
	if (role === 'user') {
		// Escape HTML entities in user messages to display them as text
		const escaped_content = content
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/\n/g, '<br>');
		message_bubble.innerHTML = escaped_content;
	} else if (is_placeholder) {
		// System messages (placeholders) can contain HTML
		message_bubble.innerHTML = content.replace(/\n/g, '<br>');
	} else {
		// Assistant's final answers are already processed by simple_markdown_to_html
		message_bubble.innerHTML = content;
	}
	
	message_wrapper.appendChild(message_bubble);
	qa_chat_window.appendChild(message_wrapper);
	
	// Scroll to the bottom
	qa_chat_window.scrollTop = qa_chat_window.scrollHeight;
	
	if (is_placeholder) {
		return message_bubble;
	}
	return null;
}

/**
 * Handles the submission of a question from the QA modal.
 */
async function handle_question_submit() {
	const user_question = qa_input.value.trim();
	if (!user_question) return;
	
	const current_project = get_current_project();
	const qa_llm_id = document.getElementById('llm-dropdown-qa').value;
	const smart_prompt_llm_id = document.getElementById('llm-dropdown-smart-prompt').value;
	const temperature = document.getElementById('temperature-slider').value;
	
	if (!current_project || !qa_llm_id || !smart_prompt_llm_id) {
		show_alert('Please select a project and LLMs for both Q&A and Smart Prompt File Selection before asking a question.');
		return;
	}
	
	// Add user message to chat and clear input
	add_message_to_chat('user', user_question);
	qa_input.value = '';
	qa_input.disabled = true;
	qa_send_button.disabled = true;
	
	// Add a placeholder for the assistant's response
	const thinking_placeholder = add_message_to_chat('assistant', '<i>Thinking... finding relevant files...</i>', true);
	
	try {
		// Step 1: Get relevant files based on the question using the Smart Prompt LLM
		const relevant_files_response = await post_data({
			action: 'get_relevant_files_from_prompt', // Re-using the smart prompt logic
			project_path: current_project.path,
			user_prompt: user_question,
			llm_id: smart_prompt_llm_id,
			temperature: parseFloat(temperature)
		});
		
		const relevant_files = relevant_files_response.relevant_files;
		if (!relevant_files || relevant_files.length === 0) {
			thinking_placeholder.innerHTML = "I couldn't find any relevant files to answer your question. Please try rephrasing or analyzing more files in your project.";
			return;
		}
		
		thinking_placeholder.innerHTML = `<i>Found ${relevant_files.length} relevant file(s). Asking the LLM...</i>`;
		
		// Step 2: Ask the LLM the question with the context of the relevant files, using the Q&A LLM
		const qa_response = await post_data({
			action: 'ask_question_about_code',
			project_path: current_project.path,
			question: user_question,
			relevant_files: JSON.stringify(relevant_files),
			llm_id: qa_llm_id,
			temperature: parseFloat(temperature)
		});
		
		// Replace placeholder with the sanitized and formatted answer.
		thinking_placeholder.innerHTML = simple_markdown_to_html(qa_response.answer);
		
	} catch (error) {
		console.error('Error during QA process:', error);
		thinking_placeholder.innerHTML = `<span class="text-error">An error occurred: ${error.message}</span>`;
	} finally {
		qa_input.disabled = false;
		qa_send_button.disabled = false;
		qa_input.focus();
	}
}

/**
 * Sets up all event listeners for the QA modal and its trigger.
 */
export function setup_qa_listeners() {
	document.getElementById('qa-modal-button').addEventListener('click', () => {
		const current_project = get_current_project();
		if (current_project) {
			qa_modal_title.textContent = `Ask a Question - ${current_project.path}`;
		} else {
			qa_modal_title.textContent = 'Ask a Question';
		}
		// Clear previous chat history
		qa_chat_window.innerHTML = '';
		add_message_to_chat('assistant', 'Hello! What would you like to know about your project? I will find relevant files and use them to answer your question.');
		qa_modal.showModal();
		qa_input.focus();
	});
	
	qa_send_button.addEventListener('click', handle_question_submit);
	
	qa_input.addEventListener('keydown', (e) => {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			handle_question_submit();
		}
	});
	
	// Event delegation for copy-to-clipboard buttons on code blocks.
	if (qa_chat_window) {
		qa_chat_window.addEventListener('click', (e) => {
			const copy_button = e.target.closest('.copy-code-button');
			if (!copy_button) return;
			
			const pre = copy_button.nextElementSibling;
			if (pre && pre.tagName === 'PRE') {
				const code = pre.querySelector('code');
				if (code) {
					navigator.clipboard.writeText(code.innerText).then(() => {
						const original_html = copy_button.innerHTML;
						copy_button.innerHTML = '<i class="bi bi-check-lg"></i> Copied!';
						copy_button.disabled = true;
						setTimeout(() => {
							copy_button.innerHTML = original_html;
							copy_button.disabled = false;
						}, 2000);
					}).catch(err => {
						console.error('Failed to copy code: ', err);
						show_alert('Failed to copy code to clipboard.');
					});
				}
			}
		});
	}
}
