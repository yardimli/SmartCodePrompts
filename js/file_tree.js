// js/file_tree.js

/**
 * @file This file serves as the public API for the file tree module.
 * It aggregates and exports functions from its constituent sub-modules,
 * providing a single, stable interface for other parts of the application.
 * This approach encapsulates the internal structure of the file tree logic.
 */

import { load_folders, refresh_folder_view } from './file_tree/renderer.js';
import {
	update_selected_content,
	refresh_prompt_display,
	restore_state,
	ensure_file_is_visible
} from './file_tree/state.js';
import { start_file_tree_polling, stop_file_tree_polling } from './file_tree/polling.js';
import { setup_file_tree_listeners } from './file_tree/events.js';

// Re-export all the necessary functions to be used by other modules.
export {
	load_folders,
	refresh_folder_view,
	update_selected_content,
	refresh_prompt_display,
	restore_state,
	ensure_file_is_visible,
	start_file_tree_polling,
	stop_file_tree_polling,
	setup_file_tree_listeners
};
