# Future version connectée — conception

Ce dossier décrit la future évolution. Il ne signifie pas que la version
Supabase est déjà développée.

## Choix recommandé

- interface conservée visuellement ;
- Vercel pour l’hébergement ;
- Supabase pour l’authentification et les données ;
- migration progressive plutôt qu’une réécriture visuelle ;
- séparation future du HTML, CSS et JavaScript seulement lorsque cela apporte
  un bénéfice technique réel.

## Variables d’environnement futures

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

La clé `SUPABASE_SERVICE_ROLE_KEY` reste exclusivement côté serveur.
