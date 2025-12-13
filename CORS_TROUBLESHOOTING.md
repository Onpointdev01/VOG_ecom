# CORS Troubleshooting Guide

## Problème : Erreur CORS persistante après modifications

Si vous rencontrez toujours des erreurs CORS après avoir modifié le code, suivez ces étapes :

### 1. **Recompiler le code TypeScript**

Le serveur en mode production utilise le code compilé dans `dist/`. Vous devez recompiler après chaque modification :

```bash
# Arrêtez le serveur (Ctrl+C)
npm run build
# Puis redémarrez
npm start
```

Ou en mode développement :
```bash
npm run dev
```

### 2. **Vérifier les logs du serveur**

Après le redémarrage, vous devriez voir dans les logs :
```
🔒 CORS Configuration: {
  allowedOrigins: [ 'http://localhost:3000', 'http://localhost:3001', 'http://localhost:3002' ],
  nodeEnv: 'production',
  credentials: true
}
```

Et lors d'une requête depuis `localhost:3001` :
```
🔍 CORS: Checking origin: http://localhost:3001
✅ CORS: Allowing localhost origin: http://localhost:3001
```

### 3. **Vérifier la variable d'environnement**

Si `FRONTEND_URL` est défini dans votre `.env`, il sera utilisé. Les ports localhost (3000, 3001, 3002) sont toujours ajoutés automatiquement.

### 4. **Tester avec curl**

Testez la requête préflight OPTIONS :
```bash
curl -X OPTIONS http://localhost:8013/api/v1/auth/login \
  -H "Origin: http://localhost:3001" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type,Authorization" \
  -v
```

Vous devriez voir les headers CORS dans la réponse :
```
< Access-Control-Allow-Origin: http://localhost:3001
< Access-Control-Allow-Methods: GET,POST,PUT,DELETE,PATCH,OPTIONS,HEAD
< Access-Control-Allow-Headers: Content-Type,Authorization,X-Requested-With,Accept,Origin,Access-Control-Request-Method,Access-Control-Request-Headers
< Access-Control-Allow-Credentials: true
```

### 5. **Vider le cache du navigateur**

Parfois, le navigateur cache les réponses CORS. Essayez :
- Mode navigation privée
- Vider le cache (Ctrl+Shift+Delete)
- Hard refresh (Ctrl+Shift+R)

### 6. **Vérifier l'ordre des middlewares**

Le middleware CORS doit être **avant** tous les autres middlewares et routes. Dans `app.ts`, l'ordre est :
1. `express.json()`
2. `express.urlencoded()`
3. `cookieParser()`
4. **CORS middleware** ← Doit être ici
5. Autres middlewares
6. Routes

### 7. **Mode développement vs Production**

En mode développement, toutes les origines `http://localhost:*` sont automatiquement autorisées.

En mode production, seules les origines dans `allowedOrigins` ou celles commençant par `http://localhost:` sont autorisées.

### 8. **Vérifier les headers de la requête**

Assurez-vous que le frontend envoie :
- `Content-Type: application/json` (pour POST/PUT)
- `Authorization: Bearer <token>` (si authentifié)
- `credentials: 'include'` dans fetch (pour les cookies)

### 9. **Logs de débogage**

Si le problème persiste, activez les logs détaillés en vérifiant la console du serveur. Vous devriez voir :
- `🔍 CORS: Checking origin: http://localhost:3001`
- `✅ CORS: Allowing localhost origin: http://localhost:3001`

Si vous voyez `❌ CORS: Rejecting origin`, vérifiez la configuration.

### 10. **Solution rapide pour le développement**

Si vous voulez autoriser toutes les origines localhost temporairement (DÉVELOPPEMENT UNIQUEMENT) :

```typescript
origin: (origin, callback) => {
  if (!origin || origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
    callback(null, true);
  } else {
    callback(new Error('Not allowed by CORS'));
  }
}
```

**⚠️ NE JAMAIS utiliser cela en production !**

## Checklist de résolution

- [ ] Code recompilé (`npm run build`)
- [ ] Serveur redémarré
- [ ] Logs CORS visibles dans la console
- [ ] Variable `FRONTEND_URL` vérifiée (si définie)
- [ ] Cache du navigateur vidé
- [ ] Test avec curl réussi
- [ ] Headers de requête corrects

## Contact

Si le problème persiste après avoir suivi toutes ces étapes, vérifiez :
1. Les logs complets du serveur
2. Les headers de la requête dans les DevTools du navigateur
3. La réponse du serveur dans l'onglet Network

