import os
import re
import sys
from collections import defaultdict

# --- Configuration ---
TARGET_EXTENSIONS = ['.js', '.html', '.css']
# Folders to exclude from the scan
EXCLUDE_DIRS = ['node_modules', '.git', 'dist', 'build', 'vendor', '.vscode', '.idea']

# --- ANSI Color Codes for Readability ---
class colors:
    HEADER = '\033[95m'
    BLUE = '\033[94m'
    CYAN = '\033[96m'
    GREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'
    UNDERLINE = '\033[4m'

def to_snake_case(name):
    """Converts a PascalCase or camelCase string to snake_case."""
    if '_' in name or name.upper() == name:
        return name
    s1 = re.sub('(.)([A-Z][a-z]+)', r'\1_\2', name)
    s2 = re.sub('([a-z0-9])([A-Z])', r'\1_\2', s1)
    return s2.lower()

def is_candidate_for_conversion(name):
    """Determines if a name is likely camelCase or PascalCase."""
    return (
        not name.islower() and
        not name.isupper() and
        "_" not in name and
        re.search('[a-z][A-Z]', name)
    )

def scan_directory(root_dir):
    """
    Phase 1: Scans the entire directory, collecting all potential changes without modifying anything.
    """
    print(f"{colors.BLUE}Phase 1: Scanning all files...{colors.ENDC}")

    # Updated data structure to hold line content
    # {'camelCaseName': {'proposed': 'snake_case_name',
    #                   'locations': [{'file': path, 'occurrences': [{'line_num': num, 'line_content': '...'}]}]}}
    all_candidates = defaultdict(lambda: {'proposed': '', 'locations': []})

    for dirpath, dirnames, filenames in os.walk(root_dir, topdown=True):
        dirnames[:] = [d for d in dirnames if d not in EXCLUDE_DIRS]

        for filename in filenames:
            if not any(filename.endswith(ext) for ext in TARGET_EXTENSIONS):
                continue

            file_path = os.path.join(dirpath, filename)
            try:
                with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                    lines = f.readlines()

                content_str = "".join(lines)
                words = set(re.findall(r'\b[a-zA-Z0-9_]+\b', content_str))

                for word in words:
                    if is_candidate_for_conversion(word):
                        proposed_name = to_snake_case(word)
                        if proposed_name != word:
                            # Find line numbers and content for this specific word in this file
                            occurrences_in_file = []
                            for i, line in enumerate(lines):
                                if re.search(r'\b' + re.escape(word) + r'\b', line):
                                    occurrences_in_file.append({
                                        'line_num': i + 1,
                                        'line_content': line.strip()
                                    })

                            if occurrences_in_file:
                                all_candidates[word]['proposed'] = proposed_name
                                all_candidates[word]['locations'].append({
                                    'file': file_path,
                                    'occurrences': occurrences_in_file
                                })

            except Exception as e:
                print(f"{colors.FAIL}Could not read {file_path}: {e}{colors.ENDC}")

    print(f"{colors.GREEN}Scan complete. Found {len(all_candidates)} unique identifiers to review.{colors.ENDC}")
    return all_candidates

def review_and_apply_changes(all_candidates):
    """
    Phase 2: Interactively reviews the collected candidates with the user and applies approved changes.
    """
    if not all_candidates:
        print(f"{colors.GREEN}No convertible identifiers found anywhere in the project.{colors.ENDC}")
        return

    print(f"\n{colors.HEADER}=================================================={colors.ENDC}")
    print(f"{colors.BLUE}{colors.BOLD}Phase 2: Reviewing Changes{colors.ENDC}")
    print(f"{colors.HEADER}=================================================={colors.ENDC}")

    approved_changes = {}
    apply_all = False

    for original, data in sorted(all_candidates.items()):
        proposed = data['proposed']
        locations = data['locations']

        print(f"\n{colors.HEADER}--------------------------------------------------{colors.ENDC}")
        print(f"Identifier:      {colors.WARNING}{original}{colors.ENDC}")
        print(f"Proposed change: {colors.GREEN}{proposed}{colors.ENDC}")
        print(f"{colors.BOLD}Found in the following locations:{colors.ENDC}")

        for loc in locations:
            print(f"  - {colors.CYAN}{loc['file']}{colors.ENDC}")
            for occ in loc['occurrences']:
                # Highlight the original word in the line for context
                highlighted_line = re.sub(
                    r'\b(' + re.escape(original) + r')\b',
                    rf'{colors.WARNING}\1{colors.ENDC}',
                    occ['line_content']
                )
                print(f"    {colors.BLUE}L{occ['line_num']:<4}:{colors.ENDC} {highlighted_line}")

        if apply_all:
            print(f"\n{colors.GREEN}Applying change automatically ('all' was selected).{colors.ENDC}")
            approved_changes[original] = proposed
            continue

        while True:
            choice = input(f"\nApply this change everywhere? {colors.BOLD}(y)es, (n)o, (a)ll remaining, (q)uit:{colors.ENDC} ").lower()
            if choice in ['y', 'yes']:
                approved_changes[original] = proposed
                break
            elif choice in ['n', 'no']:
                print(f"Skipping {colors.WARNING}{original}{colors.ENDC}...")
                break
            elif choice in ['a', 'all']:
                print(f"{colors.GREEN}Applying this and all subsequent changes automatically.{colors.ENDC}")
                approved_changes[original] = proposed
                apply_all = True
                break
            elif choice in ['q', 'quit']:
                print(f"{colors.FAIL}Quitting review.{colors.ENDC}")
                break
            else:
                print(f"{colors.FAIL}Invalid input. Please enter y, n, a, or q.{colors.ENDC}")

        if choice in ['q', 'quit']:
            break

    if not approved_changes:
        print(f"\n{colors.GREEN}No changes were approved. Exiting.{colors.ENDC}")
        return

    print(f"\n{colors.HEADER}=================================================={colors.ENDC}")
    print(f"{colors.WARNING}{colors.BOLD}Review complete. You have approved {len(approved_changes)} change(s).{colors.ENDC}")

    final_confirm = input(f"Do you want to write all approved changes to disk? {colors.BOLD}This cannot be undone. (y/n):{colors.ENDC} ").lower()
    if final_confirm not in ['y', 'yes']:
        print(f"{colors.FAIL}All changes discarded. No files were modified.{colors.ENDC}")
        return

    files_to_modify = defaultdict(list)
    for original, proposed in approved_changes.items():
        for loc in all_candidates[original]['locations']:
            files_to_modify[loc['file']].append((original, proposed))

    print("\nWriting changes to files...")
    for file_path, changes in files_to_modify.items():
        try:
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()

            for original, proposed in changes:
                content = re.sub(r'\b' + re.escape(original) + r'\b', proposed, content)

            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(content)
            print(f"  {colors.GREEN}Updated:{colors.ENDC} {file_path}")

        except Exception as e:
            print(f"  {colors.FAIL}FAILED to update {file_path}: {e}{colors.ENDC}")

def main():
    if len(sys.argv) < 2:
        print(f"{colors.FAIL}Usage: python {sys.argv[0]} /path/to/your/folder{colors.ENDC}")
        sys.exit(1)

    root_dir = sys.argv[1]

    if not os.path.isdir(root_dir):
        print(f"{colors.FAIL}Error: The provided path '{root_dir}' is not a valid directory.{colors.ENDC}")
        sys.exit(1)

    print(f"{colors.BOLD}Starting batch case converter in directory: {root_dir}{colors.ENDC}")
    print(f"{colors.WARNING}WARNING: This script will suggest modifications to files in place.{colors.ENDC}")
    print(f"{colors.WARNING}Please make sure you have a backup or are using version control (git).{colors.ENDC}")
    input("Press Enter to begin the scan...")

    all_candidates = scan_directory(root_dir)
    review_and_apply_changes(all_candidates)

    print(f"\n{colors.GREEN}{colors.BOLD}Script finished.{colors.ENDC}")

if __name__ == "__main__":
    main()
