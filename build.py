from pathlib import Path
import zipfile

root = Path(__file__).resolve().parent
source = (root / 'index.html').read_text(encoding='utf-8')
css = (root / 'style.css').read_text(encoding='utf-8-sig')
js = (root / 'app.js').read_text(encoding='utf-8')
js = js.replace("k.startsWith(p.id+'-')", "k.startsWith(p.id+'-'+p.level+'-')")
(root / 'app.js').write_text(js, encoding='utf-8')
source = source.replace('<link rel="stylesheet" href="style.css">', '<style>\n' + css + '\n</style>')
source = source.replace('<script src="app.js"></script>', '<script>\n' + js + '\n</script>')
(root / 'prototype.html').write_text(source, encoding='utf-8')
with zipfile.ZipFile(root.parent / 'ai-career-miniapp-prototype.zip', 'w', zipfile.ZIP_DEFLATED) as z:
    for name in ['index.html', 'style.css', 'app.js', 'prototype.html', 'overview.html', 'README.md', 'build.py']:
        z.write(root / name, arcname='ai-career-miniapp-prototype/' + name)
print('Built standalone prototype.html and source archive.')
