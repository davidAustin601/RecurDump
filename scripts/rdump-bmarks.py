#!/usr/bin/env python3
"""
rdump-bmarks.py

Export all bookmarks from a single specified folder (and its subfolders) in the locally installed Firefox web browser to a JSON file.

Required arguments:
  --dir, -d      Path to the directory where exported bookmarks will be saved (use '.' for current directory)
  --folder, -f   Name of the folder to search for and export (case-sensitive, matches any folder with this name)

Optional arguments:
  --name, -n     Base filename for the exported bookmarks (default: 'firefox_bookmarks')
  --help, -h     Show this help message and exit

If the user provides '.', the script will use the current working directory. The script is designed to work globally (can be placed in $PATH and run from any directory).
"""
import argparse
import os
import sys
import configparser
from pathlib import Path
import sqlite3

CYAN = '\033[36m'
BOLD = '\033[1m'
RESET = '\033[0m'
HELP_TEXT = f"""
rdump-bmarks.py

Export all bookmarks from a single specified folder (and its subfolders) in the locally installed Firefox web browser to a JSON file.

{CYAN}{BOLD}Required arguments:{RESET}
  --dir, -d           Path to the directory where exported bookmarks will be saved (use '.' for current directory)
  --folder, -f        Name of the folder to search for and export (case-sensitive, matches any folder with this name)

{CYAN}{BOLD}Optional arguments:{RESET}
  --name, -n          Base filename for the exported bookmarks (default: 'firefox_bookmarks')
  --help, -h          Show this help message and exit

{CYAN}{BOLD}Examples:{RESET}
  python rdump-bmarks.py --dir . --folder FAVORITES
  python rdump-bmarks.py -d /path/to/exports -f RECURBATE
"""

def find_firefox_profiles():
    # Determine platform-specific Firefox config directory
    if sys.platform.startswith('darwin'):
        base = Path.home() / 'Library' / 'Application Support' / 'Firefox'
    elif sys.platform.startswith('win'):
        base = Path(os.environ.get('APPDATA', '')) / 'Mozilla' / 'Firefox'
    else:
        base = Path.home() / '.mozilla' / 'firefox'
    profiles_ini = base / 'profiles.ini'
    if not profiles_ini.exists():
        return []
    config = configparser.ConfigParser()
    config.read(profiles_ini)
    profiles = []
    for section in config.sections():
        if section.startswith('Profile'):
            name = config.get(section, 'Name', fallback='(unknown)')
            path = config.get(section, 'Path', fallback=None)
            is_relative = config.getboolean(section, 'IsRelative', fallback=True)
            abs_path = (base / path) if is_relative and path else (Path(path) if path else None)
            places = abs_path / 'places.sqlite' if abs_path else None
            profiles.append({
                'name': name,
                'path': str(abs_path) if abs_path else '(unknown)',
                'places': str(places) if places and places.exists() else None,
                'exists': abs_path.exists() if abs_path else False
            })
    return profiles

def print_profiles_list(profiles):
    if not profiles:
        print("No Firefox profiles found.")
        return
    name_w = 20
    path_w = 48
    db_w = 5
    # ANSI color codes
    CYAN = '\033[36m'
    YELLOW = '\033[33m'
    RESET = '\033[0m'
    BOLD = '\033[1m'
    # Legend
    print("\nLegend: yes = DB found, no = DB not found\n")
    # Header (cyan)
    header = f"{CYAN}{BOLD}{'Profile Name':<{name_w}}  {'Profile Path':<{path_w}}  {'DB':^{db_w}}{RESET}"
    print(header)
    # Rows
    for p in profiles:
        db = 'yes' if p['places'] else 'no'
        path_disp = p['path']
        if len(path_disp) > path_w:
            path_disp = '...' + path_disp[-(path_w-3):]
        print(f"{YELLOW}{p['name']:<{name_w}}{RESET}  {path_disp:<{path_w}}  {db:^{db_w}}")
    print()

def get_profile_by_name(profiles, name):
    for p in profiles:
        if p['name'] == name:
            return p
    return None

def fetch_bookmark_folders(places_path):
    # Returns a dict: {folder_id: {'title': ..., 'parent': ..., 'children': [...]}}
    conn = sqlite3.connect(places_path)
    cur = conn.cursor()
    # Get all folders
    cur.execute("""
        SELECT id, parent, title
        FROM moz_bookmarks
        WHERE type=2
        ORDER BY parent, id
    """)
    folders = {}
    for row in cur.fetchall():
        folder_id, parent, title = row
        folders[folder_id] = {'title': title or '(no name)', 'parent': parent, 'children': []}
    # Build tree
    for fid, f in folders.items():
        parent = f['parent']
        if parent in folders:
            folders[parent]['children'].append(fid)
    conn.close()
    return folders

def print_folder_tree(folders, root_id=1, prefix="", is_last=True):
    # Skip '(no name)' root in listings
    if root_id not in folders or folders[root_id]['title'] == '(no name)':
        return
    title = folders[root_id]['title']
    connector = "└── " if is_last else "├── "
    print(prefix + connector + title)
    children = [cid for cid in folders[root_id]['children'] if folders[cid]['title'] != '(no name)']
    for i, child_id in enumerate(children):
        last = (i == len(children) - 1)
        new_prefix = prefix + ("    " if is_last else "│   ")
        print_folder_tree(folders, child_id, new_prefix, last)

def find_folder_id_by_path(folders, path_parts):
    # Accept both user-facing and internal names for root folders
    # Map user-friendly names to internal names
    name_map = {
        "Bookmarks Menu": ["Bookmarks Menu", "menu"],
        "Bookmarks Toolbar": ["Bookmarks Toolbar", "toolbar"],
        "Other Bookmarks": ["Other Bookmarks", "(unfiled)", "unfiled"],
    }
    # roots mapping
    roots = {"Bookmarks Menu": 1, "Bookmarks Toolbar": 2, "Other Bookmarks": 3, "menu": 1, "toolbar": 2, "(unfiled)": 3, "unfiled": 3}
    if not path_parts:
        return None, None
    # Normalize root name
    root_name = path_parts[0]
    # Try mapping user-friendly to internal
    for friendly, aliases in name_map.items():
        if root_name in aliases:
            root_name = friendly
            break
    if root_name not in roots:
        return None, None
    current_id = roots[root_name]
    current_title = root_name
    for part in path_parts[1:]:
        found = False
        for child_id in folders[current_id]['children']:
            # Skip '(no name)'
            if folders[child_id]['title'] == '(no name)':
                continue
            if folders[child_id]['title'] == part:
                current_id = child_id
                current_title = part
                found = True
                break
        if not found:
            return None, None
    return current_id, current_title

def collect_bookmark_ids_under_folder(places_path, folder_id):
    # Recursively collect all bookmark IDs (type=1) under the given folder_id
    conn = sqlite3.connect(places_path)
    cur = conn.cursor()
    # Get all folders and bookmarks
    cur.execute("SELECT id, parent, type FROM moz_bookmarks")
    items = {row[0]: {'parent': row[1], 'type': row[2]} for row in cur.fetchall()}
    # Build child map
    children = {}
    for item_id, item in items.items():
        parent = item['parent']
        children.setdefault(parent, []).append(item_id)
    # Recursively collect bookmarks
    result = []
    def recurse(fid):
        for cid in children.get(fid, []):
            if items[cid]['type'] == 1:
                result.append(cid)
            elif items[cid]['type'] == 2:
                recurse(cid)
    recurse(folder_id)
    conn.close()
    return result

def fetch_bookmark_info(places_path, bookmark_ids=None):
    # Returns a list of dicts: {id, title, url, dateAdded, lastModified, parent}
    conn = sqlite3.connect(places_path)
    cur = conn.cursor()
    if bookmark_ids is not None:
        qmarks = ','.join('?' for _ in bookmark_ids)
        cur.execute(f"""
            SELECT b.id, b.title, p.url, b.dateAdded, b.lastModified, b.parent
            FROM moz_bookmarks b
            LEFT JOIN moz_places p ON b.fk = p.id
            WHERE b.id IN ({qmarks}) AND b.type=1
        """, bookmark_ids)
    else:
        cur.execute("""
            SELECT b.id, b.title, p.url, b.dateAdded, b.lastModified, b.parent
            FROM moz_bookmarks b
            LEFT JOIN moz_places p ON b.fk = p.id
            WHERE b.type=1
        """)
    bookmarks = []
    for row in cur.fetchall():
        bookmarks.append({
            'id': row[0],
            'title': row[1] or '',
            'url': row[2] or '',
            'dateAdded': row[3],
            'lastModified': row[4],
            'parent': row[5]
        })
    conn.close()
    return bookmarks

def export_bookmarks_json(bookmarks, out_path):
    import json
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(bookmarks, f, indent=2, ensure_ascii=False)
    print(f"Exported JSON: {out_path}")

def build_folder_tree(folders, bookmarks, root_ids):
    # Build a nested dict structure for JSON export
    bookmark_by_parent = {}
    for bm in bookmarks:
        bookmark_by_parent.setdefault(bm['parent'], []).append({
            'id': bm['id'],
            'title': bm['title'],
            'url': bm['url'],
            'dateAdded': bm['dateAdded'],
            'lastModified': bm['lastModified'],
        })
    def build_node(folder_id):
        folder = folders[folder_id]
        node = {
            'id': folder_id,
            'title': folder['title'],
            'folders': [],
            'bookmarks': bookmark_by_parent.get(folder_id, [])
        }
        for child_id in folder['children']:
            node['folders'].append(build_node(child_id))
        return node
    return [build_node(root_id) for root_id in root_ids if root_id in folders]

def export_bookmarks_json_with_folders(bookmarks, folders, out_path, root_ids):
    import json
    tree = build_folder_tree(folders, bookmarks, root_ids)
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(tree, f, indent=2, ensure_ascii=False)
    print(f"Exported JSON: {out_path}")

def find_folders_by_name(folders, name):
    # Return a list of folder IDs whose title matches 'name' (case-sensitive)
    return [fid for fid, f in folders.items() if f['title'] == name]

def parse_args():
    parser = argparse.ArgumentParser(
        description="Export all bookmarks from a single specified folder (and its subfolders) in the locally installed Firefox web browser to a JSON file.",
        add_help=False,
        usage=HELP_TEXT
    )
    parser.add_argument('--dir', '-d', required=True, help='Directory to save exported bookmarks (use "." for current directory)')
    parser.add_argument('--folder', '-f', required=True, help='Name of the folder to search for and export (case-sensitive)')
    parser.add_argument('--name', '-n', default='firefox_bookmarks', help='Base filename for exported bookmarks (default: firefox_bookmarks)')
    parser.add_argument('--help', '-h', action='store_true', help='Show this help message and exit')
    return parser.parse_args()

def build_export_tree(folders, bookmarks, folder_id):
    # Build a nested dict structure for JSON export starting from folder_id
    bookmark_by_parent = {}
    for bm in bookmarks:
        bookmark_by_parent.setdefault(bm['parent'], []).append({
            'id': bm['id'],
            'title': bm['title'],
            'url': bm['url'],
            'dateAdded': bm['dateAdded'],
            'lastModified': bm['lastModified'],
        })
    def build_node(fid):
        folder = folders[fid]
        node = {
            'id': fid,
            'title': folder['title'],
            'bookmarks': bookmark_by_parent.get(fid, []),
            'folders': [build_node(cid) for cid in folder['children']]
        }
        return node
    return build_node(folder_id)

def main():
    args = parse_args()
    if args.help or not args.dir or not getattr(args, 'folder', None):
        print(HELP_TEXT)
        sys.exit(0)
    dir_path = args.dir
    if dir_path == ".":
        dir_path = os.getcwd()
    if not os.path.isdir(dir_path):
        print(f"Error: Directory not found: {dir_path}")
        print(HELP_TEXT)
        sys.exit(1)
    base_name = args.name
    profiles = find_firefox_profiles()
    profile = None
    for p in profiles:
        if p['places']:
            profile = p
            break
    if not profile:
        print("Error: No Firefox profile with a bookmarks database found.")
        sys.exit(1)
    places_path = profile['places']
    folders = fetch_bookmark_folders(places_path)
    folder_ids = find_folders_by_name(folders, args.folder)
    if not folder_ids:
        print(f"Error: No folder named '{args.folder}' found in bookmarks.")
        sys.exit(1)
    # Export the structure for each matching folder
    export_trees = []
    for folder_id in folder_ids:
        # Collect all bookmarks under this folder
        bookmark_ids = collect_bookmark_ids_under_folder(places_path, folder_id)
        bookmarks = fetch_bookmark_info(places_path, bookmark_ids)
        export_trees.append(build_export_tree(folders, bookmarks, folder_id))
    json_path = os.path.join(dir_path, base_name + '.json')
    import json
    # If only one match, export as a single object; else, as a list
    export_data = export_trees[0] if len(export_trees) == 1 else export_trees
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(export_data, f, indent=2, ensure_ascii=False)
    print(f"Exported folder structure to: {json_path}")

if __name__ == "__main__":
    main() 