#!/usr/bin/env python3
"""
rdump-bmarks.py

Export all bookmarks from the locally installed Firefox web browser to a specified directory as both HTML and JSON files.

Required arguments:
  --dir, -d      Path to the directory where exported bookmarks will be saved (use '.' for current directory)

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

Export all bookmarks from the locally installed Firefox web browser to a specified directory as both HTML and JSON files.

{CYAN}{BOLD}Required arguments:{RESET}
  --dir, -d           Path to the directory where exported bookmarks will be saved (use '.' for current directory)

{CYAN}{BOLD}Optional arguments:{RESET}
  --name, -n          Base filename for the exported bookmarks (default: 'firefox_bookmarks')
  --list-profiles, -l List all found Firefox profiles and exit
  --list-folders, -f  List bookmark folders in a Firefox profile as a tree diagram (requires --profile)
  --profile, -p       Profile name to use with --list-folders
  --folder-path, -F  Path to a specific bookmark folder to export (e.g. "Bookmarks Menu/Programming/Python")
  --help, -h          Show this help message and exit

{CYAN}{BOLD}Examples:{RESET}
  python rdump-bmarks.py --dir .
  python rdump-bmarks.py -d /path/to/exports --name my_bookmarks
  python rdump-bmarks.py --list-profiles
  python rdump-bmarks.py --list-folders --profile default-release
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
    # root_id=1 is usually the "Bookmarks Menu"
    if root_id not in folders:
        return
    title = folders[root_id]['title']
    connector = "└── " if is_last else "├── "
    print(prefix + connector + title)
    children = folders[root_id]['children']
    for i, child_id in enumerate(children):
        last = (i == len(children) - 1)
        new_prefix = prefix + ("    " if is_last else "│   ")
        print_folder_tree(folders, child_id, new_prefix, last)

def find_folder_id_by_path(folders, path_parts):
    # path_parts: list of folder names, e.g. ['Bookmarks Menu', 'Programming', 'Python']
    # roots mapping
    roots = {"Bookmarks Menu": 1, "Bookmarks Toolbar": 2, "Other Bookmarks": 3}
    if not path_parts:
        return None, None
    root_name = path_parts[0]
    if root_name not in roots:
        return None, None
    current_id = roots[root_name]
    current_title = root_name
    for part in path_parts[1:]:
        found = False
        for child_id in folders[current_id]['children']:
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

def export_bookmarks_html(bookmarks, out_path):
    with open(out_path, 'w', encoding='utf-8') as f:
        f.write('<!DOCTYPE NETSCAPE-Bookmark-file-1>\n')
        f.write('<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">\n')
        f.write('<TITLE>Bookmarks</TITLE>\n')
        f.write('<H1>Bookmarks</H1>\n')
        f.write('<DL><p>\n')
        for bm in bookmarks:
            f.write(f'    <DT><A HREF="{bm["url"]}">{bm["title"]}</A>\n')
        f.write('</DL><p>\n')
    print(f"Exported HTML: {out_path}")

def export_bookmarks_html_with_folders(bookmarks, folders, out_path, root_ids):
    # Build a map from parent to children (folders and bookmarks)
    folder_children = {fid: [] for fid in folders}
    bookmark_by_parent = {}
    for bm in bookmarks:
        bookmark_by_parent.setdefault(bm['parent'], []).append(bm)
    def write_folder(f, folder_id, indent=0):
        folder = folders[folder_id]
        ind = '    ' * indent
        f.write(f'{ind}<DT><H3>{folder["title"]}</H3>\n')
        f.write(f'{ind}<DL><p>\n')
        # Bookmarks in this folder
        for bm in bookmark_by_parent.get(folder_id, []):
            f.write(f'{ind}    <DT><A HREF="{bm["url"]}">{bm["title"]}</A>\n')
        # Subfolders
        for child_id in folder['children']:
            write_folder(f, child_id, indent+1)
        f.write(f'{ind}</DL><p>\n')
    with open(out_path, 'w', encoding='utf-8') as f:
        f.write('<!DOCTYPE NETSCAPE-Bookmark-file-1>\n')
        f.write('<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">\n')
        f.write('<TITLE>Bookmarks</TITLE>\n')
        f.write('<H1>Bookmarks</H1>\n')
        for root_id in root_ids:
            if root_id in folders:
                write_folder(f, root_id)
    print(f"Exported HTML: {out_path}")

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

def parse_args():
    parser = argparse.ArgumentParser(
        description="Export all bookmarks from the locally installed Firefox web browser to a specified directory as both HTML and JSON files.",
        add_help=False,
        usage=HELP_TEXT
    )
    parser.add_argument('--dir', '-d', required=False, help='Directory to save exported bookmarks (use "." for current directory)')
    parser.add_argument('--name', '-n', default='firefox_bookmarks', help='Base filename for exported bookmarks (default: firefox_bookmarks)')
    parser.add_argument('--list-profiles', '-l', action='store_true', help='List all found Firefox profiles and exit')
    parser.add_argument('--list-folders', '-f', action='store_true', help='List bookmark folders in a Firefox profile (requires --profile)')
    parser.add_argument('--profile', '-p', help='Profile name to use with --list-folders')
    parser.add_argument('--folder-path', '-F', help='Path to a specific bookmark folder to export (e.g. "Bookmarks Menu/Programming/Python")')
    parser.add_argument('--help', '-h', action='store_true', help='Show this help message and exit')
    args = parser.parse_args()
    if args.help or (not args.dir and not args.list_profiles and not args.list_folders):
        print(HELP_TEXT)
        sys.exit(0)
    return args

def main():
    args = parse_args()
    if args.list_profiles:
        profiles = find_firefox_profiles()
        print_profiles_list(profiles)
        sys.exit(0)
    if args.list_folders:
        if not args.profile:
            print("Error: --list-folders requires --profile PROFILE_NAME\n")
            print(HELP_TEXT)
            sys.exit(1)
        profiles = find_firefox_profiles()
        profile = get_profile_by_name(profiles, args.profile)
        if not profile or not profile['places']:
            print(f"Error: Profile '{args.profile}' not found or has no places.sqlite database.")
            sys.exit(1)
        print(f"\nBookmark folders for profile: {args.profile}\n")
        folders = fetch_bookmark_folders(profile['places'])
        roots = {"Bookmarks Menu": 1, "Bookmarks Toolbar": 2, "Other Bookmarks": 3}
        for root_name, root_id in roots.items():
            if root_id in folders:
                print(f"{root_name}:")
                print_folder_tree(folders, root_id)
                print()
        sys.exit(0)
    dir_path = args.dir
    if dir_path == ".":
        dir_path = os.getcwd()
    if not os.path.isdir(dir_path):
        print(f"Error: Directory not found: {dir_path}")
        print(HELP_TEXT)
        sys.exit(1)
    base_name = args.name
    folder_id = None
    folder_title = None
    bookmark_ids = None
    bookmarks = None
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
    if args.folder_path:
        folder_path_parts = [part.strip() for part in args.folder_path.split('/') if part.strip()]
        folders = fetch_bookmark_folders(places_path)
        folder_id, folder_title = find_folder_id_by_path(folders, folder_path_parts)
        if folder_id is None:
            print(f"Error: Folder path '{args.folder_path}' not found in bookmarks.")
            sys.exit(1)
        bookmark_ids = collect_bookmark_ids_under_folder(places_path, folder_id)
        bookmarks = fetch_bookmark_info(places_path, bookmark_ids)
        html_path = os.path.join(dir_path, base_name + '.html')
        json_path = os.path.join(dir_path, base_name + '.json')
        # Only export the selected folder as root
        export_bookmarks_html_with_folders(bookmarks, folders, html_path, [folder_id])
        export_bookmarks_json_with_folders(bookmarks, folders, json_path, [folder_id])
    else:
        folders = fetch_bookmark_folders(places_path)
        bookmarks = fetch_bookmark_info(places_path)
        html_path = os.path.join(dir_path, base_name + '.html')
        json_path = os.path.join(dir_path, base_name + '.json')
        # Export all three main roots if present
        root_ids = [rid for rid in [1, 2, 3] if rid in folders]
        export_bookmarks_html_with_folders(bookmarks, folders, html_path, root_ids)
        export_bookmarks_json_with_folders(bookmarks, folders, json_path, root_ids)

if __name__ == "__main__":
    main() 