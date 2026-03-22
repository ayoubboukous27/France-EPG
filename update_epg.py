import requests
import xml.etree.ElementTree as ET
import subprocess

EPG_URL = "https://raw.githubusercontent.com/ayoubboukous27/France-EPG/refs/heads/main/Data/guide_france.xml"
OUTPUT_FILE = "updated_epg.xml"

logos_by_id = {
    "bein-sports-1.fr": "https://raw.githubusercontent.com/tv-logo/tv-logos/refs/heads/main/countries/france/bein-sports-1-french-fr.png",
    "bein-sports-2.fr": "https://raw.githubusercontent.com/tv-logo/tv-logos/refs/heads/main/countries/france/bein-sports-2-french-fr.png",
    "bein-sports-3.fr": "https://raw.githubusercontent.com/tv-logo/tv-logos/refs/heads/main/countries/france/bein-sports-3-french-fr.png",
}

def update_epg():
    print("Downloading EPG...")
    response = requests.get(EPG_URL)
    response.raise_for_status()

    root = ET.fromstring(response.content)
    updated = 0

    for channel in root.findall("channel"):
        channel_id = channel.get("id")
        if channel_id in logos_by_id:
            print(f"Updating: {channel_id}")
            icon = channel.find("icon")
            new_logo = logos_by_id[channel_id]
            if icon is not None:
                icon.set("src", new_logo)
            else:
                new_icon = ET.Element("icon")
                new_icon.set("src", new_logo)
                channel.append(new_icon)
            updated += 1

    tree = ET.ElementTree(root)
    tree.write(OUTPUT_FILE, encoding="utf-8", xml_declaration=True)
    print(f"Done! Updated {updated} channels.")

def git_commit_push():
    subprocess.run(["git", "config", "user.name", "github-actions"], check=True)
    subprocess.run(["git", "config", "user.email", "actions@github.com"], check=True)
    subprocess.run(["git", "add", OUTPUT_FILE], check=True)
    # إذا هناك تغييرات فقط يتم commit
    result = subprocess.run(["git", "diff", "--staged", "--quiet"])
    if result.returncode != 0:
        subprocess.run(["git", "commit", "-m", "Update EPG"], check=True)
        subprocess.run(["git", "push"], check=True)
        print("Changes pushed to repo.")
    else:
        print("No changes detected.")

if __name__ == "__main__":
    update_epg()
    git_commit_push()
