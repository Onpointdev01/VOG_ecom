# Configuration Email - Guide de Configuration

Le backend utilise deux méthodes pour envoyer des emails (vérification d'email et réinitialisation de mot de passe) :

## Option 1 : Resend (Par défaut - Recommandé pour la production)

**Resend** est un service d'email transactionnel moderne et fiable.

### Configuration requise :

1. Créez un compte sur [Resend](https://resend.com)
2. Obtenez votre API Key depuis le dashboard Resend
3. Ajoutez dans votre fichier `.env` :

```env
RESEND_PASSKEY=re_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### Avantages :
- ✅ Service dédié aux emails transactionnels
- ✅ Meilleure délivrabilité
- ✅ Analytics et tracking intégrés
- ✅ Pas besoin de configurer SMTP
- ✅ Domaine personnalisé possible

### Configuration actuelle :
- **From Email** : `St-Caël <info@rehoboth-api.cloud>`
- ⚠️ **Note** : Vous devrez peut-être vérifier ce domaine dans Resend ou le changer pour votre propre domaine

---

## Option 2 : Gmail SMTP (Alternative)

Si vous préférez utiliser Gmail pour envoyer des emails.

### Configuration requise :

1. Activez la validation en 2 étapes sur votre compte Gmail
2. Générez un **Mot de passe d'application** :
   - Allez sur [Google Account Security](https://myaccount.google.com/security)
   - Activez la validation en 2 étapes si ce n'est pas déjà fait
   - Allez dans "Mots de passe des applications"
   - Créez un nouveau mot de passe d'application pour "Mail"
   - Copiez le mot de passe généré (16 caractères)

3. Ajoutez dans votre fichier `.env` :

```env
GMAIL_USER=votre-email@gmail.com
GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx
```

### Avantages :
- ✅ Utilise votre propre compte Gmail
- ✅ Gratuit (dans les limites de Gmail)
- ✅ Pas besoin de service externe

### Limitations :
- ⚠️ Limite de 500 emails/jour pour les comptes Gmail gratuits
- ⚠️ Peut être marqué comme spam si vous envoyez beaucoup d'emails
- ⚠️ Moins professionnel que Resend pour la production

---

## Comment ça fonctionne

Le système choisit automatiquement la méthode à utiliser :

1. **Si `GMAIL_USER` et `GMAIL_APP_PASSWORD` sont configurés** :
   - Les emails de réinitialisation de mot de passe utilisent Gmail SMTP
   - Les autres emails utilisent Resend (par défaut)

2. **Sinon** :
   - Tous les emails utilisent Resend

---

## Variables d'environnement nécessaires

### Minimum requis (Resend) :
```env
RESEND_PASSKEY=re_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
FRONTEND_URL=http://localhost:3001  # Pour les liens dans les emails (st_cael_website)
SELLER_FRONTEND_URL=http://localhost:3002  # Pour les liens dans les emails (st_cael_seller)
```

### Si vous utilisez Gmail SMTP :
```env
GMAIL_USER=votre-email@gmail.com
GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx
FRONTEND_URL=http://localhost:3001  # Pour les utilisateurs normaux (st_cael_website)
SELLER_FRONTEND_URL=http://localhost:3002  # Pour les vendeurs (st_cael_seller)
```

### Configuration des URLs Frontend

Le backend utilise automatiquement la bonne URL selon le rôle de l'utilisateur :
- **Utilisateurs normaux** (`role: 'user'`) : Utilise `FRONTEND_URL` (par défaut: `http://localhost:3001`)
- **Vendeurs** (`role: 'seller'`) : Utilise `SELLER_FRONTEND_URL` si défini, sinon `FRONTEND_URL` (par défaut: `http://localhost:3002`)

**Important** : Si `SELLER_FRONTEND_URL` n'est pas défini, le système utilisera `FRONTEND_URL` pour tous les utilisateurs.

### Optionnel :
```env
APP_NAME=St-Caël  # Nom de l'application (utilisé dans les emails Gmail)
```

---

## Emails envoyés

Le système envoie automatiquement :

1. **Email de vérification** (lors de l'inscription)
   - Contient un code de vérification
   - Lien de vérification : 
     - Utilisateurs normaux : `${FRONTEND_URL}/verify-email?code=XXX&email=XXX`
     - Vendeurs : `${SELLER_FRONTEND_URL}/verify-email?code=XXX&email=XXX`

2. **Email de réinitialisation de mot de passe**
   - Contient un lien de réinitialisation
   - Lien :
     - Utilisateurs normaux : `${FRONTEND_URL}/reset-password?token=XXX`
     - Vendeurs : `${SELLER_FRONTEND_URL}/reset-password?token=XXX`
   - Le token expire après 1 heure

---

## Test de la configuration

Pour tester si les emails fonctionnent :

1. **Test d'inscription** :
   - Créez un nouveau compte utilisateur
   - Vérifiez votre boîte email (et spam) pour le code de vérification

2. **Test de réinitialisation** :
   - Allez sur `/forgot-password`
   - Entrez votre email
   - Vérifiez votre boîte email pour le lien de réinitialisation

---

## Dépannage

### Les emails ne sont pas envoyés

1. **Vérifiez les logs du serveur** :
   ```bash
   # Cherchez les erreurs dans la console
   # Exemple : "Error sending email: ..."
   ```

2. **Vérifiez vos variables d'environnement** :
   ```bash
   # Assurez-vous que RESEND_PASSKEY ou GMAIL_USER/GMAIL_APP_PASSWORD sont définis
   ```

3. **Pour Resend** :
   - Vérifiez que votre API key est valide
   - Vérifiez que le domaine `rehoboth-api.cloud` est vérifié dans Resend
   - Ou changez l'adresse "from" dans `sendMail.ts` ligne 26

4. **Pour Gmail** :
   - Vérifiez que la validation en 2 étapes est activée
   - Vérifiez que vous utilisez un **mot de passe d'application** (pas votre mot de passe Gmail)
   - Vérifiez que le mot de passe d'application n'a pas d'espaces dans `.env`

### Les emails arrivent en spam

- Pour Resend : Vérifiez votre domaine et configurez SPF/DKIM
- Pour Gmail : Limitez le nombre d'emails envoyés, utilisez Resend pour la production

---

## Recommandation

Pour la **production**, utilisez **Resend** avec votre propre domaine vérifié. C'est plus professionnel et fiable.

Pour le **développement/test**, Gmail SMTP est suffisant.

