// js/project_selector.js

/**
 * @file Manages the interactive and searchable project selector component,
 * including project loading, filtering, and archive/unarchive actions.
 */

import { get_current_project } from './state.js';
import { load_project, open_project_modal } from './project.js';
import { show_confirm } from './modal-confirm.js';
import { post_data } from './utils.js';

let projects = [];
let show_archived = false;

const project_search_input = document.getElementById('project-search-input');
const project_dropdown_list = document.getElementById('project-dropdown-list');
const archive_project_btn = document.getElementById('archive-project-btn');
const unarchive_project_btn = document.getElementById('unarchive-project-btn');
const toggle_archived_btn = document.getElementById('toggle-archived-btn');
const archived_count_badge = document.getElementById('archived-count-badge');

/**
 * Refreshes the project list from the backend and re-renders the UI.
 */
async function refresh_project_list() {
	try {
		// Fetch main page data again, respecting the show_archived flag
		const data = await post_data({ action: 'get_main_page_data', show_archived: show_archived });
		initialize_project_selector(data.projects, data.archived_count);
		
		// Update the display of the current project, as it might have been archived/unarchived
		const current_project = get_current_project();
		if (current_project) {
			update_project_display(current_project.path, current_project.is_archived);
		}
	} catch (error) {
		console.error('Failed to refresh project list:', error);
	}
}

/**
 * Populates and prepares the project selector dropdown.
 * @param {Array<object>} project_list - Array of project objects from the backend.
 * @param {number} archived_count - The number of archived projects.
 */
export function initialize_project_selector(project_list, archived_count) {
	projects = project_list || [];
	
	// Sort projects case-insensitively by the last part of the path (folder name).
	projects.sort((a, b) => {
		const pathA = a.path.split(/[\\/]/).pop() || a.path;
		const pathB = b.path.split(/[\\/]/).pop() || b.path;
		return pathA.localeCompare(pathB, undefined, { sensitivity: 'base' });
	});
	
	archived_count_badge.textContent = archived_count || 0;
	
	render_project_list(projects);
}

/**
 * Renders the list of projects in the dropdown.
 * @param {Array<object>} projects_to_render - The array of projects to display.
 */
function render_project_list(projects_to_render) {
	project_dropdown_list.innerHTML = ''; // Clear existing items
	
	// Add "Add New Project" option first
	const add_new_li = document.createElement('li');
	add_new_li.innerHTML = `<a><i class="bi bi-plus-circle-dotted me-2"></i>Add New Project...</a>`;
	add_new_li.classList.add('text-accent', 'font-bold');
	add_new_li.addEventListener('click', () => {
		open_project_modal();
		project_search_input.blur(); // Close dropdown
	});
	project_dropdown_list.appendChild(add_new_li);
	
	// Add a visual separator
	const divider = document.createElement('li');
	divider.className = 'menu-title p-0 m-0';
	divider.innerHTML = '<span></span>';
	project_dropdown_list.appendChild(divider);
	
	
	if (projects_to_render.length === 0) {
		const no_results_li = document.createElement('li');
		no_results_li.innerHTML = `<span class="italic text-base-content/60 px-4 py-2">No projects found.</span>`;
		project_dropdown_list.appendChild(no_results_li);
	} else {
		projects_to_render.forEach(project => {
			const li = document.createElement('li');
			const project_name = project.path.split(/[\\/]/).pop() || project.path;
			// Add a visual indicator for archived projects.
			const archive_indicator = project.is_archived ? `<i class="bi bi-archive text-warning/70 me-2" title="Archived"></i>` : '';
			
			li.innerHTML = `<a>${archive_indicator}<div class="flex flex-col overflow-hidden"><span>${project_name}</span><span class="text-xs text-base-content/50 truncate">${project.path}</span></div></a>`;
			li.addEventListener('click', () => {
				load_project(project.path, project.is_archived); // Pass archived status
				project_search_input.value = project_name;
				project_search_input.blur(); // Close dropdown
				project_dropdown_list.blur();
			});
			project_dropdown_list.appendChild(li);
		});
	}
}

/**
 * Updates the project selector to display the current project's name and archive status.
 * @param {string} project_path - The path of the currently loaded project.
 * @param {boolean} is_archived - Whether the current project is archived.
 */
export function update_project_display(project_path, is_archived) {
	if (project_path) {
		const project_name = project_path.split(/[\\/]/).pop() || project_path;
		project_search_input.value = project_name;
		
		// Show/hide archive/unarchive buttons based on the project's status.
		archive_project_btn.classList.toggle('hidden', is_archived);
		unarchive_project_btn.classList.toggle('hidden', !is_archived);
	} else {
		project_search_input.value = '';
		archive_project_btn.classList.add('hidden');
		unarchive_project_btn.classList.add('hidden');
	}
}

/**
 * Sets up all event listeners for the project selector component.
 */
export function setup_project_selector_listeners() {
	// Filter the project list as the user types in the search input.
	project_search_input.addEventListener('input', () => {
		const filter = project_search_input.value.toLowerCase();
		const filtered_projects = projects.filter(p => p.path.toLowerCase().includes(filter));
		render_project_list(filtered_projects);
	});
	
	// When the user focuses on the input, clear it to show the full list again.
	project_search_input.addEventListener('focus', () => {
		project_search_input.value = '';
		render_project_list(projects);
	});
	
	// If the user clicks away without selecting, restore the current project name.
	project_search_input.addEventListener('blur', () => {
		setTimeout(() => { // Timeout allows click events on the list to fire first.
			const current_project = get_current_project();
			if (current_project) {
				update_project_display(current_project.path, current_project.is_archived);
			} else {
				project_search_input.value = '';
			}
		}, 200);
	});
	
	// Listener for the archive button.
	archive_project_btn.addEventListener('click', async () => {
		const project = get_current_project();
		if (!project) return;
		
		const confirmed = await show_confirm(`Are you sure you want to archive the project "${project.path}"?\n\nIt will be hidden from the default list.`, 'Confirm Archive');
		if (confirmed) {
			await post_data({ action: 'archive_project', project_path: project.path });
			await refresh_project_list();
		}
	});
	
	// Listener for the unarchive/restore button.
	unarchive_project_btn.addEventListener('click', async () => {
		const project = get_current_project();
		if (!project) return;
		
		const confirmed = await show_confirm(`Are you sure you want to restore the project "${project.path}"?`, 'Confirm Restore');
		if (confirmed) {
			await post_data({ action: 'unarchive_project', project_path: project.path });
			await refresh_project_list();
		}
	});
	
	// Listener for the "Show/Hide Archived" toggle button.
	toggle_archived_btn.addEventListener('click', async () => {
		show_archived = !show_archived;
		toggle_archived_btn.classList.toggle('active', show_archived); // 'active' state for styling.
		const text = show_archived ? 'Hide Archived' : 'Show Archived';
		toggle_archived_btn.childNodes[0].nodeValue = `${text} `; // Update the button's text content.
		await refresh_project_list();
	});
}
