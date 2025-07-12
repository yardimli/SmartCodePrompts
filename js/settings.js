// SmartCodePrompts/js/settings.js
import { set_content_footer_prompt } from './state.js';
import { show_alert } from './modal-alert.js';
import jsyaml from '../vendor/js-yaml.mjs';

// This module-level variable will hold the settings for the currently loaded project.
let current_settings = {};

/**
 * Loads and parses project settings from a YAML string using the js-yaml library.
 * This function is the single source of truth for populating the `current_settings` object.
 * @param {string} yaml_string - The raw YAML content from the settings file.
 * @returns {Promise<object|null>} The parsed settings object, or null on failure.
 */
export async function update_project_settings(yaml_string) {
	// Check if the js-yaml library is available on the window object.
	// This should be guaranteed by including it via a <script> tag in index.html.
	if (!jsyaml) {
		const errorMsg = "FATAL: js-yaml library not found. The application cannot parse project settings. Please check the index.html file.";
		console.error(errorMsg);
		show_alert(errorMsg, 'Initialization Error');
		current_settings = {}; // Ensure settings are cleared on fatal error
		return null;
	}
	
	try {
		// Use the reliable library to parse the YAML string.
		// The `load` function can throw an exception on malformed YAML.
		const parsed_settings = jsyaml.load(yaml_string);
		
		// Basic validation to ensure we got a non-null object.
		if (typeof parsed_settings !== 'object' || parsed_settings === null) {
			throw new Error("The root of settings.yaml must be a valid object.");
		}
		
		// Success! Update the module-level settings object.
		current_settings = parsed_settings;
		
		console.log('Project settings loaded successfully:', current_settings);
		
		// Update parts of the app that depend on these settings.
		// Check for nested properties safely.
		if (current_settings.prompts && current_settings.prompts.content_footer) {
			set_content_footer_prompt(current_settings.prompts.content_footer);
		} else {
			// If the setting is missing, fall back to a default empty state.
			set_content_footer_prompt('');
		}
		
		return current_settings;
		
	} catch (e) {
		console.error("Failed to parse settings.yaml:", e);
		show_alert(`Could not parse project settings file (.scp/settings.yaml). Please ensure it is valid YAML.\n\nError: ${e.message}`, 'Settings Error');
		
		// In case of a parsing error, clear the settings to prevent the app
		// from using stale/incorrect configuration from a previously loaded project.
		current_settings = {};
		return null;
	}
}

/**
 * Gets a specific setting value from the currently loaded project settings.
 * @param {string} key - The top-level key of the setting.
 * @returns {*} The value of the setting, or undefined if not found.
 */
export function get_setting(key) {
	// This now correctly returns a value from the populated `current_settings` object.
	return current_settings ? current_settings[key] : undefined;
}

/**
 * Gets the entire settings object for the currently loaded project.
 * It's crucial that this is called only *after* `update_project_settings` has run
 * during the project loading sequence.
 * @returns {object} A copy of the current settings object to prevent mutation.
 */
export function get_all_settings() {
	// This will now return a copy of the object populated by `update_project_settings`.
	// If project loading failed, it will correctly return an empty object.
	return { ...current_settings };
}
