// js/project_selector.js

/**
 * @file Manages the interactive and searchable project selector component,
 * including project loading, filtering, and archive/unarchive actions.
 */

import { get_current_project, set_current_project } from './state.js'; // MODIFIED: Import set_current_project
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
// NEW: Get favorite buttons from the DOM.
const favorite_project_btn = document.getElementById('favorite-project-btn');
const unfavorite_project_btn = document.getElementById('unfavorite-project-btn');

/**
 * Refreshes the project list from the backend and re-renders the UI.
 * If the currently selected project is no longer visible (e.g., after being archived),
 * the entire application is reloaded to ensure a consistent state.
 */
async function refresh_project_list() {
	try {
		// Fetch main page data again, respecting the show_archived flag.
		const data = await post_data({ action: 'get_main_page_data', show_archived: show_archived });
		initialize_project_selector(data.projects, data.archived_count);
		
		// Update the display of the current project, as it might have been archived/unarchived/favorited.
		const current_project = get_current_project();
		if (current_project) {
			const updated_project_data = data.projects.find(p => p.path === current_project.path);
			
			if (updated_project_data) {
				// The project is still visible, so update its state in the global store and the UI.
				set_current_project(updated_project_data); // Update global state with new favorite/archive status.
				update_project_display(updated_project_data.path, updated_project_data.is_archived, updated_project_data.is_favorite);
			} else {
				// The current project is no longer in the visible list. A full reload is the
				// cleanest way to reset the app state and load the next available project.
				window.location.reload();
			}
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
	
	// MODIFIED: The backend now sorts projects by favorite status then alphabetically.
	// No client-side sort is needed anymore.
	
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
			
			// MODIFIED: Add visual indicators for both favorite and archived projects.
			const favorite_indicator = project.is_favorite ? `<i class="bi bi-star-fill text-amber-400/80 me-2" title="Favorite"></i>` : '';
			const archive_indicator = project.is_archived ? `<i class="bi bi-archive text-warning/70 me-2" title="Archived"></i>` : '';
			
			li.innerHTML = `<a>${favorite_indicator}${archive_indicator}<div class="flex flex-col overflow-hidden"><span>${project_name}</span><span class="text-xs text-base-content/50 truncate">${project.path}</span></div></a>`;
			li.addEventListener('click', () => {
				load_project(project.path, project.is_archived, project.is_favorite); // MODIFIED: Pass favorite status
				project_search_input.value = project_name;
				project_search_input.blur(); // Close dropdown
				project_dropdown_list.blur();
			});
			project_dropdown_list.appendChild(li);
		});
	}
}

/**
 * Updates the project selector to display the current project's name and status.
 * @param {string} project_path - The path of the currently loaded project.
 * @param {boolean} is_archived - Whether the current project is archived.
 * @param {boolean} is_favorite - Whether the current project is a favorite.
 */
export function update_project_display(project_path, is_archived, is_favorite) { // MODIFIED: Added is_favorite
	if (project_path) {
		const project_name = project_path.split(/[\\/]/).pop() || project_path;
		project_search_input.value = project_name;
		
		// MODIFIED: Show/hide favorite/unfavorite buttons based on the project's status.
		favorite_project_btn.classList.toggle('hidden', is_favorite);
		unfavorite_project_btn.classList.toggle('hidden', !is_favorite);
		
		// Show/hide archive/unarchive buttons based on the project's status.
		archive_project_btn.classList.toggle('hidden', is_archived);
		unarchive_project_btn.classList.toggle('hidden', !is_archived);
	} else {
		project_search_input.value = '';
		// MODIFIED: Hide all action buttons when no project is selected.
		archive_project_btn.classList.add('hidden');
		unarchive_project_btn.classList.add('hidden');
		favorite_project_btn.classList.add('hidden');
		unfavorite_project_btn.classList.add('hidden');
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
				update_project_display(current_project.path, current_project.is_archived, current_project.is_favorite);
			} else {
				project_search_input.value = '';
			}
		}, 200);
	});
	
	// MODIFIED: Listener for the favorite button.
	favorite_project_btn.addEventListener('click', async () => {
		const project = get_current_project();
		if (!project) return;
		await post_data({ action: 'favorite_project', project_path: project.path });
		await refresh_project_list(); // Refresh the list to show the change.
	});
	
	// MODIFIED: Listener for the unfavorite button.
	unfavorite_project_btn.addEventListener('click', async () => {
		const project = get_current_project();
		if (!project) return;
		await post_data({ action: 'unfavorite_project', project_path: project.path });
		await refresh_project_list(); // Refresh the list to show the change.
	});
	
	// Listener for the archive button.
	archive_project_btn.addEventListener('click', async () => {
		const project = get_current_project();
		if (!project) return;
		
		const confirmed = await show_confirm(`Are you sure you want to archive the project "${project.path}"?\n\nIt will be hidden from the default list.`, 'Confirm Archive');
		if (confirmed) {
			await post_data({ action: 'archive_project', project_path: project.path });
			// MODIFIED: A full reload ensures a clean state transition if the project is no longer visible.
			window.location.reload();
		}
	});
	
	// Listener for the unarchive/restore button.
	unarchive_project_btn.addEventListener('click', async () => {
		const project = get_current_project();
		if (!project) return;
		
		const confirmed = await show_confirm(`Are you sure you want to restore the project "${project.path}"?`, 'Confirm Restore');
		if (confirmed) {
			await post_data({ action: 'unarchive_project', project_path: project.path });
			// MODIFIED: A full reload ensures a clean state transition.
			window.location.reload();
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
