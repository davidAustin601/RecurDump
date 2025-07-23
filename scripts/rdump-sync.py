#!/usr/bin/env python3
"""
rdump-sync.py
Synchronize a RecurTrack CSV database with a directory of video files.

Required arguments:
  --db, -d      Path to the RecurTrack CSV database file (exported from the Firefox extension)
  --dir, -p     Path to the directory containing your video files (use '.' for current directory)

Optional arguments:
  --backup, -b          Backup the input database file before processing
  --output, -o          Specify a different output directory and/or filename for the exported CSV
  --sort, -s            Sort the output CSV by a specified column (URL, Filename, or Extracted At)
  --desc, -D            Sort in descending order (default is ascending)
  --help, -h            Show this help message and exit

If any filenames in the database are not found in the directory, a new CSV is exported with only those missing entries, formatted like the input. The output file is named '[MODEL NAME]_need-to-download_MM-DD-YY.csv' by default, saved in the input directory unless overridden.
"""
import argparse
import csv
import os
import sys
import shutil
from datetime import datetime

HELP_TEXT = """
rdump-sync.py - Synchronize a RecurTrack CSV database with a directory of video files.

Required arguments:
  --db, -d      Path to the RecurTrack CSV database file (exported from the Firefox extension)
  --dir, -p     Path to the directory containing your video files (use "." for current directory)

Optional arguments:
  --backup, -b          Backup the input database file before processing
  --output, -o          Specify a different output directory and/or filename for the exported CSV
  --sort, -s            Sort the output CSV by a specified column (URL, Filename, or Extracted At)
  --desc, -D            Sort in descending order (default is ascending)
  --help, -h            Show this help message and exit

Example usage:
  python rdump-sync.py --db my_model_Database_07-20-2025.csv --dir /path/to/videos
  python rdump-sync.py -d my_model_Database_07-20-2025.csv -p . --backup --sort Filename --desc
"""

def parse_args():
    parser = argparse.ArgumentParser(
        description="Synchronize a RecurTrack CSV database with a directory of video files.",
        add_help=False,
        usage=HELP_TEXT
    )
    parser.add_argument('--db', '-d', required=True, help='Path to the RecurTrack CSV database file')
    parser.add_argument('--dir', '-p', required=True, help='Path to the directory containing your video files (use "." for current directory)')
    parser.add_argument('--backup', '-b', action='store_true', help='Backup the input database file before processing')
    parser.add_argument('--output', '-o', help='Specify a different output directory and/or filename for the exported CSV')
    parser.add_argument('--sort', '-s', choices=['URL', 'Filename', 'Extracted At'], help='Sort the output CSV by a specified column')
    parser.add_argument('--desc', '-D', action='store_true', help='Sort in descending order (default is ascending)')
    parser.add_argument('--help', '-h', action='store_true', help='Show this help message and exit')
    args = parser.parse_args()
    if args.help or not (args.db and args.dir):
        print(HELP_TEXT)
        sys.exit(0)
    return args

def backup_file(filepath):
    backup_path = filepath + ".bak"
    shutil.copy2(filepath, backup_path)
    print(f"Backup created: {backup_path}")

def extract_model_name(db_filename):
    # Example: my_model_Database_07-20-2025.csv -> my_model
    base = os.path.basename(db_filename)
    if "_Database_" in base:
        return base.split("_Database_")[0]
    return os.path.splitext(base)[0]

def load_csv_database(csv_path):
    with open(csv_path, newline='', encoding='utf-8') as csvfile:
        reader = csv.DictReader(csvfile)
        rows = list(reader)
    return rows, reader.fieldnames

def get_filenames_from_db(rows):
    return set(row['Filename'] for row in rows if row['Filename'])

def scan_directory_for_files(directory):
    files = set()
    for entry in os.scandir(directory):
        if entry.is_file():
            files.add(entry.name)
    return files

def filter_missing_files(rows, present_files):
    # Only keep rows whose 'Filename' is not in present_files
    seen = set()
    filtered = []
    for row in rows:
        key = (row['URL'], row['Filename'], row['Extracted At'])
        if row['Filename'] not in present_files and key not in seen:
            filtered.append(row)
            seen.add(key)
    return filtered

def sort_rows(rows, sort_col, descending):
    return sorted(rows, key=lambda r: r.get(sort_col, ''), reverse=descending)

def write_csv(rows, fieldnames, output_path):
    with open(output_path, 'w', newline='', encoding='utf-8') as csvfile:
        writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)
    print(f"Exported: {output_path}")

def main():
    args = parse_args()
    db_path = args.db
    dir_path = args.dir
    if dir_path == ".":
        dir_path = os.getcwd()
    if not os.path.isfile(db_path):
        print(f"Error: Database file not found: {db_path}")
        print(HELP_TEXT)
        sys.exit(1)
    if not os.path.isdir(dir_path):
        print(f"Error: Directory not found: {dir_path}")
        print(HELP_TEXT)
        sys.exit(1)
    if args.backup:
        backup_file(db_path)
    rows, fieldnames = load_csv_database(db_path)
    db_filenames = get_filenames_from_db(rows)
    present_files = scan_directory_for_files(dir_path)
    missing_rows = filter_missing_files(rows, present_files)
    if not missing_rows:
        print("All files in the database are present in the directory. No export needed.")
        sys.exit(0)
    # Sorting
    if args.sort:
        missing_rows = sort_rows(missing_rows, args.sort, args.desc)
    # Output path
    model_name = extract_model_name(db_path)
    date_str = datetime.now().strftime("%m-%d-%y")
    default_output_name = f"{model_name}_need-to-download_{date_str}.csv"
    if args.output:
        if os.path.isdir(args.output):
            output_path = os.path.join(args.output, default_output_name)
        else:
            output_path = args.output
    else:
        output_path = os.path.join(dir_path, default_output_name)
    write_csv(missing_rows, fieldnames, output_path)

if __name__ == "__main__":
    main() 