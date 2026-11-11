# Mettre Flash Poker en ligne avec Vercel

## Ce que Vercel héberge, et ce qu'il n'héberge pas

Vercel sert très bien l'interface (les fichiers compilés de `packages/web`). Il ne peut pas faire tourner le serveur de jeu, qui a besoin d'une connexion WebSocket permanente et d'une base SQLite sur disque : les fonctions Vercel s'éteignent après chaque requête.

L'organisation retenue est donc la suivante.

- **Vercel** : l'interface (adresse publique du site).
- **Render** (déjà en place, https://flash-poker-a9o3.onrender.com) : le serveur de jeu, les comptes et le temps réel.

Les deux se parlent par deux réglages, décrits ci-dessous. Le dépôt contient déjà `vercel.json`, qui règle la compilation, le cache et les en-têtes de sécurité.

## Étapes (une dizaine de minutes)

1. Poussez le dépôt à jour sur GitHub (`git add -A`, `git commit`, `git push`).
2. Sur vercel.com, connectez-vous avec le compte GitHub propriétaire du dépôt, puis **Add New… → Project** et choisissez le dépôt `flash-poker`.
3. Laissez Vercel lire `vercel.json`. Ne changez ni la commande de build ni le dossier de sortie. Dans **Settings → General**, vérifiez que **Node.js Version** est **22.x**.
4. Avant de lancer le déploiement, ouvrez **Environment Variables** et ajoutez :
   - `VITE_SERVER_URL` = `https://flash-poker-a9o3.onrender.com`
5. Cliquez sur **Deploy**. Vercel attribue une adresse du type `https://flash-poker-xxxx.vercel.app`.
6. Sur Render, ouvrez le service puis **Environment** et ajoutez :
   - `CORS_ORIGIN` = l'adresse Vercel exacte, sans barre oblique finale (par exemple `https://flash-poker-xxxx.vercel.app`).
   Render redémarre le service. Sans ce réglage, le navigateur refuse les échanges entre les deux adresses.
7. Ouvrez l'adresse Vercel, créez une partie d'entraînement, puis une partie à deux navigateurs pour vérifier le temps réel.

## Si vous avez un nom de domaine

Dans Vercel, **Settings → Domains**, ajoutez le domaine et suivez les enregistrements DNS indiqués. Mettez ensuite à jour `CORS_ORIGIN` sur Render avec ce domaine, et les valeurs `connect-src` et `img-src` dans `vercel.json` si l'adresse Render change (`img-src` autorise l'affichage des photos de profil servies par le serveur).

## Limites à connaître

- **Le serveur reste sur Render.** Sur le plan gratuit, il s'endort après 15 minutes d'inactivité (reprise en 30 à 60 secondes) et sa base est effacée à chaque redéploiement. La mise en production durable reste prévue sur le VPS OVH avec disque persistant.
- **Un seul domaine autorisé.** `CORS_ORIGIN` accepte une seule adresse. Les déploiements d'aperçu de Vercel (adresses temporaires par branche) n'auront pas accès au serveur.
- **Aperçus de liens.** Les liens d'invitation partagés depuis l'adresse Vercel affichent l'aperçu général du site, pas l'aperçu personnalisé que le serveur Render produit pour ses propres adresses.
- **Changement d'adresse Render.** Si l'adresse Render change, mettez à jour `VITE_SERVER_URL` (puis redéployez sur Vercel) et les valeurs `connect-src` et `img-src` de `vercel.json`.
