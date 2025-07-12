// SmartCodePrompts/js/main.js

// --- CORE & STATE IMPORTS ---
// MODIFIED: Added show_loading and hide_loading for the first-run model fetch.
import { post_data, show_loading, hide_loading } from './utils.js';
import { set_content_footer_prompt, set_last_smart_prompt, get_current_project } from './state.js';
import { update_project_settings } from './settings.js';

// --- MODULE IMPORTS ---
import { initialize_about_modal, open_about_modal, setup_about_modal_listeners } from './modal-about.js';
import { initialize_analysis_modal } from './modal-analysis.js';
import { initialize_log_modal, setup_log_modal_listeners } from './modal-log.js';
import { initialize_search_modal, setup_search_modal_listeners } from './modal-search.js';
import { initialize_api_key_modal, setup_api_key_modal_listeners, update_api_key_status } from './modal-api-key.js';
import { setup_analysis_actions_listener } from './analysis.js';
import { initialize_llm_selector, setup_llm_listeners } from './llm.js';
import { initialize_status_bar } from './status_bar.js';
// MODIFIED: Added open_project_modal to be called after the about modal closes on first run.
import { load_project, setup_project_listeners, open_project_modal } from './project.js';
import { initialize_auto_expand_textarea, setup_prompt_bar_listeners } from './prompt.js';
import {
	initialize_resizers,
	initialize_temperature_slider,
	setup_ui_event_listeners
} from './ui_components.js';
import { initialize_qa_modal, setup_qa_listeners } from './qa.js';
import { setup_direct_prompt_listeners } from './direct_prompt.js';
import { setup_file_tree_listeners } from './file_tree.js';
import { initialize_progress_modal } from './modal-progress.js';
import { initialize_alert_modal, show_alert } from './modal-alert.js';
import { initialize_confirm_modal, show_confirm } from './modal-confirm.js';
import { initialize_prompt_modal } from './modal-prompt.js';
import { initialize_diff_modal } from './modal-diff.js';
import { setup_auto_select_listeners } from './auto_select.js';

import { initialize_editor, saveTabContent, getActiveTabId, saveAllModifiedTabs, openFileInTab, setTabContent } from './editor.js';
import { initialize_tab_switcher } from './tab-switcher.js';

// Function to load all individual modal HTML files.
async function load_all_modals_html () {
	const modal_files = [
		'modal-about.html', 'modal-analysis.html',
		'modal-log.html', 'modal-qa.html',
		'modal-reanalysis.html', 'modal-search.html',
		'modal-progress.html', 'modal-alert.html', 'modal-confirm.html',
		'modal-prompt.html',
		'modal-tab-switcher.html',
		'modal-api-key.html',
		'modal-diff.html'
	];
	const modal_container = document.getElementById('modal-container');
	
	try {
		const fetch_promises = modal_files.map(file => fetch(file).then(res => {
			if (!res.ok) throw new Error(`Failed to load ${file}: ${res.statusText}`);
			return res.text();
		}));
		
		const html_contents = await Promise.all(fetch_promises);
		modal_container.innerHTML = html_contents.join('');
	} catch (error) {
		console.error(error);
		document.body.innerHTML = `<div class="p-4"><div class="alert alert-error">Could not load essential UI components (modals). Please refresh the page or check the console.</div></div>`;
	}
}

function initialize_tab_scroller() {
	const tabsContainer = document.getElementById('editor-tabs');
	const leftScroller = document.getElementById('scroll-tabs-left');
	const rightScroller = document.getElementById('scroll-tabs-right');
	
	if (!tabsContainer || !leftScroller || !rightScroller) {
		console.warn('Tab scroller elements not found, feature disabled.');
		return;
	}
	
	const checkScroll = () => {
		const hasOverflow = tabsContainer.scrollWidth > tabsContainer.clientWidth;
		leftScroller.classList.toggle('hidden', !hasOverflow);
		rightScroller.classList.toggle('hidden', !hasOverflow);
		
		if (hasOverflow) {
			leftScroller.disabled = tabsContainer.scrollLeft < 1;
			rightScroller.disabled = tabsContainer.scrollLeft >= tabsContainer.scrollWidth - tabsContainer.clientWidth - 1;
		}
	};
	
	leftScroller.addEventListener('click', () => {
		tabsContainer.scrollLeft -= 200;
	});
	rightScroller.addEventListener('click', () => {
		tabsContainer.scrollLeft += 200;
	});
	
	let isDown = false;
	let startX;
	let scrollLeft;
	
	tabsContainer.addEventListener('mousedown', (e) => {
		if (e.button !== 0) return;
		if (e.target.closest('button, i')) return;
		
		isDown = true;
		tabsContainer.classList.add('dragging');
		startX = e.pageX - tabsContainer.offsetLeft;
		scrollLeft = tabsContainer.scrollLeft;
	});
	
	const stopDragging = () => {
		if (!isDown) return;
		isDown = false;
		tabsContainer.classList.remove('dragging');
	};
	
	tabsContainer.addEventListener('mouseleave', stopDragging);
	tabsContainer.addEventListener('mouseup', stopDragging);
	
	tabsContainer.addEventListener('mousemove', (e) => {
		if (!isDown) return;
		e.preventDefault();
		const x = e.pageX - tabsContainer.offsetLeft;
		const walk = (x - startX);
		tabsContainer.scrollLeft = scrollLeft - walk;
	});
	
	tabsContainer.addEventListener('scroll', checkScroll);
	
	tabsContainer.addEventListener('wheel', (e) => {
		// If there's no overflow, do nothing.
		if (tabsContainer.scrollWidth <= tabsContainer.clientWidth) {
			return;
		}
		// Prevent the default vertical scroll of the page.
		e.preventDefault();
		// Scroll horizontally instead. e.deltaY is what most mouse wheels use.
		tabsContainer.scrollLeft += e.deltaY;
	}, { passive: false }); // `passive: false` is required to allow preventDefault.
	
	const observer = new MutationObserver(checkScroll);
	observer.observe(tabsContainer, { childList: true });
	
	checkScroll();
}

/**
 * Initializes the entire application on page load.
 * @returns {Promise<boolean>} A promise that resolves to true if projects exist, false otherwise.
 */
async function initialize_app() {
	function adjust_prompt_textarea_height() {
		const textarea = document.getElementById('prompt-input');
		if (!textarea) return;
		textarea.style.height = 'auto';
		textarea.style.height = `${textarea.scrollHeight}px`;
	}
	
	try {
		const data = await post_data({action: 'get_main_page_data'});
		
		const highlight_theme_link = document.getElementById('highlight-js-theme');
		if (data.dark_mode) {
			document.documentElement.setAttribute('data-theme', 'dark');
			document.querySelector('#toggle-mode i').classList = 'bi-moon';
			if (highlight_theme_link) {
				highlight_theme_link.href = './vendor/highlight.js/styles/atom-one-dark.min.css';
			}
		} else {
			document.documentElement.setAttribute('data-theme', 'light');
			document.querySelector('#toggle-mode i').classList = 'bi-sun';
			if (highlight_theme_link) {
				highlight_theme_link.href = './vendor/highlight.js/styles/atom-one-light.min.css';
			}
		}
		
		await initialize_editor(data.dark_mode);
		
		if (data.right_sidebar_collapsed) {
			document.getElementById('app-container').classList.add('right-sidebar-collapsed');
		} else {
			document.getElementById('app-container').classList.remove('right-sidebar-collapsed');
		}
		
		if (data.file_tree_width) {
			const main_split_pane = document.getElementById('main-split-pane');
			if (main_split_pane) {
				main_split_pane.style.gridTemplateColumns = `${data.file_tree_width}px auto 1fr`;
			}
		}
		
		console.log('Last Smart Prompt:', data.last_smart_prompt);
		set_last_smart_prompt(data.last_smart_prompt || '');
		document.getElementById('prompt-input').value = data.last_smart_prompt || '';
		adjust_prompt_textarea_height();
		
		// --- NEW: First-run LLM auto-selection ---
		let llms = data.llms;
		let last_selected_llms = {
			analysis: data.last_selected_llm_analysis,
			smart_prompt: data.last_selected_llm_smart_prompt,
			qa: data.last_selected_llm_qa,
			direct_prompt: data.last_selected_llm_direct_prompt
		};
		
		// Check for first run (no LLMs in DB) which implies a new install.
		if (!llms || llms.length === 0) {
			show_loading('Performing first-time setup: Fetching available models...');
			try {
				const response = await post_data({ action: 'refresh_llms' });
				if (response.success) {
					llms = response.llms; // Update the llms list with the fresh data
					
					// Find the recommended model: contains "google", "gemini", "2.5", and "flash"
					const recommended_model = llms.find(llm => {
						const name_lower = llm.name.toLowerCase();
						return name_lower.includes('google') &&
							name_lower.includes('gemini') &&
							name_lower.includes('2.5') &&
							name_lower.includes('flash');
					});
					
					const recommended_model_file_selection = llms.find(llm => {
						const name_lower = llm.name.toLowerCase();
						return name_lower.includes('google') &&
							name_lower.includes('gemini') &&
							name_lower.includes('2.5') &&
							name_lower.includes('thinking') &&
							name_lower.includes('flash');
					});
					
					if (recommended_model && recommended_model_file_selection) {
						console.log('Found recommended model for first run:', recommended_model);
						const model_id = recommended_model.id;
						
						// Update the selections object for all dropdowns
						last_selected_llms.analysis = model_id;
						last_selected_llms.smart_prompt = recommended_model_file_selection;
						last_selected_llms.qa = model_id;
						last_selected_llms.direct_prompt = model_id;
						
						// Save these new default selections to the server
						const save_promises = [
							post_data({ action: 'save_selected_llm', key: 'last_selected_llm_analysis', llm_id: model_id }),
							post_data({ action: 'save_selected_llm', key: 'last_selected_llm_smart_prompt', llm_id: model_id }),
							post_data({ action: 'save_selected_llm', key: 'last_selected_llm_qa', llm_id: model_id }),
							post_data({ action: 'save_selected_llm', key: 'last_selected_llm_direct_prompt', llm_id: model_id })
						];
						await Promise.all(save_promises);
						
						show_alert(`Recommended model '${recommended_model.name}' has been pre-selected for you.`);
					}
				} else {
					throw new Error(response.error || 'Unknown error during initial model refresh.');
				}
			} catch (error) {
				console.error('Failed to perform initial LLM refresh:', error);
				show_alert(`Could not fetch LLM models on first run: ${error.message}`, 'Error');
			} finally {
				hide_loading();
			}
		}
		// --- END: First-run LLM auto-selection ---
		
		initialize_llm_selector(llms, last_selected_llms);
		initialize_status_bar(data.session_tokens);
		update_api_key_status(data.api_key_set);
		
		let projects_exist = true;
		const dropdown = document.getElementById('projects-dropdown');
		dropdown.innerHTML = '';
		if (!data.projects || data.projects.length === 0) {
			projects_exist = false;
			dropdown.innerHTML = '<option value="">No projects found</option>';
			document.getElementById('file-tree').innerHTML = '<p class="p-3 text-base-content/70">No projects configured. Please add a project to begin.</p>';
			if (window.electronAPI && typeof window.electronAPI.updateWindowTitle === 'function') {
				window.electronAPI.updateWindowTitle('Smart Code Prompts');
			}
		} else {
			data.projects.forEach(project => {
				const option = document.createElement('option');
				option.value = project.path;
				option.textContent = project.path;
				dropdown.appendChild(option);
			});
		}
		
		dropdown.insertAdjacentHTML ('beforeend', '<option value="add_new_project" class="text-accent font-bold">Add New Project...</option>');
		
		const last_project_path = data.last_selected_project;
		if (last_project_path) {
			const options = Array.from(dropdown.options);
			const matching_option = options.find(option => option.value === last_project_path);
			
			if (matching_option) {
				await load_project(last_project_path);
			} else if (data.projects.length > 0) {
				await load_project(data.projects[0].path);
			}
		} else if (data.projects.length > 0) {
			await load_project(data.projects[0].path);
		}
		
		return projects_exist;
	} catch (error) {
		console.error('Failed to initialize app:', error);
		show_alert('Could not load application data from the server. Please ensure the server is running and check the console.', 'Initialization Error');
		return false; // Return false on error
	}
}

/**
 * Sets up listeners related to the new save and settings functionality.
 */
function setup_save_and_settings_listeners() {
	const saveBtn = document.getElementById('save-active-file-btn');
	if (saveBtn) {
		saveBtn.addEventListener('click', () => {
			const activeId = getActiveTabId();
			if (activeId) {
				saveTabContent(activeId);
			}
		});
	}
	
	window.addEventListener('blur', () => {
		saveAllModifiedTabs();
	});
	
	document.getElementById('open-settings-file-button').addEventListener('click', async () => {
		const project = get_current_project();
		if (!project) {
			show_alert('Please select a project first.', 'No Project Selected');
			return;
		}
		try {
			const data = await post_data({
				action: 'get_file_for_editor',
				project_path: project.path,
				path: '.scp/settings.yaml'
			});
			if (data.currentContent !== null) {
				openFileInTab('.scp/settings.yaml', data.currentContent, data.originalContent);
			} else {
				show_alert('Could not find or create the settings file for this project.', 'Error');
			}
		} catch (error) {
			show_alert(`Error opening settings file: ${error.message}`, 'Error');
		}
	});
	
	document.getElementById('reset-settings-btn').addEventListener('click', async () => {
		const confirmed = await show_confirm('Are you sure you want to reset the project settings to their default values? This will overwrite the current content in the editor.', 'Confirm Reset');
		if (confirmed) {
			try {
				const result = await post_data({ action: 'get_default_settings_yaml' });
				const activeTabId = getActiveTabId();
				if (activeTabId && result.yaml) {
					setTabContent(activeTabId, result.yaml);
				}
			} catch (error) {
				show_alert(`Failed to fetch default settings: ${error.message}`, 'Error');
			}
		}
	});
}

// --- Document Ready ---
document.addEventListener('DOMContentLoaded', async function () {
	await load_all_modals_html();
	
	initialize_about_modal();
	initialize_analysis_modal();
	initialize_api_key_modal();
	initialize_alert_modal()
	initialize_confirm_modal();
	initialize_prompt_modal();
	initialize_diff_modal();
	initialize_log_modal();
	initialize_progress_modal();
	initialize_qa_modal();
	initialize_search_modal();
	initialize_resizers();
	initialize_auto_expand_textarea();
	initialize_temperature_slider();
	initialize_tab_scroller();
	initialize_tab_switcher();
	
	// --- NEW: Handle first-run "About" modal and subsequent "Add Project" prompt ---
	const is_first_run_view = !sessionStorage.getItem('aboutModalShown');
	if (is_first_run_view) {
		open_about_modal();
		sessionStorage.setItem('aboutModalShown', 'true');
	}
	
	const projects_exist = await initialize_app();
	
	// If this was the first time the user saw the "About" modal AND no projects are set up,
	// then prompt them to add a project when they close the modal.
	if (is_first_run_view && !projects_exist) {
		const about_modal = document.getElementById('about_modal');
		if (about_modal) {
			about_modal.addEventListener('close', () => {
				console.log('About modal closed on first run with no projects. Prompting to add one.');
				open_project_modal();
			}, { once: true }); // Only fire this listener once.
		}
	}
	// --- END: New logic ---
	
	setup_about_modal_listeners();
	setup_log_modal_listeners();
	setup_search_modal_listeners();
	setup_api_key_modal_listeners();
	setup_qa_listeners();
	setup_direct_prompt_listeners();
	setup_analysis_actions_listener();
	setup_llm_listeners();
	setup_project_listeners();
	setup_file_tree_listeners();
	setup_ui_event_listeners();
	setup_prompt_bar_listeners();
	setup_auto_select_listeners();
	setup_save_and_settings_listeners();
});
