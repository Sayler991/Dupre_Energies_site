# Dupre Energies — site vitrine (maquette de démonstration)

Maquette **non officielle** préparée pour présenter une proposition de site à Dupre Energies (plombier chauffagiste, Mérignac).
Toutes les informations viennent de la fiche publique PagesJaunes : https://www.pagesjaunes.fr/pros/50151435

- Site : https://sayler991.github.io/Dupre_Energies_site/
- Espace patron : https://sayler991.github.io/Dupre_Energies_site/admin/

## Faits réels utilisés (fiche PagesJaunes)
Dupre Energies (SARL créée en 2021, reprise de Dupre Fils, SIREN 901 651 869) · Lot 8, 8 rue Vert Castel, 33700 Mérignac · 06 12 59 18 18 ·
Qualibat RGE · Professionnel du Gaz · 5/5 sur 61 avis PagesJaunes · équipe de 3 à 5 personnes · prestations plomberie / chauffage / chauffe-eau / salle de bain / recherche de fuite.
Les 4 avis affichés sont cités mot pour mot avec leur auteur, leur date et un lien vers la source.

## Éléments provisoires (à confirmer avec le client)
- Horaires : non publiés → « nous appeler pour connaître nos disponibilités ». Pas de mention 24h/24.
- Aucune adresse e-mail affichée (la fiche n'en donne pas).
- Créneaux de rendez-vous (08h-10h, 10h-12h, 14h-16h, 16h-18h, du lundi au samedi) : choix de la maquette.
- Slogan « Le travail bien fait, chez vous, près de chez vous. » : texte de la maquette, sans promesse chiffrée.
- Photos : photos libres d'illustration, pas des chantiers de l'entreprise.

## Structure
- `site/` : site publié (index.html, config.js, content.json de secours, assets/, admin/)
- `site/assets/js/live.js` : contenu chargé depuis Supabase (`dupre.site_content`), puis `content.json`, puis le HTML statique ; formulaires rendez-vous, devis (avec photo) et message.
- `site/admin/` : tableau de bord (Rendez-vous, Devis, Messages, Clients avec notes, Stats, Contenu & photos, Historique avec restauration, interrupteur ouvert/fermé). `alerts.js` : temps réel + relève toutes les 30 s, son, bandeau rouge, badges, titre de l'onglet, notification du navigateur.
- `supabase/schema.sql`, `supabase/seed.sql` : schéma `dupre` (RLS, propriétaire via `public.owners`/`public.is_owner()`, anti-abus par trigger : pot de miel, statut forcé, URL photo contrôlée, dates/créneaux, limites 20/min et 3 par téléphone/10 min).
- `tools/e2e/` : `e2e.js` (site en ligne, bureau + 390 px), `admin_harness.html` + `admin_test.js` (interface patron avec faux client Supabase et `fixture.json`).
- `netlify.toml` : déploiement Netlify possible (publish = `site`).

## Supabase
Projet `rvreusugrtiubqtafgbk`. Appliquer `schema.sql` puis `seed.sql`, puis ajouter `dupre` aux schémas exposés (API → `public, graphql_public, ibis, dupre`).
Propriétaire : insérer l'utilisateur benduy0@gmail.com dans `public.owners`. Photos de devis : bucket public `images`, préfixe `up-dupre_devis-` (lisibles par toute personne qui a l'URL).

## Tests
```
cd site && python3 -m http.server 8642          # ou utiliser l'URL en ligne
node tools/e2e/e2e.js https://sayler991.github.io/Dupre_Energies_site/ /tmp/shots/
python3 -m http.server 8643 (à la racine) && node tools/e2e/admin_test.js /tmp/shots/
```
Les demandes de test sont nommées « TEST E2E … ». Il faut les supprimer après les tests, ainsi que les photos `up-dupre_devis-*`, avec l'API Storage.

## Crédits photos — licence Unsplash (usage libre, commercial compris, sans attribution obligatoire)
- Salle de bain : Alex Tyson — https://unsplash.com/photos/UKW2QHI5eOY
- Radiateur : Erik Mclean — https://unsplash.com/photos/a3t5yfME32g
- Clé : Oxa Roxa — https://unsplash.com/photos/oHoOrmEms38
- Tuyaux : Ryan Vargas — https://unsplash.com/photos/rdAKQYI3Hnk (pas utilisée)
Converties en WebP 800/1600 px.
