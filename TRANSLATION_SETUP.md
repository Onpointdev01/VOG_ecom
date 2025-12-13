# Configuration Microsoft Translator API

Ce document explique comment configurer Microsoft Translator API pour la traduction automatique des données de la base de données.

## Prérequis

1. Un compte Azure (gratuit ou payant)
2. Une ressource Azure Translator créée

## Étapes de configuration

### 1. Créer une ressource Azure Translator

1. Connectez-vous au [portail Azure](https://portal.azure.com)
2. Cliquez sur "Créer une ressource"
3. Recherchez "Translator" et sélectionnez "Translator"
4. Remplissez le formulaire :
   - **Abonnement** : Sélectionnez votre abonnement
   - **Groupe de ressources** : Créez-en un nouveau ou utilisez un existant
   - **Région** : Sélectionnez une région (par exemple : `eastus`, `westus`, `westeurope`)
   - **Nom** : Donnez un nom à votre ressource
   - **Niveau tarifaire** : Sélectionnez "F0" (gratuit) ou "S1" (payant)
5. Cliquez sur "Créer"

### 2. Obtenir la clé API et la région

1. Une fois la ressource créée, allez dans "Clés et point de terminaison"
2. Copiez la **Clé 1** (ou Clé 2)
3. Notez la **Région** (par exemple : `eastus`)

### 3. Configurer les variables d'environnement

Ajoutez les variables suivantes à votre fichier `.env` :

```env
AZURE_TRANSLATOR_KEY=votre_clé_api_ici
AZURE_TRANSLATOR_REGION=eastus
```

**Important** : 
- Remplacez `votre_clé_api_ici` par votre clé API réelle
- Remplacez `eastus` par la région que vous avez sélectionnée lors de la création de la ressource

### 4. Limites du niveau gratuit (F0)

- **2 millions de caractères par mois**
- **5 000 caractères par requête**
- **100 requêtes par seconde**

Si vous dépassez ces limites, vous devrez passer au niveau payant (S1).

## Fonctionnement

### Langue par défaut

- **Français (fr)** : Langue par défaut. Aucune traduction n'est effectuée si la langue demandée est le français.
- **Anglais (en)** : Les données sont traduites du français vers l'anglais.

### Détection automatique de la langue

Le système détecte automatiquement la langue demandée via le header HTTP `Accept-Language` :

- `Accept-Language: fr` → Pas de traduction (français par défaut)
- `Accept-Language: en` → Traduction vers l'anglais
- `Accept-Language: fr-FR,fr;q=0.9,en;q=0.8` → Détection du français (première langue)

### Données traduites

Les champs suivants sont automatiquement traduits :

**Produits :**
- `name` (nom du produit)
- `description` (description)
- `brand` (marque)
- `category.name` (nom de la catégorie)
- `owner.name` (nom du vendeur)

**Catégories :**
- `name` (nom de la catégorie)
- `description` (description)
- `subcategories` (sous-catégories, récursif)

### Endpoints avec traduction automatique

- `GET /api/v1/products` - Liste des produits
- `GET /api/v1/products/:id` - Détails d'un produit
- `GET /api/v1/products/category/:categoryId` - Produits par catégorie
- `GET /api/v1/products/seller/:sellerId` - Produits par vendeur
- `GET /api/v1/categories` - Liste des catégories
- `GET /api/v1/categories/:id` - Détails d'une catégorie

### Endpoint de traduction manuelle

Si vous avez besoin de traduire du texte manuellement :

```
POST /api/v1/translate
Content-Type: application/json

{
  "text": "Texte à traduire",
  "targetLanguage": "en",
  "sourceLanguage": "fr" // optionnel, auto-détection par défaut
}
```

Pour traduire plusieurs textes en une seule requête :

```
POST /api/v1/translate
Content-Type: application/json

{
  "text": ["Texte 1", "Texte 2", "Texte 3"],
  "targetLanguage": "en",
  "sourceLanguage": "fr"
}
```

## Dépannage

### Erreur : "Translation service not configured"

**Cause** : La variable d'environnement `AZURE_TRANSLATOR_KEY` n'est pas définie.

**Solution** : Vérifiez que vous avez ajouté la variable dans votre fichier `.env` et redémarrez le serveur.

### Erreur : "Translation API error: 401"

**Cause** : La clé API est invalide ou expirée.

**Solution** : Vérifiez votre clé API dans le portail Azure et mettez à jour votre fichier `.env`.

### Erreur : "Translation API error: 403"

**Cause** : Vous avez dépassé votre quota mensuel (niveau gratuit).

**Solution** : Attendez le mois suivant ou passez au niveau payant.

### Les traductions ne fonctionnent pas

**Vérifications :**
1. Vérifiez que `AZURE_TRANSLATOR_KEY` est défini dans `.env`
2. Vérifiez que `AZURE_TRANSLATOR_REGION` correspond à la région de votre ressource
3. Vérifiez que le header `Accept-Language` est envoyé par le frontend
4. Vérifiez les logs du serveur pour les erreurs de traduction

## Notes importantes

1. **Performance** : Les traductions sont effectuées en temps réel. Pour de grandes quantités de données, cela peut ralentir les requêtes. Considérez la mise en cache si nécessaire.

2. **Coûts** : Le niveau gratuit (F0) offre 2 millions de caractères par mois. Surveillez votre utilisation dans le portail Azure.

3. **Qualité** : Microsoft Translator est une traduction automatique. La qualité peut varier selon le type de contenu.

4. **Fallback** : Si la traduction échoue, le système retourne le texte original en français.

