#!/usr/bin/env python3
"""
rdump-merge-models.py

Scan a directory (and subdirectories) for CSV files, extract all unique links from the 'reurb_link' column, and export them to a text file (one link per line).

Required arguments:
  --dir, -d      Path to the directory to scan for CSV files (use '.' for current directory)
  --output, -o   Path (and filename) for the output text file

Optional arguments:
  --sort, -s     Sort the output links alphabetically
  --help, -h     Show this help message and exit

If a CSV file does not contain the 'reurb_link' column or cannot be read, it will be skipped.
The output file will contain one link per line, with no duplicates and no trailing commas.
"""
import argparse
import os
import sys
import csv

HELP_TEXT = """
rdump-merge-models.py

Merge all unique 'reurb_link' links from CSV files in a directory (recursively)
into a text file, or add links from a single CSV file to a text file.

Required arguments (for merge mode):
  --dir, -d      Directory to scan for CSV files (use '.' for current directory)
  --output, -o   Path (and filename) for the output text file

Optional arguments:
  --sort, -s     Sort the output links alphabetically
  --add-csv      Path to a single CSV file to add links from (reurb_link column)
  --add-to-txt   Path to a text file to add links to (one link per line, no duplicates)
  --help, -h     Show this help message and exit

If --add-csv and --add-to-txt are both used, the script will add all unique
links from the CSV's 'reurb_link' column to the specified text file, avoiding
duplicates. If --sort is used, the resulting text file will be sorted.

Examples:
  python rdump-merge-models.py --dir ./my_exports --output merged_links.txt
  python rdump-merge-models.py --add-csv my_links.csv --add-to-txt master_links.txt --sort
"""

def parse_args():
    parser = argparse.ArgumentParser(
        description="Merge all unique 'reurb_link' links from CSV files in a directory (recursively) into a text file, or add links from a CSV to a text file.",
        add_help=False,
        usage=HELP_TEXT
    )
    parser.add_argument('--dir', '-d', required=False, help='Directory to scan for CSV files (use "." for current directory)')
    parser.add_argument('--output', '-o', required=False, help='Path (and filename) for the output text file')
    parser.add_argument('--sort', '-s', action='store_true', help='Sort the output links alphabetically')
    parser.add_argument('--help', '-h', action='store_true', help='Show this help message and exit')
    parser.add_argument('--add-csv', required=False, help='Path to a single CSV file to add links from (reurb_link column)')
    parser.add_argument('--add-to-txt', required=False, help='Path to a text file to add links to (one link per line, no duplicates)')
    return parser.parse_args()

def find_csv_files(directory):
    for root, _, files in os.walk(directory):
        for file in files:
            if file.lower().endswith('.csv'):
                yield os.path.join(root, file)

def extract_links_from_csv(csv_path):
    links = set()
    try:
        with open(csv_path, newline='', encoding='utf-8') as csvfile:
            reader = csv.DictReader(csvfile)
            if 'reurb_link' not in reader.fieldnames:
                print(f"Skipping (no 'reurb_link' column): {csv_path}")
                return links
            for row in reader:
                link = row.get('reurb_link', '').strip()
                if link:
                    links.add(link)
    except Exception as e:
        print(f"Skipping (error reading file): {csv_path} ({e})")
    return links

def write_links_to_file(links, output_path):
    with open(output_path, 'w', encoding='utf-8') as f:
        for link in links:
            f.write(link + '\n')
    print(f"Exported: {output_path}")

def add_csv_links_to_txt(csv_path, txt_path, sort_links):
    import csv
    # Read links from CSV
    links = set()
    with open(csv_path, newline='', encoding='utf-8') as csvfile:
        reader = csv.DictReader(csvfile)
        if 'reurb_link' not in reader.fieldnames:
            print(f"Error: 'reurb_link' column not found in {csv_path}")
            return
        for row in reader:
            link = row.get('reurb_link', '').strip()
            if link:
                links.add(link)
    # Read existing links from txt file
    existing = set()
    if os.path.exists(txt_path):
        with open(txt_path, 'r', encoding='utf-8') as f:
            for line in f:
                l = line.strip()
                if l:
                    existing.add(l)
    # Merge and deduplicate
    all_links = existing | links
    all_links = sorted(all_links) if sort_links else list(all_links)
    # Write back to txt file
    with open(txt_path, 'w', encoding='utf-8') as f:
        for link in all_links:
            f.write(link + '\n')
    print(f"Added {len(links - existing)} new links to {txt_path} (total: {len(all_links)})")

def main():
    args = parse_args()
    if args.help or (not args.dir and not args.add_csv):
        print(HELP_TEXT)
        sys.exit(0)
    # New functionality: add links from a CSV to a text file
    if args.add_csv and args.add_to_txt:
        add_csv_links_to_txt(args.add_csv, args.add_to_txt, args.sort)
        sys.exit(0)
    dir_path = args.dir
    if dir_path == ".":
        dir_path = os.getcwd()
    if not os.path.isdir(dir_path):
        print(f"Error: Directory not found: {dir_path}")
        print(HELP_TEXT)
        sys.exit(1)
    all_links = set()
    for csv_file in find_csv_files(dir_path):
        links = extract_links_from_csv(csv_file)
        all_links.update(links)
    if not all_links:
        print("No links found in any CSV files.")
        sys.exit(0)
    links_list = list(all_links)
    if args.sort:
        links_list.sort()
    write_links_to_file(links_list, args.output)

if __name__ == "__main__":
    main() 