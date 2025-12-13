# Dépannage des Emails de Vérification

## Problème : Les emails de vérification ne sont pas reçus

### Solutions rapides

#### Option 1 : Utiliser Gmail SMTP (Recommandé pour le développement)

1. **Activez la validation en 2 étapes sur votre compte Gmail** :
   - Allez sur [Google Account Security](https://myaccount.google.com/security)
   - Activez la validation en 2 étapes si ce n'est pas déjà fait

2. **Générez un mot de passe d'application** :
   - Allez dans "Mots de passe des applications"
   - Créez un nouveau mot de passe d'application pour "Mail"
   - Copiez le mot de passe généré (16 caractères, format: `xxxx xxxx xxxx xxxx`)

3. **Ajoutez dans votre fichier `.env`** :
   ```env
   GMAIL_USER=votre-email@gmail.com
   GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx
   FRONTEND_URL=http://localhost:3001
   ```

4. **Redémarrez le serveur** :
   ```bash
   npm run build
   npm start
   ```

#### Option 2 : Configurer Resend (Pour la production)

1. **Créez un compte sur [Resend](https://resend.com)**

2. **Obtenez votre API Key** depuis le dashboard Resend

3. **Ajoutez dans votre fichier `.env`** :
   ```env
   RESEND_PASSKEY=re_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   FRONTEND_URL=http://localhost:3001
   ```

4. **Important** : Le domaine `rehoboth-api.cloud` doit être vérifié dans Resend, OU vous devez modifier l'adresse "from" dans `src/utils/helpers/sendMail.ts` ligne 26

5. **Redémarrez le serveur** :
   ```bash
   npm run build
   npm start
   ```

---

## Vérification de la configuration

### Vérifier les logs du serveur

Lorsque vous essayez de vous connecter avec un email non vérifié, vous devriez voir dans les logs :

```
📧 Sending verification email to: votre-email@example.com
✅ Email sent successfully via Gmail SMTP
```

OU

```
📧 Sending verification email to: votre-email@example.com
✅ Email sent successfully via Resend
```

### Si vous voyez une erreur :

```
❌ Error sending email: ...
```

Cela signifie que :
- Les variables d'environnement ne sont pas correctement configurées
- Les credentials sont invalides
- Il y a un problème de connexion réseau

---

## Erreurs courantes

### 1. "No email service configured"

**Solution** : Configurez soit `GMAIL_USER` + `GMAIL_APP_PASSWORD`, soit `RESEND_PASSKEY` dans votre `.env`

### 2. "Gmail SMTP credentials not configured"

**Solution** : Vérifiez que `GMAIL_USER` et `GMAIL_APP_PASSWORD` sont bien définis dans votre `.env` et que vous avez redémarré le serveur

### 3. "Invalid API key" (Resend)

**Solution** : Vérifiez que votre `RESEND_PASSKEY` est correct et commence par `re_`

### 4. Les emails arrivent en spam

**Pour Gmail** :
- Vérifiez votre dossier spam
- Ajoutez l'expéditeur à vos contacts
- Limitez le nombre d'emails envoyés (max 500/jour pour Gmail gratuit)

**Pour Resend** :
- Vérifiez que votre domaine est vérifié
- Configurez SPF/DKIM dans votre DNS

---

## Test rapide

1. **Vérifiez votre configuration** :
   ```bash
   # Dans votre terminal, vérifiez que les variables sont définies
   echo $GMAIL_USER
   echo $RESEND_PASSKEY
   ```

2. **Essayez de vous connecter** avec un compte non vérifié

3. **Vérifiez les logs du serveur** pour voir si l'email est envoyé

4. **Vérifiez votre boîte email** (et le dossier spam)

---

## Configuration recommandée

### Pour le développement local :
```env
GMAIL_USER=votre-email@gmail.com
GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx
FRONTEND_URL=http://localhost:3001
```

### Pour la production :
```env
RESEND_PASSKEY=re_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
FRONTEND_URL=https://votre-domaine.com
```

---

## Support

Si le problème persiste :
1. Vérifiez les logs complets du serveur
2. Vérifiez que votre `.env` est bien chargé (redémarrez le serveur après modification)
3. Testez avec un autre email
4. Vérifiez que le port SMTP (587) n'est pas bloqué par votre firewall

