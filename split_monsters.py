
import re
import os

file_path = "/home/asuras/projects/docusaurus-metanarrative/docs/SRD/monster/monsters-a-z.md"
output_dir = "/home/asuras/projects/docusaurus-metanarrative/docs/SRD/monster/monsters"

# Create the output directory if it doesn't exist
os.makedirs(output_dir, exist_ok=True)

with open(file_path, 'r') as f:
    content = f.read()

# Split the content by '## '
sections = re.split(r'\n## ', content)

# The first part is the header, so I'll ignore it for file creation purposes,
# but we could save it or handle it if needed.
header = sections[0]
monster_sections = sections[1:]

for monster_data in monster_sections:
    lines = monster_data.strip().split('\n')
    monster_name = lines[0].strip()
    
    # Sanitize the monster name to create a valid filename
    sanitized_name = re.sub(r'[^a-zA-Z0-9_ ]', '', monster_name)
    sanitized_name = sanitized_name.replace(' ', '-') + ".md"
    
    output_path = os.path.join(output_dir, sanitized_name)
    
    # Re-add the '## ' to the content
    file_content = "## " + monster_data
    
    with open(output_path, 'w') as out_f:
        out_f.write(file_content)
    
    print(f"Created file: {output_path}")
