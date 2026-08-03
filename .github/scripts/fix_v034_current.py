from pathlib import Path

path = Path('supabase-orders.js')
text = path.read_text(encoding='utf-8')
updated = text.replace('window.current', 'current')
if updated == text:
    print('Aucune référence window.current à corriger.')
else:
    path.write_text(updated, encoding='utf-8')
    print('Références current corrigées.')
