# Dépannage : ERR_CONNECTION_REFUSED

## Problème
Le frontend affiche `ERR_CONNECTION_REFUSED` même si le serveur backend est en cours d'exécution.

## Solutions

### 1. Vérifier que le serveur backend est démarré

```bash
# Dans le dossier VOG_ecom
npm run build
npm start
```

Ou en mode développement :
```bash
npm run dev
```

### 2. Vérifier le port

Le serveur doit écouter sur le port **8013** (vérifié dans `.env`).

Vérifiez que `PORT=8013` est défini dans votre fichier `.env`.

### 3. Vérifier la configuration CORS

Le serveur doit autoriser les requêtes depuis `http://localhost:3001`.

Vérifiez dans `VOG_ecom/src/app.ts` que les origines suivantes sont autorisées :
- `http://localhost:3000`
- `http://localhost:3001`
- `http://localhost:3002`

### 4. Redémarrer le serveur

Si le serveur semble bloqué :

```bash
# Arrêter le serveur (Ctrl+C)
# Puis redémarrer
npm run build
npm start
```

### 5. Vérifier les logs du serveur

Regardez la console où le serveur est démarré pour voir s'il y a des erreurs.

Vous devriez voir :
```
🛡️  Server listening on port: 8013 🛡️
🔌 WebSocket server initialized
```

### 6. Vider le cache du navigateur

Parfois le navigateur cache les erreurs. Essayez :
- **Chrome/Edge** : `Ctrl + Shift + R` (hard refresh)
- **Firefox** : `Ctrl + F5`
- Ou ouvrez en navigation privée

### 7. Vérifier le firewall

Assurez-vous que le port 8013 n'est pas bloqué par le firewall Windows.

### 8. Vérifier que MongoDB est connecté

Le serveur doit être connecté à MongoDB. Vérifiez les logs pour :
```
✅ MongoDB connected successfully
```

### 9. Test rapide avec curl

Testez si le serveur répond :
```bash
curl http://localhost:8013/api/v1/categories
```

Si cela fonctionne, le problème est côté frontend ou navigateur.

### 10. Vérifier la variable d'environnement du frontend

Dans `st_cael_website`, vérifiez que l'URL du backend est correcte :
- Par défaut : `http://localhost:8013`
- Ou définissez `REACT_APP_BACKEND_URL=http://localhost:8013` dans `.env`

## Diagnostic

Si le problème persiste :

1. **Vérifiez les logs du serveur** pour voir s'il y a des erreurs
2. **Vérifiez la console du navigateur** (F12) pour plus de détails
3. **Testez avec Postman** ou curl pour isoler le problème
4. **Redémarrez complètement** : serveur backend + frontend

## Erreurs courantes

### "Cannot GET /"
- Le serveur n'est pas démarré ou écoute sur un autre port

### "CORS policy"
- Vérifiez la configuration CORS dans `app.ts`

### "MongoDB connection failed"
- Vérifiez que MongoDB est démarré et que `MONGO_URI` est correct dans `.env`

