
import os
import re
import sys

def lower_headings_in_file(input_path, output_path):
    with open(input_path, 'r') as f:
        content = f.read()

    def lower_heading(match):
        heading = match.group(0)
        if heading.startswith('# '):
            return heading[2:] # Remove '# '
        else:
            return heading[1:] # Remove one '#'

    # This regex will match lines that start with one or more '#'
    content = re.sub(r'^(#+ .*)', lower_heading, content, flags=re.MULTILINE)

    with open(output_path, 'w') as f:
        f.write(content)

if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python lower_headings.py <source_directory> <destination_directory>")
        sys.exit(1)

    source_dir = sys.argv[1]
    dest_dir = sys.argv[2]

    if not os.path.isdir(source_dir):
        print(f"Error: Source directory '{source_dir}' not found.")
        sys.exit(1)

    os.makedirs(dest_dir, exist_ok=True)

    for filename in os.listdir(source_dir):
        if filename.endswith(".md"):
            source_path = os.path.join(source_dir, filename)
            dest_path = os.path.join(dest_dir, filename)
            lower_headings_in_file(source_path, dest_path)
            print(f"Processed: {source_path} -> {dest_path}")
