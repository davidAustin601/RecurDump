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
rdump-merge-models.py - Merge all unique 'reurb_link' links from CSV files in a directory (recursively) into a text file.

Required arguments:
  --dir, -d      Path to the directory to scan for CSV files (use '.' for current directory)
  --output, -o   Path (and filename) for the output text file

Optional arguments:
  --sort, -s     Sort the output links alphabetically
  --help, -h     Show this help message and exit

Example usage:
  python rdump-merge-models.py --dir ./my_exports --output merged_links.txt
  python rdump-merge-models.py -d . -o /tmp/all_links.txt --sort
"""

def parse_args():
    parser = argparse.ArgumentParser(
        description="Merge all unique 'reurb_link' links from CSV files in a directory (recursively) into a text file.",
        add_help=False,
        usage=HELP_TEXT
    )
    parser.add_argument('--dir', '-d', required=True, help='Directory to scan for CSV files (use "." for current directory)')
    parser.add_argument('--output', '-o', required=True, help='Path (and filename) for the output text file')
    parser.add_argument('--sort', '-s', action='store_true', help='Sort the output links alphabetically')
    parser.add_argument('--help', '-h', action='store_true', help='Show this help message and exit')
    args = parser.parse_args()
    if args.help or not (args.dir and args.output):
        print(HELP_TEXT)
        sys.exit(0)
    return args

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

def main():
    args = parse_args()
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